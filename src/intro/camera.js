// Cinematic camera rig: a state object (position, look-at, fov, shake) that
// the timeline tweens; applied to the camera every frame. After the intro the
// same state is driven by the zoom controller.
import * as THREE from 'three';
import { ORBIT, CAMERA_PROFILE } from '../config.js';

const DEG = Math.PI / 180;
// Front view direction at a given elevation, `d` metres from (0, 0.05, 0).
const front = (elevation, d = 1.33) => [0, 0.05 + d * Math.sin(elevation), d * Math.cos(elevation)];

// Keys with `fit` get their distance re-computed from the window aspect so the
// whole set fits, times `fit` (1 = the default framing, >1 = more air around).
export const CAMERA_KEYS = {
  // opening: very wide shot from the DJ side, the set small in the middle of
  // the club (fixed distance, inside the room and the leaf-free camera volume
  // of src/scene/club/foliage.js); wider field of view, narrowed while the
  // camera moves in (fovMax: phones in portrait may widen it this far)
  far: { pos: front(32 * DEG, 3.8), target: [0, 0.05, 0.0], fov: 46, fovMax: 70 },
  // ...passing key of the zoom-in: `at` of the way from 'far' to 'final'
  // (distance on a log scale, direction, look-at and FOV interpolated), so the
  // zoom is monotonic whatever the window (phones: 'final' is already far)
  approach: { between: ['far', 'final'], at: 0.55 },
  // passing key: sweeping around the right side of the set, from the front to the rear
  sweep: { pos: [1.0, 0.55, -0.05], target: [0.12, 0.06, -0.05], fov: 34 },
  // ...and around the left side, from the rear back to the final front view
  sweepOut: { pos: [-1.0, 0.62, 0.05], target: [-0.1, 0.06, 0.0], fov: 34.5 },
  // behind the set, travelling from the right CDJ to the left one
  rearIn: { pos: [0.55, 0.36, -0.78], target: [0.22, 0.06, -0.15], fov: 34 },
  rearOut: { pos: [-0.55, 0.36, -0.78], target: [-0.22, 0.06, -0.15], fov: 34 },
  // final: plunging front view at ORBIT.defaultElevation (standing in front of
  // the set, never straight overhead); the distance is re-fitted to the window
  final: { pos: front(ORBIT.defaultElevation), target: [0, 0.05, 0.0], fov: 35, fit: 1 },
  // dev presets (?cam=)
  rear: { pos: [0, 0.45, -0.9], target: [0, 0.05, -0.15], fov: 34 },
  front: { pos: [0, 0.6, 1.1], target: [0, 0.07, 0], fov: 36 },
  iso: { pos: [0.9, 0.8, 0.9], target: [0, 0.05, 0], fov: 35 },
  top: { pos: [0, 1.3, 0.001], target: [0, 0.05, 0], fov: 35 },
  left: { pos: [-1.0, 0.45, 0.3], target: [-0.3, 0.06, 0], fov: 35 },
  right: { pos: [1.0, 0.45, 0.3], target: [0.3, 0.06, 0], fov: 35 },
};

// Margin around the set in the fitted final view (1 = touching the edges).
// Phones / tablets: MOBILE_CAMERA.fitMargin in src/config.js.
const FIT_MARGIN = CAMERA_PROFILE?.fitMargin ?? 1.1;
const DEV_PRESETS = new Set(['rear', 'front', 'iso', 'top', 'left', 'right']);
const REF_ASPECT = 16 / 10; // the PC window the fixed intro keys were framed for
const hfov = (vfovDeg, aspect) => 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfovDeg) / 2) * aspect);

// Vertical FOV for a key's `base` FOV at this aspect. PC: unchanged. MOBILE
// profile, portrait: widened (up to maxFov) so the horizontal FOV stays at least
// portraitHFov degrees: on a tall narrow screen the camera comes closer to the
// set instead of backing off through the club, and the image keeps the same
// focal feel. Landscape / square: unchanged.
export function viewFov(base, aspect, maxFov = CAMERA_PROFILE?.maxFov) {
  const P = CAMERA_PROFILE;
  if (!P || !(aspect < 1)) return base;
  const need = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(P.portraitHFov) / 2) / aspect));
  // a key wider than the overview (fovMax) keeps its extra width in portrait
  const extra = maxFov > P.maxFov ? (need * base) / CAMERA_KEYS.final.fov : need;
  return Math.min(maxFov, Math.max(base, extra));
}

