// One shader for the whole décor. It does not use three.js lights: the diffuse
// light of the fixed club lights (./lights.js) is read from the irradiance
// volume baked once at start-up (./bake.js: 3 texture reads per pixel), plus
// leaf translucency, a glossy sheen (club light seen in the reflection
// direction, and crisp highlights of the PAR cans on the lacquered floor), an
// analytic ambient occlusion against the room box, and the scene fog. Variants are compiled from defines (same program shared by every
// material with the same defines), so the décor costs only a handful of
// programs, all compiled by the shader warm-up of src/main.js.
//   CLUB_MAP       albedo texture (world planar mapping, or mesh UVs with CLUB_MESHUV)
//   CLUB_NORMAL    tangent-space normal map (planar mapping)
//   CLUB_SPEC      glossy sheen (+ CLUB_ROUGH roughness map, + CLUB_PAR highlights of the PAR cans)
//   CLUB_LEAF      leaf atlas (instanced cell index, alpha to coverage, translucency)
//   CLUB_UNLIT     emissive only (bulbs, LED strips, lenses)
//   CLUB_WASH      vertical colour wash from the top (LED under the counter lip)
// Everything is multiplied by the shared uClubLevel (0 = black first frame of
// the intro, 1 = full), the only thing that ever changes.
import * as THREE from 'three';
import { NPAR } from './lights.js';
import { VOLUME_PARS } from './bake.js';
import { DANCE_Y, STAGE_Y, CEIL_Y, X_MIN, X_MAX, FAR, BACK, FRONT } from './layout.js';

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
  varying vec3 vCol;
#endif
#ifdef CLUB_LEAF
  attribute float aCell;
  varying float vCell;
#endif
void main() {
  vec4 wp = vec4(position, 1.0);
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    nrm = mat3(instanceMatrix) * nrm;
  #endif
  wp = modelMatrix * wp;
  vW = wp.xyz;
  vN = mat3(modelMatrix) * nrm;
  vUv = uv;
  #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
    vCol = vec3(1.0);
    #ifdef USE_COLOR
      vCol *= color;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vCol *= instanceColor;
    #endif
  #endif
  #ifdef CLUB_LEAF
    vCell = aCell;
  #endif
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${VOLUME_PARS}
#define CLUB_NPAR ${NPAR}
uniform vec4 uClubLP[CLUB_NPAR];
uniform vec4 uClubLC[CLUB_NPAR];
uniform vec4 uClubLD[CLUB_NPAR];
uniform float uClubLevel;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uWrap;
uniform float uTrans;
uniform float uGloss;
uniform float uShin;
uniform float uAO;
uniform float uSat;
#ifdef CLUB_MAP
  uniform sampler2D uMap;
  uniform float uMapScale;
#endif
#ifdef CLUB_NORMAL
  uniform sampler2D uNormalMap;
  uniform float uNormalScale;
#endif
#ifdef CLUB_ROUGH
  uniform sampler2D uRoughMap;
#endif
#ifdef CLUB_WASH
  uniform vec3 uWashColor;
  uniform vec2 uWash; // top y, fall-off (m)
#endif
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
  varying vec3 vCol;
#endif
#ifdef CLUB_LEAF
  varying float vCell;
#endif

// World planar mapping on the dominant axis of the normal (axis-aligned room).
vec2 clubPlanar(vec3 P, vec3 N, out vec3 T, out vec3 B) {
  vec3 an = abs(N);
  if (an.y >= an.x && an.y >= an.z) {
    float s = N.y >= 0.0 ? 1.0 : -1.0;
    T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, -s);
    return vec2(P.x, -s * P.z);
  }
  if (an.x >= an.z) {
    float s = N.x >= 0.0 ? 1.0 : -1.0;
    T = vec3(0.0, 0.0, -s); B = vec3(0.0, 1.0, 0.0);
    return vec2(-s * P.z, P.y);
  }
  float s = N.z >= 0.0 ? 1.0 : -1.0;
  T = vec3(s, 0.0, 0.0); B = vec3(0.0, 1.0, 0.0);
  return vec2(s * P.x, P.y);
}

