// CRÉDITS page: end credits rolling from bottom to top, like a film, on the
// CRÉDITS screen of the mixer (its Beat FX display, 1024 x 816 canvas). Shown
// while that screen is focused (a click on it zooms the camera in; its 3D ÉCHAP
// key or Escape zooms back out and the screen returns to the `standby` page:
// src/screens/index.js). Content: src/data/credits.js (every line from
// CREDITS.md / README.md). Works on any canvas height (api.height).
//
// CONTRACT (keep the work inside this file + src/data/credits.js):
//   - reads: CREDITS (src/data/credits.js); writes no store state (the roll's
//     running state is local to this file, reset each time the page is shown)
//   - touch: drag = scroll by hand (the roll pauses under the finger, resumes
//     0.6 s after), wheel / arrows = scroll, tap at the end = replay, title bar
//     key REJOUER = replay at any time.
//   - shared helpers: ../design.js
//
// Motion (a deliberate exception to "nothing moves by itself"):
//   - the roll only runs while this page is on the FOCUSED screen (camera
//     settled); during the flight in it shows the opening card, still;
//   - position = f(time) (base + elapsed x SPEED), never a per-frame increment:
//     a late frame lands at the right place;
//   - it stops on the closing card (no loop): frameRate 0, nothing is redrawn;
//   - the whole text is pre-rendered once into an off-screen canvas; a frame is
//     one drawImage of the visible slice (sub-pixel, smooth) + the title bar;
//   - prefers-reduced-motion: no automatic roll, scroll by hand only.
import { registerPage } from '../registry.js';
import { CREDITS } from '../../data/credits.js';
import { C, L, SCREEN_W, FONT, font, rect, fill, text, titleBar, scrollAmount } from '../design.js';
import { DEVICE } from '../../utils/device.js';

const SPEED = 50; // px per second (canvas px)
const START_DELAY = 1400; // ms on the opening card before it rolls
const RESUME_DELAY = 600; // ms after a manual scroll before it rolls again
const BODY_Y = L.titleH + 2; // below the title bar and its progress line
const viewH = (api) => api.height - BODY_Y; // height of the rolling area
const CX = SCREEN_W / 2; // the roll is laid out for a 1024 px wide canvas (CDJ and mixer screens)
const MAX_W = SCREEN_W - 120; // widest line
const FADE_TOP = 56, FADE_BOTTOM = 84; // soft black edges of the roll (px)

const reducedMotion = () => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; }
};

// --- layout: a list of draw ops in content px (y down from 0), built once ---
const STYLE = {
  kicker: { size: 15, weight: 600, color: C.textDim, letterSpacing: 8 },
  title: { size: 72, weight: 200, color: C.text, letterSpacing: 2 },
  section: { size: 14, weight: 600, color: C.highlight, letterSpacing: 6 },
  note: { size: 15, weight: 400, color: '#8a8a8a', letterSpacing: 0.3 },
  role: { size: 13, weight: 500, color: C.textDim, letterSpacing: 3 },
  name: { size: 44, weight: 300, color: C.text, letterSpacing: 1 },
  nameCompact: { size: 28, weight: 300, color: C.text, letterSpacing: 0.6 },
  line: { size: 15, weight: 400, color: '#8a8a8a', letterSpacing: 0.3 },
  list: { size: 19, weight: 400, color: C.textSoft, letterSpacing: 0.3 },
  license: { size: 13, weight: 400, color: '#7c7c7c', letterSpacing: 0.4 },
  closing: { size: 30, weight: 300, color: C.text, letterSpacing: 14 },
  legal: { size: 14, weight: 400, color: '#8a8a8a', letterSpacing: 0.3 },
};

let measureCtx = null;
// Font size that fits `str` in maxW (shrinks long lines only).
function fitted(str, st, maxW = MAX_W) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  let size = st.size;
  for (let i = 0; i < 20; i++) {
    measureCtx.font = font(size, st.weight, FONT.family);
    measureCtx.letterSpacing = `${st.letterSpacing}px`;
    if (measureCtx.measureText(str).width <= maxW) break;
    size *= 0.95;
  }
  return { ...st, size };
}

