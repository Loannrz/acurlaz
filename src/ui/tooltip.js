// Hover hint: a small dark label next to the zone under the mouse (CDJ screen,
// important buttons and controls), its text typed character by character.
// Texts: src/data/hints.js. Styles: #hint in src/styles.css.
//
//   const tip = createTooltip({ dom, camera, hintFor, rectFor, obstacles, blocked, reducedMotion })
//   tip.hover(info)   // hotspots onHover ({ id } or null)
//   tip.update()      // render loop, after hotspots.update(): returns at once when
//                     // no hinted zone is hovered (one matrix compare otherwise)
//   tip.hide()        // hide now (screen focus, replay); the zone may show it again later
//   tip.onShow(fn)    // a hint appeared
//   tip.press(info)   // a FINGER pressed a zone (hotspots onPress, info.pointerType 'touch'):
//                     // its hint appears after TOUCH.longPressMs if the finger stays (no hover on touch)
//   tip.release()     // that press ended (release, slide, cancel): the hint goes at once
//   tip.takeLongPress(id) // true once if `id` just showed its hint by a long press: the
//                     // release is then not a click (src/main.js onButton)
//
// Behaviour:
//   - appears DELAY ms after the pointer settles on a zone that has a hint
//     (WARM_DELAY when moving straight from one hint to the next), disappears at once
//     (short fade) when it leaves; one hint at a time;
//   - never during a press (click, orbit drag, control drag): a press hides it and
//     the zone stays silent until the pointer moves to another zone; same for a
//     wheel gesture; never while the camera moves (zoom inertia, flights: shown
//     again SETTLE ms after it stops); never while blocked(zoneId) is true (intro,
//     flights; in screen focus only the keys above the screen keep their hint);
//   - placed next to the zone, never over it: the zone's projected box (rectFor)
//     is tried above, below, right, left, clamped in the window; any overlap with
//     the zone rejects a side, overlaps with obstacles() (the CDJ screens, the
//     neighbour keys; an obstacle may carry a `weight`, default 1) cost;
//   - typed at TYPE_MS per character, with a thin static caret while typing; the
//     box gets its final size at once (the untyped rest is laid out invisible), so
//     nothing moves; positioned by transform only. prefers-reduced-motion: the
//     text is shown whole, no fade offset;
//   - timers only while a hint is pending / typing; nothing runs at rest.
import { TOUCH } from '../config.js';

const DELAY = 250; // ms on a zone before the hint appears
const WARM_DELAY = 70; // ms when another hint was visible a moment ago
const WARM_MS = 350;
const SETTLE = 250; // ms after the camera stopped
const TYPE_MS = 26; // ms per character
const GAP = 10; // px between the zone and the hint
const MARGIN = 12; // px from the window edges

