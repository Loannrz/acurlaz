// "Casita" club décor (BACKDROP.variant = 'casita', settings CLUB in
// src/config.js): the DJ booth of a tropical latino bar facing an empty dance
// floor. Same interface as the studio backdrop of src/scene/backdrop.js
// ({ floor, reflections, attachReflections, update, variant } + `ready`), so
// main.js does not care which décor runs.
//
// Everything is static: no light, beam, garland, haze or reflection moves or
// pulses. The only change over time is the intro fade-in: the whole décor
// follows the light level of the intro (environment intensity tweened by
// src/intro/timeline.js), black on the first frame, so it comes up with the
// gear without a flash. It adds no render pass and no shadow caster. The club
// lights are baked once into an irradiance volume (bake.js) during `ready`,
// with the textures; main.js awaits `ready` before its shader warm-up, which
// then compiles every décor program before the first frame.
//
// Files: layout.js (floor plan), lights.js (fixed analytic lights),
// shading.js (décor shader), room.js, foliage.js, props.js, glow.js,
// textures.js (CC0 maps + procedural canvases).
import * as THREE from 'three';
import { CLUB, RENDER } from '../../config.js';
import { DANCE_Y, DESK, X_MIN, X_MAX, FAR, BACK, CEIL_Y } from './layout.js';
import { clubLights, lightUniforms, parUniforms, GREEN } from './lights.js';
import { createShared, clubMaterial } from './shading.js';
import { createVolume, bakeVolume, VOLUME_PARS } from './bake.js';
import { loadTextures, blank, cementTiles, leafAtlas, neonSign, clubEnvironment } from './textures.js';
import { buildRoom } from './room.js';
import { buildFoliage } from './foliage.js';
import { buildProps } from './props.js';
import { merge } from './geo.js';
import { createHalos, createBeams, createWashes, createNeon, syncFog } from './glow.js';

