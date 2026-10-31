// DEMO, easy to remove: three placeholder keys drawn on the focused CDJ screen
// to try the touch surface (tap = on / off, hover = slightly brighter outline).
// Only while that screen is focused; enabled by SCREEN_TOUCH.demo in
// src/config.js. To remove: set the flag to false (or delete this file and its
// import in src/main.js). Nothing else depends on it.
import { SCREEN_TOUCH } from '../config.js';

const SCREEN_KEYS = { cdj_left: 'cdjLeft', cdj_right: 'cdjRight' };
const KEYS = ['A', 'B', 'C'];

export function createScreenDemo({ screens, focus }) {
  if (!SCREEN_TOUCH.demo) return { dispose() {} };
  const state = {}; // 'cdj_left:A' -> on
  let active = null; // { screen, unit, offs: [] }

  const layout = (w, h) => {
    const kw = Math.round(w * 0.13), kh = Math.round(h * 0.085), gap = Math.round(w * 0.016);
    const right = Math.round(w * 0.965), y = Math.round(h * 0.815);
    return KEYS.map((k, i) => ({ k, x: right - (KEYS.length - i) * kw - (KEYS.length - 1 - i) * gap, y, w: kw, h: kh }));
  };

  const show = (unit) => {
    const screen = screens[SCREEN_KEYS[unit]];
    if (!screen) return;
    const hovered = new Set();
    const offs = [];
    const boxes = layout(screen.width, screen.height);
    offs.push(screen.addLayer('demo-keys', (ctx, w, h) => {
      ctx.font = `600 ${Math.round(h * 0.03)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillText('DÉMO TACTILE', boxes[0].x - Math.round(w * 0.016), boxes[0].y + boxes[0].h / 2);
      ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(h * 0.036)}px ui-sans-serif, system-ui, sans-serif`;
      for (const b of boxes) {
        const on = !!state[`${unit}:${b.k}`];
        ctx.beginPath();
        ctx.roundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, b.h / 2);
        ctx.fillStyle = on ? 'rgba(236,236,232,0.9)' : 'rgba(255,255,255,0.04)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = on ? 'rgba(236,236,232,0.9)' : hovered.has(b.k) ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.26)';
        ctx.stroke();
        ctx.fillStyle = on ? '#0b0c0e' : 'rgba(255,255,255,0.72)';
        ctx.fillText(`DÉMO ${b.k}`, b.x + b.w / 2, b.y + b.h / 2 + 1);
      }
    }));
    for (const b of boxes) {
      offs.push(screen.addHitRegion({
        id: `demo-${b.k}`, x: b.x, y: b.y, w: b.w, h: b.h,
        onTap: () => { state[`${unit}:${b.k}`] = !state[`${unit}:${b.k}`]; screen.invalidate(); },
        onHover: (over) => { if (over) hovered.add(b.k); else hovered.delete(b.k); screen.invalidate(); },
      }));
    }
    active = { screen, unit, offs };
  };
  const hide = () => {
    if (!active) return;
    for (const off of active.offs) off();
    active = null;
  };

  const off = focus.onChange((e) => {
    if (e.type === 'enter') { hide(); show(e.unit); }
    else if (e.type === 'exit' || e.type === 'exited') hide();
  });
  return { dispose() { hide(); off(); } };
}