// fitBox (optional): world box of the set. When given, the 'final' key keeps
// its direction and look-at point but its distance is computed so the whole
// box fits the current camera aspect (any window size or ratio).
export function createCameraRig(camera, { fitBox = null } = {}) {
  const state = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 36, shake: 0 };
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  let seed = 0;

  // Distance at which `fitBox` fits entirely in view, looking from `key`'s direction.
  const fitDistance = (name = 'final') => {
    const k = CAMERA_KEYS[name];
    const t = new THREE.Vector3(...k.target);
    const back = new THREE.Vector3(...k.pos).sub(t).normalize(); // towards the camera
    const right = new THREE.Vector3().crossVectors(back.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, back.clone().negate());
    const tanV = Math.tan(THREE.MathUtils.degToRad(viewFov(k.fov, camera.aspect)) / 2);
    const tanH = tanV * camera.aspect;
    let d = 0;
    const c = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? fitBox.max.x : fitBox.min.x, i & 2 ? fitBox.max.y : fitBox.min.y, i & 4 ? fitBox.max.z : fitBox.min.z).sub(t);
      const z = c.dot(back);
      d = Math.max(d, z + (FIT_MARGIN * Math.abs(c.dot(right))) / tanH, z + (FIT_MARGIN * Math.abs(c.dot(up))) / tanV);
    }
    return d;
  };
  // Key values, fitted to the set (keys with `fit`) when a box is known.
  const key = (name) => {
    const k = CAMERA_KEYS[name];
    if (k.between) return blendKeys(key(k.between[0]), key(k.between[1]), k.at);
    if (!k.fit || !fitBox) return CAMERA_PROFILE && !DEV_PRESETS.has(name) ? narrowKey(k) : k;
    const t = new THREE.Vector3(...k.target);
    const p = new THREE.Vector3(...k.pos).sub(t).normalize().multiplyScalar(fitDistance(name) * k.fit).add(t);
    return { pos: p.toArray(), target: k.target, fov: viewFov(k.fov, camera.aspect) };
  };
  // MOBILE profile: a fixed key (wide opening, sweeps, rear pan) seen through a
  // narrower window moves back along its own direction so it frames about what
  // the PC window shows (horizontal FOV ratio, at most introScaleMax), never
  // above maxCameraY (ceiling) nor beyond maxCameraZ (wall behind the DJ).
  // Same direction, same look-at point: same shot.
  const narrowKey = (k) => {
    const fov = viewFov(k.fov, camera.aspect, k.fovMax);
    const ratio = Math.tan(hfov(k.fov, REF_ASPECT) / 2) / Math.tan(hfov(fov, camera.aspect) / 2);
    const t = new THREE.Vector3(...k.target);
    const d = new THREE.Vector3(...k.pos).sub(t);
    let s = Math.min(CAMERA_PROFILE.introScaleMax, Math.max(1, ratio));
    if (d.y > 1e-6) s = Math.min(s, Math.max(1, (CAMERA_PROFILE.maxCameraY - t.y) / d.y));
    if (d.z > 1e-6) s = Math.min(s, Math.max(1, (CAMERA_PROFILE.maxCameraZ - t.z) / d.z));
    return { pos: d.multiplyScalar(s).add(t).toArray(), target: k.target, fov };
  };

  // A key part of the way from key a to key b (s = 0..1).
  const blendKeys = (a, b, s) => {
    const ta = new THREE.Vector3(...a.target), tb = new THREE.Vector3(...b.target);
    const va = new THREE.Vector3(...a.pos).sub(ta), vb = new THREE.Vector3(...b.pos).sub(tb);
    const da = va.length(), db = vb.length();
    const t = ta.clone().lerp(tb, s);
    const dir = va.normalize().lerp(vb.normalize(), s).normalize();
    const d = Math.exp(Math.log(da) + (Math.log(db) - Math.log(da)) * s);
    return { pos: dir.multiplyScalar(d).add(t).toArray(), target: t.toArray(), fov: a.fov + (b.fov - a.fov) * s };
  };

  const set = (name) => {
    const k = key(name);
    [state.px, state.py, state.pz] = k.pos;
    [state.tx, state.ty, state.tz] = k.target;
    state.fov = k.fov;
  };
  set('far');

  return {
    state,
    set,
    // Tween-friendly target values for a key.
    vars(name) {
      const k = key(name);
      return { px: k.pos[0], py: k.pos[1], pz: k.pos[2], tx: k.target[0], ty: k.target[1], tz: k.target[2], fov: k.fov };
    },
    // Distance at which the whole set is visible in the final view (current aspect).
    fitDistance: () => (fitBox ? fitDistance('final') : null),
    // Vertical FOV of the final view at the current aspect (MOBILE portrait: wider).
    finalFov: () => viewFov(CAMERA_KEYS.final.fov, camera.aspect),
    viewFov: (base) => viewFov(base, camera.aspect),
    // Half width (m) of the view of a key, measured at its look-at point.
    viewHalfWidth(name) {
      const k = key(name);
      const d = new THREE.Vector3(...k.pos).distanceTo(new THREE.Vector3(...k.target));
      return d * Math.tan(THREE.MathUtils.degToRad(k.fov) / 2) * camera.aspect;
    },
    // Distance / direction helpers used by the zoom controller.
    distance() { return pos.set(state.px, state.py, state.pz).distanceTo(target.set(state.tx, state.ty, state.tz)); },
    setDistance(d) {
      target.set(state.tx, state.ty, state.tz);
      pos.set(state.px, state.py, state.pz).sub(target).normalize().multiplyScalar(d).add(target);
      state.px = pos.x; state.py = pos.y; state.pz = pos.z;
    },
    // Orbit helpers (camera position around the look-at point, THREE.Spherical
    // convention: phi from +y, theta around y from +z).
    getSpherical() {
      target.set(state.tx, state.ty, state.tz);
      spherical.setFromVector3(pos.set(state.px, state.py, state.pz).sub(target));
      return { radius: spherical.radius, phi: spherical.phi, theta: spherical.theta };
    },
    setSpherical(radius, phi, theta) {
      target.set(state.tx, state.ty, state.tz);
      pos.setFromSphericalCoords(radius, phi, theta).add(target);
      state.px = pos.x; state.py = pos.y; state.pz = pos.z;
    },
    apply(dt) {
      seed += dt * 60;
      let sx = 0, sy = 0;
      if (state.shake > 0) {
        sx = Math.sin(seed * 1.7) * Math.cos(seed * 0.9) * state.shake;
        sy = Math.sin(seed * 2.3 + 1.0) * state.shake;
      }
      camera.position.set(state.px + sx, state.py + sy, state.pz);
      camera.lookAt(state.tx + sx * 0.5, state.ty + sy * 0.5, state.tz);
      if (camera.fov !== state.fov) { camera.fov = state.fov; camera.updateProjectionMatrix(); }
    },
  };
}

