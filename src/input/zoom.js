// Camera controls after the intro:
//   - wheel / trackpad pinch: zoom along the view direction (clamped distance)
//   - press and drag (mouse, pen or one finger): orbit around the look-at point,
//     elevation and azimuth limited (ORBIT in config) with soft, springy stops
// Both are smoothed. A short press without movement stays a plain click for the
// click zones: both use the same threshold, tapSlop() in ./pointer.js (6 px,
// 10 px for a finger), so a press is either a click or a drag, never both.
//   - two fingers (touch): pinch to zoom towards the point between the fingers,
//     and slide both to pan the look-at point over the set (bounded: MOBILE_CAMERA
//     panX / panZ in config), e.g. to bring one CDJ close on a phone
// While the user has not moved the camera, the default view is re-fitted on
// resize so the three units stay entirely visible (MOBILE profile: also after a
// rotation, the zoom keeps its proportion of the fitted distance). Inactive during the intro.
import * as THREE from 'three';
import { ZOOM, ORBIT, MOBILE_CAMERA, CAMERA_PROFILE } from '../config.js';
import { tapSlop } from './pointer.js';

export function createZoom(rig, dom, { reducedMotion = false, camera = null } = {}) {
  let active = false;
  let touched = false; // the user moved the camera since activation
  let locked = false; // scripted camera (screen focus): ignore input, leave the rig alone
  let pointerFilter = null; // (event) => true: this press belongs to someone else (a control being dragged)
  const cur = { r: rig.distance(), phi: 0, theta: 0, tx: rig.state.tx, tz: rig.state.tz };
  const goal = { ...cur };
  let lastFit = null; // fitted distance at the last activation / resize (MOBILE rotation)

  // Limits, proportional to the fitted default distance (see ZOOM in config):
  // the default view is always reachable, with room to zoom out beyond it.
  const limits = () => {
    const fit = rig.fitDistance() ?? ZOOM.max / ZOOM.maxOverFit;
    const near = Math.min(ZOOM.minCap, Math.max(ZOOM.minFloor, fit * ZOOM.minOverFit));
    return { min: Math.min(near, fit), max: Math.max(ZOOM.max, fit * ZOOM.maxOverFit) };
  };
  const clampR = (d) => { const l = limits(); return Math.min(l.max, Math.max(l.min, d)); };
  // Angle limits. phi is the polar angle from straight above (90 deg - elevation).
  const PHI = [Math.PI / 2 - ORBIT.maxElevation, Math.PI / 2 - ORBIT.minElevation];
  const THETA = [-ORBIT.maxAzimuth, ORBIT.maxAzimuth];
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  // Soft stop: past a limit, the raw drag angle is mapped onto at most
  // ORBIT.give extra radians (asymptotic); on release it springs back to the limit.
  const soft = (v, [lo, hi]) => {
    const g = ORBIT.give;
    if (v > hi) return hi + g * (1 - Math.exp(-(v - hi) / g));
    if (v < lo) return lo - g * (1 - Math.exp(-(lo - v) / g));
    return v;
  };
  // MOBILE profile: the camera never rises above maxCameraY (club ceiling), even
  // zoomed out in portrait at the steepest elevation.
  const maxY = CAMERA_PROFILE?.maxCameraY ?? Infinity;
  const apply = () => {
    rig.state.tx = cur.tx; rig.state.tz = cur.tz;
    const r = Number.isFinite(maxY) ? Math.min(cur.r, (maxY - rig.state.ty) / Math.max(0.2, Math.cos(cur.phi))) : cur.r;
    rig.setSpherical(r, cur.phi, cur.theta);
  };
  const snap = () => { cur.r = goal.r; cur.phi = goal.phi; cur.theta = goal.theta; cur.tx = goal.tx; cur.tz = goal.tz; apply(); };
  const syncFromRig = () => {
    const s = rig.getSpherical();
    goal.r = cur.r = s.radius; goal.phi = cur.phi = s.phi; goal.theta = cur.theta = s.theta;
    goal.tx = cur.tx = rig.state.tx; goal.tz = cur.tz = rig.state.tz;
  };

  const onWheel = (e) => {
    if (!active || locked) return; // let the page behave normally while inactive / locked
    // Trackpad pinch arrives as a wheel event with ctrlKey; it is finer.
    const gain = e.ctrlKey ? 3.2 : 1;
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const next = clampR(goal.r * Math.exp(delta * ZOOM.wheelSensitivity * gain));
    // Already at the limit in that direction: the wheel is left to the page (it
    // scrolls if the page can; here it cannot, so nothing happens). A pinch is
    // always taken (otherwise the browser would zoom the whole page).
    if (next === goal.r && !e.ctrlKey) return;
    e.preventDefault();
    touched = true;
    goal.r = next;
    if (reducedMotion) snap();
  };

  // --- drag to orbit ---
  let drag = null; // { id, x, y, moved, theta, phi (raw drag angles, before the soft stops) }
  const onDown = (e) => {
    if (!active || locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType === 'touch') {
      // every finger is tracked; the ones holding a control (pointerFilter) never
      // take part in a pinch (a pending control press is dropped by the second
      // finger first: src/input/controlDrag.js)
      // a primary touch = no other finger is down: forget any lost one (a system
      // gesture may swallow a pointerup)
      if (e.isPrimary) { fingers.clear(); pinch = null; gesture = false; }
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (freeFingers().length >= 2) { startPinch(); return; } // second finger: the orbit stops, the pinch starts
      if (gesture) return; // a finger left over from a pinch: nothing until all are lifted
    }
    if (pointerFilter?.(e)) return; // press on a movable control: no orbit (wheel zoom unaffected)
    if (drag) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, slop: tapSlop(e.pointerType), theta: goal.theta, phi: goal.phi };
  };
  const onMove = (e) => {
    if (fingers.has(e.pointerId)) {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) { movePinch(); return; }
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < drag.slop) return;
      drag.moved = true;
      touched = true;
      dom.setPointerCapture?.(e.pointerId);
      dom.style.cursor = 'grabbing';
    }
    drag.x = e.clientX; drag.y = e.clientY;
    const k = (Math.PI * ORBIT.speed) / Math.max(1, dom.clientHeight);
    drag.theta -= dx * k;
    drag.phi -= dy * k;
    goal.theta = soft(drag.theta, THETA);
    goal.phi = soft(drag.phi, PHI);
    if (reducedMotion) snap();
  };
  const onUp = (e) => {
    if (fingers.delete(e.pointerId)) {
      if (pinch) { if (freeFingers().length < 2) endPinch(); else pinch = pinchState(); } // 3 -> 2 fingers: new reference, no jump
      if (!fingers.size) gesture = false;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) { dom.releasePointerCapture?.(e.pointerId); dom.style.cursor = ''; }
    drag = null;
    // spring back from the soft stops (smoothed in update)
    goal.theta = clamp(goal.theta, THETA);
    goal.phi = clamp(goal.phi, PHI);
    if (reducedMotion) snap();
  };

  // --- two fingers: pinch (zoom towards the fingers) and pan ---
  const fingers = new Map(); // touch pointerId -> { x, y }
  const freeFingers = () => [...fingers.entries()].filter(([id]) => !pointerFilter?.({ pointerId: id, pointerType: 'touch' })).map(([, p]) => p);
  let pinch = null; // { a, b, dist, mid }
  let gesture = false; // a multi-finger gesture ran: no orbit until every finger is up
  const P = CAMERA_PROFILE ?? MOBILE_CAMERA;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // point of the table plane (look-at height) under a client point, or null
  const groundAt = (x, y, out) => {
    if (!camera) return null;
    const r = dom.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    ground.constant = -rig.state.ty;
    return ray.ray.intersectPlane(ground, out);
  };
  const clampPan = () => {
    goal.tx = Math.min(P.panX, Math.max(-P.panX, goal.tx));
    goal.tz = Math.min(P.panZ[1], Math.max(P.panZ[0], goal.tz));
  };
  const pinchState = () => {
    const [a, b] = freeFingers();
    if (!b) return null;
    return { dist: Math.max(20, Math.hypot(b.x - a.x, b.y - a.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  const startPinch = () => {
    if (drag) { if (drag.moved) { try { dom.releasePointerCapture?.(drag.id); } catch { /* released */ } dom.style.cursor = ''; } drag = null; }
    goal.theta = clamp(goal.theta, THETA); goal.phi = clamp(goal.phi, PHI); // a soft stop stretched by the orbit springs back
    gesture = true;
    touched = true;
    pinch = pinchState();
  };
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const movePinch = () => {
    const now = pinchState();
    if (!now) { pinch = null; return; }
    const prev = pinch;
    pinch = now;
    // pan: the table point under the fingers' midpoint follows them
    if (groundAt(prev.mid.x, prev.mid.y, pa) && groundAt(now.mid.x, now.mid.y, pb)) { goal.tx += pa.x - pb.x; goal.tz += pa.z - pb.z; }
    // zoom: distance ratio, towards the table point between the fingers
    const r0 = goal.r;
    goal.r = clampR(goal.r * (prev.dist / now.dist));
    if (groundAt(now.mid.x, now.mid.y, pb)) { const k = 1 - goal.r / r0; goal.tx += (pb.x - goal.tx) * k; goal.tz += (pb.z - goal.tz) * k; }
    clampPan();
    if (reducedMotion) snap();
  };
  const endPinch = () => { pinch = null; };

  const onResize = () => {
    if (!active || locked) return;
    if (CAMERA_PROFILE) {
      // MOBILE: FOV and distance follow the new aspect (a rotation): the zoom keeps
      // its proportion of the fitted distance, the orbit angles stay
      rig.state.fov = rig.finalFov();
      const fit = rig.fitDistance();
      if (fit != null) goal.r = touched && lastFit ? goal.r * (fit / lastFit) : fit;
      lastFit = fit;
      goal.r = clampR(goal.r);
      cur.r = goal.r; // no slow zoom across a rotation
      apply();
      return;
    }
    if (!touched && rig.fitDistance() != null) goal.r = rig.fitDistance();
    goal.r = clampR(goal.r);
    if (reducedMotion) snap();
  };

  dom.addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);

  return {
    get active() { return active; },
    get locked() { return locked; },
    // still converging towards the goal (zoom / orbit smoothing)
    get moving() { return active && !locked && (Math.abs(goal.r - cur.r) >= 1e-5 || Math.abs(goal.phi - cur.phi) >= 1e-5 || Math.abs(goal.theta - cur.theta) >= 1e-5 || Math.abs(goal.tx - cur.tx) >= 1e-5 || Math.abs(goal.tz - cur.tz) >= 1e-5); },
    get pinching() { return !!pinch; },
    // Presses for which filter(e) returns true never start an orbit drag
    // (src/input/controlDrag.js: a press on a fader / knob / jog).
    setPointerFilter(fn) { pointerFilter = fn; },
    // Lock: input ignored and the rig untouched (another controller drives it).
    // Unlock: re-sync from the rig's current pose, so nothing jumps.
    setLocked(v) {
      if (v === locked) return;
      locked = v;
      if (v) { drag = null; pinch = null; fingers.clear(); gesture = false; dom.style.cursor = ''; return; }
      syncFromRig();
      lastFit = rig.fitDistance(); // the pose given back was framed for the current aspect
    },
    setActive(v) {
      active = v;
      dom.style.touchAction = v ? 'none' : '';
      if (!v) { drag = null; pinch = null; fingers.clear(); gesture = false; return; }
      touched = false;
      const s = rig.getSpherical();
      goal.r = clampR(s.radius); goal.phi = clamp(s.phi, PHI); goal.theta = clamp(s.theta, THETA);
      goal.tx = rig.state.tx; goal.tz = rig.state.tz;
      lastFit = rig.fitDistance();
      snap();
    },
    // The camera rig changed under the controller (rotation during a screen focus): re-read it.
    resync: syncFromRig,
    setDistance(d) { goal.r = clampR(d); snap(); },
    handleResize: onResize, // after a resize of the canvas (src/main.js: renderer onResize)
    update(dt) {
      if (!active || locked || reducedMotion) return;
      if (Math.abs(goal.r - cur.r) < 1e-5 && Math.abs(goal.phi - cur.phi) < 1e-5 && Math.abs(goal.theta - cur.theta) < 1e-5 && Math.abs(goal.tx - cur.tx) < 1e-5 && Math.abs(goal.tz - cur.tz) < 1e-5) return;
      const kz = 1 - Math.exp(-ZOOM.smoothing * dt);
      const ko = 1 - Math.exp(-ORBIT.smoothing * dt);
      cur.r += (goal.r - cur.r) * kz;
      cur.phi += (goal.phi - cur.phi) * ko;
      cur.theta += (goal.theta - cur.theta) * ko;
      cur.tx += (goal.tx - cur.tx) * ko;
      cur.tz += (goal.tz - cur.tz) * ko;
      apply();
    },
    dispose() {
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
    },
  };
}
