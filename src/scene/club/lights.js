// Fixed club lights. They are NOT three.js lights: their diffuse light is baked
// once at start-up into an irradiance volume (./bake.js) read by the décor
// shaders (./shading.js); the first NPAR lights (the PAR cans) also give crisp
// highlights on the lacquered floor. They cost nothing to the DJ gear (lit by
// src/scene/renderer.js only) and add no shadow pass. Nothing here moves or
// changes over time: the only variation is the intro fade-in.
//   - points / spots: { pos, color, power, soft, dir?, cone? [outer, inner] deg }
//       irradiance = color * power * soft^2 / (d^2 + soft^2)  (x spot cone)
//   - segments (LED strips): { a, b, color, power, soft } lit from the closest
//       point of the strip
import * as THREE from 'three';
import { DANCE_Y, STAGE_Y, TRUSS_Y, BACK, FAR, X_MIN, X_MAX, DESK, FRONT } from './layout.js';

export const NL = 16; // points / spots (shader array size)
export const NS = 6; // segments
export const NPAR = 5; // the first NPAR lights are the PAR cans (floor highlights)

// Palette (linear-ish RGB, before the power factor).
export const AMBER = [1.0, 0.52, 0.2];
export const WARM = [1.0, 0.68, 0.38]; // tungsten bulbs
export const GREEN = [0.12, 0.85, 0.42];

const down = (x = 0, z = 0) => new THREE.Vector3(x, -1, z).normalize().toArray();

export function clubLights() {
  const parY = TRUSS_Y - 0.25;
  const spot = (x, z, dx, dz, color, power) => ({ pos: [x, parY, z], dir: down(dx, dz), cone: [24, 3], color, power, soft: 1.8 });
  const lights = [
    // PAR cans over the dance floor, aimed down (soft pools on the lacquered floor)
    spot(-2.2, -2.3, -0.08, 0.02, GREEN, 7.5),
    spot(0.0, -2.3, 0, 0.02, AMBER, 5.5),
    spot(2.2, -2.3, 0.08, 0.02, GREEN, 7.5),
    spot(-1.6, -6.0, -0.12, 0.05, AMBER, 5.5),
    spot(1.6, -6.0, 0.12, 0.05, GREEN, 7.5),
    // warm fill of the string lights over the floor
    { pos: [0.0, 1.0, -3.4], color: WARM, power: 0.5, soft: 2.6 },
    { pos: [0.0, 1.0, -7.0], color: WARM, power: 0.45, soft: 2.6 },
    // inside the bar alcove (amber glow spilling out of the far arch)
    { pos: [0.0, 0.5, FAR - 0.55], color: AMBER, power: 2.2, soft: 1.1 },
    // DJ area: warm down light over the booth and the stage (not on the gear:
    // the gear is lit by src/scene/renderer.js only)
    { pos: [0.0, 2.7, 1.9], dir: down(0, -0.25), cone: [65, 20], color: WARM, power: 3.6, soft: 2.4 },
    // stage sides, warm
    { pos: [-3.0, 1.8, 1.0], color: WARM, power: 1.0, soft: 1.6 },
    // behind the DJ: warm wall washers grazing the brick, a glow inside the big arch
    { pos: [-2.4, 2.2, BACK - 0.6], dir: new THREE.Vector3(0, -1, 0.3).normalize().toArray(), cone: [38, 8], color: AMBER, power: 3.2, soft: 1.3 },
    { pos: [2.4, 2.2, BACK - 0.6], dir: new THREE.Vector3(0, -1, 0.3).normalize().toArray(), cone: [38, 8], color: AMBER, power: 3.2, soft: 1.3 },
    { pos: [0.0, 0.6, BACK - 0.25], color: WARM, power: 1.1, soft: 0.9 },
    // green uplights in the big plants at both stage corners
    { pos: [-4.6, STAGE_Y + 0.15, 2.0], dir: [0, 1, 0], cone: [60, 15], color: GREEN, power: 2.6, soft: 0.9 },
    { pos: [4.6, STAGE_Y + 0.15, 2.0], dir: [0, 1, 0], cone: [60, 15], color: GREEN, power: 2.6, soft: 0.9 },
    { pos: [3.0, 1.8, 1.0], color: WARM, power: 1.0, soft: 1.6 },
  ];
  const cove = DANCE_Y + 0.04;
  const segments = [
    // under the counter lip: green wash down the booth front
    { a: [-DESK.halfW + 0.05, DESK.top - DESK.slab - 0.01, FRONT - 0.07], b: [DESK.halfW - 0.05, DESK.top - DESK.slab - 0.01, FRONT - 0.07], color: GREEN, power: 1.4, soft: 0.22 },
    // green coves at the foot of the side walls and of the far wall (grazing the brick / plaster)
    { a: [X_MIN + 0.08, cove, FAR + 0.3], b: [X_MIN + 0.08, cove, FRONT - 0.3], color: GREEN, power: 0.7, soft: 0.45 },
    { a: [X_MAX - 0.08, cove, FAR + 0.3], b: [X_MAX - 0.08, cove, FRONT - 0.3], color: GREEN, power: 0.7, soft: 0.45 },
    { a: [X_MIN + 0.3, cove, FAR + 0.08], b: [X_MAX - 0.3, cove, FAR + 0.08], color: GREEN, power: 0.7, soft: 0.45 },
    // DJ side: warm strip under the counter lip (washes the back of the booth)
    // and at the foot of the booth on the stage
    { a: [-DESK.halfW + 0.05, DESK.top - DESK.slab - 0.01, DESK.back + 0.08], b: [DESK.halfW - 0.05, DESK.top - DESK.slab - 0.01, DESK.back + 0.08], color: WARM, power: 0.9, soft: 0.3 },
    { a: [-DESK.halfW, STAGE_Y + 0.02, DESK.back + 0.03], b: [DESK.halfW, STAGE_Y + 0.02, DESK.back + 0.03], color: WARM, power: 0.9, soft: 0.35 },
  ];
  return { lights: lights.slice(0, NL), segments: segments.slice(0, NS) };
}

