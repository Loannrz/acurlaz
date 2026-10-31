// Plants: monstera, kentia palms, banana / strelitzia, hanging pothos with
// trailing vines, ivy around the big arch behind the DJ. Every leaf of the
// club is one instance of a single bent quad (one draw call, leaf atlas from
// textures.js, alpha to coverage with the MSAA target). Stems, ropes and pots
// are returned as geometry pieces merged with the other props (vertex colours).
// All static: no sway.
import * as THREE from 'three';
import { DANCE_Y, STAGE_Y, CEIL_Y, X_MIN, X_MAX, FAR, BACK, FRONT, DESK } from './layout.js';
import { place, tint, rod, rng } from './geo.js';
import { ARCHES, NICHE_DEPTH } from './room.js';

// Free space test for foliage: true when a point is inside something solid
// (counter, gear, speakers, banquettes, tables, walls outside the arch niches,
// floors, ceiling) or inside the volume the free camera can reach (orbit
// +-65 deg azimuth, 15-62 deg elevation, plus the ~6 deg soft stops, zoom up
// to ~3.7 m: see ORBIT / ZOOM). Leaves and stems failing it are not created,
// so no foliage floats, crosses the booth or ever comes in front of the lens.
const T = new THREE.Vector3(0, 0.05, 0);
const DEG = Math.PI / 180;
const inArch = (arches, u, y, depth) => arches.some((a) => {
  const r = a.w / 2 - 0.04, du = u - a.u;
  if (Math.abs(du) > r || y < a.y - 0.01) return false;
  const spring = a.y + a.h - a.w / 2;
  if (y > spring + Math.sqrt(Math.max(0, r * r - du * du))) return false;
  return depth < (a.open ? 1.25 : NICHE_DEPTH - 0.03);
});
function blocked(p) {
  const ax = Math.abs(p.x);
  // booth counter (with a margin) and the gear + cables on it
  if (ax < DESK.halfW + 0.06 && p.z > DESK.front - 0.1 && p.z < DESK.back + 0.08 && p.y < DESK.top + 0.04) return true;
  if (ax < 0.95 && p.z > -0.65 && p.z < 0.5 && p.y < 0.55) return true;
  // speakers on their stands (x = +-2.05, z = -0.22)
  if (Math.abs(ax - 2.05) < 0.3 && p.z > -0.48 && p.z < 0.04 && p.y < 0.08) return true;
  // banquettes in the side arches and the high tables
  if (ax > X_MAX - 0.36 && p.y < DANCE_Y + 1.08 && [-2.5, -4.9, -7.3].some((z) => Math.abs(p.z - z) < 0.85)) return true;
  for (const [tx, tz] of [[3.75, -3.7], [3.75, -6.1], [2.3, -8.35]]) if (Math.hypot(ax - tx, p.z - tz) < 0.75 && p.y < DANCE_Y + 1.25) return true;
  // floors and ceiling
  if (p.y < (p.z > FRONT ? STAGE_Y : DANCE_Y) + 0.004 || p.y > CEIL_Y - 0.03) return true;
  // walls: only the arch niches can be entered
  if (p.z > BACK - 0.01 && !inArch(ARCHES.back, p.x, p.y, p.z - BACK)) return true;
  if (p.z < FAR + 0.01 && !inArch(ARCHES.far, -p.x, p.y, FAR - p.z)) return true;
  if (p.x < X_MIN + 0.01 && !inArch(ARCHES.left, p.z, p.y, X_MIN - p.x)) return true;
  if (p.x > X_MAX - 0.01 && !inArch(ARCHES.right, -p.z, p.y, p.x - X_MAX)) return true;
  // free camera volume (and everything between it and the gear)
  const vx = p.x - T.x, vy = p.y - T.y, vz = p.z - T.z;
  const r = Math.hypot(vx, vy, vz), d = Math.hypot(vx, vz);
  const el = Math.atan2(vy, d), az = Math.atan2(vx, vz);
  if (r < 3.95 && el > 5 * DEG && el < 75 * DEG && Math.abs(az) < 78 * DEG) return true;
  return false;
}

const CELL = { monstera: 0, palm: 1, heart: 2, banana: 3 };

// Unit leaf: base at the origin, tip at +y (1 m), face +z; bent along its
// length (tip curls towards -z) and folded along the midrib (edges towards +z).
function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 2, 5);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -0.28 * y * y + 0.22 * Math.abs(x));
  }
  g.computeVertexNormals();
  return g;
}

