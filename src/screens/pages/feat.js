// FEAT page (top key "Feat"): DJs the artist has played with (FAKE names,
// src/data/feat.js). Look: BROWSE track list of the manual (p19): category
// column, column header row (touch = sort), alternating rows, blue highlighted
// row, info panel on the right (like the SOURCE screen).
//
// CONTRACT (keep the work inside this file + src/data/feat.js):
//   - reads: api.library.feat, api.deckInfo()
//   - writes ONLY its own nav: api.setNav({ cat, sort, dir, highlight, scroll, pendingLink })
//   - info panel: button "Instagram" (instagramUrl, the artist's): a touch opens
//     the link in a new tab (../widgets/external.js); a placeholder ('#') shows
//     "Lien à venir" until another artist is chosen.
//   - touch zones: api.region(...) inside draw(); drags in onPointer(e, api)
//   - shared helpers: ../design.js
import { DEVICE } from '../../utils/device.js';
import { registerPage } from '../registry.js';
import { C, L, SIZE, SCREEN_W, rect, fill, text, paragraph, titleBar, sideColumn, columnHeader, layoutColumns, rowBackground, statusBar, scrollBar, scrollAmount, emptyMessage, statusBarFps } from '../design.js';
import { linkButton } from '../widgets/external.js';

const CATS = [
  { id: 'all', label: 'TOUS', icon: 'person' },
  { id: 'house', label: 'HOUSE', icon: 'note' },
  { id: 'techno', label: 'TECHNO', icon: 'note' },
  { id: 'afro', label: 'AFRO', icon: 'note' },
  { id: 'disco', label: 'DISCO', icon: 'note' },
  { id: 'breaks', label: 'BREAKS', icon: 'note' },
];
const COLUMNS = [
  { key: 'n', label: '#', f: 0.09 },
  { key: 'name', label: 'NOM DE SCÈNE', f: 0.32 },
  { key: 'style', label: 'STYLE', f: 0.23 },
  { key: 'country', label: 'PAYS', f: 0.16 },
  { key: 'year', label: 'ANNÉE', f: 0.11, align: 'right' },
  { key: 'sets', label: 'SETS', f: 0.09, align: 'right' },
];
const SORTABLE = ['name', 'style', 'country', 'year', 'sets'];
const INFO_W = 250;
const metrics = (r) => ({ visible: Math.max(1, Math.floor((r.h - L.colHeaderH) / L.rowH)), rowsY: r.y + L.colHeaderH });
const listRect = () => rect(L.sideW + L.gap, L.bodyY + L.gap, SCREEN_W - L.sideW - L.gap - INFO_W - L.gap, L.bodyH - L.gap);

function view(feat, nav) {
  const cat = nav.cat ?? 'all';
  let rows = feat.filter((f) => cat === 'all' || f.cat === cat);
  if (nav.sort) {
    const k = nav.sort, d = nav.dir === 'desc' ? -1 : 1;
    rows = rows.slice().sort((a, b) => (typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(b[k], 'fr')) * d);
  }
  return rows;
}

