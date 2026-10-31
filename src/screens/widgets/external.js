// External links of the CDJ screens (LINK page, buttons of the DATES / FEAT
// info panels). A touch opens the address in a new tab, without giving the new
// page access to this one (noopener, noreferrer). Placeholders ('' or '#') and
// addresses that are not http(s) / mailto / tel open nothing: the caller shows
// "Lien à venir" instead (see linkButton below).
//
//   openExternal(url) -> true if a tab was asked for, false otherwise
//   isPending(url)    -> true for a placeholder / unusable address
//   linkButton(ctx, api, { id, x, y, w, h, label, url, pendingKey })
//     Draws a button (CDJ grey, blue while hovered) and registers its touch zone.
//     A touch opens `url`; if there is nothing to open, the label becomes
//     "Lien à venir" (kept in api.nav[pendingKey] until the page clears it, e.g.
//     when the selection changes: no timer, nothing moves by itself).
import { C, rect, fill, text } from '../design.js';

export const PENDING_LABEL = 'Lien à venir';
const ALLOWED = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeUrl(url) {
  const s = String(url ?? '').trim();
  if (!s || s === '#') return null;
  try {
    const u = new URL(s, location.href);
    return ALLOWED.has(u.protocol) ? u.href : null;
  } catch { return null; }
}
export const isPending = (url) => safeUrl(url) == null;

export function openExternal(url) {
  const href = safeUrl(url);
  if (!href) return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}

export function linkButton(ctx, api, { id, x, y, w, h, label, url, pendingKey = 'pendingLink' }) {
  const pending = api.nav[pendingKey] === id;
  const hover = api.hovered === id;
  const r = rect(x, y, w, h);
  fill(ctx, r, hover && !pending ? C.highlightDeep : C.button);
  ctx.strokeStyle = hover && !pending ? C.highlight : C.buttonBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5);
  const shown = pending ? PENDING_LABEL : label;
  const tw = text(ctx, shown, r.x + r.w / 2 - (pending ? 0 : 8), r.y + r.h / 2 + 1, { size: 15, weight: 500, align: 'center', color: pending ? C.textDim : C.buttonText, letterSpacing: 0.3, maxWidth: r.w - 34 });
  if (!pending) arrowOut(ctx, r.x + r.w / 2 + tw / 2 + 2, r.y + r.h / 2, 11, C.buttonText);
  api.region({ id, ...r, onTap: () => {
    if (openExternal(url)) { if (api.nav[pendingKey]) api.setNav({ [pendingKey]: null }); return; }
    api.setNav({ [pendingKey]: id });
  } });
  return r;
}

// "Opens elsewhere" mark: small arrow pointing up-right.
export function arrowOut(ctx, x, cy, size, color) {
  const s = size;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 1, cy + s / 2 - 1); ctx.lineTo(x + s - 1, cy - s / 2 + 1);
  ctx.moveTo(x + s * 0.35, cy - s / 2 + 1); ctx.lineTo(x + s - 1, cy - s / 2 + 1); ctx.lineTo(x + s - 1, cy + s * 0.15);
  ctx.stroke();
  ctx.restore();
}
