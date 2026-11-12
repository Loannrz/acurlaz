// Découpe d'un maillage monolithique en composantes connexes.
// Le glb soude deux CDJ, leurs câbles et tous les reliefs de boutons dans un
// seul maillage : on ressoude les sommets par position (les coutures de
// normales et d'UV sont ignorées), on regroupe les triangles par union-find,
// puis chaque composante est rendue avec sa boîte englobante.
import * as THREE from 'three';

export function splitComponents(geometry, weld = 1e-4) {
  const pos = geometry.attributes.position;
  const index = geometry.index ? geometry.index.array : null;
  const vertexCount = pos.count;
  const triCount = index ? index.length / 3 : vertexCount / 3;
  const corner = (t, c) => (index ? index[t * 3 + c] : t * 3 + c);

  // Soudure : un représentant par position quantifiée.
  const inv = 1 / weld;
  const seen = new Map();
  const rep = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const key = `${Math.round(pos.getX(i) * inv)},${Math.round(pos.getY(i) * inv)},${Math.round(pos.getZ(i) * inv)}`;
    let id = seen.get(key);
    if (id === undefined) { id = i; seen.set(key, id); }
    rep[i] = id;
  }

  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const find = (a) => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < triCount; t++) {
    const a = rep[corner(t, 0)];
    union(a, rep[corner(t, 1)]);
    union(a, rep[corner(t, 2)]);
  }

  const groups = new Map();
  for (let t = 0; t < triCount; t++) {
    const root = find(rep[corner(t, 0)]);
    let list = groups.get(root);
    if (!list) { list = []; groups.set(root, list); }
    list.push(t);
  }

  const v = new THREE.Vector3();
  const components = [];
  for (const tris of groups.values()) {
    const idx = new Uint32Array(tris.length * 3);
    const box = new THREE.Box3();
    for (let i = 0; i < tris.length; i++) {
      for (let c = 0; c < 3; c++) {
        const vid = corner(tris[i], c);
        idx[i * 3 + c] = vid;
        box.expandByPoint(v.fromBufferAttribute(pos, vid));
      }
    }
    components.push({ triangles: tris.length, box, index: idx });
  }
  return components;
}

// Géométrie compacte (seuls les sommets référencés) à partir d'un sous-ensemble
// de composantes.
export function geometryFromComponents(geometry, components) {
  const total = components.reduce((n, c) => n + c.index.length, 0);
  const remap = new Map();
  const idx = new Uint32Array(total);
  let o = 0;
  for (const c of components) {
    for (let i = 0; i < c.index.length; i++) {
      const from = c.index[i];
      let to = remap.get(from);
      if (to === undefined) { to = remap.size; remap.set(from, to); }
      idx[o++] = to;
    }
  }
  const out = new THREE.BufferGeometry();
  for (const [name, src] of Object.entries(geometry.attributes)) {
    const size = src.itemSize;
    const dst = new src.array.constructor(remap.size * size);
    for (const [from, to] of remap) {
      for (let k = 0; k < size; k++) dst[to * size + k] = src.array[from * size + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, size, src.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
