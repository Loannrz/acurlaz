// Mouse / pen / touch handling of the movable controls (src/controls/).
//   - press on a control zone, then drag (past the shared tap slop of
//     ./pointer.js, so a short press stays a click for the hotspots):
//       fader, crossfader, tempo : the cap follows the pointer along its slot
//                                  (axis projected on screen: works from any angle)
//       knob, selector, encoder  : drag up / right = clockwise (a selector snaps
//                                  to its positions), 220 px for the full range
//       jog                      : the platter turns with the pointer around its
//                                  centre (grab and spin); the centre display stays
//   - wheel over a jog: turns it (pinch / ctrl+wheel still zooms; a wheel gesture
//     that started as a zoom keeps zooming when it passes over a jog)
//   - double tap / double click on a control: back to its default value
//   - the BROWSE rotary of the CDJs has no function here: not grabbed (controls.isInert)
// While a control is grabbed the camera does not orbit (zoom.setPointerFilter);
// the wheel zoom and the screen focus are untouched. Nothing happens during
// the intro (zoom inactive) or while a CDJ screen is focused.
// Multitouch: each finger has its own grab. A second finger that lands while
// the first one is already moving a control may grab another one (a fader with
// one finger, a knob with another); a second finger that lands while the first
// press has not started to move drops that press (it is a pinch: src/input/zoom.js).
//   createControlInput({ dom, camera, controls, hotspots, zoom, focus })
import * as THREE from 'three';
import { tapSlop, TAP_MAX_MS } from './pointer.js';

const KNOB_PX = 220; // px of drag for the full range of a knob
const ENCODER_RAD_PER_PX = Math.PI / 180; // 1 degree per px (browse, endless knobs)
const SELECTOR_STEP_PX = 26; // px per position of a selector
const JOG_WHEEL_RAD = 0.0035; // radians per wheel px
const DOUBLE_TAP_MS = 380;
const DOUBLE_TAP_PX = 10;
const ZOOM_GESTURE_MS = 260; // a wheel gesture within this gap keeps its first target

