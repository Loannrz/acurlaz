// Room shell: dance floor, stage, DJ booth counter, brick / plaster walls with
// arched niches, dark wooden ceiling with beams. One merged geometry per
// material. Returns the meshes and the niche anchors used by the props.
import * as THREE from 'three';
import { DANCE_Y, STAGE_Y, CEIL_Y, X_MIN, X_MAX, FAR, BACK, FRONT, DESK, TRUSS_Y } from './layout.js';
import { place, merge, boxNoTop } from './geo.js';

const ARCH_SEG = 20;

// Wall with arched openings, extruded `depth` metres away from the room.
// Local frame: u along the wall, y up, extrusion along +z (away from the room).
function archedWall({ u0, u1, y0, y1, arches, depth }) {
  const s = new THREE.Shape();
  s.moveTo(u0, y0); s.lineTo(u1, y0); s.lineTo(u1, y1); s.lineTo(u0, y1);
  for (const a of arches) {
    const r = a.w / 2, yb = a.y ?? y0, spring = yb + a.h - r;
    const h = new THREE.Path();
    h.moveTo(a.u - r, yb);
    h.lineTo(a.u + r, yb);
    h.lineTo(a.u + r, spring);
    h.absarc(a.u, spring, r, 0, Math.PI, false);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: ARCH_SEG });
  return g;
}

// Back panels of the niches (facing the room, local -z), at the extrusion depth.
function nicheBacks(arches, y0, depth) {
  return arches.filter((a) => !a.open).map((a) => {
    const yb = a.y ?? y0, r = a.w / 2;
    const s = new THREE.Shape();
    s.moveTo(a.u - r, yb); s.lineTo(a.u + r, yb); s.lineTo(a.u + r, yb + a.h - r);
    s.absarc(a.u, yb + a.h - r, r, 0, Math.PI, false);
    const g = new THREE.ShapeGeometry(s, ARCH_SEG);
    g.rotateY(Math.PI); // face local -z (towards the room); x is mirrored...
    g.scale(-1, 1, 1); // ...so mirror it back (keeps u)
    // scale(-1) flips the winding: rebuild the normals facing -z
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.computeVertexNormals();
    g.translate(0, 0, depth - 0.002);
    return g;
  });
}

// Placement of a wall-local geometry in the room.
const WALLS = {
  back: { rot: 0, pos: [0, 0, BACK] }, // faces -z, u = x
  far: { rot: Math.PI, pos: [0, 0, FAR] }, // faces +z, u = -x
  left: { rot: -Math.PI / 2, pos: [X_MIN, 0, 0] }, // faces +x, u = z
  right: { rot: Math.PI / 2, pos: [X_MAX, 0, 0] }, // faces -x, u = -z
};
const toRoom = (g, side) => place(g, { pos: WALLS[side].pos, rot: [0, WALLS[side].rot, 0] });
// World position of a wall-local point (u, y, depth).
export function wallPoint(side, u, y, d = 0) {
  const v = new THREE.Vector3(u, y, d).applyAxisAngle(new THREE.Vector3(0, 1, 0), WALLS[side].rot);
  return v.add(new THREE.Vector3(...WALLS[side].pos));
}

export const NICHE_DEPTH = 0.42;
// Arches of each wall (u in wall-local coordinates).
export const ARCHES = {
  back: [
    { u: 0, w: 2.7, h: 2.95, y: STAGE_Y, kind: 'dj' },
    { u: -3.7, w: 1.35, h: 2.25, y: STAGE_Y, kind: 'plant' },
    { u: 3.7, w: 1.35, h: 2.25, y: STAGE_Y, kind: 'plant' },
  ],
  far: [
    { u: 0, w: 2.7, h: 2.85, y: DANCE_Y, kind: 'bar', open: true },
    { u: -3.4, w: 1.5, h: 2.35, y: DANCE_Y, kind: 'plant' },
    { u: 3.4, w: 1.5, h: 2.35, y: DANCE_Y, kind: 'plant' },
  ],
  // side walls: u = z on the left, u = -z on the right
  left: [-2.5, -4.9, -7.3].map((z) => ({ u: z, w: 1.75, h: 2.4, y: DANCE_Y, kind: 'seat' })).concat([{ u: 2.0, w: 1.3, h: 2.1, y: STAGE_Y, kind: 'plant' }]),
  right: [-2.5, -4.9, -7.3].map((z) => ({ u: -z, w: 1.75, h: 2.4, y: DANCE_Y, kind: 'seat' })).concat([{ u: -2.0, w: 1.3, h: 2.1, y: STAGE_Y, kind: 'plant' }]),
};