export function createClub({ scene, camera, lights, outputPass, renderer, onProgress }) {
  const C = CLUB;
  const level = { value: 0 };
  const group = new THREE.Group();
  group.name = 'club';
  scene.add(group);

  // --- fog (haze), deep green-black ---
  const fogColor = new THREE.Color(C.fogColor);
  scene.fog = new THREE.FogExp2(fogColor.clone(), C.fogDensity);

  // --- lights of the gear: same rig, colours warmed / tinted (intensities are
  // tweened by the intro timeline, colours are not) ---
  if (lights) {
    lights.key.color.set(C.gearLights.key);
    lights.rim.color.set(C.gearLights.rim);
    lights.fill.color.set(C.gearLights.fill);
  }

  // --- shared shading ---
  const lightSet = clubLights();
  const allLightU = lightUniforms(lightSet, C.lightGain);
  // irradiance volume over the room (niches and bar alcove included), baked in `ready`
  const volume = createVolume({ min: [X_MIN - 0.6, DANCE_Y - 0.1, FAR - 1.4], max: [X_MAX + 0.6, CEIL_Y + 0.05, BACK + 0.55], voxel: C.voxel });
  const shared = createShared(parUniforms(allLightU), volume.uniforms);
  shared.uClubLevel = level;

  // textures: placeholders now, the real ones in `ready` (before the warm-up)
  const tex = {};
  for (const k of ['brick', 'brickNormal', 'plaster', 'wood', 'planks', 'tiles', 'tilesNormal', 'tilesRough']) tex[k] = blank(k.endsWith('Normal') ? 0x8080ff : 0x808080);
  // canvas atlases at the profile's texture scale (MOBILE: half size)
  const ts = RENDER.textureScale ?? 1;
  const canvasTex = ts < 1
    ? { cement: cementTiles(Math.max(256, Math.round(512 * ts))), leaves: leafAtlas(Math.max(256, Math.round(1024 * ts))), neon: neonSign(Math.max(256, Math.round(1024 * ts))) }
    : { cement: cementTiles(), leaves: leafAtlas(), neon: neonSign() };

  const mats = {
    tiles: clubMaterial(shared, { name: 'club_tiles', map: tex.tiles, mapScale: 1.6, normalMap: tex.tilesNormal, normalScale: 0.8, roughMap: tex.tilesRough, saturation: C.floorSaturation, gloss: C.floorGloss, par: true, shininess: 700, color: C.floorTint, wrap: 0 }),
    planks: clubMaterial(shared, { name: 'club_planks', map: tex.planks, mapScale: 2.4, color: 0xa08878, gloss: 0.12, shininess: 40 }),
    brick: clubMaterial(shared, { name: 'club_brick', map: tex.brick, mapScale: 0.9, normalMap: tex.brickNormal, normalScale: 1.1, color: C.brickTint }),
    plasterGreen: clubMaterial(shared, { name: 'club_plasterGreen', map: tex.plaster, mapScale: 2.2, normalMap: null, color: C.plasterGreen }),
    plasterWarm: clubMaterial(shared, { name: 'club_plasterWarm', map: tex.plaster, mapScale: 2.2, color: C.plasterWarm }),
    ceiling: clubMaterial(shared, { name: 'club_ceiling', map: tex.planks, mapScale: 2.4, color: 0x2a2420 }),
    deskFront: clubMaterial(shared, { name: 'club_deskFront', map: canvasTex.cement, mapScale: 0.44, color: 0xb8b0a4, gloss: 0.25, shininess: 80, wash: { color: GREEN.map((v) => v * C.boothWash), top: -0.08, falloff: 0.32 } }),
    woodDark: clubMaterial(shared, { name: 'club_woodDark', map: tex.wood, mapScale: 1.2, saturation: 0.55, color: 0x7a6660, gloss: 0.2, shininess: 60 }),
    catcher: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    counterTop: counterTopMaterial(shared, tex.wood, clubEnvironment(), C),
  };
  mats.catcher.name = 'club_catcher';
  const litProps = clubMaterial(shared, { name: 'club_props', vertexColors: true, wrap: 0.25, gloss: 0.15, shininess: 50 });
  const emisProps = clubMaterial(shared, { name: 'club_emissive', vertexColors: true, unlit: true, emissive: C.emissiveGain });
  const leafMat = clubMaterial(shared, { name: 'club_leaves', leaf: true, map: canvasTex.leaves, side: THREE.DoubleSide, wrap: 0.35, trans: 0.5, gloss: 0.35, shininess: 40, color: C.leafTint, ao: 0.6 });

  // --- geometry ---
  const room = buildRoom(mats);
  for (const m of room.meshes) group.add(m);
  const props = buildProps({ lights: lightSet.lights });
  const foliage = buildFoliage({ material: leafMat, propsOut: props.lit });
  group.add(foliage.mesh);
  const litMesh = new THREE.Mesh(merge(props.lit, { color: true }), litProps);
  const emisMesh = new THREE.Mesh(merge(props.emis, { color: true }), emisProps);
  litMesh.name = 'club_props'; emisMesh.name = 'club_emissive';
  for (const m of [litMesh, emisMesh]) { m.matrixAutoUpdate = false; group.add(m); }

  // --- glows ---
  const glows = [
    createHalos(shared, props.halos, { gain: C.haloGain, name: 'halos' }),
    // warm bulbs / lamps mirrored in the satin counter top (no reflection on
    // the dance floor: it stays sober, only a faint sheen)
    createHalos(shared, props.halos.filter((h) => h.mirror !== false && h.color[0] > h.color[1] * 1.3), {
      gain: C.counterGlow, mirrorY: DESK.top, stretch: 1.8, falloff: 0.15, name: 'counterReflections',
      clip: { x0: -DESK.halfW - DESK.lip, x1: DESK.halfW + DESK.lip, z0: DESK.front - DESK.lip, z1: DESK.back + DESK.lip },
    }),
    createBeams(shared, props.beams, { gain: C.beamGain }),
    createWashes(shared, props.washes, { gain: 1 }),
    ...createNeon(shared, canvasTex.neon, { pos: [0, 2.3, -9.5 + 0.035], size: 1.45, gain: C.neonGain }),
  ];
  for (const g of glows) group.add(g);
  syncFog(glows, scene.fog);
  group.updateMatrixWorld(true);

  // --- vignette + static grain in the output pass (same as the studio) ---
  if (outputPass) patchOutput(outputPass, C.vignette, C.grain);

  // --- reflections of the units in the lacquered counter top ---
  const reflections = [];
  const attachReflections = (units) => {
    for (const u of units) {
      if (!u.material.map) continue;
      const opacity = { value: 0 };
      const mat = new THREE.MeshBasicMaterial({ map: u.material.map, color: C.counterReflectionTint, transparent: true, depthWrite: false });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, { uLevel: level, uOpacity: opacity, uStrength: { value: C.counterReflection }, uDepth: { value: 0.05 } }); // fades out before the catcher (5.6 cm down)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vBdY;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBdY = (modelMatrix * vec4(transformed, 1.0)).y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vBdY;\nuniform float uLevel; uniform float uOpacity; uniform float uStrength; uniform float uDepth;')
          .replace('#include <opaque_fragment>', `
            outgoingLight *= uLevel;
            diffuseColor.a = uStrength * uOpacity * (1.0 - smoothstep(0.0, uDepth, -vBdY));
            if (diffuseColor.a < 0.002) discard;
            #include <opaque_fragment>`);
      };
      const mesh = new THREE.Mesh(u.mesh.geometry, mat);
      mesh.name = `${u.key}_reflection`;
      mesh.scale.y = -1;
      mesh.renderOrder = -1;
      mesh.onBeforeRender = () => { opacity.value = u.material.opacity; };
      u.group.add(mesh);
      reflections.push(mesh);
    }
  };

  // --- textures, then ready ---
  const texturesReady = loadTextures({ onProgress: (f) => onProgress?.('textures', f) }).then((t) => {
    for (const [k, v] of Object.entries(t)) {
      tex[k].dispose();
      tex[k] = v;
    }
    const set = (m, name, v) => { if (m.uniforms?.[name]) m.uniforms[name].value = v; };
    set(mats.tiles, 'uMap', t.tiles); set(mats.tiles, 'uNormalMap', t.tilesNormal); set(mats.tiles, 'uRoughMap', t.tilesRough);
    set(mats.planks, 'uMap', t.planks); set(mats.ceiling, 'uMap', t.planks);
    set(mats.brick, 'uMap', t.brick); set(mats.brick, 'uNormalMap', t.brickNormal);
    set(mats.plasterGreen, 'uMap', t.plaster); set(mats.plasterWarm, 'uMap', t.plaster);
    set(mats.woodDark, 'uMap', t.wood);
    // counter top: stock material, UV mapped (1.2 m per repeat of the grain)
    const top = t.wood.clone();
    top.repeat.set(2.3, 0.93);
    top.needsUpdate = true;
    mats.counterTop.map = top;
    onProgress?.('textures', 1);
  }).catch((err) => { console.warn('[club] textures not loaded', err); onProgress?.('textures', 1); });
  const baked = renderer
    ? bakeVolume(renderer, volume, allLightU, { sky: C.ambientSky, ground: C.ambientGround })
      .catch((err) => { console.warn('[club] light bake failed', err); })
      .finally(() => onProgress?.('bake', 1))
    : Promise.resolve(console.warn('[club] no renderer: club lights not baked'));
  const ready = Promise.all([texturesReady, baked]);

  // Called every frame before rendering: follows the intro light level only.
  const update = () => {
    const l = lights?.full.env > 0 ? Math.min(1, lights.scene.environmentIntensity / lights.full.env) : 1;
    level.value = Math.pow(l, C.fadeCurve);
    scene.fog.color.copy(fogColor).multiplyScalar(level.value);
    // its own envMap is not scaled by scene.environmentIntensity: fade it here
    mats.counterTop.envMapIntensity = C.counterSheen * level.value;
  };
  update();

  const floor = room.meshes.find((m) => m.name === 'club_danceFloor');
  return { group, floor, reflections, attachReflections, update, variant: 'casita', ready, stats: { leaves: foliage.count, halos: props.halos.length, beams: props.beams.length } };
}