function layout(data) {
  const ops = [];
  let y = 0;
  const line = (str, st, x = CX, maxW = MAX_W) => {
    const s = fitted(str, st, maxW);
    ops.push({ type: 'text', str, x, y, st: s });
    return s.size;
  };
  const upper = (s) => String(s).toLocaleUpperCase('fr-FR');

  // opening card
  const o = data.opening ?? {};
  const openTop = y;
  if (o.kicker) { line(upper(o.kicker), STYLE.kicker); y += 15 + 26; }
  if (o.title) { line(o.title, STYLE.title); y += 72 + 22; }
  ops.push({ type: 'rule', x: CX - 24, y, w: 48, h: 2, color: C.highlight });
  y += 2;
  const opening = (openTop + y) / 2;

  for (const sec of data.sections ?? []) {
    y += 128;
    // section card: spaced capitals between two hairlines
    const s = fitted(upper(sec.title), STYLE.section);
    measureCtx.font = font(s.size, s.weight, FONT.family);
    measureCtx.letterSpacing = `${s.letterSpacing}px`;
    const half = measureCtx.measureText(upper(sec.title)).width / 2;
    ops.push({ type: 'text', str: upper(sec.title), x: CX, y, st: s });
    ops.push({ type: 'rule', x: CX - half - 64, y: y + s.size / 2, w: 40, h: 1, color: '#3a3a3a' });
    ops.push({ type: 'rule', x: CX + half + 24, y: y + s.size / 2, w: 40, h: 1, color: '#3a3a3a' });
    y += s.size + 22;
    if (sec.note) { line(sec.note, STYLE.note); y += 15 + 12; }
    y += 26;
    sec.entries.forEach((e, i) => {
      if (i) y += sec.compact ? 30 : 50;
      if (e.role) { line(upper(e.role), STYLE.role); y += 13 + 12; }
      const nameSt = sec.compact ? STYLE.nameCompact : STYLE.name;
      if (e.names) { const sz = line(e.names.join('   ·   '), nameSt); y += sz * 1.22; }
      else if (e.name) { const sz = line(e.name, nameSt); y += sz * 1.22; }
      for (const l of e.lines ?? []) { y += 4; line(l, STYLE.line); y += 15 + 6; }
      if (e.list?.length) {
        y += 22;
        const cols = 3, colW = 240;
        e.list.forEach((t, k) => {
          const c = k % cols, r = Math.floor(k / cols);
          const n = Math.min(cols, e.list.length - r * cols); // items on this row, centred
          ops.push({ type: 'text', str: t, x: CX + (c - (n - 1) / 2) * colW, y: y + r * 34, st: fitted(t, STYLE.list, colW - 16) });
        });
        y += Math.ceil(e.list.length / cols) * 34 - 6;
      }
      if (e.license) { y += 16; line(e.license, STYLE.license); y += 13; }
    });
  }

  // closing card: the roll stops with it centred
  y += 260; // alone on screen when the roll stops
  const c = data.closing ?? {};
  const closeTop = y;
  if (c.title) { line(upper(c.title), STYLE.closing); y += 30 + 26; }
  for (const l of c.lines ?? []) { line(l, STYLE.legal); y += 14 + 9; }
  const closing = (closeTop + y) / 2;
  return { ops, height: Math.ceil(y + 4), opening, closing };
}

// Pre-rendered roll (built once). Scroll positions (content y at the top of the
// view) depend on the height of the view: span(r, h).
let roll = null;
function getRoll() {
  if (roll) return roll;
  const lay = layout(CREDITS);
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W; canvas.height = Math.max(1, lay.height);
  const g = canvas.getContext('2d');
  for (const op of lay.ops) {
    if (op.type === 'rule') { fill(g, rect(op.x, op.y, op.w, op.h), op.color); continue; }
    // centred text: the trailing letter spacing is not part of the visible line
    text(g, op.str, op.x + op.st.letterSpacing / 2, op.y, { ...op.st, align: 'center', baseline: 'top' });
  }
  roll = { canvas, height: lay.height, opening: lay.opening, closing: Math.max(lay.opening, lay.closing) };
  return roll;
}
// first / last scroll position for a view of height h: opening / closing card centred
const span = (h) => { const r = getRoll(); return { start: r.opening - h / 2, end: r.closing - h / 2 }; };