// Packs the lights into the shader uniforms of ./shading.js (shared by every
// décor material: one set of uniform objects).
export function lightUniforms({ lights, segments }, gain = 1) {
  const LP = [], LC = [], LD = [];
  for (let i = 0; i < NL; i++) {
    const l = lights[i];
    if (!l) { LP.push(new THREE.Vector4(0, -50, 0, 1)); LC.push(new THREE.Vector4(0, 0, 0, -2)); LD.push(new THREE.Vector4(0, -1, 0, 1)); continue; }
    const p = l.power * gain;
    LP.push(new THREE.Vector4(...l.pos, l.soft * l.soft));
    const outer = l.cone ? Math.cos(THREE.MathUtils.degToRad(l.cone[0])) : -2;
    const inner = l.cone ? Math.cos(THREE.MathUtils.degToRad(l.cone[1])) : 1;
    LC.push(new THREE.Vector4(l.color[0] * p, l.color[1] * p, l.color[2] * p, outer));
    LD.push(new THREE.Vector4(...(l.dir ?? [0, -1, 0]), inner));
  }
  const SA = [], SB = [], SC = [];
  for (let i = 0; i < NS; i++) {
    const s = segments[i];
    if (!s) { SA.push(new THREE.Vector4(0, -50, 0, 1)); SB.push(new THREE.Vector3(0, -50, 0)); SC.push(new THREE.Vector3()); continue; }
    const p = s.power * gain;
    SA.push(new THREE.Vector4(...s.a, s.soft * s.soft));
    SB.push(new THREE.Vector3(...s.b));
    SC.push(new THREE.Vector3(s.color[0] * p, s.color[1] * p, s.color[2] * p));
  }
  return {
    uClubLP: { value: LP }, uClubLC: { value: LC }, uClubLD: { value: LD },
    uClubSA: { value: SA }, uClubSB: { value: SB }, uClubSC: { value: SC },
  };
}

// Uniforms of the PAR cans only (floor highlights in shading.js).
export function parUniforms(all) {
  return {
    uClubLP: { value: all.uClubLP.value.slice(0, NPAR) },
    uClubLC: { value: all.uClubLC.value.slice(0, NPAR) },
    uClubLD: { value: all.uClubLD.value.slice(0, NPAR) },
  };
}
