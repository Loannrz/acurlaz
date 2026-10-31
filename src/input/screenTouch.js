// Touch surface of the focused screen (a CDJ screen, or the mixer's CRÉDITS
// screen). While the screen focus is settled
// (src/input/screenFocus.js: camera locked, no flight), a press on the image of
// THAT screen is converted to canvas pixels of its CanvasTexture and dispatched
// to the screen (screens.cdjLeft.onPointer / hit regions, src/scene/screens.js):
//   pointerdown -> pointermove (while pressed; dragging = past the tap slop)
//   -> pointerup -> tap (no drag, within TAP_MAX_MS).
// Conversion: the pointer ray is intersected with the image plane (`screen.mesh`,
// UV 0..1 over the whole canvas): x = u * width, y = (1 - v) * height. A press
// must hit the image; a drag keeps reporting outside it (inside = false).
// Mouse, pen and touch (pointer events); a second finger cancels. Thresholds are
// the shared ones (src/input/pointer.js), so a tap here is a click elsewhere.
// Out of focus, or outside the image, nothing happens here: the click zones
// (src/scene/hotspots.js) work as usual (MENU, BROWSE...).
//   const touch = createScreenTouch({ dom, camera, screens, focus, onEvent })
// Scroll (wheel / trackpad over the image, ArrowUp / ArrowDown / PageUp / PageDown)
// goes to the focused screen as { type: 'scroll', scrollY (canvas px, + = down),
// lines, page, source } -> page.onPointer; the camera does not zoom meanwhile.
//   touch.update()           // render loop, after hotspots.update() (cursor, list inertia)
//   touch.setZoneHover(info) // hotspots hover info, for the cursor
// Fingers (pointerType 'touch') also get:
//   - a reach around the keys of the screen (TOUCH.screenSlopPx CSS px, sent as
//     `slop` in canvas px: src/scene/screens.js regionAt), so small keys take ~44 px;
//   - a light inertia after a vertical fling: the list keeps scrolling for a
//     moment ('scroll' events, source 'inertia', at the press point), slowing down
//     (TOUCH.inertia); any new press, a page or focus change stops it.
import * as THREE from 'three';
import { TOUCH } from '../config.js';
import { tapSlop, TAP_MAX_MS } from './pointer.js';

const SCREEN_KEYS = { cdj_left: 'cdjLeft', cdj_right: 'cdjRight', mixer: 'mixer' };

