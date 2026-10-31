// Loads the Sketchfab GLB and turns it into normalised "units".
//
// What the file really contains (checked with inspect.html): one mesh with the
// TWO CDJ-3000 side by side plus a modelled cable, and one mesh with the
// DJM-900NXS2 plus several modelled cables. Each mesh is split into connected
// components, components are assigned to a unit by position, and the modelled
// cables are discarded (the intro animates its own cables), as are the USB
// sticks plugged into the CDJs.
//
// Unit local frame: x -> right, y -> up, z -> towards the DJ (front).
// Rear ports face -z. Origin: centre of the footprint, bottom of the chassis.
// Scale is normalised so a CDJ is 452 mm wide (real CDJ-3000 width).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CDJ_WIDTH_M, RENDER } from '../config.js';
import { splitComponents, geometryFromComponents } from './split.js';
import { fetchProgress } from '../ui/loader.js';

// The production build also ships the model gzipped (`<model>.glb.gz`, written
// by vite.config.js from public/models: same bytes once inflated, so node names,
// UVs and topology are untouched): 2.2 MB -> 1.1 MB on the wire, whatever the
// host compresses. It is inflated with DecompressionStream; any failure (old
// browser, file missing, dev server) falls back to the plain .glb (index.html
// preloads the file that will be used).
// onProgress(fraction 0..1): bytes received over the size of the file (or over
// the inflated size when the transfer is compressed). The .gz download fills
// 0..GZ_SHARE (inflating it is the rest); after a fallback, the plain file fills
// the bar from where the first attempt left it up to 1, so the bar (which never
// goes back) keeps moving during the second download instead of sitting at ~98 %.
const INFLATED_BYTES = 2.3e6; // ~size of the .glb (progress when the length is unknown)
const GZ_SHARE = 0.9;
async function fetchModel(url, onProgress) {
  let reached = 0;
  const report = (from, to) => (loaded, total) => {
    const f = Math.min(1, total ? loaded / total : loaded / INFLATED_BYTES);
    reached = from + (to - from) * f;
    onProgress?.(reached);
  };
  if (import.meta.env.PROD && typeof DecompressionStream === 'function') {
    try {
      const blob = await fetchProgress(`${url}.gz`, report(0, GZ_SHARE));
      const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      // 1f 8b: gzip bytes; otherwise the server already decoded it (Content-Encoding)
      const body = head[0] === 0x1f && head[1] === 0x8b ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob.stream();
      const buf = await new Response(body).arrayBuffer();
      if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) === 'glTF') return buf;
    } catch { /* plain file below */ }
  }
  return (await fetchProgress(url, report(reached, 1))).arrayBuffer();
}

const MESH_MATCH = { cdj: /cdj/i, mixer: /djm/i };