// Soft ambient occlusion against the room box (floors near walls, walls near
// the floor and the ceiling). The plane a fragment lies on is ignored.
float clubAO(vec3 P, vec3 N) {
  float fy = P.z > ${f(FRONT)} ? ${f(STAGE_Y)} : ${f(DANCE_Y)};
  float dx = abs(N.x) > 0.7 ? 9.0 : min(P.x - (${f(X_MIN)}), ${f(X_MAX)} - P.x);
  float dz = abs(N.z) > 0.7 ? 9.0 : min(P.z - (${f(FAR)}), ${f(BACK)} - P.z);
  float dyf = N.y > 0.7 ? 9.0 : P.y - fy;
  float dyc = N.y < -0.7 ? 9.0 : ${f(CEIL_Y)} - P.y;
  vec4 d = clamp(vec4(dx, dz, dyf, dyc) / 0.8, 0.0, 1.0);
  d = d * d * (3.0 - 2.0 * d);
  vec4 o = mix(vec4(0.42), vec4(1.0), d);
  return o.x * o.y * o.z * o.w;
}

#ifdef CLUB_PAR
// crisp highlights of the PAR cans on the lacquered floor (view dependent:
// not baked; the first CLUB_NPAR lights of lights.js)
vec3 clubParSpec(vec3 P, vec3 N, vec3 V, float shin) {
  vec3 spec = vec3(0.0);
  for (int i = 0; i < CLUB_NPAR; i++) {
    vec3 L = uClubLP[i].xyz - P;
    float d2 = dot(L, L) + 1e-4;
    L *= inversesqrt(d2);
    float cone = smoothstep(uClubLC[i].w, uClubLD[i].w, dot(-L, uClubLD[i].xyz));
    vec3 H = normalize(L + V + vec3(0.0, 1e-4, 0.0));
    spec += uClubLC[i].rgb * ((uClubLP[i].w / (d2 + uClubLP[i].w)) * cone * max(dot(N, L), 0.0) * pow(max(dot(N, H), 0.0), shin) * (shin + 8.0) * 0.0398);
  }
  return spec;
}
#endif