export function createControlInput({ dom, camera, controls, hotspots, zoom, focus }) {
  const { store } = controls;
  const host = dom.parentElement ?? dom; // capture phase on the parent: runs before the canvas listeners
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const grabs = new Map(); // pointerId -> press on a control (not yet / now dragging)
  let lastTap = null; // { id, t, x, y }
  const dragging = () => { for (const g of grabs.values()) if (g.dragging) return true; return false; };

  const usable = () => zoom.active && !zoom.locked && !focus?.current && !focus?.busy;

  // Control under a client point: the hotspots' own picking (bodies + parts,
  // occlusion and parallax handled there).
  const controlAt = (x, y, pointerType) => {
    const res = hotspots.pick(x, y, pointerType);
    if (!res.zone || controls.isInert?.(res.zone.id)) return null; // inert (BROWSE rotary): not a control here
    return controls.byZone.get(res.zone.id) ?? null;
  };

  const toScreen = (v3) => {
    const r = dom.getBoundingClientRect();
    const p = v3.clone().project(camera);
    return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
  };
  const rayAt = (x, y) => {
    const r = dom.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  };
  // Angle (clockwise from above) of a client point around the jog centre, on
  // the plane of the platter top. null when the ray misses the plane.
  const jogAngle = (ctl, x, y) => {
    const m = ctl.mount;
    m.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 1, 0).transformDirection(m.matrixWorld);
    const o = m.localToWorld(new THREE.Vector3(0, ctl.height, 0));
    plane.setFromNormalAndCoplanarPoint(n, o);
    if (!rayAt(x, y).intersectPlane(plane, hit)) return null;
    const l = m.worldToLocal(hit.clone());
    if (Math.hypot(l.x, l.z) < 0.004) return null; // too close to the centre: angle unstable
    return -Math.atan2(l.x, l.z); // clockwise
  };

  const begin = (g, e) => {
    g.dragging = true;
    const c = g.ctl;
    if (c.setPressed) c.setPressed(false);
    try { dom.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    dom.style.cursor = 'grabbing';
    if (c.kind === 'fader') {
      const a = toScreen(c.worldAt(0)), b = toScreen(c.worldAt(1));
      g.axis = [b[0] - a[0], b[1] - a[1]];
      g.axisLen2 = Math.max(1, g.axis[0] ** 2 + g.axis[1] ** 2);
    } else if (c.kind === 'jog') {
      g.angle = jogAngle(c, g.x0, g.y0);
    }
  };

  const move = (g, e) => {
    const c = g.ctl;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (c.kind === 'fader') {
      const t = (dx * g.axis[0] + dy * g.axis[1]) / g.axisLen2;
      store.set(c.id, g.v0 + t, 'user');
    } else if (c.kind === 'knob') {
      store.set(c.id, g.v0 + (dx - dy) / KNOB_PX, 'user');
    } else if (c.kind === 'selector') {
      store.set(c.id, Math.round(g.v0 + (dx - dy) / SELECTOR_STEP_PX), 'user');
    } else if (c.kind === 'encoder') {
      const total = (dx - dy) * ENCODER_RAD_PER_PX;
      store.nudge(c.id, total - (g.done ?? 0), 'user');
      g.done = total;
    } else if (c.kind === 'jog') {
      const a = jogAngle(c, e.clientX, e.clientY);
      if (a == null) return;
      if (g.angle == null) { g.angle = a; return; }
      const d = Math.atan2(Math.sin(a - g.angle), Math.cos(a - g.angle));
      g.angle = a;
      store.nudge(c.id, d, 'user');
    }
  };

  const end = (e, cancelled = false) => {
    const g = grabs.get(e.pointerId);
    if (!g) return;
    grabs.delete(e.pointerId);
    g.ctl.setPressed?.(false);
    if (g.dragging) {
      try { dom.releasePointerCapture?.(e.pointerId); } catch { /* released */ }
      // still over a control: grab hand right away (the hotspots refresh on the next move)
      dom.style.cursor = !cancelled && e.pointerType === 'mouse' && controlAt(e.clientX, e.clientY, e.pointerType) ? 'grab' : '';
      lastTap = null;
      return;
    }
    if (cancelled) return;
    // a tap: second tap on the same control soon after = reset to default
    const now = performance.now();
    if (now - g.t > TAP_MAX_MS) { lastTap = null; return; }
    if (lastTap && lastTap.id === g.ctl.id && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX) {
      store.reset(g.ctl.id);
      lastTap = null;
    } else {
      lastTap = { id: g.ctl.id, t: now, x: e.clientX, y: e.clientY };
    }
  };

  const drop = (g) => { g.ctl.setPressed?.(false); grabs.delete(g.id); };
  const onDown = (e) => {
    if (e.target !== dom) return;
    if (!e.isPrimary) {
      // a second finger: pending presses are dropped (pinch); if a control is
      // already moving, this finger may grab another control
      for (const g of [...grabs.values()]) if (!g.dragging) drop(g);
      if (!grabs.size || !usable()) return;
    } else {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (grabs.size || !usable()) return;
    }
    const ctl = controlAt(e.clientX, e.clientY, e.pointerType);
    if (!ctl) return;
    for (const g of grabs.values()) if (g.ctl === ctl) return; // one finger per control
    grabs.set(e.pointerId, { id: e.pointerId, ctl, x0: e.clientX, y0: e.clientY, t: performance.now(), slop: tapSlop(e.pointerType), v0: store.get(ctl.id), dragging: false });
    ctl.setPressed?.(true);
  };
  const onMove = (e) => {
    const g = grabs.get(e.pointerId);
    if (!g) return;
    if (!usable()) { end(e, true); return; }
    if (!g.dragging) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) <= g.slop) return;
      begin(g, e);
    }
    move(g, e);
  };
  const onUp = (e) => end(e);
  const onCancel = (e) => end(e, true);

  // Wheel: turns a jog under the pointer, unless the gesture started as a zoom.
  let gesture = { target: null, t: 0 };
  const onWheel = (e) => {
    if (e.target !== dom || !usable() || e.ctrlKey) return;
    const now = performance.now();
    let target = gesture.target;
    if (now - gesture.t > ZOOM_GESTURE_MS) {
      const ctl = controlAt(e.clientX, e.clientY, 'mouse');
      target = ctl?.kind === 'jog' ? ctl : 'zoom';
    }
    gesture = { target, t: now };
    if (target === 'zoom') return; // the zoom controller handles it
    e.preventDefault();
    e.stopPropagation(); // capture phase on the parent: the canvas (zoom) never sees it
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    store.nudge(target.id, delta * JOG_WHEEL_RAD, 'user');
  };

  host.addEventListener('pointerdown', onDown, true);
  host.addEventListener('pointermove', onMove, true);
  host.addEventListener('pointerup', onUp, true);
  host.addEventListener('pointercancel', onCancel, true);
  host.addEventListener('wheel', onWheel, { capture: true, passive: false });
  // the orbit never starts from a press on a control, nor while a control moves
  zoom.setPointerFilter((e) => grabs.has(e.pointerId) || dragging());
  // Every grab ends when the focus changes, the window loses the focus (Alt-Tab:
  // the pointerup may never come) or the page is hidden: no fader left grabbed.
  const purge = () => {
    if (!grabs.size) return;
    if (dragging()) dom.style.cursor = '';
    for (const g of [...grabs.values()]) {
      if (g.dragging) { try { dom.releasePointerCapture?.(g.id); } catch { /* released */ } }
      drop(g);
    }
    lastTap = null;
  };
  const offFocus = focus?.onChange?.(purge);
  const onVisibility = () => { if (document.hidden) purge(); };
  window.addEventListener('blur', purge);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    get grabbing() { for (const g of grabs.values()) if (g.dragging) return g.ctl.id; return null; },
    dispose() {
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('pointermove', onMove, true);
      host.removeEventListener('pointerup', onUp, true);
      host.removeEventListener('pointercancel', onCancel, true);
      host.removeEventListener('wheel', onWheel, { capture: true });
      zoom.setPointerFilter(null);
      offFocus?.();
      window.removeEventListener('blur', purge);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