export async function loadUnits(url, renderer, { onProgress } = {}) {
  // onProgress(fraction 0..1) of the model download (loading screen)
  const data = await fetchModel(url, onProgress);
  const gltf = await new GLTFLoader().parseAsync(data, url.replace(/[^/]*$/, ''));
  const raw = gltf.scene;
  raw.updateMatrixWorld(true);

  const meshes = [];
  raw.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const findMesh = (re) => {
    const m = meshes.find((mm) => re.test(mm.name));
    if (!m) throw new Error(`mesh ${re} missing from ${url}`);
    return m;
  };

  // Bake node transforms into world-space geometry (Y up, unscaled).
  const bake = (mesh) => {
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    return g;
  };
  const cdjGeo = bake(findMesh(MESH_MATCH.cdj));
  const mixerGeo = bake(findMesh(MESH_MATCH.mixer));
  const cdjParts = splitComponents(cdjGeo);
  const mixerParts = splitComponents(mixerGeo);

  // Chassis = components with the largest footprint (triangle count is useless
  // here: the modelled cables have far more triangles than the simple boxes).
  const area = (p) => (p.box.max.x - p.box.min.x) * (p.box.max.z - p.box.min.z);
  const byArea = [...cdjParts].sort((a, b) => area(b) - area(a));
  const bodyA = byArea[0];
  const bodyB = byArea.find((p) => p.box.max.x < bodyA.box.min.x || p.box.min.x > bodyA.box.max.x);
  const [leftBody, rightBody] = bodyA.box.min.x < bodyB.box.min.x ? [bodyA, bodyB] : [bodyB, bodyA];
  const cdjWidthRaw = Math.max(leftBody.box.max.x - leftBody.box.min.x, rightBody.box.max.x - rightBody.box.min.x);

  // Assign every component to the chassis whose footprint contains its centre;
  // anything behind the rear face (cables, plugs) or outside both is dropped.
  const assign = (parts, bodies) => {
    const kept = bodies.map(() => []);
    const dropped = [];
    const c = new THREE.Vector3();
    for (const p of parts) {
      p.box.getCenter(c);
      const i = bodies.findIndex((b) => c.x >= b.box.min.x && c.x <= b.box.max.x && c.z >= b.box.min.z && c.z <= b.box.max.z);
      if (i < 0) { dropped.push(p); continue; }
      kept[i].push(p);
    }
    return { kept, dropped };
  };
  const cdjAssign = assign(cdjParts, [leftBody, rightBody]);
  const dropped = cdjAssign.dropped;
  // The model ships each CDJ with a red USB stick plugged into the top-left
  // rear port (stick body + its connector): drop them, keep the port itself.
  // Stick = narrow part near the rear-left corner rising well above the top.
  const mmRaw = cdjWidthRaw / (CDJ_WIDTH_M * 1000); // raw units per real millimetre
  const isUsbStick = (p, body) =>
    p.box.max.y > body.box.max.y + 8 * mmRaw &&
    p.box.max.x - p.box.min.x < 30 * mmRaw &&
    p.box.min.x < body.box.min.x + 35 * mmRaw &&
    p.box.min.z < body.box.min.z + 30 * mmRaw;
  const usbSticks = [];
  const [left, right] = cdjAssign.kept.map((parts, i) => {
    const body = [leftBody, rightBody][i];
    return parts.filter((p) => (isUsbStick(p, body) ? (usbSticks.push(p), false) : true));
  });
  const mixerBody = [...mixerParts].sort((a, b) => area(b) - area(a))[0];
  const mixerAssign = assign(mixerParts, [mixerBody]);
  const mixerKeep = mixerAssign.kept[0];
  const mixerDropped = mixerAssign.dropped;

  const scale = CDJ_WIDTH_M / cdjWidthRaw;
  const cdjMat = findMesh(MESH_MATCH.cdj).material;
  const mixerMat = findMesh(MESH_MATCH.mixer).material;
  const units = {
    cdjLeft: buildUnit('cdjLeft', geometryFromComponents(cdjGeo, left), cdjMat, scale, renderer),
    cdjRight: buildUnit('cdjRight', geometryFromComponents(cdjGeo, right), cdjMat, scale, renderer),
    mixer: buildUnit('mixer', geometryFromComponents(mixerGeo, mixerKeep), mixerMat, scale, renderer),
  };
  const debug = {
    bodies: [leftBody, rightBody, mixerBody].map(describe),
    cdjParts: cdjParts.map(describe), mixerParts: mixerParts.map(describe),
    dropped: dropped.map(describe), mixerDropped: mixerDropped.map(describe), usbSticks: usbSticks.map(describe), scale,
  };
  return { units, raw, scale, debug };
}

function describe(p) {
  const r = (v) => Math.round(v * 1000) / 1000;
  return { tris: p.triangles, min: [r(p.box.min.x), r(p.box.min.y), r(p.box.min.z)], max: [r(p.box.max.x), r(p.box.max.y), r(p.box.max.z)] };
}

function buildUnit(key, geometry, srcMaterial, scale, renderer) {
  // Own copy of the attributes so each unit can be re-centred independently.
  geometry = geometry.clone();
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = srcMaterial.clone();
  material.transparent = true; // needed for the fade-in
  material.opacity = 1;
  material.side = THREE.FrontSide;
  if (material.map) {
    const maxAniso = renderer?.capabilities.getMaxAnisotropy() ?? RENDER.anisotropy;
    material.map.anisotropy = Math.min(RENDER.anisotropy, maxAniso);
    material.map.colorSpace = THREE.SRGBColorSpace;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${key}_body`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = key;
  group.add(mesh);
  return { key, group, mesh, material, bounds: geometry.boundingBox.clone() };
}
