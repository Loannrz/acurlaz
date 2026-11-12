// Petits utilitaires d'affichage : échappement, typographie française, formats.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Typographie française : espace fine insécable avant ; ! ?, insécable avant :, dans « ».
export const fr = (s) =>
  String(s ?? '')
    .replace(/ ([?!;])/g, ' $1')
    .replace(/ :/g, ' :')
    .replace(/« /g, '« ')
    .replace(/ »/g, ' »');

export const t = (s) => esc(fr(s));

// Une URL valant '' ou '#' est un emplacement à remplir.
export const isLink = (u) => typeof u === 'string' && u.trim() !== '' && u.trim() !== '#';

export const pad2 = (n) => String(n).padStart(2, '0');

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

// 'HH:MM' devient « 01 h 30 »
export function fmtHour(hhmm) {
  const [h, m] = String(hhmm || '').split(':');
  if (h === undefined || m === undefined) return '';
  return `${h} h ${m}`;
}

const dfWeek = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const dfMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
export function dateParts(d) {
  return { day: pad2(d.getDate()), week: dfWeek.format(d), month: dfMonth.format(d) };
}

export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// Valeur ms ou s d'un jeton CSS, en secondes.
export function tokenSeconds(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v.endsWith('ms')) return parseFloat(v) / 1000;
  if (v.endsWith('s')) return parseFloat(v);
  return fallback;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isMobile = () => window.matchMedia('(max-width: 899px)').matches;

// Pictogrammes SVG (jamais de caractères pour les flèches et symboles de lecture).
const svg = (vb, w, h, inner) =>
  `<svg viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${inner}</svg>`;
export const icons = {
  play: svg('0 0 24 24', 24, 24, '<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  pause: svg('0 0 24 24', 24, 24, '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z" fill="currentColor"/>'),
  arrow: svg('0 0 12 12', 12, 12, '<path d="M3 9l6-6M4 3h5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>'),
  close: svg('0 0 24 24', 24, 24, '<path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>'),
};