registerPage('feat', {
  frameRate: statusBarFps, // status bar (REMAIN, playhead) while the deck plays, else 0
  initialNav: () => ({ cat: 'all', sort: null, dir: 'asc', highlight: null, scroll: 0 }),

  draw(ctx, state, api) {
    const nav = api.nav;
    const rows = view(api.library.feat, nav);
    titleBar(ctx, { title: 'FEAT', icon: 'person' });
    const catRects = sideColumn(ctx, rect(0, L.bodyY + L.gap, L.sideW, L.bodyH - L.gap), CATS, CATS.findIndex((c) => c.id === (nav.cat ?? 'all')), { tileH: 54 });
    CATS.forEach((c, i) => api.region({ id: `cat-${c.id}`, ...catRects[i], onTap: () => api.setNav({ cat: c.id, scroll: 0, highlight: null, pendingLink: null }) }));

    const r = listRect();
    const cols = layoutColumns(rect(r.x, r.y, r.w - 8, r.h), COLUMNS);
    columnHeader(ctx, rect(r.x, r.y, r.w, L.colHeaderH), cols.map((c) => ({
      ...c,
      label: c.key === 'name' ? `NOM DE SCÈNE  [${String(rows.length).padStart(4, '0')}]` : c.label,
      sort: c.key === 'n' ? (nav.sort ? null : 'active') : nav.sort === c.key ? 'active' : 'on',
    })));
    cols.forEach((c) => {
      const hit = rect(c.x, r.y, c.w, L.colHeaderH);
      if (c.key === 'n') api.region({ id: 'h-n', ...hit, onTap: () => api.setNav({ sort: null, dir: 'asc', scroll: 0 }) });
      else api.region({ id: `h-${c.key}`, ...hit, onTap: () => api.setNav((p) => ({ ...p, sort: c.key, dir: p.sort === c.key && p.dir !== 'desc' ? 'desc' : 'asc', scroll: 0 })) });
    });

    const { visible, rowsY } = metrics(r);
    if (!rows.length) emptyMessage(ctx, rect(r.x, rowsY, r.w, r.h - L.colHeaderH), 'Aucun artiste dans cette catégorie');
    const scroll = Math.max(0, Math.min(Math.max(0, rows.length - visible), nav.scroll ?? 0));
    const c = Object.fromEntries(cols.map((k) => [k.key, k]));
    let selected = null;
    for (let k = 0; k < visible && scroll + k < rows.length; k++) {
      const i = scroll + k;
      const f = rows[i];
      const hl = nav.highlight === f.name;
      if (hl) selected = f;
      const row = rect(r.x, rowsY + k * L.rowH, r.w - 8, L.rowH);
      rowBackground(ctx, row, i, { highlighted: hl });
      const mid = row.y + row.h / 2 + 1;
      const col = C.text;
      text(ctx, String(i + 1).padStart(3, '0'), c.n.x + 8, mid, { size: SIZE.rowSmall, color: col });
      text(ctx, f.name, c.name.x + 8, mid, { size: SIZE.rowSmall, color: col, maxWidth: c.name.w - 14 });
      text(ctx, f.style, c.style.x + 8, mid, { size: SIZE.rowSmall, color: hl ? C.text : C.textSoft, maxWidth: c.style.w - 14 });
      text(ctx, f.country, c.country.x + 8, mid, { size: SIZE.rowSmall, color: hl ? C.text : C.textSoft, maxWidth: c.country.w - 14 });
      text(ctx, String(f.year), c.year.x + c.year.w - 8, mid, { size: SIZE.rowSmall, align: 'right', color: col });
      text(ctx, String(f.sets), c.sets.x + c.sets.w - 8, mid, { size: SIZE.rowSmall, align: 'right', color: col });
      api.region({ id: `row-${i}`, ...row, onTap: () => { if (api.nav.highlight !== f.name || api.nav.pendingLink) api.setNav({ highlight: f.name, pendingLink: null }); } });
    }
    scrollBar(ctx, rect(r.x + r.w - 6, rowsY, 6, visible * L.rowH), scroll, visible, rows.length);
    drawInfo(ctx, selected ?? api.library.feat.find((f) => f.name === nav.highlight) ?? null, api.library.feat.length, api);
    statusBar(ctx, api.deckInfo());
  },

  onPointer(e, api) {
    if (e.type === 'pointerdown') { api._featAcc = 0; return; }
    const scrolling = e.type === 'scroll';
    if (!scrolling && (e.type !== 'pointermove' || !e.dragging)) return;
    const { visible } = metrics(listRect());
    const n = view(api.library.feat, api.nav).length;
    api._featAcc = (api._featAcc ?? 0) + (scrolling ? scrollAmount(e, L.rowH, visible * L.rowH) : -e.dy);
    const steps = Math.trunc(api._featAcc / L.rowH);
    if (!steps) return;
    api._featAcc -= steps * L.rowH;
    const cur = api.nav.scroll ?? 0;
    const scroll = Math.max(0, Math.min(Math.max(0, n - visible), cur + steps));
    if (scroll !== cur) api.setNav({ scroll });
  },
});

function drawInfo(ctx, f, total, api) {
  const info = rect(SCREEN_W - INFO_W, L.bodyY + L.gap, INFO_W, L.bodyH - L.gap);
  fill(ctx, info, C.panel);
  if (!f) {
    text(ctx, 'ARTISTES', info.x + 12, info.y + 24, { size: SIZE.label, color: C.textDim, letterSpacing: 0.5 });
    text(ctx, String(total), info.x + 12, info.y + 62, { size: 34, weight: 300, color: C.text });
    paragraph(ctx, DEVICE.touchFirst ? 'Touchez une ligne pour voir le détail du set partagé, ou un en-tête pour trier.' : 'Sélectionnez une ligne pour voir le détail du set partagé, ou un en-tête pour trier.', info.x + 12, info.y + 96, info.w - 24, { size: SIZE.header + 3, color: C.textDim, lineHeight: 20 });
    return;
  }
  text(ctx, f.name, info.x + 12, info.y + 28, { size: 22, weight: 500, color: C.text, maxWidth: info.w - 24 });
  text(ctx, f.style, info.x + 12, info.y + 54, { size: SIZE.value - 1, color: C.green, maxWidth: info.w - 24 });
  const rows = [['Pays', f.country], ['Dernier set', String(f.year)], ['Sets ensemble', String(f.sets)]];
  rows.forEach(([k, v], i) => {
    const y = info.y + 76 + i * 42;
    text(ctx, k, info.x + 12, y + 21, { size: SIZE.label, color: C.textDim });
    text(ctx, v, info.x + info.w - 12, y + 19, { size: SIZE.value, align: 'right', color: C.text, maxWidth: 140 });
    fill(ctx, rect(info.x + 8, y + 40, info.w - 16, 1), '#3a3a3a');
  });
  const y = info.y + 76 + rows.length * 42 + 6;
  text(ctx, 'Dernier lieu', info.x + 12, y + 8, { size: SIZE.label, color: C.textDim });
  const y2 = paragraph(ctx, f.where, info.x + 12, y + 22, info.w - 24, { size: SIZE.header + 4, color: C.text, lineHeight: 20, maxLines: 2 });
  if (f.note) paragraph(ctx, f.note, info.x + 12, y2 + 10, info.w - 24, { size: SIZE.header + 2, color: C.textDim, lineHeight: 18, maxLines: 4 });
  const bh = 40;
  linkButton(ctx, api, { id: 'artist-instagram', x: info.x + 12, y: info.y + info.h - bh - 12, w: info.w - 24, h: bh, label: 'Instagram', url: f.instagramUrl });
}
