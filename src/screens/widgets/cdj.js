// CDJ-3000 look for the SOURCE / BROWSE screens: palette, vector icons, device
// tile, clipped text, checkered buttons, procedural artwork and cached preview
// waveforms. Measured on the native 1280 x 720 screenshots embedded in the
// manual (pdfimages, pages 18-19): canvas x = ref x * 0.8, heights scaled to the
// 72 / 457 / 68 px bands of the 1024 x 597 canvas (title / body / status bar).
// Used by widgets/browse.js, pages/sources.js and pages/link.js only.
//
//   import { K, kText, clipText, icon, deviceTile, checker, artwork, previewWave } from './cdj.js';
// Helpers take the context first and leave its state as they found it.
import { C, FONT, font } from '../design.js';

// --- palette (sampled on the manual screenshots) ---
export const K = {
  bar: C.titleBar, // #191919 title bar, row separators of the SOURCE list
  panel: C.panel, // #232323 SOURCE rows / info panel
  header: C.header, // #3c3c3c column header row, category tiles, buttons
  headerText: '#bebebe',
  headerSep: '#000000',
  rowA: C.rowA, // #282828
  rowB: C.rowB, // #000000
  rowSep: '#4b4b4b', // vertical column lines inside the rows
  tile: '#3c3c3c', // category tile
  tileSelected: C.sideSelected, // #64646e
  tileHover: '#4a4a52', // category tile under the mouse (screen focus)
  tileIcon: '#afafaf',
  tileText: '#f1f1f1',
  catStrip: '#505050',
  catThumb: '#666666',
  sideEdge: '#323232', // 2 px edge between the category column and the list
  highlight: C.highlight, // #007de1
  highlightDeep: C.highlightDeep, // #0064a5 (checker of the active PREVIEW button)
  green: '#00ff00', // loaded track / device ("Loaded")
  text: '#ffffff',
  soft: '#e1e1e1',
  label: '#afafaf', // info panel labels, INFO text, back arrow
  unit: '#a2a2a2', // "GB"
  line: '#000000', // info panel separators
  boxBorder: '#c8c8c8', // dropdown / MY SETTINGS LOAD border
  boxFill: '#3c3c3c',
  backBorder: '#4b4b4b',
  bracket: '#4b4b4b', // [ Loaded ]
  checkerDark: '#232323', // inactive button checker
  checkerLight: '#323232',
  underline: '#afafaf',
  scrollTrack: '#505050',
  scrollThumb: '#5f5f5f',
  waveBg: '#000000',
  device: C.device, // icon backgrounds: navy, brown, green, purple
  numberBorder: '#d9d9d9',
};

