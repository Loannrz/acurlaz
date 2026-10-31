// Screen focus: a click on a screen flies the camera to a framing of that
// screen, with the camera locked; a click on the ÉCHAP key of that same screen
// (or Escape) flies back to the exact pose the user left, then gives the
// controls back. Screens (TARGETS below):
//   cdj_left / cdj_right  the CDJ screens (seen almost square-on, slightly
//                         plunging; arced flight), ÉCHAP = the MENU key at the
//                         top right of the row above the screen
//   mixer                 the CRÉDITS screen of the mixer (its small Beat FX
//                         display): framed much closer so it reads like a big
//                         screen; the flight is a zoom (MIXER_FOCUS in config)
//   const focus = createScreenFocus({ rig, zoom, units, camera, reducedMotion })
//   focus.handleButton(info) -> 'enter' | 'exit' | 'blocked' | null (null = normal click)
//   While focused, the screen is a touch surface (src/input/screenTouch.js):
//   its zone no longer acts as a button.
//   focus.enter('cdj_left' | 'cdj_right' | 'mixer') / focus.exit() / focus.reset()
//   focus.current (unit name or null), focus.busy, focus.onChange(fn)
// Touch screens: once settled, a two-finger pinch magnifies the screen (down to
// `mag.min` of the framing distance, towards the fingers) and sliding both fingers
// pans over it, within the screen and its keys; one finger keeps working
// the screen (taps, lists). Pinching back out returns to the framing.
//   focus.magnified (distance factor < 1), focus.onMagnify(fn)
import gsap from 'gsap';
import * as THREE from 'three';
import { SCREEN_FOCUS, MIXER_FOCUS, MOBILE, CAMERA_PROFILE } from '../config.js';
import { hermitePath, viewFov } from '../intro/camera.js';
import { SCREEN_SPECS } from '../scene/screens.js';

// Screen geometry, from the same source as the screens themselves (metres).
const geometry = (S) => ({ center: [S.x / 1000, S.y / 1000, S.z / 1000], size: [S.w / 1000, S.h / 1000], tilt: S.tilt });
// CDJ: the row of keys (~76 mm up the panel) and a little below the bottom edge
// may be panned to with the magnifier.
const CDJ = {
  ...SCREEN_FOCUS,
  flight: 'arc',
  portraitMargin: MOBILE.focus.portraitMargin,
  landscape: MOBILE.focus.landscape,
  mag: { min: 0.4, top: -0.088, bottomExtra: 0.02, side: 0.006 },
};
const TARGETS = {
  cdj_left: { unit: 'cdjLeft', screen: geometry(SCREEN_SPECS.cdjLeft), F: CDJ },
  cdj_right: { unit: 'cdjRight', screen: geometry(SCREEN_SPECS.cdjRight), F: CDJ },
  mixer: { unit: 'mixer', screen: geometry(SCREEN_SPECS.mixer), F: MIXER_FOCUS },
};

