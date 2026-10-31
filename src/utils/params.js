// URL parameters for development, validated. Read with `npm run dev` only
// (import.meta.env.DEV): a production build ignores them (no seeking, no frozen
// camera, no speed change for visitors). Malformed values fall back to defaults.
//   ?t=3.2        seek the intro to a time (seconds, 0..60)
//   ?speed=0.5    timeline speed (0.1..5)
//   ?cam=rear     fixed dev camera preset (see CAMERA_PRESETS); disables the cinematic rig
// (also dev only: ?mobile=1 / 0 in src/utils/device.js, ?backdrop= in src/scene/backdrop.js)
export const CAMERA_PRESETS = ['final', 'rear', 'front', 'iso', 'top', 'left', 'right'];
const NONE = Object.freeze({ t: null, speed: null, cam: null });

export function readParams(search = window.location.search) {
  if (!import.meta.env.DEV) return NONE;
  const q = new URLSearchParams(search);
  const num = (key, min, max) => {
    if (!q.has(key)) return null;
    const v = Number.parseFloat(q.get(key));
    return Number.isFinite(v) && v >= min && v <= max ? v : null;
  };
  const cam = q.get('cam');
  return {
    t: num('t', 0, 60),
    speed: num('speed', 0.1, 5),
    cam: CAMERA_PRESETS.includes(cam) ? cam : null,
  };
}
