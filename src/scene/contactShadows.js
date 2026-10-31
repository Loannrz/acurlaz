// Soft contact shadow under each unit (ambient occlusion where the chassis meets
// the counter top): a flat quad just above the counter, black with a soft alpha
// falloff around the footprint. Static (the units never move): no draw cost
// beyond three small transparent quads, one shared texture, no shadow pass.
import * as THREE from 'three';

const SIZE = 128; // texture resolution (~4 mm per texel on a CDJ: smooth falloff, no banding)
const MARGIN = 0.035; // m of falloff around the footprint
const Y = 0.0006; // m above the counter top (y = 0; it writes no depth: no z-fighting)

export const CONTACT = { strength: 0.42 };

// Alpha of a rounded-box shadow: 1 inside the inner box (fraction `inner` of the
// quad half size, per axis), smooth falloff to 0 at the quad border. The quad is the
// footprint plus MARGIN on each side; `inner` is computed for the CDJ and shared
// with the mixer (falloff 3.0 cm instead of 3.5 cm on its long side: invisible).
function shadowTexture(innerU, innerV) {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      // -1..1 over the quad; the inner footprint ends at +-innerU / +-innerV
      const u = ((i + 0.5) / SIZE) * 2 - 1;
      const v = ((j + 0.5) / SIZE) * 2 - 1;
      // distance outside the inner box, normalised to the falloff width (0..1)
      const dx = Math.max(0, (Math.abs(u) - innerU) / (1 - innerU));
      const dy = Math.max(0, (Math.abs(v) - innerV) / (1 - innerV));
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = (1 - d) ** 2.2; // dense at the edge of the chassis, long soft tail
      const k = (j * SIZE + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = 0;
      data[k + 3] = Math.round(255 * a);
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
export function createContactShadows(stage) {
  const cdj = stage.units.cdjLeft.bounds;
  const halfW = (cdj.max.x - cdj.min.x) / 2;
  const halfD = (cdj.max.z - cdj.min.z) / 2;
  const map = shadowTexture(halfW / (halfW + MARGIN), halfD / (halfD + MARGIN));
  const list = [];
  for (const u of stage.list) {
    const b = u.bounds;
    const w = b.max.x - b.min.x + 2 * MARGIN;
    const d = b.max.z - b.min.z + 2 * MARGIN;
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, map, transparent: true, depthWrite: false, opacity: CONTACT.strength });
    material.name = `${u.key}_contactShadow`;
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `${u.key}_contactShadow`;
    mesh.position.set(u.home.x + (b.min.x + b.max.x) / 2, Y, u.home.z + (b.min.z + b.max.z) / 2);
    mesh.renderOrder = -0.5; // after the counter reflections (-1), before the units
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {}; // visual only (never picked by the hotspots)
    stage.root.add(mesh);
    list.push(mesh);
  }
  return { list, map };
}