export function createScreenTouch({ dom, camera, screens, focus, onEvent }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  const local = new THREE.Vector3();
  let pressed = null; // { id, screen, sx, sy, t, slop, x, y, dragging, pointerType, reach, x0, y0, trail }
  let fling = null; // { screen, x, y, v (canvas px / s, + = content moves up), last }
  let hover = { screen: null, image: false, region: false }; // mouse hover
  let zoneHover = null; // hotspots hover (zone id)

  const screenOf = () => {
    if (!focus.current || focus.busy) return null;
    return screens[SCREEN_KEYS[focus.current]] ?? null;
  };

  // Canvas coordinates of a client point on `screen`, or null (ray parallel / behind).
  const toCanvas = (screen, clientX, clientY, requireHit) => {
    const r = dom.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const mesh = screen.mesh;
    mesh.updateMatrixWorld();
    if (requireHit) {
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (!hit) return null;
      point.copy(hit.point);
    } else {
      plane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld),
        new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld),
      );
      if (!raycaster.ray.intersectPlane(plane, point)) return null;
    }
    mesh.worldToLocal(local.copy(point));
    const [iw, ih] = screen.imageSize;
    const u = local.x / iw + 0.5, v = local.y / ih + 0.5;
    return { x: u * screen.width, y: (1 - v) * screen.height, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  };

  const send = (screen, p) => {
    const e = screen.handlePointer(p);
    if (e && typeof e === 'object') onEvent?.(e);
    return e;
  };

  // canvas px per CSS px around a client point of `screen` (zoom of the focus)
  const canvasPerCss = (screen, x, y, c) => {
    const c2 = toCanvas(screen, x + 50, y, false);
    return c2 ? Math.abs(c2.x - c.x) / 50 : 1;
  };
  const cancel = () => {
    fling = null;
    if (pressed) {
      const p = pressed;
      pressed = null;
      try { dom.releasePointerCapture?.(p.id); } catch { /* already released */ }
      send(p.screen, { type: 'pointercancel', x: p.x, y: p.y, inside: false, pointerType: p.pointerType });
    }
    if (hover.screen) hover.screen.handlePointer({ type: 'leave' });
    hover = { screen: null, image: false, region: false };
  };

  const onDown = (e) => {
    fling = null; // any new press stops a list fling (a key of the row, another page...)
    if (!e.isPrimary) { if (pressed) cancel(); return; } // second finger: no tap, no drag
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const screen = screenOf();
    if (!screen || pressed) return;
    const c = toCanvas(screen, e.clientX, e.clientY, true);
    if (!c) return; // not on the image: zones handle it
    fling = null; // a finger on the list stops it
    const finger = e.pointerType === 'touch';
    const reach = finger ? Math.min(TOUCH.screenSlopMax, TOUCH.screenSlopPx * canvasPerCss(screen, e.clientX, e.clientY, c)) : 0;
    pressed = { id: e.pointerId, screen, sx: e.clientX, sy: e.clientY, t: performance.now(), slop: tapSlop(e.pointerType), x: c.x, y: c.y, dragging: false, pointerType: e.pointerType, reach, x0: c.x, y0: c.y, trail: finger ? [[performance.now(), c.x, c.y]] : null };
    try { dom.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    send(screen, { type: 'pointerdown', x: c.x, y: c.y, inside: true, pointerType: e.pointerType, slop: reach });
  };

  const onMove = (e) => {
    if (pressed && e.pointerId === pressed.id) {
      const p = pressed;
      if (screenOf() !== p.screen) { cancel(); return; }
      const c = toCanvas(p.screen, e.clientX, e.clientY, false);
      if (!c) return;
      if (!p.dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > p.slop) p.dragging = true;
      const dx = c.x - p.x, dy = c.y - p.y;
      if (dx === 0 && dy === 0) return;
      p.x = c.x; p.y = c.y;
      if (p.trail) { const now = performance.now(); p.trail.push([now, c.x, c.y]); while (p.trail.length > 2 && now - p.trail[0][0] > 120) p.trail.shift(); }
      send(p.screen, { type: 'pointermove', x: c.x, y: c.y, inside: c.inside, dragging: p.dragging, dx, dy, pointerType: p.pointerType, slop: p.reach });
      return;
    }
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return; // no hover for fingers
    const screen = screenOf();
    if (!screen) { if (hover.screen) cancel(); return; }
    const c = toCanvas(screen, e.clientX, e.clientY, true);
    if (hover.screen && hover.screen !== screen) hover.screen.handlePointer({ type: 'leave' });
    const region = c ? screen.handlePointer({ type: 'hover', x: c.x, y: c.y, inside: true }) : screen.handlePointer({ type: 'leave' });
    hover = { screen, image: !!c, region: !!region };
  };

  const onUp = (e) => {
    if (!pressed || e.pointerId !== pressed.id) return;
    const p = pressed;
    pressed = null;
    try { dom.releasePointerCapture?.(p.id); } catch { /* already released */ }
    if (screenOf() !== p.screen) { send(p.screen, { type: 'pointercancel', x: p.x, y: p.y, inside: false, pointerType: p.pointerType }); return; }
    const c = toCanvas(p.screen, e.clientX, e.clientY, false) ?? { x: p.x, y: p.y, inside: false };
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > p.slop;
    send(p.screen, { type: 'pointerup', x: c.x, y: c.y, inside: c.inside, dragging: p.dragging, pointerType: p.pointerType, slop: p.reach });
    if (!p.dragging && !moved && performance.now() - p.t <= TAP_MAX_MS) {
      send(p.screen, { type: 'tap', x: c.x, y: c.y, inside: c.inside, pointerType: p.pointerType, slop: p.reach });
    }
    if (p.trail && p.dragging) startFling(p);
  };
  // Vertical fling of a finger: speed over the last ~120 ms of the drag (none if
  // the finger rested before lifting, or the drag was mostly sideways).
  const startFling = (p) => {
    const tr = p.trail, now = performance.now();
    if (tr.length < 2 || now - tr[tr.length - 1][0] > 60) return;
    const [t0, x0, y0] = tr[0], [t1, x1, y1] = tr[tr.length - 1];
    const dt = (t1 - t0) / 1000;
    if (dt <= 0.01) return;
    const dy = y1 - y0, dx = x1 - x0;
    if (Math.abs(dy) < Math.abs(dx) * 1.5 || Math.abs(p.y - p.y0) < Math.abs(p.x - p.x0)) return;
    const I = TOUCH.inertia;
    const v = Math.max(-I.maxSpeed, Math.min(I.maxSpeed, -dy / dt)); // finger up = content up
    if (Math.abs(v) < I.minSpeed * 4) return;
    fling = { screen: p.screen, x: p.x0, y: p.y0, v, last: now };
  };
  const onCancel = (e) => { if (pressed && e.pointerId === pressed.id) cancel(); };
  // capture lost without a pointerup, tab / window switch: the press ends (pointercancel)
  const onLostCapture = (e) => { if (pressed && e.pointerId === pressed.id) cancel(); };
  const onBlur = () => { if (pressed) cancel(); };
  const onVisibility = () => { if (document.hidden) onBlur(); };
  const onLeave = (e) => {
    if (e.pointerType === 'touch' || pressed) return;
    if (hover.screen) hover.screen.handlePointer({ type: 'leave' });
    hover = { screen: null, image: false, region: false };
  };

  // Wheel / trackpad: scrolls the list under the pointer. Natural direction:
  // deltaY > 0 (fingers up / wheel down) = content moves up = scrollY > 0.
  const onWheel = (e) => {
    const screen = screenOf();
    if (!screen) return;
    if (e.ctrlKey) { e.preventDefault(); return; } // pinch: neither zoom nor page zoom while focused
    const c = toCanvas(screen, e.clientX, e.clientY, true);
    if (!c) return;
    e.preventDefault();
    const c2 = toCanvas(screen, e.clientX + 100, e.clientY, false);
    const k = c2 ? Math.min(6, Math.max(0.2, Math.abs(c2.x - c.x) / 100)) : 1.5; // canvas px per client px
    const raw = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * dom.clientHeight : e.deltaY;
    const dy = e.shiftKey && !e.deltaY ? 0 : raw;
    if (!dy) return;
    send(screen, { type: 'scroll', x: c.x, y: c.y, inside: true, scrollY: dy * k, source: 'wheel', pointerType: 'mouse' });
  };
  const KEY_SCROLL = { ArrowUp: { lines: -1 }, ArrowDown: { lines: 1 }, PageUp: { page: -1 }, PageDown: { page: 1 } };
  const onKey = (e) => {
    const m = KEY_SCROLL[e.key];
    if (!m || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const screen = screenOf();
    if (!screen) return;
    e.preventDefault();
    send(screen, { type: 'scroll', x: screen.width / 2, y: screen.height / 2, inside: true, scrollY: 0, lines: m.lines ?? 0, page: m.page ?? 0, source: 'key', pointerType: 'mouse' });
  };
  dom.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onCancel);
  dom.addEventListener('pointerleave', onLeave);
  dom.addEventListener('lostpointercapture', onLostCapture);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  const offFocus = focus.onChange(() => cancel()); // entering / leaving: drop any press and hover

  return {
    get pressed() { return !!pressed; },
    get flinging() { return !!fling; },
    toCanvas,
    setZoneHover(info) { zoneHover = info?.id ?? null; },
    // Cursor while focused: over the screen (image or its zone), "pointer" only
    // above a hit region. Runs after hotspots.update(), which sets "pointer" for
    // every zone (the screen zone included).
    update() {
      if (fling) {
        const now = performance.now();
        if (screenOf() !== fling.screen) fling = null;
        else {
          const dt = Math.min(0.05, (now - fling.last) / 1000);
          fling.last = now;
          fling.v *= Math.exp(-dt / TOUCH.inertia.tau);
          if (Math.abs(fling.v) < TOUCH.inertia.minSpeed) fling = null;
          else if (dt > 0) send(fling.screen, { type: 'scroll', x: fling.x, y: fling.y, inside: true, scrollY: fling.v * dt, source: 'inertia', pointerType: 'touch' });
        }
      }
      if (!screenOf()) return;
      const onScreen = hover.image || (zoneHover != null && /_screen$/.test(zoneHover));
      if (!onScreen) return;
      const want = hover.image && hover.region ? 'pointer' : '';
      if (dom.style.cursor !== want && dom.style.cursor !== 'grabbing') dom.style.cursor = want;
    },
    dispose() {
      cancel();
      offFocus();
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onCancel);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('lostpointercapture', onLostCapture);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
