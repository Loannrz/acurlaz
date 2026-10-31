// Design tokens + canvas drawing helpers for the CDJ-3000 touch display,
// measured on the manual screenshots (docs/reference/cdj3000-manual-p18 /
// p19 / p21: colours sampled on the images, sizes scaled from the 777 x 439 px
// screen of the manual to the 1024 x 597 px canvas, i.e. x 1.318, y 1.36).
// Shared by every page: change a token here, every page follows. Pages may add
// their own local constants, but colours / fonts should come from here.
//
//   import { C, FONT, SIZE, L, font, text, ellipsize, ... } from '../design.js';
// Every helper takes the 2D context first, coordinates in canvas px, and
// leaves the context state as it found it (fill / font / alignment are set
// each time). Helpers that draw something touchable return its rectangle(s)
// { x, y, w, h } so the page can register a touch zone with api.region().

// --- canvas ---
export const SCREEN_W = 1024;
export const SCREEN_H = 597;

// --- colours (sampled on the manual) ---
export const C = {
  bg: '#000000',
  panel: '#232323', // list / info panel background (SOURCE screen)
  titleBar: '#191919', // top bar
  side: '#3c3c3c', // category column (BROWSE), column header row
  sideSelected: '#64646e',
  header: '#3c3c3c',
  headerText: '#b4b4b4',
  rowA: '#282828', // track list rows alternate A / B
  rowB: '#000000',
  rowSep: '#1a1a1a',
  text: '#ffffff',
  textSoft: '#dedede',
  textDim: '#999999',
  textMute: '#626262',
  highlight: '#007de1', // highlighted row (cursor)
  highlightDeep: '#0064a5', // active toggle button (PREVIEW)
  playing: '#00e42d', // loaded / playing track text, "Loaded"
  green: '#0bec0c', // selected category text
  orange: '#ff7323', // BPM / MASTER
  orangeRed: '#ff4619', // tempo range badge
  red: '#ff0000', // playhead, cue markers
  mtOff: '#3b1006',
  button: '#323232', // BEAT LOOP / KEY SHIFT / BEAT JUMP
  buttonBorder: '#3c3c3c',
  buttonText: '#dedede',
  // device icon backgrounds (USB, LINK, SD in the manual)
  device: ['#0f325f', '#874600', '#007300', '#4b1f6b'],
  // waveforms
  wfBlue: '#049efb', // enlarged waveform, bright
  wfDeep: '#075edc', // enlarged waveform, body
  wfLow: '#0b3f9c',
  wfOverview: '#1869a5', // overall waveform (not yet played)
  wfOverviewPlayed: '#0d3b5e', // overall waveform (played part)
  wfOverviewLight: '#5aa9df',
  phaseOrange: '#ff7300',
  phaseBlue: '#007dff',
  tick: '#6e6e6e',
  hotCue: { A: '#e8202e', B: '#00a0e9', C: '#33e000', D: '#8a2be2', E: '#2ecc40', F: '#ff8c00', G: '#1e50ff', H: '#e6d300' },
};

// --- typography ---
// The CDJ uses a plain grotesque sans; the closest system faces (no download).
export const FONT = {
  family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  numeric: '"Helvetica Neue", Helvetica, Arial, sans-serif', // tabular digits in Helvetica Neue
};
export const SIZE = {
  title: 20, // top bar title ("SOURCE", folder name)
  row: 21, // SOURCE list rows
  rowSmall: 17, // BROWSE track rows
  header: 12, // column headers, small labels (REMAIN, PLAYER...)
  label: 12, // info panel labels
  value: 17, // info panel values
  tiny: 10,
  body: 19, // paragraphs (custom pages)
};
export const font = (size, weight = 400, family = FONT.family) => `${weight} ${Math.round(size)}px ${family}`;

