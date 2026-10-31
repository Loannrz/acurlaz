// Mixer print "BEAT FX": the section title printed above the Beat FX display
// of the mixer is painted out of the model texture, in place (the texture
// already patched by src/controls: same object, reflections included), each
// texel row interpolated between the bare band on its left and right
// (createTexturePatcher().band). That display is now the CRÉDITS screen
// (src/screens/pages/standby.js, credits.js) and a 3D key "ÉCHAP" lies where the
// print was (MIXER_TOP_KEYS in src/scene/screens.js). The other "BEAT FX"
// prints (channel assign buttons chN_beat_fx) are untouched. Call right after
// createControls() (main.js, inspect.js), before the reflections / screens /
// keys read the units:
//   const label = createMixerLabel({ units, texture: controls?.texture })
//   label.ink: colour of the baked print (sRGB 0..255); label.logo: the artist
//   logo placed on the mixer front (src/scene/mixerLogo.js).
import * as THREE from 'three';
import { createTexturePatcher } from '../controls/texturePatch.js';
import { affine } from '../controls/index.js';
import { createMixerLogo } from './mixerLogo.js';

// Unit-local mm, measured on /inspect.html?unit=mixer&view=top&rect=108,-126,158,-108&px=24&controls=0
export const MIXER_LABEL = {
  bakedText: 'BEAT FX',
  x: 132.8, z: -117.0, // centre of the baked print
  bakedWidth: 15.0, // width of the baked "BEAT FX"
  capHeight: 2.45, // capitals of the baked print
  erase: [124.4, -119.0, 141.2, -115.25], // painted out (x0, z0, x1, z1): print + its blur
  fallbackInk: [206, 206, 206], // if the texture cannot be read
};

export function createMixerLabel({ units, texture = null }) {
  const unit = units?.mixer;
  if (!unit) return null;
  const L = MIXER_LABEL;
  const map = texture ?? unit.material.map;
  // artist logo on the front face of the mixer (src/scene/mixerLogo.js)
  const logo = createMixerLogo({ unit });

  // surface under the print: point, normal and mm -> uv affine of the hit triangle
  unit.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.set(unit.group.localToWorld(new THREE.Vector3(L.x / 1000, 1, L.z / 1000)), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(unit.mesh, false)[0];
  if (!hit) { console.warn('[mixerLabel] panel not found under the print'); return null; }

  // paint the baked print out
  let ink = L.fallbackInk;
  if (map?.image?.width) {
    const g = unit.mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv;
    const f = hit.face;
    const aff = affine([f.a, f.b, f.c].map((i) => [pos.getX(i) * 1000, pos.getZ(i) * 1000, uv.getX(i), uv.getY(i)]));
    const inPlace = map.image instanceof HTMLCanvasElement;
    const patcher = createTexturePatcher(map, { inPlace });
    const hw = L.bakedWidth / 2, hc = L.capHeight / 2;
    // brightest texels: the baked print is blurred (~3 texels/mm), its core is the ink
    ink = patcher.inkColour(aff, [L.x - hw, L.z - hc, L.x + hw, L.z + hc], 0.995) ?? ink;
    patcher.band(aff, L.erase);
    if (inPlace) map.needsUpdate = true;
    else { // original (image) map, e.g. inspect.html?controls=0: swap in the patched copy
      const patched = patcher.texture();
      for (const u of Object.values(units)) if (u.material.map === map) { u.material.map = patched; u.material.needsUpdate = true; }
    }
  }

  return { ink, logo };
}
