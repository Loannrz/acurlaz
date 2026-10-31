// Splits a single indexed BufferGeometry into connected components.
// Vertices are welded by quantised position (seams from normals/UVs are
// ignored), triangles are grouped with union-find, and each component is
// returned with its own geometry and bounding box. Used because the GLB packs
// two CDJs and their cables into one mesh.
import * as THREE from 'three';

export function splitComponents(geometry, weldPrecision = 1e-4) {
  const pos = geometry.attributes.position;
  const index = geometry.index ? geometry.index.array : null;
  const vCount = pos.count;
  const triCount = index ? index.length / 3 : vCount / 3;

  // Weld: map each vertex to a representative id by quantised position.
  const keyToId = new Map();
  const rep = new Int32Array(vCount);
  const inv = 1 / weldPrecision;
  for (let i = 0; i < vCount; i++) {
    const k = `${Math.round(pos.getX(i) * inv)},${Math.round(pos.getY(i) * inv)},${Math.round(pos.getZ(i) * inv)}`;
    let id = keyToId.get(k);
    if (id === undefined) { id = i; keyToId.set(k, id); }
    rep[i] = id;
  }

  // Union-find over representative ids.
  const parent = new Int32Array(vCount);
  for (let i = 0; i < vCount; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const vi = (t, c) => (index ? index[t * 3 + c] : t * 3 + c);
  for (let t = 0; t < triCount; t++) {
    const a = rep[vi(t, 0)], b = rep[vi(t, 1)], c = rep[vi(t, 2)];
    union(a, b); union(b, c);
  }

  // Group triangles by root.
  const groups = new Map();
  for (let t = 0; t < triCount; t++) {
    const r = find(rep[vi(t, 0)]);
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(t);
  }

  const components = [];
  for (const tris of groups.values()) {
    const idx = new Uint32Array(tris.length * 3);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < tris.length; i++) {
      for (let c = 0; c < 3; c++) {
        const vid = vi(tris[i], c);
        idx[i * 3 + c] = vid;
        box.expandByPoint(v.fromBufferAttribute(pos, vid));
      }
    }
    components.push({ triangles: tris.length, box, index: idx });
  }
  components.sort((a, b) => b.triangles - a.triangles);
  return components;
}

// Builds a compact geometry (only the referenced vertices) from a subset of
// components, so bounding boxes and draw calls only cover that subset.
export function geometryFromComponents(geometry, components) {
  const total = components.reduce((n, c) => n + c.index.length, 0);
  const remap = new Map();
  const idx = new Uint32Array(total);
  let o = 0;
  for (const c of components) {
    for (let i = 0; i < c.index.length; i++) {
      const v = c.index[i];
      let n = remap.get(v);
      if (n === undefined) { n = remap.size; remap.set(v, n); }
      idx[o++] = n;
    }
  }
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const src = geometry.attributes[name];
    const dst = new src.array.constructor(remap.size * src.itemSize);
    for (const [from, to] of remap) {
      for (let k = 0; k < src.itemSize; k++) dst[to * src.itemSize + k] = src.array[from * src.itemSize + k];
    }
    g.setAttribute(name, new THREE.BufferAttribute(dst, src.itemSize, src.normalized));
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