export function buildRoom(mats) {
  const meshes = [];
  const add = (geo, mat, name, opts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `club_${name}`;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    if (opts.renderOrder != null) m.renderOrder = opts.renderOrder;
    meshes.push(m);
    return m;
  };
  const W = X_MAX - X_MIN + 2 * NICHE_DEPTH + 0.2;

  // --- dance floor (satin terracotta, sober: no mirrored glows on it) ---
  {
    const len = FRONT - FAR + NICHE_DEPTH + 0.2;
    const g = new THREE.PlaneGeometry(W, len);
    g.rotateX(-Math.PI / 2);
    g.translate(0, DANCE_Y, FRONT - len / 2);
    add(g, mats.tiles, 'danceFloor');
  }
  // --- stage (dark planks), behind the booth, full width ---
  {
    const len = BACK - FRONT + NICHE_DEPTH + 0.2;
    const g = new THREE.PlaneGeometry(W, len);
    g.rotateX(-Math.PI / 2);
    g.translate(0, STAGE_Y, FRONT + len / 2);
    add(g, mats.planks, 'stage');
  }

  // --- walls ---
  const brick = [], plaster = [], backs = [], warmBacks = [];
  const wall = (side, u0, u1, y0, mat, backList) => {
    const arches = ARCHES[side].filter((a) => a.u > u0 && a.u < u1);
    // the contour starts 5 cm under the floor: holes never touch it (triangulation)
    const g = archedWall({ u0, u1, y0: y0 - 0.05, y1: CEIL_Y + 0.02, arches, depth: NICHE_DEPTH });
    mat.push(toRoom(g, side));
    for (const b of nicheBacks(arches, y0, NICHE_DEPTH)) backList.push(toRoom(b, side));
  };
  wall('back', X_MIN, X_MAX, STAGE_Y, brick, warmBacks);
  wall('far', X_MIN, X_MAX, DANCE_Y, plaster, backs);
  wall('left', FAR, BACK, DANCE_Y, brick, warmBacks);
  wall('right', -BACK, -FAR, DANCE_Y, brick, warmBacks);
  add(merge(brick), mats.brick, 'brick');
  add(merge(plaster), mats.plasterGreen, 'plaster');
  add(merge(warmBacks), mats.plasterWarm, 'nicheBacks');
  if (backs.length) add(merge(backs), mats.plasterGreen, 'farNicheBacks');

  // --- ceiling (dark boards) + beams + PAR trusses ---
  {
    const g = new THREE.PlaneGeometry(W, BACK - FAR + 2);
    g.rotateX(Math.PI / 2);
    g.translate(0, CEIL_Y, (BACK + FAR) / 2);
    const beams = [g];
    for (let z = BACK - 0.8; z > FAR; z -= 1.55) beams.push(place(new THREE.BoxGeometry(X_MAX - X_MIN, 0.24, 0.17), { pos: [0, CEIL_Y - 0.12, z] }));
    add(merge(beams), mats.ceiling, 'ceiling');
  }

  // --- DJ booth counter ---
  const frontParts = [], woodParts = [];
  const hw = DESK.halfW, top = DESK.top, slab = DESK.slab, lip = DESK.lip;
  const bodyTop = top - slab;
  // tiled front, between a top rail and a recessed plinth
  {
    const railH = 0.07, plinthH = 0.12, pil = 0.07;
    const y0 = DANCE_Y + plinthH, y1 = bodyTop - railH;
    const g = new THREE.PlaneGeometry(2 * (hw - pil), y1 - y0);
    g.rotateY(Math.PI);
    g.translate(0, (y0 + y1) / 2, FRONT);
    frontParts.push(g);
    // top rail, pilasters, plinth (recessed by 3 cm, the kick LED sits in front)
    woodParts.push(place(new THREE.BoxGeometry(2 * hw, railH, 0.04), { pos: [0, bodyTop - railH / 2, FRONT - 0.01] }));
    for (const s of [-1, 1]) woodParts.push(place(new THREE.BoxGeometry(pil, bodyTop - DANCE_Y, 0.05), { pos: [s * (hw - pil / 2), (bodyTop + DANCE_Y) / 2, FRONT - 0.012] }));
    woodParts.push(place(new THREE.BoxGeometry(2 * hw, plinthH, 0.02), { pos: [0, DANCE_Y + plinthH / 2, FRONT + 0.03] }));
  }
  // sides and back of the counter (dark wood), down to the stage / dance floor
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(DESK.back - FRONT, bodyTop - DANCE_Y);
    g.rotateY(s * Math.PI / 2);
    g.translate(s * hw, (bodyTop + DANCE_Y) / 2, (DESK.back + FRONT) / 2);
    woodParts.push(g);
  }
  {
    const g = new THREE.PlaneGeometry(2 * hw, bodyTop - STAGE_Y);
    g.translate(0, (bodyTop + STAGE_Y) / 2, DESK.back);
    woodParts.push(g);
  }
  // counter slab edges (its top face is the glossy counter top, drawn apart)
  woodParts.push(place(boxNoTop(2 * hw + 2 * lip, slab, DESK.back - FRONT + 2 * lip), { pos: [0, top - slab / 2 - 0.0004, (DESK.back + FRONT) / 2] }));
  add(merge(frontParts), mats.deskFront, 'deskFront');

  // stage front at both sides of the counter (wood, under the stage edge)
  for (const s of [-1, 1]) {
    const w = X_MAX - hw + NICHE_DEPTH;
    const g = new THREE.PlaneGeometry(w, STAGE_Y - DANCE_Y);
    g.rotateY(Math.PI);
    g.translate(s * (hw + w / 2), (STAGE_Y + DANCE_Y) / 2, FRONT);
    woodParts.push(g);
    // nosing
    woodParts.push(place(new THREE.BoxGeometry(w, 0.04, 0.06), { pos: [s * (hw + w / 2), STAGE_Y - 0.02, FRONT - 0.02] }));
  }
  add(merge(woodParts), mats.woodDark, 'deskWood');

  // counter top (glossy wood, receives the shadow of the gear, shows its
  // reflection): material from index.js; plus a black "catcher" just under it
  // (writes depth before the top, so nothing below the counter shows through
  // the top, which writes no depth for the reflections)
  {
    const g = new THREE.PlaneGeometry(2 * hw + 2 * lip, DESK.back - FRONT + 2 * lip);
    g.rotateX(-Math.PI / 2);
    g.translate(0, top - 0.0005, (DESK.back + FRONT) / 2);
    const m = add(g, mats.counterTop, 'counterTop', { renderOrder: -2 });
    m.receiveShadow = true;
    const c = new THREE.PlaneGeometry(2 * hw + 2 * lip - 0.004, DESK.back - FRONT + 2 * lip - 0.004);
    c.rotateX(-Math.PI / 2);
    c.translate(0, top - 0.056, (DESK.back + FRONT) / 2); // inside the slab: hides the inside of the counter
    add(c, mats.catcher, 'counterCatcher', { renderOrder: -3 });
  }

  return { meshes, trussY: TRUSS_Y };
}