export function createTooltip({ dom, camera, hintFor, rectFor, obstacles = () => [], blocked = () => false, reducedMotion = false }) {
  const el = document.createElement('div');
  el.id = 'hint';
  el.setAttribute('role', 'tooltip');
  el.setAttribute('aria-hidden', 'true');
  const box = document.createElement('div');
  box.className = 'hint-box';
  const line = (cls) => {
    const root = document.createElement('span');
    root.className = cls;
    const typed = document.createElement('span');
    const caret = document.createElement('i');
    caret.className = 'hint-caret';
    caret.setAttribute('aria-hidden', 'true');
    const rest = document.createElement('span');
    rest.className = 'hint-rest';
    root.append(typed, caret, rest);
    box.append(root);
    return { root, typed, caret, rest, chars: [] };
  };
  const L1 = line('hint-t');
  const L2 = line('hint-s');
  el.append(box);
  document.body.append(el);

  let zone = null; // { id, hint } hovered zone that has a hint
  let dismissed = null; // zone id silenced by a press / wheel until the pointer leaves it
  let down = false; // a pointer is pressed (click, drag)
  let visible = false;
  let hiddenAt = -Infinity;
  let timer = null; // pending show
  let typer = null; // typing interval
  let typedN = 0;
  let held = null; // { id, hint } long press of a finger (touch: no hover)
  let holdTimer = null;
  let longShown = null; // { id, t } hint shown by a long press (its release is not a click)
  const listeners = new Set();
  const lastView = new Float64Array(16), lastProj = new Float64Array(16);

  const snapCamera = () => { lastView.set(camera.matrixWorld.elements); lastProj.set(camera.projectionMatrix.elements); };
  const cameraMoved = () => {
    const v = camera.matrixWorld.elements, p = camera.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) if (v[i] !== lastView[i] || p[i] !== lastProj[i]) return true;
    return false;
  };

  const setTyped = (n) => {
    typedN = n;
    const a = L1.chars.length;
    const n1 = Math.min(n, a), n2 = Math.max(0, n - a);
    L1.typed.textContent = L1.chars.slice(0, n1).join('');
    L1.rest.textContent = L1.chars.slice(n1).join('');
    L2.typed.textContent = L2.chars.slice(0, n2).join('');
    L2.rest.textContent = L2.chars.slice(n2).join('');
    const total = a + L2.chars.length;
    // caret on the line being typed, none once done
    L1.caret.hidden = !(n < a);
    L2.caret.hidden = !(n >= a && n < total);
  };
  const stopTyping = () => { if (typer) { clearInterval(typer); typer = null; } };
  const step = () => {
    const total = L1.chars.length + L2.chars.length;
    setTyped(Math.min(total, typedN + 1));
    if (typedN >= total) stopTyping();
  };

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const hideBox = () => {
    stopTyping();
    if (!visible) return;
    visible = false;
    hiddenAt = performance.now();
    el.classList.remove('on');
    el.setAttribute('aria-hidden', 'true');
  };
  const schedule = (ms) => { clearTimer(); timer = setTimeout(show, ms); };

  function show() {
    timer = null;
    const z = held ?? zone;
    if (!z || (!held && (down || z.id === dismissed)) || blocked(z.id)) return;
    const r = rectFor(z.id);
    if (!r) return;
    const { t, s } = z.hint;
    L1.chars = Array.from(t);
    L2.chars = Array.from(s);
    L2.root.hidden = !s;
    setTyped(0); // full text laid out (invisible): final size right away
    const w = el.offsetWidth, h = el.offsetHeight; // one layout read per hint
    const p = place(r, w, h, obstacles(z.id) ?? []);
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    el.dataset.side = p.side;
    visible = true;
    el.classList.add('on');
    el.setAttribute('aria-hidden', 'false');
    if (reducedMotion) setTyped(L1.chars.length + L2.chars.length);
    else { stopTyping(); typer = setInterval(step, TYPE_MS); }
    for (const fn of listeners) fn(z.id);
  }

  // Safe areas of a phone (notch, home indicator): read from a probe element
  // whose padding is env(safe-area-inset-*) (all 0 on a PC).
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(probe);
  const insets = () => { const c = getComputedStyle(probe); return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 }; };

  // Best side next to the zone box r (client px) for a w x h hint.
  function place(r, w, h, obs) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sa = insets();
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const guard = { left: r.left - GAP / 2, top: r.top - GAP / 2, right: r.right + GAP / 2, bottom: r.bottom + GAP / 2 };
    const sides = [
      ['top', cx - w / 2, r.top - GAP - h],
      ['bottom', cx - w / 2, r.bottom + GAP],
      ['right', r.right + GAP, cy - h / 2],
      ['left', r.left - GAP - w, cy - h / 2],
    ];
    let best = null;
    sides.forEach(([side, x0, y0], i) => {
      const x = Math.round(clamp(x0, MARGIN + sa.l, vw - MARGIN - sa.r - w));
      const y = Math.round(clamp(y0, MARGIN + sa.t, vh - MARGIN - sa.b - h));
      const b = { left: x, top: y, right: x + w, bottom: y + h };
      let score = overlap(b, guard) * 1000 + i; // over the zone: (almost) never
      for (const o of obs) if (o) score += overlap(b, o) * 10 * (o.weight ?? 1); // over a CDJ screen / a key: avoided
      if (!best || score < best.score) best = { side, x, y, score };
    });
    return best;
  }

  // --- input that silences the hint ---
  const onDown = () => {
    down = true;
    if (zone) dismissed = zone.id;
    clearTimer();
    hideBox();
  };
  const onUp = () => { down = false; };
  const onWheel = () => { if (zone) dismissed = zone.id; clearTimer(); hideBox(); };
  const onBlur = () => { down = false; clearTimer(); hideBox(); };
  const onVisibility = () => { if (document.hidden) onBlur(); };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  dom.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    el,
    hover(info) {
      const id = info?.id ?? null;
      if (id === (zone?.id ?? null) && (zone || !id)) return;
      if (dismissed && id !== dismissed) dismissed = null;
      const hint = id ? hintFor(id) : null;
      const warm = visible || performance.now() - hiddenAt < WARM_MS;
      clearTimer();
      hideBox();
      zone = hint && (hint.t || hint.s) ? { id, hint } : null;
      if (!zone) return;
      snapCamera();
      if (!down && id !== dismissed && !blocked(id)) schedule(warm ? WARM_DELAY : DELAY);
    },
    update() {
      if (held) { if (cameraMoved()) { snapCamera(); this.release(); } return; }
      if (!zone || !cameraMoved()) return;
      snapCamera();
      hideBox();
      schedule(SETTLE); // shown again once the camera rests (if still allowed)
    },
    hide() { clearTimer(); hideBox(); held = null; clearTimeout(holdTimer); },
    press(info) {
      clearTimeout(holdTimer);
      held = null;
      longShown = null;
      if (info?.pointerType !== 'touch') return;
      const hint = hintFor(info.id, { touch: true });
      if (!hint || !(hint.t || hint.s) || blocked(info.id)) return;
      holdTimer = setTimeout(() => {
        held = { id: info.id, hint };
        snapCamera();
        show();
        if (visible) longShown = { id: info.id, t: 0 };
      }, TOUCH.longPressMs);
    },
    release() {
      clearTimeout(holdTimer);
      if (!held) return;
      held = null;
      if (longShown) longShown.t = performance.now();
      hideBox();
    },
    takeLongPress(id) {
      const l = longShown;
      if (!l || l.id !== id || (l.t && performance.now() - l.t > 1000)) return false;
      longShown = null;
      return true;
    },
    onShow(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get visible() { return visible; },
    get zone() { return zone?.id ?? null; },
    dispose() {
      clearTimer(); stopTyping();
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      el.remove();
      probe.remove();
    },
  };
}

const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));
function overlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}
