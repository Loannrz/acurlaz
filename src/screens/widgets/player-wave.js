// Waveform rendering + audio timing of the PLAYER page (src/screens/pages/player.js).
//
//   drawEnlarged(ctx, wf, { x, y, w, h, playheadX, pos, pps, mode })
//       scrolling (enlarged) waveform centred on playheadX = time pos (s),
//       pps = px per second. Columns are rendered once into cached tiles
//       (TILE_W px wide, per waveform / zoom / height / colour mode) and blitted
//       at a sub-pixel offset each frame: a frame costs 2-3 drawImage calls.
//   drawOverview(ctx, wf, r, mode)   whole track in r (cached canvas per size / mode)
//   heardPosition(deck)              position (s) of the sample HEARD when this frame
//       reaches the screen: deck.position minus the output latency
//       (AudioContext.getOutputTimestamp, interpolated with performance.now()),
//       plus one display refresh. Stopped deck: deck.position exactly.
//   WAVE_MODES = ['blue', 'rgb', '3band']   (WAVEFORM COLOR of the CDJ-3000)
import { engine } from '../../audio/engine.js';

export const WAVE_MODES = ['blue', 'rgb', '3band'];
export const TILE_W = 512;
const MAX_TILES = 16; // all waveforms together (LRU, ~5 MB at 160 px high)
const MAX_OVERVIEWS = 6;

// --- timing -----------------------------------------------------------------

// The frame drawn now reaches the screen about one refresh later.
const DISPLAY_LEAD = 1 / 60;
export function heardPosition(deck) {
  const pos = deck.position;
  if (!deck.moving) return pos;
  const ctx = engine.context;
  let lag = 0;
  if (ctx && ctx.state === 'running' && typeof ctx.getOutputTimestamp === 'function') {
    const ts = ctx.getOutputTimestamp();
    if (ts?.contextTime > 0 && ts.performanceTime > 0) {
      const heard = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      const l = ctx.currentTime - heard;
      if (l > -0.05 && l < 0.5) lag = l; // else bogus timestamp: no correction
    }
  }
  return Math.max(0, Math.min(deck.duration, pos - lag + DISPLAY_LEAD));
}

// --- colours ----------------------------------------------------------------

// "Blue" waveform: tone 0 (bass) -> navy / saturated blue ... 1 (highs) -> almost white.
const BLUE_STOPS = [
  [0.0, [10, 48, 150]],
  [0.4, [16, 100, 240]],
  [0.65, [40, 150, 255]],
  [0.85, [135, 202, 255]],
  [1.0, [226, 241, 255]],
];
const lerpStops = (stops, t) => {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    if (t <= t1) {
      const [t0, c0] = stops[i - 1];
      const k = (t - t0) / (t1 - t0 || 1);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
  }
  return stops[stops.length - 1][1];
};
const BLUE = Array.from({ length: 64 }, (_, i) => { const [r, g, b] = lerpStops(BLUE_STOPS, i / 63); return `rgb(${r},${g},${b})`; });
const blue = (t) => BLUE[Math.max(0, Math.min(63, Math.round(t * 63)))];

// The bands of src/audio/waveform.js share one normalisation (the highs, made of
// sharp transients, look as big as the bass). For colours, each band is
// rescaled by its own high percentile: values below are 0..1 per band.
const bandScales = new WeakMap();
function scalesOf(wf) {
  let s = bandScales.get(wf);
  if (!s) {
    const pct = (a) => { const c = Uint8Array.from(a).sort(); return Math.max(8, c[Math.floor(c.length * 0.98)] || 255); };
    const pr = (a) => { const c = Uint8Array.from(a).sort(); return Math.max(8, c[Math.floor(c.length * 0.995)] || 255); };
    s = { low: 1 / pct(wf.low), mid: 1 / pct(wf.mid), high: 1 / pct(wf.high), rms: 1 / pr(wf.rms) };
    bandScales.set(wf, s);
  }
  return s;
}
// share of highs in a column (0 = bass only, 1 = highs only), spread over 0..1
const toneOf = (l, m, h) => Math.max(0, Math.min(1, ((h + 0.35 * m) / (l + 0.35 * m + h + 0.02) - 0.26) / 0.66));

const BAND3 = { low: '#1b4cf0', mid: '#e0901c', high: '#f4f4f4' };

// One column, mirrored around cy (half height hh). p, r: full band peak / rms
// (0..255, normalised on the track), l, m, h: bands rescaled 0..1 (scalesOf).
// Height: loudness (RMS over the column, rescaled 0..1) with a slight
// expansion, so loud mastered tracks still show their transients as spikes.
function column(g, x, cy, hh, mode, p, r, l, m, h) {
  if (p < 1) return;
  const a = Math.max(1, Math.min(hh, r ** 1.35 * hh));
  if (mode === '3band') {
    const L = Math.max(1, Math.min(hh, l * hh * 0.95)), M = Math.min(hh, m * hh * 0.62), H = Math.min(hh, h * hh * 0.3);
    g.fillStyle = BAND3.low; g.fillRect(x, cy - L, 1, 2 * L);
    if (M >= 0.5) { g.fillStyle = BAND3.mid; g.fillRect(x, cy - M, 1, 2 * M); }
    if (H >= 0.5) { g.fillStyle = BAND3.high; g.fillRect(x, cy - H, 1, 2 * H); }
    return;
  }
  if (mode === 'rgb') {
    const mx = Math.max(l, m, h, 1e-3);
    g.fillStyle = `rgb(${Math.round((l / mx) * 255)},${Math.round((m / mx) * 235)},${Math.round((h / mx) * 255)})`;
    g.fillRect(x, cy - a, 1, 2 * a);
    return;
  }
  const t = toneOf(l, m, h);
  g.fillStyle = blue(t);
  g.fillRect(x, cy - a, 1, 2 * a);
  // brighter core (body of the sound), like the layered Pioneer waveform
  const b = Math.min(a, r ** 2.4 * hh);
  if (b >= 1) { g.fillStyle = blue(Math.min(1, t + 0.08)); g.fillRect(x, cy - b, 1, 2 * b); }
}

