// Additive light effects, all static:
//   - halos: camera-facing soft glows around every emitter (bulbs, lenses,
//     LED strips, lamps); one instanced draw call
//   - counter reflections (option `clip`): mirrored in the lacquered counter
//     top under the gear, clipped to its rectangle; they write the depth of the
//     counter plane, so the gear hides them like a real reflection
//   - beams: soft light cones under the PAR cans (haze), view-angle faded edges
//   - washes: soft elliptical light decals on walls (sconces)
// Additive, no depth write, fog-faded, scaled by the shared intro level.
import * as THREE from 'three';

const fogFade = /* glsl */`
  float clubFog(float depth) { return exp(-fogDensity * fogDensity * depth * depth); }
`;

// list: [{ pos: [x,y,z], color: [r,g,b] (already multiplied by intensity), size }]
export function createHalos(shared, list, { mirrorY = null, gain = 1, stretch = 1, falloff = 0.3, clip = null, name = 'halos' } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  const P = new Float32Array(list.length * 3), C = new Float32Array(list.length * 3), S = new Float32Array(list.length);
  list.forEach((h, i) => { P.set(h.pos, i * 3); C.set(h.color, i * 3); S[i] = h.size; });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(P, 3));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(C, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(S, 1));
  geo.instanceCount = list.length;
  const mirror = mirrorY != null;
  const mat = new THREE.ShaderMaterial({
    name: `club_${name}`,
    uniforms: {
      uClubLevel: shared.uClubLevel,
      fogDensity: { value: 0 },
      uGain: { value: gain },
      uMirrorY: { value: mirror ? mirrorY : 0 },
      uStretch: { value: stretch },
      uFalloff: { value: falloff },
      uViewInv: { value: new THREE.Matrix4() },
      uClip: { value: clip ? new THREE.Vector4(clip.x0, clip.x1, clip.z0, clip.z1) : new THREE.Vector4() },
    },
    defines: { ...(mirror ? { MIRROR: '' } : {}), ...(clip ? { CLIP: '' } : {}) },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec3 aCol; attribute float aSize;
      uniform float uMirrorY; uniform float uStretch; uniform float uFalloff; uniform float uGain;
      uniform float fogDensity;
      uniform mat4 uViewInv;
      varying vec2 vQ; varying vec3 vC; varying vec3 vWq;
      ${fogFade}
      void main() {
        vec3 wp = aPos;
        vec2 size = vec2(aSize);
        vec3 col = aCol * uGain;
        #ifdef MIRROR
          float h = max(wp.y - uMirrorY, 0.0);
          wp.y = uMirrorY - h;
          size *= vec2(1.0 + h * 0.12, uStretch * (1.0 + h * 0.25));
          col *= exp(-h * uFalloff);
        #endif
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
        vQ = position.xy * 2.0;
        vC = col * clubFog(-mv.z);
        vWq = (uViewInv * mv).xyz;
      }`,
    fragmentShader: /* glsl */`
      uniform float uClubLevel; uniform float uMirrorY; uniform vec4 uClip;
      #ifdef CLIP
        uniform mat4 projectionMatrix;
      #endif
      varying vec2 vQ; varying vec3 vC; varying vec3 vWq;
      void main() {
        float r2 = dot(vQ, vQ);
        if (r2 > 1.0) discard;
        #ifdef CLIP
          // where the view ray crosses the reflecting plane: inside the counter top?
          vec3 d = vWq - cameraPosition;
          if (d.y > -1e-4) discard;
          vec3 X = cameraPosition + d * ((cameraPosition.y - uMirrorY) / -d.y);
          if (X.x < uClip.x || X.x > uClip.y || X.z < uClip.z || X.z > uClip.w) discard;
          vec4 cp = projectionMatrix * viewMatrix * vec4(X, 1.0);
          gl_FragDepth = cp.z / cp.w * 0.5 + 0.5;
        #endif
        float i = exp(-r2 * 14.0) * 0.85 + exp(-r2 * 4.0) * 0.22;
        i *= 1.0 - r2;
        gl_FragColor = vec4(vC * i * uClubLevel, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `club_${name}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = mirror ? -1 : 2;
  if (clip) mesh.onBeforeRender = (r, sc, cam) => { mat.uniforms.uViewInv.value.copy(cam.matrixWorld); };
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// list: [{ pos (apex), dir (unit), length, angle (half, degrees), color }]
export function createBeams(shared, list, { gain = 1 } = {}) {
  const geo = new THREE.ConeGeometry(1, 1, 28, 6, true);
  geo.translate(0, -0.5, 0); // apex at the origin, opening towards -y
  const mat = new THREE.ShaderMaterial({
    name: 'club_beams',
    uniforms: { uClubLevel: shared.uClubLevel, fogDensity: { value: 0 }, uGain: { value: gain } },
    vertexShader: /* glsl */`
      uniform float fogDensity;
      varying vec3 vN; varying vec3 vW; varying vec3 vColor; varying float vT; varying float vFog;
      ${fogFade}
      void main() {
        // normal through rotation x scale(r, len, r): M S^-2 n == M^-T n
        mat3 m = mat3(modelMatrix) * mat3(instanceMatrix);
        vec3 sc = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
        vN = m * (normal / max(sc, vec3(1e-8)));
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vT = -position.y;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(1.0);
        #endif
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        vFog = clubFog(-mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform float uClubLevel; uniform float uGain;
      varying vec3 vN; varying vec3 vW; varying vec3 vColor; varying float vT; varying float vFog;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float nl = length(vN);
        float f = nl > 1e-8 ? abs(dot(vN / nl, V)) : 0.0;
        float edge = f * f;
        float a = clamp(1.0 - vT, 0.0, 1.0);
        float along = a * sqrt(a) * smoothstep(0.0, 0.06, vT);
        // fixed dust texture in the haze (static)
        float n = fract(sin(dot(floor(vW * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float dust = 0.88 + 0.24 * n;
        gl_FragColor = vec4(vColor * uGain * edge * along * dust * vFog * uClubLevel, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const q = new THREE.Quaternion(), m = new THREE.Matrix4();
  list.forEach((b, i) => {
    const r = b.length * Math.tan(THREE.MathUtils.degToRad(b.angle));
    q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...b.dir).normalize());
    m.compose(new THREE.Vector3(...b.pos), q, new THREE.Vector3(r, b.length, r));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(...b.color));
  });
  mesh.name = 'club_beams';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// list: [{ pos, normal, w, h, color }] soft elliptical light on a wall
export function createWashes(shared, list, { gain = 1 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    name: 'club_washes',
    uniforms: { uClubLevel: shared.uClubLevel, fogDensity: { value: 0 }, uGain: { value: gain } },
    vertexShader: /* glsl */`
      uniform float fogDensity;
      varying vec2 vQ; varying vec3 vC;
      ${fogFade}
      void main() {
        vQ = position.xy * 2.0;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor * clubFog(-mv.z);
        #else
          vC = vec3(clubFog(-mv.z));
        #endif
      }`,
    fragmentShader: /* glsl */`
      uniform float uClubLevel; uniform float uGain;
      varying vec2 vQ; varying vec3 vC;
      void main() {
        // brighter just above the fixture (vQ.y ~ -0.3), fading up and down
        vec2 q = vQ - vec2(0.0, -0.25);
        q.y *= q.y > 0.0 ? 0.75 : 1.8;
        float r2 = dot(q, q);
        float i = exp(-r2 * 3.2) * (1.0 - smoothstep(0.75, 1.0, length(vQ)));
        gl_FragColor = vec4(vC * uGain * i * uClubLevel, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const q = new THREE.Quaternion(), m = new THREE.Matrix4();
  list.forEach((w, i) => {
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...w.normal));
    m.compose(new THREE.Vector3(...w.pos), q, new THREE.Vector3(w.w, w.h, 1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(...w.color));
  });
  mesh.name = 'club_washes';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Additive textured plane (neon sign), optionally mirrored under a floor.
export function createNeon(shared, texture, { pos, size, gain = 1, mirrorY = null, mirrorGain = 0.25 }) {
  const make = (mirror) => {
    const mat = new THREE.ShaderMaterial({
      name: 'club_neon',
      uniforms: { uClubLevel: shared.uClubLevel, fogDensity: { value: 0 }, uMap: { value: texture }, uGain: { value: mirror ? gain * mirrorGain : gain } },
      vertexShader: /* glsl */`
        uniform float fogDensity;
        varying vec2 vUv; varying float vFog;
        ${fogFade}
        void main() {
          vUv = uv;
          vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vFog = clubFog(-mv.z);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uClubLevel; uniform float uGain;
        varying vec2 vUv; varying float vFog;
        void main() {
          vec3 c = texture2D(uMap, vUv).rgb;
          gl_FragColor = vec4(c * c * uGain * vFog * uClubLevel, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      side: mirror ? THREE.DoubleSide : THREE.FrontSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(...pos);
    if (mirror) {
      m.position.y = 2 * mirrorY - pos[1];
      m.scale.y = -1.6; // reflection: flipped and smeared vertically
      m.renderOrder = -1;
    } else m.renderOrder = 2;
    m.name = mirror ? 'club_neonReflection' : 'club_neon';
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    return m;
  };
  return mirrorY != null ? [make(false), make(true)] : [make(false)];
}

// Keeps the fog density of the additive materials in sync with the scene fog.
export function syncFog(meshes, fog) {
  for (const m of meshes) if (m.material.uniforms?.fogDensity) m.material.uniforms.fogDensity.value = fog?.density ?? 0;
}
