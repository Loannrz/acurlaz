// À PROPOS page (top key "À propos", start page of both CDJs): text on the
// left, photo on the right (public/img/about-portrait.jpg, royalty-free).
// Content: src/data/about.js (PLACEHOLDER text).
//
// CONTRACT (keep the work inside this file + src/data/about.js):
//   - reads: api.library.about ({ title, name, role, paragraphs, facts, photoUrl }),
//     api.library.image(url) (HTMLImageElement once loaded, else null: the page is
//     redrawn automatically when it arrives), api.deckInfo() (status bar)
//   - writes ONLY its own nav: api.setNav(...) (none today)
//   - a long biography is cut above the facts grid (maxLines, ellipsis)
//   - touch zones: api.region({ id, x, y, w, h, onTap }) inside draw().
//   - shared helpers: ../design.js
//
// Static page: drawn once, redrawn when the photo has loaded (frameRate 0 at rest).
import { registerPage } from '../registry.js';
import { C, L, SCREEN_W, rect, fill, text, titleBar, paragraph, statusBar, statusBarFps } from '../design.js';

const PHOTO_W = 336;
const PAD = 46;

registerPage('about', {
  frameRate: statusBarFps, // status bar (REMAIN, playhead) while the deck plays, else 0
  initialNav: () => ({}),

  draw(ctx, state, api) {
    const a = api.library.about;
    titleBar(ctx, { title: a.title, icon: 'info' });
    const body = rect(0, L.bodyY + L.gap, SCREEN_W, L.bodyH - L.gap);
    fill(ctx, body, C.panel);

    // photo on the right: sharp-cornered frame, cover crop, soft vignette
    const ph = rect(SCREEN_W - PHOTO_W, body.y, PHOTO_W, body.h);
    fill(ctx, ph, C.bg);
    const img = api.library.image(a.photoUrl);
    if (img) {
      const s = Math.max(ph.w / img.naturalWidth, ph.h / img.naturalHeight);
      const w = ph.w / s, h = ph.h / s;
      const sx = (img.naturalWidth - w) * 0.5, sy = (img.naturalHeight - h) * 0.3; // keep the face in frame
      ctx.drawImage(img, sx, sy, w, h, ph.x, ph.y, ph.w, ph.h);
      ctx.save();
      ctx.beginPath(); ctx.rect(ph.x, ph.y, ph.w, ph.h); ctx.clip();
      const g = ctx.createRadialGradient(ph.x + ph.w / 2, ph.y + ph.h * 0.42, ph.h * 0.35, ph.x + ph.w / 2, ph.y + ph.h * 0.42, ph.h * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = g; ctx.fillRect(ph.x, ph.y, ph.w, ph.h);
      ctx.restore();
    }
    fill(ctx, rect(ph.x - 3, ph.y, 3, ph.h), C.highlight); // blue accent edge

    // text on the left
    const x = PAD, maxW = ph.x - x - 40;
    let y = body.y + 34;
    text(ctx, a.role, x, y, { size: 16, weight: 500, baseline: 'top', color: C.highlight, letterSpacing: 3 });
    y += 30;
    text(ctx, a.name, x, y, { size: 64, weight: 300, baseline: 'top', color: C.text, letterSpacing: 4 });
    y += 84;
    fill(ctx, rect(x, y, 56, 3), C.highlight);
    y += 24;
    // repères: 2 x 2 grid pinned to the bottom of the panel; the biography stops
    // above it whatever its length (lines cut, the last one ends with an ellipsis)
    const facts = a.facts ?? [];
    const colW = maxW / 2, rowH = 52;
    const gy = body.y + body.h - 24 - rowH * Math.ceil(facts.length / 2);
    const LINE = 30;
    const textBottom = facts.length ? gy - 14 - 10 : body.y + body.h - 16;
    for (const p of a.paragraphs) {
      const lines = Math.floor((textBottom - y) / LINE);
      if (lines < 1) break;
      y = paragraph(ctx, p, x, y, maxW, { size: 20, lineHeight: LINE, color: C.textSoft, maxLines: lines }) + 8;
    }

    fill(ctx, rect(x, gy - 14, maxW, 1), '#3a3a3a');
    facts.forEach(([k, v], i) => {
      const fx = x + (i % 2) * colW, fy = gy + Math.floor(i / 2) * rowH;
      text(ctx, k, fx, fy, { size: 13, weight: 500, baseline: 'top', color: C.textDim, letterSpacing: 2 });
      text(ctx, v, fx, fy + 20, { size: 22, baseline: 'top', color: C.text, maxWidth: colW - 14 });
    });

    statusBar(ctx, api.deckInfo());
  },
});
