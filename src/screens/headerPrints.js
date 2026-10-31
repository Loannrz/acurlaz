// Prints above the row of keys of each CDJ screen: the baked "rekordbox" logo
// (top left, above SOURCES) and the blurred logo above ÉCHAP are replaced by
// "ACURLAZ" and "MUSIQUE":
//   1. the baked print is painted out of the model texture, in place (the
//      texture already patched by src/controls; both CDJs share the same UVs, so
//      it is painted once), each texel row interpolated between the bare panel
//      on its left and right (createTexturePatcher().band);
//   2. the new text is a decal lying on the panel of each CDJ: a transparent
//      canvas at HEADER_PRINTS.pxPerMm (sharp up close, mipmapped far away), lit
//      with the unit's own material settings. Not raycast: clicks are unchanged.
// Static: nothing moves. Call once, right after createMixerLabel() (main.js):
//   createHeaderPrints({ units, texture: controls.texture })
// Positions: unit-local mm, measured on
//   /inspect.html?unit=cdjLeft&view=top&rect=-108,-224,-66,-210&px=30&step=2
//   /inspect.html?unit=cdjLeft&view=top&rect=76,-224,106,-208&px=30&step=2
import * as THREE from 'three';
import { createTexturePatcher } from '../controls/texturePatch.js';
import { affine } from '../controls/index.js';
import { TOP_ROW_LABELS } from '../scene/screens.js';

export const HEADER_PRINTS = {
  font: TOP_ROW_LABELS.font, // same family as the printed keys
  weight: 700,
  pxPerMm: 48,
  prints: [
    // baked "rekordbox": x -102.3..-76.3, z -219.4..-214.1 (blur included), on the
    // silver corner. Printed in graphite: a white print vanishes on the silver
    // (measured: "ACU" unreadable); ink: [244, 244, 242] for white.
    { text: 'ACURLAZ', x: -89.3, z: -216.9, capHeight: 2.6, spacing: 0.2, ink: [34, 34, 36], erase: [-104.2, -220.4, -74.6, -213.9], decal: [34, 7] },
    // baked logo above MENU / ÉCHAP: x 81.8..99.8, z -217.8..-213.6, on the dark panel: white
    { text: 'MUSIQUE', x: 90.8, z: -215.7, capHeight: 2.3, spacing: 0.16, ink: [244, 244, 242], erase: [80.6, -218.9, 101.2, -213.4], decal: [28, 6] },
  ],
};

export function createHeaderPrints({ units, texture = null }) {
  const cdjs = [units?.cdjLeft, units?.cdjRight].filter(Boolean);
  if (!cdjs.length) return null;
  const P = HEADER_PRINTS;
  const map = texture ?? cdjs[0].material.map;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const hitAt = (unit, x, z) => {
    unit.group.updateMatrixWorld(true);
    ray.set(unit.group.localToWorld(new THREE.Vector3(x / 1000, 1, z / 1000)), down);
    return ray.intersectObject(unit.mesh, false)[0] ?? null;
  };

  // 1. paint the baked prints out (once: both CDJs share the texture and the UVs)
  if (map?.image?.width) {
    const unit = cdjs[0];
    const inPlace = map.image instanceof HTMLCanvasElement;
    const patcher = createTexturePatcher(map, { inPlace });
    const g = unit.mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv;
    for (const p of P.prints) {
      const hit = hitAt(unit, p.x, p.z);
      if (!hit) { console.warn('[headerPrints] panel not found under', p.text); continue; }
      const f = hit.face;
      const aff = affine([f.a, f.b, f.c].map((i) => [pos.getX(i) * 1000, pos.getZ(i) * 1000, uv.getX(i), uv.getY(i)]));
      patcher.band(aff, p.erase, { margin: 3 });
    }
    if (inPlace) map.needsUpdate = true;
    else {
      const patched = patcher.texture();
      for (const u of Object.values(units)) if (u.material.map === map) { u.material.map = patched; u.material.needsUpdate = true; }
    }
  }

  // 2. the new prints, one canvas per text, shared by both CDJs
  const textures = P.prints.map((p) => printTexture(p, P));
  const meshes = [];
  for (const unit of cdjs) {
    P.prints.forEach((p, k) => {
      const hit = hitAt(unit, p.x, p.z);
      if (!hit) return;
      const [dw, dh] = p.decal;
      const mat = new THREE.MeshStandardMaterial({
        map: textures[k], color: 0xffffff,
        metalness: unit.material.metalness ?? 0, roughness: Math.max(0.5, unit.material.roughness ?? 0.8),
        transparent: true, premultipliedAlpha: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(dw / 1000, dh / 1000), mat);
      mesh.name = `${unit.key}_header_${p.text.toLowerCase()}`;
      mesh.rotation.x = -Math.PI / 2; // facing up, top of the text away from the DJ
      mesh.position.y = 0.00003;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.raycast = () => {}; // visual only
      const group = new THREE.Group();
      group.name = `${unit.key}_header_print`;
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.face.normal.clone().normalize());
      group.position.copy(unit.group.worldToLocal(hit.point.clone()));
      group.add(mesh);
      unit.group.add(group);
      // intro fade: follows the unit's opacity, stays transparent when the unit turns opaque
      unit.fadeMaterials?.push({
        transparent: true, needsUpdate: false,
        set opacity(v) { mat.opacity = v; },
        get opacity() { return mat.opacity; },
      });
      meshes.push(mesh);
    });
  }
  return { meshes };
}

function printTexture(p, P) {
  const [dw, dh] = p.decal;
  const cv = document.createElement('canvas');
  cv.width = Math.round(dw * P.pxPerMm); cv.height = Math.round(dh * P.pxPerMm);
  const c2 = cv.getContext('2d');
  c2.font = `${P.weight} 100px ${P.font}`;
  const capRatio = (c2.measureText('H').actualBoundingBoxAscent || 72) / 100;
  const size = (p.capHeight * P.pxPerMm) / capRatio;
  const spacing = size * p.spacing;
  c2.font = `${P.weight} ${size}px ${P.font}`;
  c2.letterSpacing = `${spacing}px`;
  c2.textAlign = 'center';
  c2.textBaseline = 'alphabetic';
  const x = cv.width / 2 + spacing / 2; // the trailing letter spacing is not part of the visible text
  const y = cv.height / 2 + (p.capHeight * P.pxPerMm) / 2;
  c2.fillStyle = `rgb(${p.ink.join(',')})`;
  c2.fillText(p.text, x, y);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.premultiplyAlpha = true; // clean mipmaps on a transparent background
  return tex;
}
