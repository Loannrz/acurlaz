// Infinite studio "void": the set stands on a dark polished floor that melts
// into the background with no edge, no corner and no horizon line, whatever
// the camera direction. Everything here is static (no autonomous animation);
// its brightness only follows the light level of the intro (black at t = 0).
//   - backdrop: a sphere that follows the camera (so it never shows an edge or
//     a fixed landmark), vertical gradient from the horizon colour to a darker top
//   - floor: large dark lacquer disc, contact shadows, a soft pool of light under
//     the set and a faint static micro-grain; exponential fog with the exact
//     horizon colour so the floor dissolves into the backdrop
//   - reflection: each unit mirrored under the floor, drawn faintly and fading
//     with depth (3 extra draw calls, no extra render pass)
//   - vignette + static film grain (dithering against banding), patched into the
//     existing output pass (no extra full-screen pass)
// Settings: BACKDROP in src/config.js. Variant 'casita' (the default) is the
// club décor of src/scene/club/ instead (settings CLUB).
import * as THREE from 'three';
import { BACKDROP } from '../config.js';
import { createClub } from './club/index.js';

export function createBackdrop({ scene, camera, lights, outputPass, renderer, onProgress }) {
  // ?backdrop=casita|warm|cold|graphite overrides the configured variant (to compare them; `npm run dev` only)
  const asked = import.meta.env.DEV ? new URLSearchParams(location.search).get('backdrop') : null;
  const known = (name) => name === 'casita' || name in BACKDROP.variants;
  const variant = known(asked) ? asked : BACKDROP.variant;
  // club décor (src/scene/club/, CLUB in config): same interface, plus `ready`
  if (variant === 'casita') return createClub({ scene, camera, lights, outputPass, renderer, onProgress });
  const v = BACKDROP.variants[variant] ?? BACKDROP.variants.graphite;
  const level = { value: 0 }; // 0 = black frame, 1 = full light
  const horizon = new THREE.Color(v.horizon);
  const top = new THREE.Color(v.top);

  // --- fog, matching the backdrop horizon ---
  scene.fog = new THREE.FogExp2(horizon.clone(), BACKDROP.fogDensity);

  // --- backdrop sphere (follows the camera) ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(15, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uHorizon: { value: horizon }, uTop: { value: top }, uLevel: level, uBand: { value: v.band } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uHorizon; uniform vec3 uTop; uniform float uLevel; uniform float uBand;
        varying vec3 vDir;
        void main() {
          float y = normalize(vDir).y;
          // below the horizon: horizon colour (what the fogged floor fades to);
          // above: a long, soft fall-off to the darker top, with a faint haze band
          vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.65, y));
          c *= 1.0 + uBand * exp(-y * y * 60.0) * step(0.0, y);
          gl_FragColor = vec4(c * uLevel, 1.0);
        }`,
    }),
  );
  sky.name = 'backdrop';
  sky.renderOrder = -3;
  sky.frustumCulled = false;
  scene.add(sky);

  // --- floor ---
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: v.floor, roughness: BACKDROP.floorRoughness, metalness: 0,
    specularIntensity: BACKDROP.floorSheen, envMapIntensity: BACKDROP.floorSheen,
  });
  floorMat.depthWrite = false; // lets the mirrored units show through it
  const poolColor = new THREE.Color(v.pool).multiplyScalar(BACKDROP.poolStrength);
  floorMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uLevel: level, uPool: { value: poolColor }, uPoolR: { value: BACKDROP.poolRadius }, uMicro: { value: BACKDROP.floorGrain } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBdWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBdWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBdWorld;\nuniform float uLevel; uniform vec3 uPool; uniform float uPoolR; uniform float uMicro;')
      .replace('#include <opaque_fragment>', `
        {
          float r = length(vBdWorld.xz);
          outgoingLight += uPool * exp(-(r * r) / (uPoolR * uPoolR)) * uLevel;
          float n = fract(sin(dot(floor(vBdWorld.xz * 700.0), vec2(12.9898, 78.233))) * 43758.5453);
          outgoingLight *= 1.0 + (n - 0.5) * uMicro;
        }
        #include <opaque_fragment>`);
  };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.0005;
  floor.receiveShadow = true;
  floor.renderOrder = -2;
  floor.name = 'floor';
  scene.add(floor);

  // --- vignette + static grain in the output pass ---
  if (outputPass) {
    Object.assign(outputPass.uniforms, { uVignette: { value: BACKDROP.vignette }, uGrain: { value: BACKDROP.grain } });
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

  // --- reflections ---
  const reflections = [];
  const attachReflections = (units) => {
    for (const u of units) {
      if (!u.material.map) continue;
      const opacity = { value: 0 };
      const mat = new THREE.MeshBasicMaterial({ map: u.material.map, color: v.reflectionTint, transparent: true, depthWrite: false });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, { uLevel: level, uOpacity: opacity, uStrength: { value: BACKDROP.reflection }, uDepth: { value: BACKDROP.reflectionDepth } });
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
      mesh.scale.y = -1; // mirrored under the floor (y = 0)
      mesh.renderOrder = -1; // before the units while they are transparent (intro)
      mesh.onBeforeRender = () => { opacity.value = u.material.opacity; };
      u.group.add(mesh);
      reflections.push(mesh);
    }
  };

  // Called every frame before rendering: follow the camera and the light level.
  const update = () => {
    sky.position.copy(camera.position);
    level.value = lights.full.env > 0 ? Math.min(1, lights.scene.environmentIntensity / lights.full.env) : 1;
    scene.fog.color.copy(horizon).multiplyScalar(level.value);
  };
  update();

  onProgress?.('textures', 1); onProgress?.('bake', 1); // nothing to load for the studio variants
  return { sky, floor, reflections, attachReflections, update, variant, ready: Promise.resolve() };
}
