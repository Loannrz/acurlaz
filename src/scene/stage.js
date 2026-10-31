// Places the three units (CDJ | mixer | CDJ) and exposes per-unit helpers
// (home position, opaque / transparent switch of their materials).
import * as THREE from 'three';
import { loadUnits } from './units.js';
import { MODEL_URL, UNIT_GAP_M } from '../config.js';

export async function buildStage(scene, renderer, { onProgress } = {}) {
  const { units } = await loadUnits(MODEL_URL, renderer, { onProgress });
  const root = new THREE.Group();
  root.name = 'set';
  scene.add(root);

  const cdjW = units.cdjLeft.bounds.max.x - units.cdjLeft.bounds.min.x;
  const mixW = units.mixer.bounds.max.x - units.mixer.bounds.min.x;
  const cdjD = units.cdjLeft.bounds.max.z - units.cdjLeft.bounds.min.z;
  const mixD = units.mixer.bounds.max.z - units.mixer.bounds.min.z;
  const sideX = cdjW / 2 + UNIT_GAP_M + mixW / 2;
  // Front edges aligned (the mixer is shallower than the CDJs).
  const mixerZ = (cdjD - mixD) / 2;

  const homes = {
    cdjLeft: new THREE.Vector3(-sideX, 0, 0),
    mixer: new THREE.Vector3(0, 0, mixerZ),
    cdjRight: new THREE.Vector3(sideX, 0, 0),
  };

  const list = [];
  for (const key of ['cdjLeft', 'mixer', 'cdjRight']) {
    const u = units[key];
    u.home = homes[key];
    u.group.position.copy(u.home);
    // Materials of the unit and of what lies on it (screens, VU covers, key
    // caps, prints...: they register themselves here). They are built
    // transparent; main.js switches them all to the cheaper opaque path once
    // everything is built (the units never fade: they are visible from the start).
    u.fadeMaterials = [u.material];
    u.setOpaque = (opaque) => {
      for (const m of u.fadeMaterials) {
        if (m.transparent === !opaque) continue;
        m.transparent = !opaque;
        m.needsUpdate = true;
      }
    };
    u.surfaceY = u.key === 'mixer' ? 0.0921 : 0.0945; // measured flat top (m)
    root.add(u.group);
    list.push(u);
  }

  root.updateMatrixWorld(true); // raycasts (hotspots, cables) need world matrices

  // World-space extents, for the camera framing.
  const box = new THREE.Box3();
  for (const u of list) box.expandByObject(u.group);

  return { root, units, list, box };
}