void main() {
  vec3 P = vW;
  // degenerate triangles (extruded arches) can carry a zero normal: never NaN
  float nl = length(vN);
  vec3 N = nl > 1e-6 ? vN / nl : vec3(0.0, 1.0, 0.0);
  #ifdef DOUBLE_SIDED
    N = gl_FrontFacing ? N : -N;
  #endif
  vec3 V = normalize(cameraPosition - P);
  vec3 albedo = uColor;
  float alpha = 1.0;
  #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
    albedo *= vCol;
  #endif
  float shin = uShin;
  float gloss = uGloss;

  #ifdef CLUB_LEAF
    vec2 cell = vec2(mod(vCell, 2.0), floor(vCell / 2.0));
    vec4 lt = texture2D(uMap, (vUv + cell) * 0.5);
    albedo *= lt.rgb;
    alpha = clamp((lt.a - 0.5) / max(fwidth(lt.a), 1e-4) + 0.5, 0.0, 1.0);
    if (alpha < 0.02) discard;
  #elif defined(CLUB_MAP)
    #ifdef CLUB_MESHUV
      vec2 uv = vUv * uMapScale;
      vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 1.0, 0.0);
    #else
      vec3 T, B;
      vec2 uv = clubPlanar(P, N, T, B) / uMapScale;
    #endif
    vec3 tx = texture2D(uMap, uv).rgb;
    albedo *= mix(vec3(dot(tx, vec3(0.3, 0.59, 0.11))), tx, uSat);
    #ifdef CLUB_NORMAL
      vec3 tn = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
      tn.xy *= uNormalScale;
      N = normalize(T * tn.x + B * tn.y + N * tn.z);
    #endif
    #ifdef CLUB_ROUGH
      float r = texture2D(uRoughMap, uv).r;
      shin = mix(uShin, uShin * 0.08, r);
      gloss *= mix(1.0, 0.25, r);
    #endif
  #endif

  vec3 col;
  #ifdef CLUB_UNLIT
    col = albedo * uEmissive;
  #else
    vec3 diff = clubIrradiance(P, N);
    // wrap (soft terminator) and leaf translucency: light from behind
    if (uWrap > 0.0 || uTrans > 0.0) {
      vec3 back = clubIrradiance(P, -N);
      diff = (diff + back * uWrap * 0.5) / (1.0 + uWrap * 0.5) + back * uTrans;
    }
    #ifdef CLUB_WASH
      diff += uWashColor * exp(-max(uWash.x - P.y, 0.0) / uWash.y);
    #endif
    float ao = mix(1.0, clubAO(P, N), uAO);
    col = albedo * diff * ao + uEmissive;
    #ifdef CLUB_SPEC
      float fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 R = reflect(-V, N);
      // glossy sheen: the club light arriving from the reflection direction
      vec3 sheen = clubIrradiance(P + R * 0.4, R) * (0.08 + 0.25 * fr);
      #ifdef CLUB_PAR
        sheen += clubParSpec(P, N, V, shin) * mix(0.35, 1.0, fr);
      #endif
      col += sheen * gloss * ao;
    #endif
  #endif

  gl_FragColor = vec4(col * uClubLevel, alpha);
  #include <fog_fragment>
}`;

// Shared uniforms (lights, ambient, level): one object, referenced by every
// décor material.
// parU: PAR light uniforms (lights.js parUniforms), volU: volume uniforms
// (bake.js createVolume().uniforms).
export function createShared(parU, volU) {
  return { ...parU, ...volU, uClubLevel: { value: 0 } };
}

// opts: color, map, mapScale (m per repeat, or repeats with meshUV), meshUV,
// normalMap, normalScale, roughMap, saturation, gloss, par (PAR highlights), shininess, wrap, trans, ao (0..1),
// emissive (colour added, or the emissive gain with unlit), unlit,
// vertexColors, side, leaf, wash { color, top, falloff }
export function clubMaterial(shared, opts = {}) {
  const defines = {};
  const u = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...shared,
    uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
    uEmissive: { value: opts.emissive?.isColor ? opts.emissive : new THREE.Color(opts.unlit ? 0 : opts.emissive ?? 0) },
    uWrap: { value: opts.wrap ?? 0.15 },
    uTrans: { value: opts.trans ?? 0 },
    uGloss: { value: opts.gloss ?? 0 },
    uShin: { value: opts.shininess ?? 60 },
    uAO: { value: opts.ao ?? 1 },
    uSat: { value: opts.saturation ?? 1 }, // of the albedo texture
  };
  if (typeof opts.emissive === 'number' && opts.unlit) u.uEmissive.value = new THREE.Color(opts.emissive, opts.emissive, opts.emissive);
  if (opts.map) { defines.CLUB_MAP = ''; u.uMap = { value: opts.map }; u.uMapScale = { value: opts.mapScale ?? 1 }; }
  if (opts.meshUV) defines.CLUB_MESHUV = '';
  if (opts.normalMap) { defines.CLUB_NORMAL = ''; u.uNormalMap = { value: opts.normalMap }; u.uNormalScale = { value: opts.normalScale ?? 1 }; }
  if (opts.roughMap) { defines.CLUB_ROUGH = ''; u.uRoughMap = { value: opts.roughMap }; }
  if (opts.gloss) defines.CLUB_SPEC = '';
  if (opts.par) defines.CLUB_PAR = '';
  if (opts.leaf) defines.CLUB_LEAF = '';
  if (opts.unlit) defines.CLUB_UNLIT = '';
  if (opts.wash) {
    defines.CLUB_WASH = '';
    u.uWashColor = { value: new THREE.Color(...opts.wash.color) };
    u.uWash = { value: new THREE.Vector2(opts.wash.top, opts.wash.falloff) };
  }
  const side = opts.side ?? THREE.FrontSide; // DoubleSide: three.js defines DOUBLE_SIDED
  const m = new THREE.ShaderMaterial({
    name: opts.name ?? 'club',
    defines, uniforms: u, vertexShader: VERT, fragmentShader: FRAG,
    fog: true, side, vertexColors: Boolean(opts.vertexColors),
  });
  if (opts.leaf) m.alphaToCoverage = true;
  return m;
}