function counterTopMaterial(shared, map, envMap, C) {
  // satin lacquer: a soft sheen, never a white glare under the key light
  const m = new THREE.MeshPhysicalMaterial({
    map, envMap, color: C.counterTint, roughness: 0.5, metalness: 0,
    specularIntensity: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.32, envMapIntensity: C.counterSheen,
  });
  m.name = 'club_counterTop';
  m.depthWrite = false; // the mirrored units show through it (catcher below)
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClubW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvClubW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vClubW;\nuniform float uClubLevel;\n${VOLUME_PARS}`)
      .replace('#include <opaque_fragment>', `
        outgoingLight += diffuseColor.rgb * clubIrradiance(vClubW, vec3(0.0, 1.0, 0.0)) * uClubLevel;
        #include <opaque_fragment>`);
  };
  return m;
}

function patchOutput(outputPass, vignette, grain) {
  Object.assign(outputPass.uniforms, { uVignette: { value: vignette }, uGrain: { value: grain } });
  const m = outputPass.material;
  const i = m.fragmentShader.lastIndexOf('}');
  m.fragmentShader = m.fragmentShader
    .slice(0, i)
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform float uVignette;\nuniform float uGrain;')
    + `
      {
        vec2 q = vUv - 0.5;
        gl_FragColor.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(q * vec2(1.15, 1.0)) * 1.25);
        float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor.rgb += (g - 0.5) * uGrain;
      }
    }`;
  m.uniforms = outputPass.uniforms;
  m.needsUpdate = true;
}