// --- tiles of the enlarged waveform ------------------------------------------

// One global LRU for every waveform: src/audio/waveform.js keeps every analysed
// track alive, so a per-track cache would only grow.
const tiles = new Map(); // key -> canvas, insertion order = LRU
const ids = new WeakMap(); // wf -> numeric id
let nextId = 1;
const idOf = (wf) => { let i = ids.get(wf); if (!i) { i = nextId++; ids.set(wf, i); } return i; };
function lru(map, key, max, build) {
  let c = map.get(key);
  if (c) { map.delete(key); map.set(key, c); return c; }
  c = build();
  map.set(key, c);
  while (map.size > max) map.delete(map.keys().next().value);
  return c;
}

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function buildTile(wf, pps, h, mode, idx) {
  const c = newCanvas(TILE_W, h);
  const g = c.getContext('2d');
  const cy = h / 2, hh = h / 2;
  const { peak, rms, low, mid, high, rate } = wf;
  const n = wf.length;
  const per = rate / pps; // bins per px
  const k = scalesOf(wf);
  for (let x = 0; x < TILE_W; x++) {
    const X = idx * TILE_W + x;
    const a = Math.floor(X * per);
    const b = Math.max(a + 1, Math.floor((X + 1) * per));
    if (a >= n) break;
    if (b <= 0) continue;
    let p = 0, r = 0, lo = 0, md = 0, hi = 0;
    for (let i = Math.max(0, a); i < b && i < n; i++) {
      if (peak[i] > p) p = peak[i];
      if (rms[i] > r) r = rms[i];
      if (low[i] > lo) lo = low[i];
      if (mid[i] > md) md = mid[i];
      if (high[i] > hi) hi = high[i];
    }
    column(g, x, cy, hh, mode, p, Math.min(1, r * k.rms), lo * k.low, md * k.mid, hi * k.high);
  }
  return c;
}

const tile = (wf, pps, h, mode, idx) => lru(tiles, `${idOf(wf)}|${mode}|${pps}|${h}|${idx}`, MAX_TILES, () => buildTile(wf, pps, h, mode, idx));

export function drawEnlarged(ctx, wf, { x, y, w, h, playheadX, pos, pps, mode = 'blue' }) {
  if (!wf) return;
  h = Math.round(h);
  const X0 = pos * pps - (playheadX - x); // world px at the left edge
  const endX = wf.duration * pps;
  const i0 = Math.max(0, Math.floor(X0 / TILE_W));
  const i1 = Math.floor(Math.min(X0 + w, endX) / TILE_W);
  if (i1 < i0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  for (let i = i0; i <= i1; i++) ctx.drawImage(tile(wf, pps, h, mode, i), x + (i * TILE_W - X0), y);
  ctx.restore();
}

// --- overall waveform -----------------------------------------------------------

const overviews = new Map(); // key -> canvas (global LRU)

export function drawOverview(ctx, wf, r, mode = 'blue') {
  if (!wf) return;
  const w = Math.round(r.w), h = Math.round(r.h);
  const c = lru(overviews, `${idOf(wf)}|${mode}|${w}|${h}`, MAX_OVERVIEWS, () => {
    const c = newCanvas(w, h);
    const g = c.getContext('2d');
    const o = wf.overview(w);
    const k = scalesOf(wf);
    for (let x = 0; x < w; x++) {
      const rr = Math.min(1, o.rms[x] * k.rms);
      const l = o.low[x] * k.low, md = o.mid[x] * k.mid, hi = o.high[x] * k.high;
      const a = Math.max(1, Math.min(h, rr ** 1.2 * h));
      if (mode === '3band') {
        const L = Math.min(h, l * h * 0.95), M = Math.min(h, md * h * 0.62), H = Math.min(h, hi * h * 0.3);
        g.fillStyle = BAND3.low; g.fillRect(x, h - L, 1, L);
        g.fillStyle = BAND3.mid; g.fillRect(x, h - M, 1, M);
        g.fillStyle = BAND3.high; g.fillRect(x, h - H, 1, H);
        continue;
      }
      if (mode === 'rgb') {
        const mx = Math.max(l, md, hi, 1e-3);
        g.fillStyle = `rgb(${Math.round((l / mx) * 255)},${Math.round((md / mx) * 235)},${Math.round((hi / mx) * 255)})`;
        g.fillRect(x, h - a, 1, a);
        continue;
      }
      // overview of the CDJ: loud parts mid blue, quiet / bright parts pale blue
      const t = toneOf(l, md, hi);
      g.fillStyle = blue(0.14 + t * 0.5);
      g.fillRect(x, h - a, 1, a);
      const b = Math.min(a, rr ** 2.2 * h);
      if (b >= 1) { g.fillStyle = blue(0.55 + t * 0.4); g.fillRect(x, h - b, 1, b); }
    }
    return c;
  });
  ctx.drawImage(c, r.x, r.y);
}
