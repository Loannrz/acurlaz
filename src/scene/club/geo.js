// Small geometry helpers: bake transforms, vertex colours, merge many pieces
// into one geometry (one draw call per material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// Bake position / rotation (Euler, radians) / scale into the geometry.
export function place(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], order = 'XYZ' } = {}) {
  _e.set(rot[0], rot[1], rot[2], order);
  _q.setFromEuler(_e);
  _m.compose(_p.set(...pos), _q, _s.set(...(Array.isArray(scale) ? scale : [scale, scale, scale])));
  geo.applyMatrix4(_m);
  return geo;
}

// Uniform vertex colour (linear RGB array or THREE.Color / hex).
export function tint(geo, color) {
  const c = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Merge geometries that may differ in indexing / attributes: everything is
// converted to non-indexed position + normal + uv (+ color when asked).
export function merge(list, { color = false } = {}) {
  const prepared = list.map((g0) => {
    let g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const keep = ['position', 'normal', 'uv'].concat(color ? ['color'] : []);
    if (color && !g.attributes.color) tint(g, 0xffffff);
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    return g;
  });
  const out = mergeGeometries(prepared, false);
  return out;
}

// Box without its top face (+y): the top is drawn by another surface.
export function boxNoTop(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  // groups: +x, -x, +y, -y, +z, -z (6 indices each with 1 segment)
  const idx = Array.from(g.index.array);
  const keep = idx.slice(0, 12).concat(idx.slice(18));
  g.setIndex(keep);
  g.clearGroups();
  return g;
}

// Thin cylinder between two points (wires, rods, stems).
export function rod(a, b, r, radial = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, true);
  const dir = B.clone().sub(A).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

// Catenary-like hanging curve between two points (string lights, ropes).
export function sagCurve(a, b, sag, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ));
  }
  return pts;
}

// Seeded random (deterministic décor).
export function rng(seed = 1) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