export function buildFoliage({ material, propsOut }) {
  const R = rng(7);
  const leaves = []; // { m: Matrix4, cell, color }
  const pots = propsOut; // geometry pieces (vertex coloured)
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // Leaf at `base`, pointing along `dir`, facing roughly `face` (both world
  // vectors), size w x len (m). Returns false (and adds nothing) when any part
  // of the leaf would enter a solid or the camera volume (see blocked()).
  const SAMPLES = [[0, 0, 0], [0, 1, -0.28], [0.5, 0.5, 0.11], [-0.5, 0.5, 0.11], [0.35, 0.85, -0.12], [-0.35, 0.85, -0.12], [0, 0.5, 0]].map((v) => new THREE.Vector3(...v));
  const _p = new THREE.Vector3();
  const leaf = (base, dir, face, w, len, cell, shade = 1) => {
    Y.copy(dir).normalize();
    X.crossVectors(Y, face).normalize();
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    Z.crossVectors(X, Y).normalize();
    const m = new THREE.Matrix4().makeBasis(X.clone().multiplyScalar(w), Y.clone().multiplyScalar(len), Z.clone().multiplyScalar(Math.max(w, len * 0.6)));
    m.setPosition(base);
    for (const sp of SAMPLES) if (blocked(_p.copy(sp).applyMatrix4(m))) return false;
    // colour variation: from deep blue-green to a warmer olive
    const t = R();
    const c = new THREE.Color().setRGB(0.55 + 0.35 * t, 0.85 + 0.1 * R(), 0.62 - 0.2 * t).multiplyScalar(shade * (0.75 + R() * 0.3));
    leaves.push({ m, cell, color: c });
    return true;
  };
  const stemColor = [0.16, 0.24, 0.1];
  const stem = (a, b, r = 0.007) => pots.push(tint(rod(a.toArray(), b.toArray(), r, 4), stemColor));
  // a stem is drawn only with its leaf: nothing hangs in the air
  const stemmedLeaf = (from, to, r, ...leafArgs) => { if (!blocked(to) && leaf(to, ...leafArgs)) stem(from, to, r); };

  // Pots: terracotta (lathe), or dark glazed
  const potGeo = (r, h, color) => {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.72, 0), new THREE.Vector2(r * 0.95, h * 0.85), new THREE.Vector2(r, h * 0.86), new THREE.Vector2(r * 1.04, h), new THREE.Vector2(r * 0.9, h), new THREE.Vector2(r * 0.88, h * 0.94), new THREE.Vector2(0, h * 0.94)];
    return tint(new THREE.LatheGeometry(pts, 14), color);
  };
  const TERRA = [0.36, 0.14, 0.07], GLAZE = [0.05, 0.1, 0.075], CREAM = [0.3, 0.26, 0.2];
  const pot = (x, y, z, r, h, color = TERRA) => { pots.push(place(potGeo(r, h, color), { pos: [x, y, z] })); return new THREE.Vector3(x, y + h * 0.94, z); };

  // --- plant types ---
  const monstera = (x, y, z, s = 1, potColor = TERRA) => {
    const top = pot(x, y, z, 0.2 * s, 0.38 * s, potColor);
    const n = 9 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + R() * 0.5;
      const el = 0.6 + R() * 0.65;
      const len = (0.4 + R() * 0.55) * s;
      const d = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const tip = top.clone().addScaledVector(d, len);
      const out = new THREE.Vector3(d.x, 0, d.z).normalize();
      const ldir = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.35 + R() * 0.3, 0));
      const face = up.clone().multiplyScalar(0.8).addScaledVector(out, 0.5);
      const size = (0.36 + R() * 0.2) * s;
      stemmedLeaf(top, tip, 0.008 * s, ldir, face, size, size, CELL.monstera, 0.85 + R() * 0.2);
    }
  };
  const palm = (x, y, z, s = 1, potColor = CREAM) => {
    const top = pot(x, y, z, 0.24 * s, 0.5 * s, potColor);
    const n = 13 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + R() * 0.6;
      const h = (0.25 + R() * 0.55) * s;
      const lean = 0.08 + R() * 0.12;
      const sb = top.clone().add(new THREE.Vector3(Math.cos(az) * lean * h, h, Math.sin(az) * lean * h));
      const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const el = 0.55 + R() * 0.8;
      const ldir = out.clone().multiplyScalar(Math.cos(el)).add(new THREE.Vector3(0, Math.sin(el), 0));
      const face = up.clone().addScaledVector(out, -0.3);
      const len = (0.9 + R() * 0.6) * s;
      stemmedLeaf(top, sb, 0.012 * s, ldir, face, len * 0.62, len, CELL.palm, 0.8 + R() * 0.25);
    }
  };
  const banana = (x, y, z, s = 1, potColor = GLAZE) => {
    const top = pot(x, y, z, 0.22 * s, 0.45 * s, potColor);
    const n = 6 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + R();
      const h = (0.35 + R() * 0.6) * s;
      const sb = top.clone().add(new THREE.Vector3(Math.cos(az) * 0.05, h, Math.sin(az) * 0.05));
      const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const el = 1.05 + R() * 0.35;
      const ldir = out.clone().multiplyScalar(Math.cos(el)).add(new THREE.Vector3(0, Math.sin(el), 0));
      const len = (0.75 + R() * 0.4) * s;
      stemmedLeaf(top, sb, 0.012 * s, ldir, out.clone().applyAxisAngle(up, Math.PI / 2), len, len, CELL.banana, 0.85 + R() * 0.2);
    }
  };
  // Trailing vine from `a`, hanging `len` m, drifting sideways.
  const vine = (a, len, drift, outward) => {
    let p = a.clone();
    const step = 0.075;
    const n = Math.floor(len / step);
    let prev = p.clone();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      p = a.clone().add(new THREE.Vector3(drift.x * t + Math.sin(i * 0.7) * 0.015, -len * t, drift.z * t + Math.cos(i * 0.9) * 0.015));
      if (blocked(p)) break; // the vine ends there (never crosses anything)
      if (i % 2 === 0) stem(prev, p, 0.003);
      if (i % 2 === 0) prev = p.clone();
      const side = i % 2 ? 1 : -1;
      const tang = new THREE.Vector3(0, -1, 0);
      const sideV = new THREE.Vector3().crossVectors(tang, outward).normalize().multiplyScalar(side);
      const ldir = sideV.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, -0.45, 0)).addScaledVector(outward, 0.2);
      const size = (0.075 + R() * 0.04) * (1 - t * 0.35);
      leaf(p, ldir, outward.clone().add(new THREE.Vector3(0, 0.3, 0)), size, size, CELL.heart, 0.8 + R() * 0.3);
    }
  };
  // Hanging pot on three ropes from the ceiling, with trailing vines.
  const hanging = (x, z, potY, vines = 6, maxLen = 1.4) => {
    const top = pot(x, potY, z, 0.14, 0.2, R() > 0.5 ? CREAM : TERRA);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      pots.push(tint(rod([x + Math.cos(a) * 0.13, potY + 0.19, z + Math.sin(a) * 0.13], [x, CEIL_Y - 0.05, z], 0.004, 3), [0.35, 0.28, 0.2]));
    }
    for (let k = 0; k < vines; k++) {
      const a = (k / vines) * Math.PI * 2 + R() * 0.4;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const start = top.clone().addScaledVector(out, 0.13);
      vine(start, maxLen * (0.45 + R() * 0.55), out.clone().multiplyScalar(0.12 + R() * 0.12), out);
      // a few leaves spilling over the rim
      for (let j = 0; j < 3; j++) {
        const o = out.clone().applyAxisAngle(up, (R() - 0.5) * 0.8);
        leaf(start.clone().add(new THREE.Vector3(0, 0.02, 0)), o.clone().add(new THREE.Vector3(0, 0.6, 0)), up, 0.1, 0.1, CELL.heart);
      }
    }
  };

  // --- placement (outside the free-camera volume: see layout.js) ---
  // stage corners and sides (lit from below by the green uplights)
  for (const s of [-1, 1]) {
    palm(s * 4.75, STAGE_Y, 3.35, 1.25);
    monstera(s * 4.85, STAGE_Y, 0.55, 1.3, GLAZE);
    banana(s * 4.2, STAGE_Y, 3.55, 1.1);
    monstera(s * 4.3, STAGE_Y, 2.15, 0.95, TERRA);
    // side arch on the stage (left / right wall, z = 2)
    banana(s * (X_MAX + 0.05), STAGE_Y, 2.0, 1.0, CREAM);
    // small arches of the back wall
    palm(s * 3.7, STAGE_Y, BACK + 0.12, 1.0, TERRA);
    // (big arch behind the DJ left bare: nothing rises behind the gear in the rear shots)
    // dance floor corners near the booth
    banana(s * 5.05, DANCE_Y, -1.05, 1.35, GLAZE);
    // far wall niches
    palm(s * 3.4, DANCE_Y, FAR - 0.12, 1.15, CREAM);
    // between the side arches (piers), low monstera
    monstera(s * 5.2, DANCE_Y, -6.1, 0.9, TERRA);
    // (no plant near the booth: it stays clear around the gear)
  }

  // hanging pots: over the dance floor edges, the bar, and the stage sides
  for (const [x, z, y, n, l] of [
    [-3.1, -1.75, 2.35, 6, 1.3], [3.1, -1.75, 2.35, 6, 1.3],
    [-4.4, -4.9, 2.4, 7, 1.6], [4.4, -4.9, 2.4, 7, 1.6],
    [-1.7, -8.6, 2.5, 6, 1.2], [1.7, -8.6, 2.5, 6, 1.2],
    [-2.3, 2.95, 2.45, 6, 1.4], [2.3, 2.95, 2.45, 6, 1.4],
    [-4.4, -7.6, 2.4, 5, 1.2], [4.4, -7.6, 2.4, 5, 1.2],
  ]) hanging(x, z, y, n, l);
  // --- instanced mesh ---
  const geo = leafGeometry();
  const mesh = new THREE.InstancedMesh(geo, material, leaves.length);
  const cells = new Float32Array(leaves.length);
  leaves.forEach((l, i) => { mesh.setMatrixAt(i, l.m); mesh.setColorAt(i, l.color); cells[i] = l.cell; });
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'club_leaves';
  mesh.frustumCulled = false; // spread over the whole room (bounding sphere of the base quad is wrong)
  mesh.matrixAutoUpdate = false;
  return { mesh, count: leaves.length };
}
