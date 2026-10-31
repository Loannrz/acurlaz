// Props, as geometry pieces with vertex colours (merged into two meshes by
// index.js: one lit, one emissive) plus the lists of glows (halos, beams,
// wall washes). Speakers, PAR cans on their trusses, string lights over the
// floor and the stage, LED strips of the booth, sconces, banquettes in the
// side arches, high tables and stools, the bar in the far arch.
import * as THREE from 'three';
import { DANCE_Y, STAGE_Y, CEIL_Y, X_MIN, X_MAX, FAR, BACK, FRONT, DESK, TRUSS_Y } from './layout.js';
import { place, tint, rod, sagCurve, rng } from './geo.js';
import { WARM, AMBER, GREEN } from './lights.js';

const DARK = [0.03, 0.03, 0.033];
const STEEL = [0.03, 0.03, 0.032];
const BRASS = [0.42, 0.28, 0.1];
const WOOD = [0.07, 0.035, 0.018];
const LEATHER = [0.26, 0.1, 0.04];
const mul = (c, k) => c.map((v) => v * k);

export function buildProps({ lights }) {
  const R = rng(11);
  const lit = [], emis = [], halos = [], washes = [], beams = [];
  const box = (w, h, d, pos, color, rot) => lit.push(tint(place(new THREE.BoxGeometry(w, h, d), { pos, rot }), color));
  const cyl = (r0, r1, h, pos, color, seg = 16, rot) => lit.push(tint(place(new THREE.CylinderGeometry(r0, r1, h, seg), { pos, rot }), color));
  const glowBox = (w, h, d, pos, color) => emis.push(tint(place(new THREE.BoxGeometry(w, h, d), { pos }), color));

  // --- speakers on stands, on the stage at both sides of the booth ---
  for (const s of [-1, 1]) {
    const x = s * 2.05, z = -0.22, yb = -0.74, h = 0.76;
    cyl(0.2, 0.22, 0.02, [x, STAGE_Y + 0.01, z], STEEL, 20);
    lit.push(tint(rod([x, STAGE_Y, z], [x, yb, z], 0.022, 8), STEEL));
    box(0.46, h, 0.42, [x, yb + h / 2, z], [0.045, 0.045, 0.05]);
    const fz = z - 0.211;
    // woofer cone + surround, horn
    lit.push(tint(place(new THREE.CylinderGeometry(0.155, 0.12, 0.03, 24, 1, true), { pos: [x, yb + 0.25, fz + 0.012], rot: [Math.PI / 2, 0, 0] }), [0.01, 0.01, 0.011]));
    lit.push(tint(place(new THREE.CircleGeometry(0.12, 24), { pos: [x, yb + 0.25, fz + 0.027], rot: [Math.PI, 0, 0] }), [0.008, 0.008, 0.009]));
    lit.push(tint(place(new THREE.TorusGeometry(0.16, 0.012, 6, 28), { pos: [x, yb + 0.25, fz] }), [0.05, 0.05, 0.055]));
    box(0.3, 0.12, 0.02, [x, yb + 0.6, fz - 0.002], [0.012, 0.012, 0.013]);
    cyl(0.03, 0.03, 0.02, [x, yb + 0.6, fz - 0.012], [0.04, 0.04, 0.045], 12, [Math.PI / 2, 0, 0]);
    // tiny status LED (green)
    glowBox(0.008, 0.008, 0.004, [x + 0.17, yb + 0.06, fz - 0.003], mul(GREEN, 2));
  }

  // --- trusses + PAR cans (first spot lights of the list) ---
  for (const z of [-2.3, -6.0]) {
    box(6.6, 0.06, 0.06, [0, TRUSS_Y, z], STEEL);
    box(6.6, 0.025, 0.025, [0, TRUSS_Y - 0.12, z], STEEL);
    for (const x of [-3.0, 3.0]) lit.push(tint(rod([x, TRUSS_Y, z], [x, CEIL_Y, z], 0.012, 6), STEEL));
    for (let x = -3.1; x <= 3.11; x += 0.31) lit.push(tint(rod([x, TRUSS_Y, z], [x + 0.155, TRUSS_Y - 0.12, z], 0.006, 4), STEEL));
  }
  for (const l of lights.filter((l) => l.cone && l.pos[1] > TRUSS_Y - 0.5 && l.pos[2] < 0)) {
    const p = new THREE.Vector3(...l.pos), d = new THREE.Vector3(...l.dir).normalize();
    const back = p.clone().addScaledVector(d, -0.26);
    lit.push(tint(rod(p.toArray(), back.toArray(), 0.085, 14), DARK));
    lit.push(tint(rod(back.toArray(), [back.x, TRUSS_Y - 0.03, back.z], 0.012, 6), STEEL));
    // lens
    const lens = new THREE.CircleGeometry(0.07, 18);
    lens.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d));
    lens.translate(...p.clone().addScaledVector(d, 0.002).toArray());
    emis.push(tint(lens, mul(l.color, 3.5)));
    halos.push({ pos: p.clone().addScaledVector(d, 0.03).toArray(), color: mul(l.color, 0.9), size: 0.42 });
    const len = ((p.y - DANCE_Y) / -d.y) * 0.98;
    beams.push({ pos: p.toArray(), dir: d.toArray(), length: len, angle: l.cone[0] * 0.72, color: mul(l.color, 1) });
  }

  // --- string lights (festoon): warm bulbs on dark wires ---
  const strand = (a, b, sag, spacing = 0.48) => {
    const pts = sagCurve(a, b, sag, 40);
    for (let i = 0; i < pts.length - 1; i++) lit.push(tint(rod(pts[i].toArray(), pts[i + 1].toArray(), 0.0035, 3), DARK));
    // bulbs at regular arc length
    const curve = new THREE.CatmullRomCurve3(pts);
    const n = Math.max(2, Math.round(curve.getLength() / spacing));
    for (let i = 1; i < n; i++) {
      const p = curve.getPointAt(i / n);
      lit.push(tint(rod([p.x, p.y, p.z], [p.x, p.y - 0.045, p.z], 0.007, 5), DARK));
      const bp = [p.x, p.y - 0.07, p.z];
      emis.push(tint(place(new THREE.SphereGeometry(0.024, 8, 6), { pos: bp, scale: [1, 1.25, 1] }), mul(WARM, 4.2 * (0.9 + R() * 0.2))));
      halos.push({ pos: bp, color: mul(WARM, 0.42), size: 0.26 });
    }
  };
  // Low enough to be seen: the camera always looks down at the gear (elevation
  // 15-62 deg), so anything much higher than ~1.5 m above the counter is
  // rarely in frame. Over the dance floor only (never in the camera volume).
  for (const z of [-1.7, -3.45, -5.2, -6.95, -8.7]) strand([X_MIN + 0.05, 1.62, z + 0.2], [X_MAX - 0.05, 1.62, z - 0.2], 0.5);
  // festoon cross over the middle of the floor
  strand([X_MIN + 0.05, 1.75, -1.3], [X_MAX - 0.05, 1.75, -8.9], 0.55, 0.55);
  strand([X_MAX - 0.05, 1.75, -1.3], [X_MIN + 0.05, 1.75, -8.9], 0.55, 0.55);

  // --- LED strips of the booth ---
  {
    const y = DESK.top - DESK.slab - 0.013, z = FRONT - DESK.lip + 0.006;
    glowBox(2 * DESK.halfW - 0.06, 0.008, 0.01, [0, y, z], mul(GREEN, 3));
    for (let x = -DESK.halfW + 0.1; x <= DESK.halfW - 0.09; x += 0.1) halos.push({ pos: [x, y - 0.01, z - 0.01], color: mul(GREEN, 0.1), size: 0.2, mirror: false });
    // DJ side: hidden warm strips (their light only: lights.js), no visible line
  }
  // No LED line on the dance floor itself (no glowing band on the floor): the
  // green coves at the foot of the walls are hidden, only their wash on the
  // brick shows (baked light, lights.js).

  // --- sconces: side walls (piers between the arches) and far wall ---
  const sconce = (p, n) => {
    const P = new THREE.Vector3(...p), N = new THREE.Vector3(...n);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), N);
    const g = new THREE.CylinderGeometry(0.07, 0.05, 0.16, 14, 1, true, 0, Math.PI);
    g.rotateY(-Math.PI / 2); // half shell opening towards +z
    g.applyQuaternion(q);
    g.translate(...P.toArray());
    lit.push(tint(g, BRASS));
    const bulb = new THREE.SphereGeometry(0.03, 8, 6);
    bulb.translate(...P.clone().addScaledVector(N, 0.04).toArray());
    emis.push(tint(bulb, mul(AMBER, 3.5)));
    halos.push({ pos: P.clone().addScaledVector(N, 0.06).toArray(), color: mul(AMBER, 0.55), size: 0.34 });
    washes.push({ pos: P.clone().addScaledVector(N, 0.005).toArray(), normal: n, w: 0.95, h: 1.7, color: mul(AMBER, 0.32) });
  };
  for (const z of [-1.3, -3.7, -6.1, -8.5]) {
    sconce([X_MIN + 0.05, 0.75, z], [1, 0, 0]);
    sconce([X_MAX - 0.05, 0.75, z], [-1, 0, 0]);
  }
  for (const x of [-1.95, 1.95]) sconce([x, 0.55, FAR + 0.05], [0, 0, 1]);
  // stage: one sconce on each side wall
  sconce([X_MIN + 0.05, 0.65, 0.4], [1, 0, 0]);
  sconce([X_MAX - 0.05, 0.65, 0.4], [-1, 0, 0]);

  // --- banquettes in the side arches, with a small table and a lamp ---
  for (const s of [-1, 1]) {
    const wx = s < 0 ? X_MIN : X_MAX;
    for (const z of [-2.5, -4.9, -7.3]) {
      const inX = wx - s * 0.01; // seat centre: from the backrest out into the room
      box(0.56, 0.42, 1.6, [inX, DANCE_Y + 0.21, z], mul(LEATHER, 0.75));
      box(0.5, 0.06, 1.56, [inX + s * 0.02, DANCE_Y + 0.45, z], LEATHER);
      box(0.14, 0.62, 1.6, [wx + s * 0.34, DANCE_Y + 0.72, z], LEATHER); // backrest, against the niche back
      // table
      const tx = wx - s * 0.62;
      cyl(0.26, 0.26, 0.03, [tx, DANCE_Y + 0.62, z], WOOD, 24);
      cyl(0.265, 0.265, 0.008, [tx, DANCE_Y + 0.637, z], BRASS, 24);
      lit.push(tint(rod([tx, DANCE_Y, z], [tx, DANCE_Y + 0.6, z], 0.025, 8), BRASS));
      cyl(0.18, 0.2, 0.02, [tx, DANCE_Y + 0.01, z], STEEL, 18);
      // lamp
      cyl(0.035, 0.045, 0.05, [tx, DANCE_Y + 0.665, z], BRASS, 12);
      emis.push(tint(place(new THREE.CylinderGeometry(0.03, 0.034, 0.07, 12), { pos: [tx, DANCE_Y + 0.725, z] }), mul(AMBER, 2.6)));
      halos.push({ pos: [tx, DANCE_Y + 0.73, z], color: mul(AMBER, 0.5), size: 0.34 });
    }
  }
  // --- high tables and stools on the edges of the dance floor ---
  const highTable = (x, z) => {
    cyl(0.22, 0.24, 0.02, [x, DANCE_Y + 0.01, z], STEEL, 20);
    lit.push(tint(rod([x, DANCE_Y, z], [x, DANCE_Y + 1.04, z], 0.028, 8), STEEL));
    cyl(0.31, 0.31, 0.035, [x, DANCE_Y + 1.06, z], WOOD, 26);
    cyl(0.04, 0.045, 0.06, [x, DANCE_Y + 1.11, z], [0.5, 0.4, 0.3], 12);
    emis.push(tint(place(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10), { pos: [x, DANCE_Y + 1.15, z] }), mul(AMBER, 2.4)));
    halos.push({ pos: [x, DANCE_Y + 1.16, z], color: mul(AMBER, 0.45), size: 0.3 });
    for (let k = 0; k < 2; k++) {
      const a = R() * Math.PI * 2;
      const sx = x + Math.cos(a) * 0.48, sz = z + Math.sin(a) * 0.48;
      lit.push(tint(rod([sx, DANCE_Y, sz], [sx, DANCE_Y + 0.74, sz], 0.018, 6), STEEL));
      cyl(0.16, 0.16, 0.05, [sx, DANCE_Y + 0.76, sz], LEATHER, 18);
      lit.push(tint(place(new THREE.TorusGeometry(0.13, 0.008, 4, 18), { pos: [sx, DANCE_Y + 0.28, sz], rot: [Math.PI / 2, 0, 0] }), STEEL));
      cyl(0.17, 0.18, 0.015, [sx, DANCE_Y + 0.008, sz], STEEL, 16);
    }
  };
  for (const s of [-1, 1]) { highTable(s * 3.75, -3.7); highTable(s * 3.75, -6.1); highTable(s * 2.3, -8.35); }

  // --- bar in the far arch: backlit onyx wall, shelves of bottles, counter ---
  {
    const zb = FAR - 1.25, hw = 1.55, y0 = DANCE_Y, h = 3.0;
    const WALL = [0.16, 0.09, 0.05];
    // alcove walls and ceiling (lit by the amber light inside)
    for (const s of [-1, 1]) box(0.05, h, 1.3, [s * hw, y0 + h / 2, FAR - 0.65], WALL);
    box(2 * hw, 0.05, 1.3, [0, y0 + h, FAR - 0.65], mul(WALL, 0.6));
    // backlit panel: brighter in the middle, vertex-colour gradient
    const panel = new THREE.PlaneGeometry(2 * hw - 0.1, 2.0, 12, 6);
    const pc = new Float32Array(panel.attributes.position.count * 3);
    for (let i = 0; i < panel.attributes.position.count; i++) {
      const px = panel.attributes.position.getX(i) / hw, py = panel.attributes.position.getY(i) / 1.0;
      const k = 0.12 + 0.5 * Math.exp(-(px * px * 1.6 + py * py * 1.3));
      pc.set(mul(AMBER, k), i * 3);
    }
    panel.setAttribute('color', new THREE.BufferAttribute(pc, 3));
    panel.translate(0, y0 + 1.75, zb + 0.03);
    emis.push(panel);
    // shelves + bottles
    const glass = [[0.22, 0.08, 0.015], [0.025, 0.09, 0.04], [0.16, 0.16, 0.14], [0.12, 0.03, 0.02]];
    const bottle = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.036, 0), new THREE.Vector2(0.036, 0.19), new THREE.Vector2(0.014, 0.25),
      new THREE.Vector2(0.012, 0.31), new THREE.Vector2(0, 0.31),
    ], 8);
    for (const sy of [1.05, 1.55, 2.05]) {
      box(2 * hw - 0.2, 0.03, 0.24, [0, y0 + sy, zb + 0.16], WOOD);
      for (let x = -hw + 0.22; x < hw - 0.2; x += 0.13 + R() * 0.06) {
        const sc = 0.8 + R() * 0.45;
        lit.push(tint(place(bottle.clone(), { pos: [x, y0 + sy + 0.015, zb + 0.14 + (R() - 0.5) * 0.06], scale: [1, sc, 1] }), glass[Math.floor(R() * glass.length)]));
      }
    }
    // counter with brass edge, a lamp at each end
    box(2.5, 1.06, 0.5, [0, y0 + 0.53, FAR - 0.42], WOOD);
    box(2.6, 0.04, 0.58, [0, y0 + 1.08, FAR - 0.42], [0.1, 0.05, 0.025]);
    box(2.6, 0.012, 0.012, [0, y0 + 1.06, FAR - 0.13], BRASS);
    for (const x of [-1.0, 1.0]) {
      cyl(0.05, 0.06, 0.05, [x, y0 + 1.125, FAR - 0.42], BRASS, 12);
      emis.push(tint(place(new THREE.SphereGeometry(0.06, 12, 8), { pos: [x, y0 + 1.2, FAR - 0.42] }), mul(WARM, 1.8)));
      halos.push({ pos: [x, y0 + 1.2, FAR - 0.42], color: mul(WARM, 0.45), size: 0.4 });
    }
  }

  // --- warm glow inside the big arch behind the DJ ---
  washes.push({ pos: [0, STAGE_Y + 1.6, BACK + 0.41], normal: [0, 0, -1], w: 2.6, h: 2.8, color: mul(WARM, 0.18) });

  return { lit, emis, halos, washes, beams };
}