// Time-parametrised camera path through rig keys: stops = [[keyName, time], ...]
// (times increasing). Each channel (position, look-at, fov) is a cubic Hermite
// spline with cardinal (Catmull-Rom) tangents computed in units per second, so
// position AND velocity are continuous at every key (no stop, no speed jump);
// the tangent is zero only at the first and last stop (ease in / ease out).
// Returns t -> { px, py, pz, tx, ty, tz, fov }; key values are read once, so
// fitted keys use the window aspect at build time.
export const CHANNELS = ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'fov'];
export function cameraPath(rig, stops) {
  return hermitePath(stops.map(([, t]) => t), stops.map(([name]) => rig.vars(name)));
}

// Same spline over explicit poses ({ px, py, pz, tx, ty, tz, fov }) at increasing times.
export function hermitePath(times, values, channels = CHANNELS) {
  const n = times.length;
  const tangent = (i, ch) => {
    if (i === 0 || i === n - 1) return 0;
    return (values[i + 1][ch] - values[i - 1][ch]) / (times[i + 1] - times[i - 1]);
  };
  const tangents = values.map((_, i) => Object.fromEntries(channels.map((ch) => [ch, tangent(i, ch)])));
  const out = {};
  return (t) => {
    if (t <= times[0]) { for (const ch of channels) out[ch] = values[0][ch]; return out; }
    if (t >= times[n - 1]) { for (const ch of channels) out[ch] = values[n - 1][ch]; return out; }
    let i = 0;
    while (t > times[i + 1]) i++;
    const h = times[i + 1] - times[i];
    const s = (t - times[i]) / h, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (const ch of channels) {
      out[ch] = h00 * values[i][ch] + h10 * h * tangents[i][ch] + h01 * values[i + 1][ch] + h11 * h * tangents[i + 1][ch];
    }
    return out;
  };
}
