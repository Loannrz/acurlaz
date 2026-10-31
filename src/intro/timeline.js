// The intro timeline (GSAP). The three units stand in their place, lit, from
// the very first frame (no arrival, no fade: the loading screen fading out over
// the scene is the only transition). One continuous camera shot (default
// timings, seconds):
//   0.00-2.90  very wide shot from the DJ side (the set small in the middle of
//              the club), zooming in progressively: the camera moves in AND its
//              field of view narrows; it passes the default framing at 2.90
//              without stopping
//   2.90-4.20  it sweeps around the right side to the rear; the first cable
//              starts at 3.95, before the camera arrives behind the set
//   3.95-6.23  cables plug one by one while the camera pans right to left
//   6.58-8.63  the camera comes round the left side and settles on the final
//              plunging front view (fitted to the window), velocity -> 0
// The camera follows ONE time-parametrised spline through the keys of
// CAMERA_KEYS (cardinal / Catmull-Rom tangents, C1: no stop and no speed jump
// at the keys; ease-in at the very start and ease-out at the very end only).
import gsap from 'gsap';
import { cameraPath } from './camera.js';

// Cables.
export const CABLE_INTERVAL = 0.2; // between two cables
const PLUG_TIME = 0.28; // slide-in of one cable
// Camera keys, relative to the events above (seconds).
const CAMERA = {
  zoomIn: 2.9, // from the wide shot ('far') to the default framing ('final'), passed without stopping
  approach: 0.55, // the intermediate key of the zoom ('approach') at this fraction of zoomIn
  rear: 1.3, // ...then reaches the rear view this long after
  cablesEarly: 0.25, // the first cable starts this long before the camera is behind the set
  panTail: 0.35, // the rear pan ends this long after the last cable is plugged
  settle: 2.05, // from the rear, around the left side, to the final view (eases out to a stop)
};

export function buildTimeline({ rig, cables, onComplete }) {
  const tl = gsap.timeline({ paused: true, onComplete });

  // --- cables ---
  const frontT = CAMERA.zoomIn;
  const rearT = frontT + CAMERA.rear;
  const cableStart = rearT - CAMERA.cablesEarly;
  cables.forEach((c, i) => {
    const t0 = cableStart + i * CABLE_INTERVAL;
    tl.fromTo(c.state, { approach: 0 }, { approach: 1, duration: PLUG_TIME, ease: 'power3.in' }, t0);
    // the cable stub fades in as it travels with its plug, then stays
    tl.fromTo(c.state, { opacity: 0 }, { opacity: 1, duration: PLUG_TIME * 0.6, ease: 'power1.out' }, t0);
  });
  const lastPlugged = cableStart + (cables.length - 1) * CABLE_INTERVAL + PLUG_TIME;

  // --- camera: one continuous path through the keys ---
  const panEnd = lastPlugged + CAMERA.panTail;
  const endT = panEnd + CAMERA.settle;
  const stops = [
    ['far', 0], ['approach', frontT * CAMERA.approach], ['final', frontT], ['sweep', frontT + CAMERA.rear * 0.5], ['rearIn', rearT], ['rearOut', panEnd], ['sweepOut', panEnd + CAMERA.settle * 0.45], ['final', endT],
  ];
  let path = cameraPath(rig, stops);
  const clock = { t: 0 };
  tl.fromTo(clock, { t: 0 }, { t: endT, duration: endT, ease: 'none' }, 0);
  // follow = false leaves the camera alone (dev ?cam= presets). The path only
  // writes when its time changes, so after the intro the zoom / orbit
  // controller owns the camera (and the path ends exactly on 'final').
  const camera = { follow: true, path, keys: { frontT, rearT, cableStart, panEnd, endT } };
  let lastT = -1;
  // The fitted keys depend on the window aspect: after a resize (a phone turned
  // during the intro) the path is rebuilt from the same keys and times.
  camera.rebuild = () => { path = cameraPath(rig, stops); camera.path = path; lastT = -1; };
  const applyCamera = () => {
    if (!camera.follow || clock.t === lastT) return;
    lastT = clock.t;
    Object.assign(rig.state, path(clock.t));
  };

  // Applied from the render loop (GSAP suppresses onUpdate when seeking).
  const tick = () => { for (const c of cables) c.update(); applyCamera(); };

  return { tl, tick, camera };
}
