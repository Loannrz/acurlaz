// Baked club lighting. The club lights never move, so their diffuse light is
// computed ONCE on the GPU at start-up into an irradiance volume covering the
// room: for each voxel (~22 cm) and each of the 6 axis directions, the
// irradiance a surface facing that direction receives ("ambient cube").
// Décor shaders then read 3 texels instead of looping over every light per
// pixel: a few texture fetches per pixel, and small shaders that compile fast.
//   - 6 WebGL3DRenderTargets (half float, linear filtering), one per direction
//   - baked by drawing one tiny quad per slice and direction (~400 draws, once)
//   - lookup: E(N) = sum_i N_i^2 * E(sign(N_i) axis_i)
import * as THREE from 'three';
import { NL, NS } from './lights.js';

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function createVolume({ min, max, voxel = 0.22 }) {
  const size = new THREE.Vector3().subVectors(new THREE.Vector3(...max), new THREE.Vector3(...min));
  const res = size.clone().divideScalar(voxel).ceil();
  const u = {
    uVolMin: { value: new THREE.Vector3(...min) },
    uVolSize: { value: size },
    uVolGain: { value: 1 },
  };
  DIRS.forEach((_, i) => { u[`uVol${i}`] = { value: null }; });
  return { res, size, uniforms: u, targets: [] };
}

// GLSL: volume lookup (shared by the décor shader and the counter top).
export const VOLUME_PARS = /* glsl */`
precision highp sampler3D;
uniform sampler3D uVol0; uniform sampler3D uVol1; uniform sampler3D uVol2;
uniform sampler3D uVol3; uniform sampler3D uVol4; uniform sampler3D uVol5;
uniform vec3 uVolMin; uniform vec3 uVolSize; uniform float uVolGain;
vec3 clubIrradiance(vec3 P, vec3 N) {
  vec3 q = clamp((P - uVolMin) / uVolSize, 0.0, 1.0);
  vec3 n2 = N * N;
  vec3 e = n2.x * (N.x >= 0.0 ? texture(uVol0, q).rgb : texture(uVol1, q).rgb)
         + n2.y * (N.y >= 0.0 ? texture(uVol2, q).rgb : texture(uVol3, q).rgb)
         + n2.z * (N.z >= 0.0 ? texture(uVol4, q).rgb : texture(uVol5, q).rgb);
  return e * uVolGain;
}
`;

// Bakes the volume (async: compiles the bake program off the main thread
// where supported, then draws). `lightU`: uniforms of lights.js lightUniforms();
// ambient: { sky, ground } colours.
export async function bakeVolume(renderer, volume, lightU, ambient) {
  const { res } = volume;
  const half = renderer.extensions.has('EXT_color_buffer_float');
  const type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const gain = half ? 1 : 8; // 8-bit fallback stores E / 8
  volume.uniforms.uVolGain.value = gain;
  const mat = new THREE.ShaderMaterial({
    name: 'club_bake',
    uniforms: {
      ...lightU,
      uSky: { value: new THREE.Color(ambient.sky) },
      uGround: { value: new THREE.Color(ambient.ground) },
      uDir: { value: new THREE.Vector3() },
      uSlice: { value: 0 },
      uRes: { value: res.clone() },
      uMin: { value: volume.uniforms.uVolMin.value.clone() },
      uSize: { value: volume.uniforms.uVolSize.value.clone() },
      uInvGain: { value: 1 / gain },
    },
    vertexShader: /* glsl */`
      void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      #define CLUB_NL ${NL}
      #define CLUB_NS ${NS}
      uniform vec4 uClubLP[CLUB_NL]; uniform vec4 uClubLC[CLUB_NL]; uniform vec4 uClubLD[CLUB_NL];
      uniform vec4 uClubSA[CLUB_NS]; uniform vec3 uClubSB[CLUB_NS]; uniform vec3 uClubSC[CLUB_NS];
      uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uDir; uniform float uSlice;
      uniform vec3 uRes; uniform vec3 uMin; uniform vec3 uSize; uniform float uInvGain;
      void main() {
        vec3 P = uMin + (vec3(gl_FragCoord.xy, uSlice + 0.5) / uRes) * uSize;
        vec3 N = uDir;
        vec3 e = mix(uGround, uSky, N.y * 0.5 + 0.5);
        for (int i = 0; i < CLUB_NL; i++) {
          vec3 L = uClubLP[i].xyz - P;
          float d2 = dot(L, L) + 1e-4;
          L *= inversesqrt(d2);
          float cone = 1.0;
          if (uClubLC[i].w > -1.5) cone = smoothstep(uClubLC[i].w, uClubLD[i].w, dot(-L, uClubLD[i].xyz));
          e += uClubLC[i].rgb * (uClubLP[i].w / (d2 + uClubLP[i].w)) * max(dot(N, L), 0.0) * cone;
        }
        for (int i = 0; i < CLUB_NS; i++) {
          vec3 a = uClubSA[i].xyz;
          vec3 ab = uClubSB[i] - a;
          float t = clamp(dot(P - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
          vec3 L = a + ab * t - P;
          float d2 = dot(L, L) + 1e-4;
          L *= inversesqrt(d2);
          e += uClubSC[i] * (uClubSA[i].w / (d2 + uClubSA[i].w)) * max(dot(N, L), 0.0);
        }
        gl_FragColor = vec4(e * uInvGain, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.Camera();
  if (renderer.compileAsync) await renderer.compileAsync(scene, cam);

  const prevTarget = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  const prevTone = renderer.toneMapping;
  const prevShadow = renderer.shadowMap.autoUpdate;
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;
  DIRS.forEach((d, i) => {
    const rt = new THREE.WebGL3DRenderTarget(res.x, res.y, res.z, {
      type, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    rt.texture.wrapS = rt.texture.wrapT = rt.texture.wrapR = THREE.ClampToEdgeWrapping;
    mat.uniforms.uDir.value.set(...d);
    for (let z = 0; z < res.z; z++) {
      mat.uniforms.uSlice.value = z;
      renderer.setRenderTarget(rt, z);
      renderer.render(scene, cam);
    }
    volume.targets.push(rt);
    volume.uniforms[`uVol${i}`].value = rt.texture;
  });
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAuto;
  renderer.toneMapping = prevTone;
  renderer.shadowMap.autoUpdate = prevShadow;
  quad.geometry.dispose();
  mat.dispose();
  return volume;
}