export function createScreenFocus({ rig, zoom, units, camera, reducedMotion = false, dom = null }) {
  let current = null; // unit name while focused (or flying in)
  let busy = false; // a flight is running
  let saved = null; // pose to return to
  let tween = null;
  const listeners = new Set();
  const emit = (type, unit) => { for (const fn of listeners) fn({ type, unit, zone: `${unit}_screen` }); };

  const pose = () => { const s = rig.state; return { px: s.px, py: s.py, pz: s.pz, tx: s.tx, ty: s.ty, tz: s.tz, fov: s.fov }; };

  // Framing of a screen for the current window aspect. MOBILE profile:
  // portrait = the screen fills the width of the phone (FOV widened like the
  // overview, so nothing jumps); landscape = screen + keys, tight.
  const frame = (F) => {
    if (!CAMERA_PROFILE) return { above: F.above, below: F.below, margin: F.margin, wMargin: F.margin };
    if (camera.aspect < 1) return { above: F.above, below: F.below, margin: F.margin, wMargin: F.portraitMargin };
    const L = F.landscape;
    return { above: L.above, below: L.below, margin: L.margin, wMargin: L.margin };
  };
  const mag = { k: 1, ox: 0, oy: 0 }; // magnifier: distance factor, offsets along the screen (m: right, down)
  let base = null; // last framing: { dist, tanV, aspect, shift } (magnifier limits)
  const focusPose = (unitName) => {
    const T = TARGETS[unitName], F = T.F, S = T.screen;
    const u = units[T.unit];
    const t = S.tilt, a = F.offAxis;
    const fr = frame(F);
    const fov = viewFov(F.fov, camera.aspect);
    const normal = new THREE.Vector3(0, Math.cos(t), Math.sin(t)); // out of the screen
    const down = new THREE.Vector3(0, -Math.sin(t), Math.cos(t)); // along the screen, towards the DJ
    const [w, h] = S.size;
    // frame: from `above` beyond the top edge to `below` beyond the bottom edge
    const halfH = (h / 2 + (fr.above + fr.below) / 2) * fr.margin;
    const shift = (fr.below - fr.above) / 2;
    const target = new THREE.Vector3(...S.center).addScaledVector(down, shift);
    const view = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(down, Math.sin(a)); // towards the camera
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    let dist = Math.max(halfH / tanV, ((w / 2) * fr.wMargin) / (tanV * camera.aspect));
    base = { dist, tanV, aspect: camera.aspect, shift };
    if (mag.k < 1) { target.x += mag.ox; target.addScaledVector(down, mag.oy); dist *= mag.k; }
    u.group.updateMatrixWorld(true);
    const tw = u.group.localToWorld(target.clone());
    const pw = u.group.localToWorld(target.clone().addScaledVector(view, dist));
    return { px: pw.x, py: pw.y, pz: pw.z, tx: tw.x, ty: tw.y, tz: tw.z, fov };
  };

  // Flight paths, s = 0..1 -> pose.
  //   arc  (CDJ): C1 spline with a raised middle key (ease-in / ease-out at the ends only)
  //   zoom (mixer): the distance to the look-at point is interpolated on a log
  //     scale (constant zoom rate), the view direction turns smoothly, and the
  //     look-at point moves with the distance covered, so it glides at a constant
  //     pace on screen (no sideways rush at the close end); smootherstep easing
  const arcPath = (from, to, lift) => {
    const len = Math.hypot(to.px - from.px, to.py - from.py, to.pz - from.pz);
    const mid = {};
    for (const k of Object.keys(to)) mid[k] = (from[k] + to[k]) / 2;
    mid.py += len * lift;
    return hermitePath([0, 0.5, 1], [from, mid, to]);
  };
  const zoomPath = (from, to) => {
    const T0 = new THREE.Vector3(from.tx, from.ty, from.tz), T1 = new THREE.Vector3(to.tx, to.ty, to.tz);
    const D0 = new THREE.Vector3(from.px, from.py, from.pz).sub(T0), D1 = new THREE.Vector3(to.px, to.py, to.pz).sub(T1);
    const d0 = Math.max(1e-4, D0.length()), d1 = Math.max(1e-4, D1.length());
    const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromUnitVectors(D0.clone().normalize(), D1.clone().normalize());
    const q = new THREE.Quaternion(), dir = new THREE.Vector3(), tgt = new THREE.Vector3();
    const l0 = Math.log(d0), l1 = Math.log(d1);
    const out = {};
    return (s) => {
      const e = s * s * s * (s * (s * 6 - 15) + 10); // smootherstep: zero speed and acceleration at both ends
      const d = Math.exp(l0 + (l1 - l0) * e);
      const k = Math.abs(d1 - d0) > 1e-6 ? (d - d0) / (d1 - d0) : e;
      tgt.copy(T0).lerp(T1, k);
      q.slerpQuaternions(q0, q1, e);
      dir.copy(D0).normalize().applyQuaternion(q).multiplyScalar(d).add(tgt);
      out.px = dir.x; out.py = dir.y; out.pz = dir.z; out.tx = tgt.x; out.ty = tgt.y; out.tz = tgt.z;
      out.fov = from.fov + (to.fov - from.fov) * e;
      return out;
    };
  };

  let stale = false; // the window was resized during a flight: re-frame at its end
  const fly = (F, from, to, done) => {
    tween?.kill();
    busy = true;
    stale = false;
    const finish = () => { Object.assign(rig.state, to); busy = false; tween = null; done(); if (stale) onResize(); };
    if (reducedMotion || F.duration <= 0) { finish(); return; }
    const path = F.flight === 'zoom' ? zoomPath(from, to) : arcPath(from, to, F.lift);
    const clock = { t: 0 };
    tween = gsap.to(clock, {
      t: 1, duration: F.duration, ease: 'none',
      onUpdate: () => Object.assign(rig.state, path(clock.t)),
      onComplete: finish,
    });
  };

  const enter = (unitName) => {
    if (current || busy || !zoom.active || !TARGETS[unitName]) return false;
    current = unitName;
    resetMag();
    saved = pose();
    savedFit = rig.fitDistance?.() ?? null;
    zoom.setLocked(true);
    emit('enter', unitName);
    fly(TARGETS[unitName].F, saved, focusPose(unitName), () => {});
    return true;
  };
  const exit = () => {
    if (!current || busy) return false;
    const unit = current;
    emit('exit', unit);
    pinch = null; fingers.clear();
    fly(TARGETS[unit].F, pose(), saved, () => { current = null; saved = null; resetMag(); zoom.setLocked(false); emit('exited', unit); });
    return true;
  };
  // Resize (a phone turned) while focused: the screen is framed again for the new
  // aspect; MOBILE: the pose to return to follows too (FOV, fitted distance).
  let savedFit = null;
  const onResize = () => {
    if (!current) return;
    adaptSaved(); // also mid-flight: the exit flight ends on `saved` itself
    if (busy) { stale = true; return; }
    stale = false;
    resetMag(); // a rotation: back to the framing
    Object.assign(rig.state, focusPose(current));
  };
  function adaptSaved() {
    if (CAMERA_PROFILE && saved) {
      const fit = rig.fitDistance?.();
      if (fit && savedFit) {
        const k = fit / savedFit;
        saved.px = saved.tx + (saved.px - saved.tx) * k; saved.py = saved.ty + (saved.py - saved.ty) * k; saved.pz = saved.tz + (saved.pz - saved.tz) * k;
      }
      savedFit = fit ?? savedFit;
      saved.fov = rig.finalFov?.() ?? saved.fov;
    }
  }

  // Instant reset (replay / skip): no flight, controls unlocked, focus cleared.
  const reset = () => {
    tween?.kill(); tween = null;
    const unit = current;
    busy = false; current = null; saved = null;
    resetMag(); pinch = null; fingers.clear();
    zoom.setLocked(false);
    if (unit) emit('exited', unit); // listeners (touch surface, pages, dev panel) see the end of the focus
  };

  // --- magnifier (two fingers on a touch screen, focus settled) ---
  const magListeners = new Set();
  function resetMag() { const was = mag.k < 1; mag.k = 1; mag.ox = 0; mag.oy = 0; if (was) for (const fn of magListeners) fn(1); }
  const fingers = new Map(); // touch pointerId -> { x, y }
  let pinch = null; // { dist, mid }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane();
  const hitW = new THREE.Vector3(), hitL = new THREE.Vector3();
  // point of the screen plane under a client point, in screen coordinates
  // relative to the framing target (x: right, d: down the panel), or null
  const planeAt = (x, y) => {
    const T = TARGETS[current];
    const u = T && units[T.unit];
    if (!u || !base) return null;
    const S = T.screen, t = S.tilt;
    u.group.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, Math.cos(t), Math.sin(t)).transformDirection(u.group.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(n, u.group.localToWorld(new THREE.Vector3(...S.center)));
    const r = dom.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hitW)) return null;
    u.group.worldToLocal(hitL.copy(hitW));
    const dx = hitL.x - S.center[0], dy = hitL.y - S.center[1], dz = hitL.z - S.center[2];
    return { x: dx, d: -Math.sin(t) * dy + Math.cos(t) * dz - base.shift };
  };
  const clampMag = () => {
    if (mag.k > 0.985) { mag.k = 1; mag.ox = 0; mag.oy = 0; return; }
    const T = TARGETS[current], M = T.F.mag;
    const [w, h] = T.screen.size;
    const visH = base.dist * mag.k * base.tanV, visW = visH * base.aspect;
    const lim = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    mag.ox = lim(mag.ox, -w / 2 - M.side + visW, w / 2 + M.side - visW);
    mag.oy = lim(mag.oy, M.top - base.shift + visH, h / 2 + M.bottomExtra - base.shift - visH);
  };
  const pinchState = () => {
    const [a, b] = [...fingers.values()];
    return { dist: Math.max(20, Math.hypot(b.x - a.x, b.y - a.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  const movePinch = () => {
    const now = pinchState(), prev = pinch;
    pinch = now;
    const k0 = mag.k;
    const a = planeAt(prev.mid.x, prev.mid.y), b = planeAt(now.mid.x, now.mid.y);
    if (a && b) { mag.ox += a.x - b.x; mag.oy += a.d - b.d; } // the point under the fingers follows them
    mag.k = Math.min(1, Math.max(TARGETS[current].F.mag.min, k0 * (prev.dist / now.dist)));
    if (b && mag.k !== k0) { const f = 1 - mag.k / k0; mag.ox += (b.x - mag.ox) * f; mag.oy += (b.d - mag.oy) * f; } // towards the fingers
    clampMag();
    Object.assign(rig.state, focusPose(current));
    for (const fn of magListeners) fn(mag.k);
  };
  const settled = () => !!current && !busy;
  const onPDown = (e) => {
    if (e.pointerType !== 'touch' || !settled()) return;
    if (e.isPrimary) { fingers.clear(); pinch = null; } // no other finger is down: forget a lost one
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) pinch = pinchState();
  };
  const onPMove = (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size === 2 && settled()) movePinch();
  };
  const onPUp = (e) => { if (fingers.delete(e.pointerId)) pinch = fingers.size >= 2 ? pinchState() : null; };
  if (dom) {
    dom.addEventListener('pointerdown', onPDown);
    dom.addEventListener('pointermove', onPMove);
    dom.addEventListener('pointerup', onPUp);
    dom.addEventListener('pointercancel', onPUp);
  }

  return {
    get current() { return current; },
    get busy() { return busy; },
    get magnified() { return mag.k; },
    onMagnify(fn) { magListeners.add(fn); return () => magListeners.delete(fn); },
    enter, exit, reset,
    refit: onResize, // after a resize of the canvas (src/main.js)
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Routing of zone clicks. 'blocked': ignore the click (flight running, or a
    // screen while focused: the focused screen is a touch surface, handled by
    // src/input/screenTouch.js, and the others do nothing).
    handleButton(info) {
      if (busy) return 'blocked';
      const unit = info.unit;
      if (!TARGETS[unit]) return null;
      if (current && info.id === `${unit}_screen`) return 'blocked';
      if (!current && info.id === `${unit}_screen`) return enter(unit) ? 'enter' : null;
      if (current && unit === current && info.id === `${unit}_menu`) return exit() ? 'exit' : null;
      return null;
    },
  };
}
