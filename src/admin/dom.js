// Construction du DOM de la régie. Aucun innerHTML : tout texte passe par textContent ou
// par un nœud texte, donc aucune donnée ne peut devenir du balisage.
import { fr } from '../ui/dom.js'; // typographie française : espaces insécables, comme sur le site

const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'required', 'readonly', 'selected', 'open']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = fr(value);
      else if (key === 'value') el.value = value;
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (BOOLEAN.has(key)) {
        if (value) el.setAttribute(key, '');
      } else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? fr(child) : child);
  }
  return el;
}

// ------------------------------------------------------------------ pictogrammes
// Tracés droits, extrémités carrées, comme ceux du site (jamais de caractère pour une flèche).
const NS = 'http://www.w3.org/2000/svg';

function icon(d, { size = 24, box = 24, fill = false, width = 2 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  if (fill) path.setAttribute('fill', 'currentColor');
  else {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', width);
    path.setAttribute('stroke-linecap', 'square');
  }
  svg.append(path);
  return svg;
}

export const icons = {
  grip: () => icon('M8 5h2v2H8zM14 5h2v2h-2zM8 11h2v2H8zM14 11h2v2h-2zM8 17h2v2H8zM14 17h2v2h-2z', { fill: true }),
  up: () => icon('M12 19V6M6 12l6-6 6 6', { size: 20 }),
  down: () => icon('M12 5v13M6 12l6 6 6-6', { size: 20 }),
  plus: () => icon('M12 5v14M5 12h14', { size: 16 }),
  close: () => icon('M5 5l14 14M19 5L5 19', { size: 20 }),
  chevron: () => icon('M6 9l6 6 6-6', { size: 20 }),
  check: () => icon('M5 12l5 5 9-10', { size: 16 }),
  alert: () => icon('M12 4l9 16H3zM12 10v5M12 17v1', { size: 16 }),
  external: () => icon('M3 9l6-6M4 3h5v5', { size: 12, box: 12, width: 1.5 }),
};

// ------------------------------------------------------------------ formats
export const pad2 = (n) => String(n).padStart(2, '0');

export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const dateFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const stampFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

// 'YYYY-MM-DD' en date locale (midi, pour éviter tout décalage de fuseau), ou null.
export function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const formatDay = (value) => {
  const d = parseDay(value);
  return d ? dateFormat.format(d) : '';
};

// « 14 h 32 », à la française.
export const formatClock = (ms) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())} h ${pad2(d.getMinutes())}`;
};

export const formatStamp = (ms) => `${stampFormat.format(new Date(ms))}, ${formatClock(ms)}`;

// 'HH:MM' devient « 01 h 30 ».
export const formatHour = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? `${m[1]} h ${m[2]}` : '';
};

export const formatCountdown = (seconds) => `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