// --- text ---
// One line of text, clipped (not ellipsized) to maxWidth like on the CDJ.
// opts: size, weight, color, align, baseline ('middle'), letterSpacing, clip (bool, default true when maxWidth).
export function kText(ctx, str, x, y, opts = {}) {
  const { size = 20, weight = 400, color = K.text, align = 'left', baseline = 'middle', letterSpacing = 0, maxWidth, family = FONT.family } = opts;
  const s = String(str ?? '');
  ctx.font = font(size, weight, family);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${letterSpacing}px`;
  const w = ctx.measureText(s).width;
  if (maxWidth > 0 && w > maxWidth) {
    ctx.save();
    ctx.beginPath();
    const x0 = align === 'right' ? x - maxWidth : align === 'center' ? x - maxWidth / 2 : x;
    ctx.rect(x0, y - size * 1.5, maxWidth, size * 3);
    ctx.clip();
    ctx.fillText(s, x, y);
    ctx.restore();
  } else ctx.fillText(s, x, y);
  ctx.letterSpacing = '0px';
  return Math.min(w, maxWidth > 0 ? maxWidth : w);
}
export const clipText = kText;

export function measure(ctx, str, size, weight = 400, letterSpacing = 0) {
  ctx.font = font(size, weight);
  ctx.letterSpacing = `${letterSpacing}px`;
  const w = ctx.measureText(String(str ?? '')).width;
  ctx.letterSpacing = '0px';
  return w;
}

export function box(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
export function strokeBox(ctx, x, y, w, h, color, lw = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

// Two-colour checker (PREVIEW / font size buttons), cell px.
const checkerCache = new Map();
export function checker(ctx, x, y, w, h, a, b, cell = 3) {
  const key = `${a}|${b}|${cell}`;
  let pat = checkerCache.get(key);
  if (!pat) {
    const c = document.createElement('canvas');
    c.width = c.height = cell * 2;
    const g = c.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, cell * 2, cell * 2);
    g.fillStyle = b; g.fillRect(cell, 0, cell, cell); g.fillRect(0, cell, cell, cell);
    pat = ctx.createPattern(c, 'repeat');
    checkerCache.set(key, pat);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// --- icons ---
// icon(ctx, name, cx, cy, size, color, extra) — size = nominal height in px.
// names: usb, sd, note (TRACK), artist, album, bpm, key, playlist, history, date,
// info (À PROPOS), link (LINK: two chain links), track (H + eighth note of the track rows), play, back, listbox, folder,
// chevron, sortUp, sortDown, updown, infoArrow, infoArrowOpen.
export function icon(ctx, name, cx, cy, size, color = K.text, extra = {}) {
  const s = size / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  switch (name) {
    case 'usb': { // connector (2 holes) + body with the USB trident in the background colour
      const bg = extra.bg ?? K.device[0];
      const bw = s * 0.95, bh = s * 1.15;
      const bx = cx - bw / 2, by = cy - s * 0.25;
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.strokeRect(cx - s * 0.33, cy - s * 0.95, s * 0.66, s * 0.62);
      ctx.fillRect(cx - s * 0.2, cy - s * 0.8, s * 0.13, s * 0.17);
      ctx.fillRect(cx + s * 0.07, cy - s * 0.8, s * 0.13, s * 0.17);
      roundRect(ctx, bx, by, bw, bh, s * 0.1); ctx.fill();
      // trident
      ctx.strokeStyle = bg; ctx.fillStyle = bg; ctx.lineWidth = Math.max(1, s * 0.09);
      const ty = by + bh * 0.18, tb = by + bh * 0.86;
      ctx.beginPath(); ctx.moveTo(cx, ty + s * 0.12); ctx.lineTo(cx, tb); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.1, ty + s * 0.14); ctx.lineTo(cx, ty); ctx.lineTo(cx + s * 0.1, ty + s * 0.14); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, tb - s * 0.2); ctx.lineTo(cx - s * 0.26, tb - s * 0.42); ctx.lineTo(cx - s * 0.26, tb - s * 0.62); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, tb - s * 0.32); ctx.lineTo(cx + s * 0.26, tb - s * 0.52); ctx.lineTo(cx + s * 0.26, tb - s * 0.62); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - s * 0.26, tb - s * 0.66, s * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx + s * 0.2, tb - s * 0.74, s * 0.12, s * 0.12);
      ctx.beginPath(); ctx.arc(cx, tb, s * 0.09, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'sd': {
      const bg = extra.bg ?? K.device[2];
      const w = s * 0.9, h = s * 1.5, x = cx - w / 2, y = cy - h / 2;
      ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bg;
      for (let i = 0; i < 3; i++) ctx.fillRect(x + w * (0.12 + i * 0.22), y, w * 0.11, h * 0.24);
      break;
    }
    case 'note': { // TRACK category: eighth note
      ctx.beginPath(); ctx.ellipse(cx - s * 0.18, cy + s * 0.58, s * 0.3, s * 0.22, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx + s * 0.06, cy - s * 0.85, s * 0.09, s * 1.4);
      ctx.lineWidth = s * 0.09;
      ctx.beginPath(); ctx.moveTo(cx + s * 0.1, cy - s * 0.82); ctx.bezierCurveTo(cx + s * 0.2, cy - s * 0.4, cx + s * 0.62, cy - s * 0.4, cx + s * 0.5, cy + s * 0.05); ctx.stroke();
      break;
    }
    case 'artist': {
      ctx.lineWidth = Math.max(1.2, s * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.32, s * 0.36, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.78, s * 0.85, s * 0.55, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      break;
    }
    case 'album': {
      ctx.lineWidth = Math.max(1.2, s * 0.07);
      ctx.strokeRect(cx - s * 0.72, cy - s * 0.72, s * 1.44, s * 1.44);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy - s * 0.72); ctx.lineTo(cx - s * 0.55, cy + s * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.08, cy, s * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.08, cy, s * 0.17, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'bpm':
    case 'key': {
      ctx.lineWidth = Math.max(1.2, s * 0.07);
      ctx.strokeRect(cx - s * 0.72, cy - s * 0.72, s * 1.44, s * 1.44);
      ctx.font = font(name === 'bpm' ? s * 0.62 : s * 0.9, 700);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name === 'bpm' ? 'BPM' : 'b#', cx, cy + s * 0.05);
      break;
    }
    case 'playlist': {
      ctx.lineWidth = Math.max(1.2, s * 0.08);
      ctx.strokeRect(cx - s * 0.62, cy - s * 0.8, s * 1.24, s * 1.6);
      for (let i = 0; i < 4; i++) {
        const y = cy - s * 0.5 + i * s * 0.34;
        ctx.beginPath(); ctx.moveTo(cx - s * 0.42, y - s * 0.09); ctx.lineTo(cx - s * 0.26, y); ctx.lineTo(cx - s * 0.42, y + s * 0.09); ctx.closePath(); ctx.fill();
        ctx.fillRect(cx - s * 0.16, y - s * 0.07, s * 0.6, s * 0.14);
      }
      break;
    }
    case 'history': {
      ctx.lineWidth = Math.max(1.2, s * 0.08);
      ctx.beginPath(); ctx.moveTo(cx - s * 0.75, cy - s * 0.8); ctx.lineTo(cx + s * 0.55, cy - s * 0.8); ctx.lineTo(cx + s * 0.55, cy - s * 0.05); ctx.moveTo(cx - s * 0.75, cy - s * 0.8); ctx.lineTo(cx - s * 0.75, cy + s * 0.75); ctx.lineTo(cx - s * 0.05, cy + s * 0.75); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const y = cy - s * 0.52 + i * s * 0.3;
        ctx.fillRect(cx - s * 0.6, y - s * 0.05, s * 0.12, s * 0.1);
        ctx.fillRect(cx - s * 0.38, y - s * 0.05, i < 2 ? s * 0.8 : s * 0.38, s * 0.1);
      }
      ctx.beginPath(); ctx.arc(cx + s * 0.42, cy + s * 0.5, s * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = extra.bg ?? K.tile; ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath(); ctx.moveTo(cx + s * 0.42, cy + s * 0.3); ctx.lineTo(cx + s * 0.42, cy + s * 0.52); ctx.lineTo(cx + s * 0.58, cy + s * 0.6); ctx.stroke();
      break;
    }
    case 'date': {
      ctx.lineWidth = Math.max(1.2, s * 0.07);
      ctx.strokeRect(cx - s * 0.75, cy - s * 0.6, s * 1.5, s * 1.35);
      ctx.fillRect(cx - s * 0.5, cy - s * 0.85, s * 0.1, s * 0.4); ctx.fillRect(cx + s * 0.4, cy - s * 0.85, s * 0.1, s * 0.4);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) ctx.fillRect(cx - s * 0.56 + k * s * 0.33, cy + s * 0.12 + r * s * 0.3, s * 0.17, s * 0.13);
      ctx.lineWidth = Math.max(1.2, s * 0.09);
      ctx.beginPath(); ctx.moveTo(cx + s * 0.05, cy - s * 0.25); ctx.lineTo(cx + s * 0.22, cy - s * 0.1); ctx.lineTo(cx + s * 0.55, cy - s * 0.45); ctx.stroke();
      break;
    }
    case 'info': { // circled i
      ctx.lineWidth = Math.max(1.2, s * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.38, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx - s * 0.08, cy - s * 0.16, s * 0.16, s * 0.6);
      break;
    }
    case 'link': { // two interlocked rounded links, tilted
      ctx.lineWidth = Math.max(1.4, s * 0.13);
      ctx.translate(cx, cy); ctx.rotate(-Math.PI / 4);
      roundRect(ctx, -s * 0.95, -s * 0.3, s * 1.15, s * 0.6, s * 0.3); ctx.stroke();
      roundRect(ctx, -s * 0.2, -s * 0.3, s * 1.15, s * 0.6, s * 0.3); ctx.stroke();
      break;
    }
    case 'track': { // small "H" + eighth note (rekordbox track icon)
      ctx.font = font(Math.max(7, s * 0.78), 500);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', cx - s * 0.66, cy - s * 0.5);
      ctx.beginPath(); ctx.ellipse(cx - s * 0.15, cy + s * 0.58, s * 0.27, s * 0.2, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx + s * 0.04, cy - s * 0.9, s * 0.12, s * 1.45);
      ctx.lineWidth = s * 0.12;
      ctx.beginPath(); ctx.moveTo(cx + s * 0.1, cy - s * 0.86); ctx.bezierCurveTo(cx + s * 0.25, cy - s * 0.42, cx + s * 0.72, cy - s * 0.45, cx + s * 0.5, cy + s * 0.12); ctx.stroke();
      break;
    }
    case 'play': {
      ctx.moveTo(cx - s * 0.4, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy); ctx.lineTo(cx - s * 0.4, cy + s * 0.5); ctx.closePath(); ctx.fill();
      break;
    }
    case 'back': { // thin left arrow
      ctx.lineWidth = Math.max(1.5, s * 0.13);
      ctx.moveTo(cx + s * 0.85, cy); ctx.lineTo(cx - s * 0.75, cy);
      ctx.moveTo(cx - s * 0.05, cy - s * 0.72); ctx.lineTo(cx - s * 0.78, cy); ctx.lineTo(cx - s * 0.05, cy + s * 0.72);
      ctx.stroke();
      break;
    }
    case 'listbox': { // title icon of a playlist: framed list
      ctx.lineWidth = Math.max(1.2, s * 0.1);
      ctx.strokeRect(cx - s * 0.8, cy - s * 0.85, s * 1.6, s * 1.7);
      for (let i = 0; i < 4; i++) {
        const y = cy - s * 0.5 + i * s * 0.34;
        ctx.fillRect(cx - s * 0.55, y - s * 0.06, s * 0.16, s * 0.12);
        ctx.fillRect(cx - s * 0.25, y - s * 0.06, s * 0.82, s * 0.12);
      }
      break;
    }
    case 'folder': {
      ctx.lineWidth = Math.max(1.2, s * 0.1);
      ctx.moveTo(cx - s * 0.85, cy - s * 0.6); ctx.lineTo(cx - s * 0.25, cy - s * 0.6); ctx.lineTo(cx - s * 0.1, cy - s * 0.42);
      ctx.lineTo(cx + s * 0.85, cy - s * 0.42); ctx.lineTo(cx + s * 0.85, cy + s * 0.65); ctx.lineTo(cx - s * 0.85, cy + s * 0.65); ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'chevron': { // bold >
      ctx.lineWidth = Math.max(2, s * 0.26);
      ctx.moveTo(cx - s * 0.32, cy - s * 0.6); ctx.lineTo(cx + s * 0.28, cy); ctx.lineTo(cx - s * 0.32, cy + s * 0.6);
      ctx.stroke();
      break;
    }
    case 'sortUp':
    case 'sortDown': {
      const d = name === 'sortUp' ? 1 : -1;
      ctx.moveTo(cx - s * 0.62, cy + d * s * 0.5); ctx.lineTo(cx + s * 0.62, cy + d * s * 0.5); ctx.lineTo(cx, cy - d * s * 0.55); ctx.closePath(); ctx.fill();
      break;
    }
    case 'updown': {
      ctx.lineWidth = Math.max(1.5, s * 0.16);
      ctx.moveTo(cx - s * 0.35, cy - s * 0.3); ctx.lineTo(cx, cy - s * 0.62); ctx.lineTo(cx + s * 0.35, cy - s * 0.3);
      ctx.moveTo(cx - s * 0.35, cy + s * 0.3); ctx.lineTo(cx, cy + s * 0.62); ctx.lineTo(cx + s * 0.35, cy + s * 0.3);
      ctx.stroke();
      break;
    }
    case 'infoArrow':
    case 'infoArrowOpen': {
      const d = name === 'infoArrow' ? -1 : 1;
      ctx.moveTo(cx + d * s * 0.4, cy); ctx.lineTo(cx - d * s * 0.3, cy - s * 0.42); ctx.lineTo(cx - d * s * 0.3, cy + s * 0.42); ctx.closePath(); ctx.fill();
      break;
    }
    default: break;
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Device icon (SOURCE rows, BROWSE top left): coloured block, white USB / SD
// glyph, label under it, player number in a black box with a light border at
// the top left. opts: kind ('usb'|'sd'), label, color, player, link (bool: LINK strip).
export function deviceTile(ctx, x, y, w, h, opts = {}) {
  const { kind = 'usb', label = kind === 'sd' ? 'SD' : 'USB', color = K.device[0], player = null, link = false } = opts;
  box(ctx, x, y, w, h, color);
  const nb = Math.round(Math.min(w, h) * 0.25);
  if (player != null) {
    box(ctx, x, y, nb, nb, '#000');
    strokeBox(ctx, x, y, nb, nb, K.numberBorder, 1);
    kText(ctx, String(player), x + nb / 2, y + nb / 2 + 1, { size: nb * 0.9, align: 'center', color: K.text });
  }
  if (link) {
    box(ctx, x + nb + 1, y + 1, w - nb - 2, nb - 2, K.soft);
    kText(ctx, 'LINK', x + nb + (w - nb) / 2, y + nb / 2 + 1, { size: nb * 0.72, align: 'center', color: '#000' });
  }
  const g = h * 0.34;
  icon(ctx, kind, x + w / 2, y + h * 0.47, g, K.text, { bg: color });
  kText(ctx, label, x + w / 2, y + h * 0.8, { size: Math.round(h * 0.235), align: 'center', color: K.text });
}

// --- procedural artwork (no real covers in the manifest) ---
// A small cover per track, deterministic (hash of the id), cached per size;
// without a track: an empty dark tile with a note. Used by the lists, the INFO
// panel and the player page (one implementation).
const artCache = new Map();
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const ART_STYLES = 4;
export function artwork(ctx, track, x, y, size) {
  if (!track) {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#30353d'); g.addColorStop(1, '#16191d');
    ctx.fillStyle = g; ctx.fillRect(x, y, size, size);
    icon(ctx, 'note', x + size / 2, y + size / 2, size * 0.5, '#8d96a3');
    return;
  }
  const n = Math.max(8, Math.round(size));
  const key = `${track?.id ?? '?'}|${n}`;
  let c = artCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const h = hash(track?.id ?? track?.title ?? '?');
    const hue = h % 360, hue2 = (hue + 40 + ((h >> 9) % 140)) % 360;
    const style = (h >> 4) % ART_STYLES;
    const grad = g.createLinearGradient(0, 0, n, n);
    grad.addColorStop(0, `hsl(${hue} 55% 34%)`);
    grad.addColorStop(1, `hsl(${hue2} 60% 14%)`);
    g.fillStyle = grad; g.fillRect(0, 0, n, n);
    g.fillStyle = `hsl(${hue2} 80% 62% / 0.85)`;
    g.strokeStyle = `hsl(${hue} 85% 70% / 0.8)`;
    g.lineWidth = Math.max(1, n * 0.05);
    if (style === 0) { g.beginPath(); g.arc(n * 0.5, n * 0.56, n * 0.26, 0, Math.PI * 2); g.fill(); }
    else if (style === 1) { for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(n * 0.5, n * 0.5, n * (0.12 + i * 0.1), 0, Math.PI * 2); g.stroke(); } }
    else if (style === 2) { for (let i = 0; i < 5; i++) g.fillRect(0, n * (0.14 + i * 0.17), n, n * 0.06); }
    else { g.beginPath(); g.moveTo(n * 0.2, n * 0.82); g.lineTo(n * 0.5, n * 0.18); g.lineTo(n * 0.8, n * 0.82); g.closePath(); g.fill(); }
    const initials = String(track?.title ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    g.font = font(n * 0.3, 700);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(initials, n * 0.08, n * 0.06);
    if (artCache.size > 200) artCache.clear();
    artCache.set(key, c);
  }
  ctx.drawImage(c, x, y, size, size);
}

// --- preview waveform (PREVIEW column), computed on the real audio ---
// Bottom-anchored bars like rekordbox's blue preview: bar height = peak, body
// darker blue, the RMS part lighter; columns rich in highs lean to cyan / white.
// Rendered once per (waveform, w, h) into an offscreen canvas, then blitted.
const waveCache = new WeakMap(); // waveform -> Map(key -> canvas)
export function previewWave(ctx, wf, x, y, w, h) {
  box(ctx, x, y, w, h, K.waveBg);
  if (!wf) { box(ctx, x, y + h - 1, w, 1, '#16324a'); return; }
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  let per = waveCache.get(wf);
  if (!per) { per = new Map(); waveCache.set(wf, per); }
  const key = `${W}x${H}`;
  let c = per.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    // Average-pooled columns (overview() is max-pooled: every column would hit
    // the top). Outer bar = mean peak, inner light part = mean RMS.
    const n = W, len = wf.length;
    const pk = new Float32Array(n), rm = new Float32Array(n), hi = new Float32Array(n), lo = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i * len) / n), b = Math.max(a + 1, Math.floor(((i + 1) * len) / n));
      let sp = 0, sr = 0, sh = 0, sl = 0;
      for (let j = a; j < b && j < len; j++) { sp += wf.peak[j]; sr += wf.rms[j]; sh += wf.high[j]; sl += wf.low[j]; }
      const m = Math.max(1, Math.min(b, len) - a);
      pk[i] = sp / m; rm[i] = sr / m; hi[i] = sh / m; lo[i] = sl / m;
    }
    const top = (arr) => { const s = Array.from(arr).sort((x, y) => x - y); return s[Math.floor(s.length * 0.97)] || 1; };
    const nPk = top(pk), nRm = top(rm);
    const body = g.createLinearGradient(0, 0, 0, H);
    body.addColorStop(0, '#04365e');
    body.addColorStop(0.5, '#0961a6');
    body.addColorStop(1, '#138ae6');
    for (let i = 0; i < n; i++) {
      const p = Math.min(1, pk[i] / nPk), r = Math.min(1, rm[i] / nRm);
      const ph = Math.max(1, Math.round(Math.pow(p, 1.6) * H));
      g.fillStyle = body;
      g.fillRect(i, H - ph, 1, ph);
      const rh = Math.round(Math.min(ph, Math.pow(r, 1.8) * H * 0.62));
      if (rh > 0) {
        const t = Math.max(0, Math.min(1, hi[i] / Math.max(1, lo[i] + hi[i])));
        // light blue (lows) -> pale cyan / white (highs)
        const R = Math.round(60 + t * 120), G = Math.round(150 + t * 60), B = Math.round(200 + t * 40);
        g.fillStyle = `rgb(${R},${G},${B})`;
        g.fillRect(i, H - rh, 1, rh);
      }
    }
    per.set(key, c);
  }
  ctx.drawImage(c, x, y, w, h);
}