// --- layout (canvas px) ---
export const L = {
  titleH: 72, // top bar
  statusH: 68, // bottom playback status bar (SOURCE / BROWSE)
  get bodyY() { return this.titleH; },
  get bodyH() { return SCREEN_H - this.titleH - this.statusH; }, // 457
  sideW: 70, // device / category column
  gap: 4, // black gap between columns
  pad: 14, // inner padding
  rowH: 40, // BROWSE row
  colHeaderH: 35, // BROWSE column header row
  sourceRowH: 76, // SOURCE row
  infoW: 274, // SOURCE info panel
  titleButtonW: 92, // PREVIEW / font size / INFO / BEAT LOOP...
};
// Columns of the BROWSE track list, as fractions of the list width (manual p19).
export const TRACK_COLUMNS = [
  { key: 'preview', label: 'PREVIEW', f: 0.255 },
  { key: 'number', label: '#', f: 0.072, align: 'left' },
  { key: 'title', label: 'TRACK', f: 0.27 },
  { key: 'artist', label: 'ARTIST', f: 0.255 },
  { key: 'bpm', label: 'BPM', f: 0.085, align: 'right' },
  { key: 'key', label: 'KEY', f: 0.063 },
];

// Pages that show the status bar (REMAIN time, playhead) refresh it at this
// rate while their deck plays, and not at all otherwise. The player page
// redraws at 60 fps while playing (scrolling waveform).
export const STATUS_BAR_FPS = 10;
export const statusBarFps = (state) => (state.deck.playing || state.deck.cueing ? STATUS_BAR_FPS : 0);

// --- basic helpers ---
export const rect = (x, y, w, h) => ({ x, y, w, h });
export const inset = (r, dx, dy = dx) => ({ x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy });

export function fill(ctx, r, color) {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

// Text truncated with an ellipsis to fit maxWidth (current ctx font).
const ellipsisCache = new Map();
export function ellipsize(ctx, str, maxWidth) {
  str = String(str ?? '');
  if (!(maxWidth > 0)) return '';
  const key = `${ctx.font}|${maxWidth | 0}|${str}`;
  const hit = ellipsisCache.get(key);
  if (hit !== undefined) return hit;
  let out = str;
  if (ctx.measureText(str).width > maxWidth) {
    let lo = 0, hi = str.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(`${str.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    out = lo > 0 ? `${str.slice(0, lo).trimEnd()}…` : '';
  }
  if (ellipsisCache.size > 2000) ellipsisCache.clear();
  ellipsisCache.set(key, out);
  return out;
}

// One line of text. opts: size, weight, color, align ('left'|'center'|'right'),
// baseline (default 'middle'), maxWidth (ellipsis), family, letterSpacing (px).
// Returns the drawn width.
export function text(ctx, str, x, y, opts = {}) {
  const { size = SIZE.rowSmall, weight = 400, color = C.text, align = 'left', baseline = 'middle', maxWidth, family = FONT.family, letterSpacing = 0 } = opts;
  ctx.font = font(size, weight, family);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${letterSpacing}px`;
  const s = maxWidth ? ellipsize(ctx, str, maxWidth) : String(str ?? '');
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.letterSpacing = '0px';
  return w;
}

// Paragraph wrapped to maxWidth; returns the y after the last line.
// opts: same as text() + lineHeight (px), maxLines (last line gets an ellipsis).
export function paragraph(ctx, str, x, y, maxWidth, opts = {}) {
  const { size = SIZE.body, lineHeight = Math.round(size * 1.4), maxLines = Infinity } = opts;
  ctx.font = font(size, opts.weight ?? 400, opts.family ?? FONT.family);
  const words = String(str ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) shown[shown.length - 1] += ` ${lines[maxLines]}`; // ellipsis below
  shown.forEach((l, i) => text(ctx, l, x, y + i * lineHeight, { ...opts, size, baseline: 'top', maxWidth: i === shown.length - 1 && lines.length > maxLines ? maxWidth : undefined }));
  return y + shown.length * lineHeight;
}

// mm:ss (or mm:ss.mmm with ms = true). Negative / unknown -> '--:--'.
export function formatTime(sec, ms = false) {
  if (!Number.isFinite(sec) || sec < 0) return ms ? '--:--.---' : '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return ms ? `${base}.${String(Math.floor((sec % 1) * 1000)).padStart(3, '0')}` : base;
}
export const formatBpm = (bpm) => (Number.isFinite(bpm) && bpm > 0 ? bpm.toFixed(1) : '--.-');

// --- glyphs (simple vector icons, white by default) ---
export function glyph(ctx, name, cx, cy, size, color = C.text) {
  const s = size / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (name) {
    case 'usb': { // stick seen from the front: body + connector
      ctx.fillRect(cx - s * 0.45, cy - s * 0.15, s * 0.9, s * 1.05);
      ctx.fillRect(cx - s * 0.3, cy - s * 0.75, s * 0.6, s * 0.5);
      ctx.fillStyle = C.bg;
      ctx.fillRect(cx - s * 0.17, cy - s * 0.62, s * 0.12, s * 0.16);
      ctx.fillRect(cx + s * 0.05, cy - s * 0.62, s * 0.12, s * 0.16);
      break;
    }
    case 'sd': {
      ctx.moveTo(cx - s * 0.5, cy - s * 0.8); ctx.lineTo(cx + s * 0.25, cy - s * 0.8); ctx.lineTo(cx + s * 0.5, cy - s * 0.55);
      ctx.lineTo(cx + s * 0.5, cy + s * 0.8); ctx.lineTo(cx - s * 0.5, cy + s * 0.8); ctx.closePath(); ctx.fill();
      break;
    }
    case 'back': { // left arrow
      ctx.moveTo(cx + s * 0.75, cy); ctx.lineTo(cx - s * 0.7, cy);
      ctx.moveTo(cx - s * 0.1, cy - s * 0.6); ctx.lineTo(cx - s * 0.72, cy); ctx.lineTo(cx - s * 0.1, cy + s * 0.6);
      ctx.stroke();
      break;
    }
    case 'chevron': { // >
      ctx.moveTo(cx - s * 0.3, cy - s * 0.6); ctx.lineTo(cx + s * 0.3, cy); ctx.lineTo(cx - s * 0.3, cy + s * 0.6);
      ctx.stroke();
      break;
    }
    case 'list': { // playlist icon: lines with bullets
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(cx - s * 0.75, cy + i * s * 0.5 - s * 0.08, s * 0.18, s * 0.16);
        ctx.fillRect(cx - s * 0.4, cy + i * s * 0.5 - s * 0.06, s * 1.1, s * 0.12);
      }
      break;
    }
    case 'folder': {
      ctx.moveTo(cx - s * 0.8, cy - s * 0.55); ctx.lineTo(cx - s * 0.25, cy - s * 0.55); ctx.lineTo(cx - s * 0.1, cy - s * 0.35);
      ctx.lineTo(cx + s * 0.8, cy - s * 0.35); ctx.lineTo(cx + s * 0.8, cy + s * 0.6); ctx.lineTo(cx - s * 0.8, cy + s * 0.6); ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'note': { // single note
      ctx.ellipse(cx - s * 0.25, cy + s * 0.45, s * 0.3, s * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx + s * 0.02, cy - s * 0.7, s * 0.12, s * 1.15);
      ctx.beginPath(); ctx.moveTo(cx + s * 0.1, cy - s * 0.7); ctx.quadraticCurveTo(cx + s * 0.55, cy - s * 0.45, cx + s * 0.5, cy - s * 0.05); ctx.stroke();
      break;
    }
    case 'play': { // triangle
      ctx.moveTo(cx - s * 0.45, cy - s * 0.6); ctx.lineTo(cx + s * 0.55, cy); ctx.lineTo(cx - s * 0.45, cy + s * 0.6); ctx.closePath(); ctx.fill();
      break;
    }
    case 'calendar': {
      ctx.strokeRect(cx - s * 0.7, cy - s * 0.55, s * 1.4, s * 1.25);
      ctx.fillRect(cx - s * 0.7, cy - s * 0.55, s * 1.4, s * 0.3);
      ctx.fillRect(cx - s * 0.4, cy - s * 0.8, s * 0.12, s * 0.35); ctx.fillRect(cx + s * 0.28, cy - s * 0.8, s * 0.12, s * 0.35);
      break;
    }
    case 'person': {
      ctx.arc(cx, cy - s * 0.35, s * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.55, s * 0.62, s * 0.38, 0, Math.PI, 0); ctx.fill();
      break;
    }
    case 'info': {
      ctx.arc(cx, cy, s * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.bg;
      ctx.fillRect(cx - s * 0.09, cy - s * 0.15, s * 0.18, s * 0.6);
      ctx.fillRect(cx - s * 0.09, cy - s * 0.48, s * 0.18, s * 0.18);
      break;
    }
    default: break;
  }
  ctx.restore();
}

// --- composite helpers ---

// Device icon of the SOURCE / BROWSE / player screens: coloured block, white
// glyph, label under it, player number in a small box at the top left.
// opts: kind ('usb'|'sd'), label ('USB'), color, player (number or null), dim.
export function deviceIcon(ctx, r, opts = {}) {
  const { kind = 'usb', label = 'USB', color = C.device[0], player = null, dim = false } = opts;
  fill(ctx, r, color);
  if (dim) fill(ctx, r, 'rgba(0,0,0,0.45)');
  const g = Math.min(r.w, r.h) * 0.36;
  glyph(ctx, kind, r.x + r.w / 2, r.y + r.h * 0.4, g, C.text);
  text(ctx, label, r.x + r.w / 2, r.y + r.h * 0.8, { size: Math.max(10, r.h * 0.2), align: 'center', color: C.text });
  if (player != null) {
    const b = Math.round(r.h * 0.22);
    fill(ctx, rect(r.x, r.y, b, b), C.text);
    text(ctx, String(player), r.x + b / 2, r.y + b / 2 + 1, { size: b * 0.85, weight: 600, align: 'center', color: C.bg });
  }
}

// Top bar. opts: title, back (draw the back arrow box), icon (glyph name
// before the title), buttons: [{ id, label, active }] right-aligned, x0 (left
// start, default 0). Returns { bar, back, buttons: { [id]: rect } }.
export function titleBar(ctx, opts = {}) {
  const { title = '', back = false, icon = null, buttons = [], x0 = 0 } = opts;
  const bar = rect(x0, 0, SCREEN_W - x0, L.titleH);
  fill(ctx, bar, C.titleBar);
  let x = x0 + L.pad + 8;
  let backRect = null;
  if (back) {
    backRect = rect(x0 + 10, 12, 48, 48);
    fill(ctx, backRect, '#262626');
    glyph(ctx, 'back', backRect.x + 24, backRect.y + 24, 26, C.text);
    x = backRect.x + backRect.w + 14;
  }
  if (icon) { glyph(ctx, icon, x + 10, L.titleH / 2, 20, C.text); x += 30; }
  const rects = {};
  let right = SCREEN_W;
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    const w = b.w ?? L.titleButtonW;
    const br = rect(right - w, 0, w, L.titleH);
    if (b.active) fill(ctx, br, C.highlightDeep);
    text(ctx, b.label, br.x + w / 2, br.y + br.h / 2, { size: SIZE.header + 2, weight: 500, align: 'center', color: b.active ? C.text : C.textSoft, letterSpacing: 0.5 });
    rects[b.id] = br;
    right -= w + 2;
  }
  text(ctx, title, x, L.titleH / 2 + 1, { size: SIZE.title, weight: 400, color: C.text, maxWidth: right - x - 12 });
  return { bar, back: backRect, buttons: rects };
}

// Column of square tiles (devices on SOURCE, categories on BROWSE).
// items: [{ label, icon, color }]; selected: index. Returns the tile rects.
export function sideColumn(ctx, r, items, selected = -1, opts = {}) {
  const { tileH = 56, background = C.side } = opts;
  fill(ctx, r, background);
  return items.map((it, i) => {
    const t = rect(r.x, r.y + i * (tileH + 2), r.w, tileH);
    if (t.y + t.h > r.y + r.h) return t;
    const sel = i === selected;
    if (sel) fill(ctx, t, C.sideSelected);
    if (it.icon) glyph(ctx, it.icon, t.x + t.w / 2, t.y + t.h * 0.38, t.h * 0.34, sel ? C.green : C.textDim);
    text(ctx, it.label, t.x + t.w / 2, t.y + t.h * 0.8, { size: SIZE.tiny, align: 'center', color: sel ? C.green : C.textDim, maxWidth: t.w - 4 });
    fill(ctx, rect(t.x, t.y + t.h, t.w, 2), C.bg);
    return t;
  });
}

// Background of one list row: highlighted (blue), or alternating A / B.
export function rowBackground(ctx, r, index, { highlighted = false, alternate = true, base = C.panel } = {}) {
  if (highlighted) fill(ctx, r, C.highlight);
  else fill(ctx, r, alternate ? (index % 2 ? C.rowB : C.rowA) : base);
}

// Simple list row (SOURCE style): name, optional "Loaded" tag and chevron.
// opts: highlighted, loaded (green text + tag), chevron, size, alternate.
export function listRow(ctx, r, label, opts = {}) {
  const { highlighted = false, loaded = false, chevron = false, size = SIZE.row, alternate = false, index = 0, tag = loaded ? 'Loaded' : null } = opts;
  rowBackground(ctx, r, index, { highlighted, alternate });
  if (!alternate && !highlighted) fill(ctx, rect(r.x, r.y + r.h - 1, r.w, 1), C.rowSep);
  let right = r.x + r.w - L.pad;
  if (chevron) { glyph(ctx, 'chevron', right - 8, r.y + r.h / 2, 20, C.text); right -= 34; }
  if (tag) {
    ctx.font = font(SIZE.header + 3);
    const tw = ctx.measureText(tag).width + 28;
    const tr = rect(right - tw, r.y + r.h * 0.22, tw, r.h * 0.56);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tr.x + 6, tr.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(tr.x, tr.y + tr.h); ctx.lineTo(tr.x + 6, tr.y + tr.h);
    ctx.moveTo(tr.x + tr.w - 6, tr.y); ctx.lineTo(tr.x + tr.w, tr.y); ctx.lineTo(tr.x + tr.w, tr.y + tr.h); ctx.lineTo(tr.x + tr.w - 6, tr.y + tr.h);
    ctx.stroke();
    text(ctx, tag, tr.x + tr.w / 2, tr.y + tr.h / 2 + 1, { size: SIZE.header + 3, align: 'center', color: C.playing });
    right = tr.x - 12;
  }
  text(ctx, label, r.x + L.pad, r.y + r.h / 2 + 1, { size, color: loaded ? C.playing : C.text, maxWidth: right - r.x - L.pad });
}

// Column header row of a track list. columns: [{ label, x, w, align, sort }].
export function columnHeader(ctx, r, columns) {
  fill(ctx, r, C.header);
  for (const col of columns) {
    if (col.x > r.x) fill(ctx, rect(col.x - 1, r.y + 6, 1, r.h - 12), '#505050');
    const tx = col.align === 'right' ? col.x + col.w - 8 : col.x + 8;
    const w = text(ctx, col.label, tx, r.y + r.h / 2 + 1, { size: SIZE.header, align: col.align === 'right' ? 'right' : 'left', color: C.headerText, maxWidth: col.w - 16 });
    if (col.sort) {
      const ax = col.align === 'right' ? tx - w - 12 : tx + w + 10;
      ctx.fillStyle = col.sort === 'active' ? C.highlight : C.headerText;
      ctx.beginPath(); ctx.moveTo(ax - 5, r.y + r.h / 2 + 4); ctx.lineTo(ax + 5, r.y + r.h / 2 + 4); ctx.lineTo(ax, r.y + r.h / 2 - 4); ctx.closePath(); ctx.fill();
    }
  }
}

// Resolves TRACK_COLUMNS (or a custom list) into x / w for a list rectangle.
export function layoutColumns(r, columns = TRACK_COLUMNS) {
  let x = r.x;
  const total = columns.reduce((a, c) => a + c.f, 0);
  return columns.map((c, i) => {
    const w = i === columns.length - 1 ? r.x + r.w - x : Math.round((c.f / total) * r.w);
    const out = { ...c, x, w };
    x += w;
    return out;
  });
}

// Button. opts: active (blue), variant: 'gray' (BEAT LOOP...) | 'outline'
// (MY SETTINGS LOAD) | 'load' (white, LOAD) ; size.
export function button(ctx, r, label, opts = {}) {
  const { active = false, variant = 'gray', size = SIZE.header + 2, lines = null } = opts;
  if (variant === 'outline') {
    fill(ctx, r, '#1c1c1c');
    ctx.strokeStyle = C.buttonBorder; ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  } else if (variant === 'load') {
    fill(ctx, r, C.textSoft);
  } else {
    fill(ctx, r, active ? C.highlightDeep : C.button);
  }
  const color = variant === 'load' ? C.bg : C.buttonText;
  const ls = lines ?? String(label).split('\n');
  const lh = size * 1.15;
  ls.forEach((l, i) => text(ctx, l, r.x + r.w / 2, r.y + r.h / 2 + (i - (ls.length - 1) / 2) * lh + 1, { size, weight: variant === 'load' ? 700 : 500, align: 'center', color, letterSpacing: 0.4, maxWidth: r.w - 8 }));
  return r;
}

// Mini waveform (PREVIEW column, status bar): `data` = Uint8Array (0..255)
// already resampled to ~r.w columns (waveform.overview(n).rms), or null (flat
// dim line: not analysed yet). progress (0..1) tints the played part.
export function miniWaveform(ctx, r, data, opts = {}) {
  const { color = C.wfOverview, played = C.wfOverviewPlayed, progress = -1, mirror = false } = opts;
  if (!data) { fill(ctx, rect(r.x, r.y + r.h / 2 - 0.5, r.w, 1), '#2a3a48'); return; }
  const n = data.length;
  const cw = r.w / n;
  for (let i = 0; i < n; i++) {
    const a = (data[i] / 255) * r.h;
    ctx.fillStyle = i / n < progress ? played : color;
    if (mirror) ctx.fillRect(r.x + i * cw, r.y + (r.h - a) / 2, Math.max(1, cw), Math.max(1, a));
    else ctx.fillRect(r.x + i * cw, r.y + r.h - a, Math.max(1, cw), Math.max(1, a));
  }
}

// Scroll amount (canvas px, + = content moves up) of a 'scroll' event (wheel,
// arrows, PageUp / PageDown) for a list with rows of rowH px and viewH px visible.
export function scrollAmount(e, rowH, viewH) {
  return (e.scrollY || 0) + (e.lines || 0) * rowH + (e.page || 0) * Math.max(rowH, Math.floor(viewH / rowH - 1) * rowH);
}

// Vertical scroll indicator on the right edge of a list.
export function scrollBar(ctx, r, first, visible, total) {
  if (total <= visible) return;
  fill(ctx, r, '#141414');
  const h = Math.max(16, (r.h * visible) / total);
  const y = r.y + ((r.h - h) * first) / Math.max(1, total - visible);
  fill(ctx, rect(r.x, y, r.w, h), '#8a8a8a');
}

// Centered message in an empty area ("Aucune clé USB", loading...).
export function emptyMessage(ctx, r, message, sub = '') {
  text(ctx, message, r.x + r.w / 2, r.y + r.h / 2 - (sub ? 12 : 0), { size: SIZE.rowSmall + 1, align: 'center', color: C.textDim, maxWidth: r.w - 40 });
  if (sub) text(ctx, sub, r.x + r.w / 2, r.y + r.h / 2 + 16, { size: SIZE.header + 1, align: 'center', color: C.textMute, maxWidth: r.w - 40 });
}

// Bottom playback status bar of the SOURCE / BROWSE screens (manual p18-19,
// item 9): PLAYER n, REMAIN time, overall waveform with playhead and cue,
// MT / key, tempo, BPM box with MASTER (only on the tempo master). info = api.deckInfo():
// the BPM shown is the one heard (detected BPM, else the manifest one, x tempo).
// Returns { overview: rect } (touch it to seek, if wanted).
export function statusBar(ctx, info, y = SCREEN_H - L.statusH) {
  const h = L.statusH;
  fill(ctx, rect(0, y, SCREEN_W, h), C.bg);
  // PLAYER box
  const pb = rect(10, y + 8, 50, h - 16);
  ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1.5; ctx.strokeRect(pb.x + 0.5, pb.y + 0.5, pb.w - 1, pb.h - 1);
  text(ctx, 'PLAYER', pb.x + pb.w / 2, pb.y + 9, { size: 8, align: 'center', color: C.textDim });
  text(ctx, String(info.player ?? 1), pb.x + pb.w / 2, pb.y + pb.h * 0.62, { size: 24, align: 'center', color: C.text, family: FONT.numeric });
  // REMAIN (or elapsed: TIME MODE)
  if (!info.elapsed) text(ctx, 'REMAIN', 76, y + 13, { size: 8, color: C.textDim });
  const remain = info.loaded ? (info.elapsed ? info.position : Math.max(0, info.duration - info.position)) : NaN;
  text(ctx, formatTime(remain), 74, y + h * 0.6, { size: 38, weight: 300, color: info.loaded ? C.text : C.textMute, family: FONT.numeric });
  // overall waveform
  const ov = rect(206, y + 18, 500, h - 30);
  const data = info.waveform ? info.waveform.overview(Math.round(ov.w / 2)).rms : null;
  const progress = info.duration > 0 ? info.position / info.duration : 0;
  miniWaveform(ctx, ov, data, { progress, color: C.wfOverviewLight, played: C.wfOverviewPlayed });
  fill(ctx, rect(ov.x, ov.y + ov.h, ov.w, 1), '#5a5a5a');
  for (let k = 0; k <= 10; k++) fill(ctx, rect(ov.x + (k / 10) * ov.w, ov.y + ov.h, 1, 4), '#5a5a5a');
  if (info.loaded && info.duration > 0) {
    const cx = ov.x + (info.cuePoint / info.duration) * ov.w;
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(cx - 5, ov.y - 9); ctx.lineTo(cx + 5, ov.y - 9); ctx.lineTo(cx, ov.y - 2); ctx.closePath(); ctx.fill();
    fill(ctx, rect(ov.x + progress * ov.w - 1, ov.y - 2, 2, ov.h + 4), C.red);
  }
  // MT + key
  const mt = rect(732, y + 10, 38, 18);
  if (info.masterTempo) fill(ctx, mt, C.orangeRed);
  ctx.strokeStyle = info.masterTempo ? C.orangeRed : C.mtOff; ctx.lineWidth = 1.5; ctx.strokeRect(mt.x + 0.5, mt.y + 0.5, mt.w - 1, mt.h - 1);
  text(ctx, 'MT', mt.x + mt.w / 2, mt.y + mt.h / 2 + 1, { size: 11, align: 'center', color: info.masterTempo ? C.text : '#7a2a14' });
  text(ctx, info.key || '--', mt.x + mt.w / 2, y + h * 0.72, { size: 15, align: 'center', color: C.text });
  // tempo
  const tb = rect(806, y + 10, 40, 16);
  fill(ctx, tb, C.orangeRed);
  text(ctx, (info.range ?? 10) >= 100 ? 'WIDE' : `±${info.range ?? 10}`, tb.x + tb.w / 2, tb.y + tb.h / 2 + 1, { size: 11, align: 'center', color: C.text });
  const tempo = Math.round((info.tempo ?? 0) * 100) / 100;
  text(ctx, `${tempo >= 0 ? '+' : '−'}${Math.abs(tempo).toFixed(2)}`, 870, y + h * 0.7, { size: 18, align: 'right', color: C.text, family: FONT.numeric });
  text(ctx, '%', 873, y + h * 0.74, { size: 10, color: C.text });
  // BPM box
  const bb = rect(906, y + 8, 108, h - 16);
  ctx.strokeStyle = C.orange; ctx.lineWidth = 1.5; ctx.strokeRect(bb.x + 0.5, bb.y + 0.5, bb.w - 1, bb.h - 1);
  text(ctx, 'BPM', bb.x + 6, bb.y + 8, { size: 8, color: C.textDim });
  if (info.isMaster) {
    fill(ctx, rect(bb.x + bb.w - 44, bb.y + 1, 43, 11), C.orange);
    text(ctx, 'MASTER', bb.x + bb.w - 22, bb.y + 7, { size: 8, align: 'center', color: C.text });
  } else if (info.synced) {
    fill(ctx, rect(bb.x + bb.w - 34, bb.y + 1, 33, 11), C.phaseBlue);
    text(ctx, 'SYNC', bb.x + bb.w - 17, bb.y + 7, { size: 8, align: 'center', color: C.text });
  }
  const [bi, bd] = formatBpm(info.effectiveBpm ?? info.bpm).split('.');
  const bx = bb.x + bb.w - 22;
  text(ctx, bd ?? '-', bx + 4, bb.y + bb.h * 0.66, { size: 15, color: C.orange, family: FONT.numeric });
  text(ctx, `${bi}.`, bx + 3, bb.y + bb.h * 0.62, { size: 32, weight: 300, align: 'right', color: C.orange, family: FONT.numeric });
  return { overview: ov };
}
