// Small drawing parts of the PLAYER page (src/screens/pages/player.js), drawn
// after the manual p21 (docs/reference/cdj3000-manual-p21-playback.png).
// Colours and fonts come from ../design.js; every helper restores the context.
import { C, FONT, rect, fill, text } from '../design.js';

// Thin rectangle outline (crisp on the pixel grid).
export function frame(ctx, r, color, lw = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
}

// Outlined label box (A.HOT CUE, AUTO CUE, MT, QUANTIZE...): lines = [{ text, size, dy }].
export function labelBox(ctx, r, lines, color, { border = color, fillColor = null, weight = 400 } = {}) {
  if (fillColor) fill(ctx, r, fillColor);
  frame(ctx, r, border);
  for (const l of lines) text(ctx, l.text, r.x + r.w / 2, r.y + r.h / 2 + (l.dy ?? 0) + 1, { size: l.size, weight: l.weight ?? weight, align: 'center', color: l.color ?? color });
}

// (device icon and artwork of the top bar: deviceTile / artwork of ./cdj.js)

// BEAT LOOP / KEY SHIFT / BEAT JUMP: checkered dark key, 2 lines, grey bar under.
let checker = null;
function checkerPattern(ctx) {
  if (checker) return checker;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = '#262626'; g.fillRect(0, 0, 4, 4);
  g.fillStyle = '#2e2e2e'; g.fillRect(0, 0, 2, 2); g.fillRect(2, 2, 2, 2);
  checker = ctx.createPattern(c, 'repeat');
  return checker;
}
export function keyButton(ctx, r, lines, { active = false } = {}) {
  ctx.save();
  ctx.fillStyle = active ? C.highlightDeep : checkerPattern(ctx);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  lines.forEach((l, i) => text(ctx, l, r.x + r.w / 2, r.y + 31 + i * 19, { size: 15, weight: 500, align: 'center', color: C.textSoft, letterSpacing: 0.6 }));
  fill(ctx, rect(r.x + r.w / 2 - 26, r.y + r.h - 6, 52, 3), active ? C.highlight : '#6c6c6c');
}

// PLAY / PAUSE touch key of the top bar: same key as keyButton, with a play
// triangle (stopped) or two bars (playing) instead of the two text lines.
export function playPauseButton(ctx, r, playing) {
  keyButton(ctx, r, []);
  const cx = r.x + r.w / 2, cy = r.y + 33;
  ctx.save();
  ctx.fillStyle = C.textSoft;
  if (playing) {
    ctx.fillRect(Math.round(cx - 11), cy - 12, 8, 24);
    ctx.fillRect(Math.round(cx + 3), cy - 12, 8, 24);
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 13);
    ctx.lineTo(cx + 13, cy);
    ctx.lineTo(cx - 8, cy + 13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// "((" n "))" of the PLAYER box: arcs on both sides of the number.
export function playerArcs(ctx, cx, cy, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (const [rad, span] of [[17, 0.62], [23, 0.55]]) {
      ctx.beginPath();
      const a0 = side < 0 ? Math.PI - span : -span;
      const a1 = side < 0 ? Math.PI + span : span;
      ctx.arc(cx, cy, rad, a0, a1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Hot cue flag: coloured square with its letter.
export function hotCueFlag(ctx, cx, y, label, color, size = 15) {
  const r = rect(Math.round(cx - size / 2), y, size, size);
  fill(ctx, r, color);
  text(ctx, label, cx, y + size / 2 + 1, { size: size - 3, weight: 700, align: 'center', color: '#000' });
}

// Memory cue / cue point: red triangle pointing down, tip at (cx, tipY).
export function cueTriangle(ctx, cx, tipY, size = 13, color = C.red) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, tipY - size * 0.85);
  ctx.lineTo(cx + size / 2, tipY - size * 0.85);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
  ctx.fill();
}

// Loop symbol (item 1): open rounded loop with an arrow head, then the beat count.
export function loopCount(ctx, x, cy, beats, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  const w = 22, h = 13, r = 5;
  const x0 = x, y0 = cy - h / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + 7, y0);
  ctx.lineTo(x0 + w - r, y0);
  ctx.arcTo(x0 + w, y0, x0 + w, y0 + r, r);
  ctx.lineTo(x0 + w, y0 + h - r);
  ctx.arcTo(x0 + w, y0 + h, x0 + w - r, y0 + h, r);
  ctx.lineTo(x0 + r, y0 + h);
  ctx.arcTo(x0, y0 + h, x0, y0 + h - r, r);
  ctx.lineTo(x0, y0 + 5);
  ctx.stroke();
  ctx.beginPath(); // arrow head pointing left, on the top branch
  ctx.moveTo(x0 + 1, y0); ctx.lineTo(x0 + 9, y0 - 5.5); ctx.lineTo(x0 + 9, y0 + 5.5); ctx.closePath(); ctx.fill();
  ctx.restore();
  text(ctx, String(beats), x0 + w + 6, cy + 1, { size: 21, color, family: FONT.numeric });
}

// Camelot keys: compatible = same, relative (A <-> B), or +-1 on the wheel.
export function keysCompatible(a, b) {
  const pa = /^(\d{1,2})([AB])$/i.exec(String(a ?? '').trim());
  const pb = /^(\d{1,2})([AB])$/i.exec(String(b ?? '').trim());
  if (!pa || !pb) return false;
  const na = +pa[1], nb = +pb[1], la = pa[2].toUpperCase(), lb = pb[2].toUpperCase();
  if (na === nb) return true;
  const d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  return la === lb && d === 1;
}