// --- running state, per screen (reset each time the page is shown) ---
const anim = new Map(); // unit -> { base, t0, delay, holding, done, start, end }
const fresh = (h) => { const { start, end } = span(h); return { base: start, t0: null, delay: START_DELAY, holding: false, done: false, start, end }; };
const clampPos = (s, p) => Math.max(s.start, Math.min(s.end, p));
function position(s, now) {
  if (s.holding || s.t0 == null || reducedMotion()) return s.base;
  return Math.min(s.end, s.base + (Math.max(0, now - s.t0 - s.delay) * SPEED) / 1000);
}
function stateOf(api) {
  let s = anim.get(api.unit);
  if (!s) { s = fresh(viewH(api)); anim.set(api.unit, s); }
  return s;
}
function replay(api) {
  const s = stateOf(api);
  Object.assign(s, fresh(viewH(api)), { t0: api.focused ? performance.now() : null, delay: 700 });
  api.invalidate();
}
// After a manual move: resume from there a little later.
function settle(s, now) {
  s.t0 = now; s.delay = RESUME_DELAY;
  s.done = s.base >= s.end - 0.5;
}

// Visible slice of the roll at scroll position p (content y at the top of the view).
function blit(ctx, r, p, w, h) {
  const y0 = Math.max(0, p), y1 = Math.min(r.height, p + h);
  if (y1 <= y0) return;
  ctx.drawImage(r.canvas, 0, y0, r.canvas.width, y1 - y0, 0, BODY_Y + (y0 - p), w, y1 - y0);
}

registerPage('credits', {
  static: true,
  frameRate(state, api) {
    const s = anim.get(api.unit);
    return s && api.focused && !s.done && !s.holding && !reducedMotion() ? 60 : 0;
  },
  // dev / checks: { p, start, end, done, holding } of a screen, or null (not shown)
  progress(unit, now = performance.now()) {
    const s = anim.get(unit);
    return s ? { p: position(s, now), start: s.start, end: s.end, done: s.done, holding: s.holding } : null;
  },
  onShow(api) { anim.set(api.unit, fresh(viewH(api))); },
  onHide(api) { anim.delete(api.unit); },
  onReselect(api) { replay(api); },

  draw(ctx, state, api) {
    const r = getRoll();
    const s = stateOf(api);
    const now = api.now;
    const W = api.width, H = api.height;
    if (api.focused && s.t0 == null && !s.holding) s.t0 = now; // the roll starts once the camera has settled
    const p = position(s, now);
    s.done = p >= s.end - 0.5;

    blit(ctx, r, p, W, viewH(api));
    // soft black edges, top and bottom of the roll
    let g = ctx.createLinearGradient(0, BODY_Y, 0, BODY_Y + FADE_TOP);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, BODY_Y, W, FADE_TOP);
    g = ctx.createLinearGradient(0, H - FADE_BOTTOM, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g; ctx.fillRect(0, H - FADE_BOTTOM, W, FADE_BOTTOM);

    // title bar (same as the other pages) + REJOUER, lit at the end
    const bar = titleBar(ctx, { title: 'CRÉDITS', icon: 'info', buttons: [{ id: 'replay', label: 'REJOUER', active: s.done, w: 120 }] });
    api.region({ id: 'replay', ...bar.buttons.replay, onTap: () => replay(api) });
    // progress of the roll: hairline under the title bar
    fill(ctx, rect(0, L.titleH, W, 2), '#141414');
    const k = s.end > s.start ? (p - s.start) / (s.end - s.start) : 1;
    fill(ctx, rect(0, L.titleH, Math.round(W * Math.min(1, Math.max(0, k)) * 10) / 10, 2), C.highlightDeep);
    if (reducedMotion() && !s.done && p <= s.start + 1) {
      text(ctx, DEVICE.touchFirst ? 'Faites glisser pour faire défiler' : 'Faites glisser ou utilisez la molette', W / 2, H - 26, { size: 13, align: 'center', color: C.textMute, letterSpacing: 1 });
    }
  },

  onPointer(e, api) {
    const s = anim.get(api.unit);
    if (!s) return;
    const now = performance.now();
    switch (e.type) {
      case 'pointerdown':
        s.base = position(s, now); s.holding = true; api.invalidate();
        break;
      case 'pointermove':
        if (!s.holding || !e.dragging) return;
        s.base = clampPos(s, s.base - e.dy); // finger up = text up
        api.invalidate();
        break;
      case 'pointerup': case 'pointercancel':
        if (!s.holding) return;
        s.holding = false; settle(s, now); api.invalidate();
        break;
      case 'tap':
        if (e.region === 'replay') return; // its own zone
        if (s.done) replay(api); // touch the screen again at the end: from the top
        break;
      case 'scroll':
        s.base = clampPos(s, position(s, now) + scrollAmount(e, 40, viewH(api)));
        settle(s, now); api.invalidate();
        break;
      default: break;
    }
  },
});
