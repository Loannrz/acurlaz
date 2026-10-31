// DATES page (top key "Dates"): upcoming gigs (FAKE data, src/data/dates.js).
// Look: BROWSE list of the manual (p19: column header, blue highlighted row,
// scroll bar) + right info panel of the SOURCE screen (p18) for the details of
// the highlighted date. Nothing moves by itself (frameRate: status bar only).
//
// CONTRACT (keep the work inside this file + src/data/dates.js):
//   - reads: api.library.dates ([{ date, when (Date), venue, city, address,
//     warmup, set, end, doors, ticketUrl, instagramUrl }], sorted), api.deckInfo()
//   - writes ONLY its own nav: api.setNav({ highlight, scroll, pendingLink })
//   - info panel: buttons "Billetterie" (ticketUrl) and "Instagram" (instagramUrl,
//     the club's): a touch opens the link in a new tab (../widgets/external.js);
//     a placeholder ('#') shows "Lien à venir" until another date is chosen.
//   - touch zones: api.region({ id, x, y, w, h, onTap }) inside draw(); drags in
//     onPointer(e, api). Zones only work while the screen is focused.
//   - shared helpers: ../design.js
import { registerPage } from '../registry.js';
import { C, L, SIZE, SCREEN_W, rect, fill, text, titleBar, sideColumn, rowBackground, paragraph, statusBar, scrollBar, scrollAmount, emptyMessage, statusBarFps, columnHeader, layoutColumns } from '../design.js';
import { linkButton } from '../widgets/external.js';

const DAYS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const DAYS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['JAN', 'FÉV', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const ROW_H = L.rowH + 4;
const COLUMNS = [
  { key: 'date', label: 'DATE', f: 0.2 },
  { key: 'venue', label: 'LIEU', f: 0.31 },
  { key: 'city', label: 'VILLE', f: 0.26 },
  { key: 'set', label: 'PASSAGE', f: 0.23 },
];
const range = (d) => (d.end ? `${d.set} – ${d.end}` : d.set);

function geometry() {
  const listX = L.sideW + L.gap + 4;
  const list = rect(listX, L.bodyY + L.gap, SCREEN_W - listX - L.infoW - L.gap - 4, L.bodyH - L.gap);
  const rowsY = list.y + L.colHeaderH;
  const visible = Math.floor((list.h - L.colHeaderH) / ROW_H);
  return { list, rowsY, visible };
}

registerPage('dates', {
  frameRate: statusBarFps, // status bar (REMAIN, playhead) while the deck plays, else 0
  initialNav: () => ({ highlight: 0, scroll: 0 }),

  draw(ctx, state, api) {
    const nav = api.nav;
    const dates = api.library.dates;
    titleBar(ctx, { title: 'PROCHAINES DATES', icon: 'calendar' });
    sideColumn(ctx, rect(0, L.bodyY + L.gap, L.sideW, L.bodyH - L.gap), [{ label: 'À VENIR', icon: 'calendar' }], 0, { tileH: 62 });

    const { list, rowsY, visible } = geometry();
    fill(ctx, list, C.panel);
    columnHeader(ctx, rect(list.x, list.y, list.w, L.colHeaderH), layoutColumns(list, COLUMNS));
    if (!dates.length) emptyMessage(ctx, list, 'Aucune date annoncée');
    const cols = layoutColumns(rect(list.x, 0, list.w - 10, 0), COLUMNS);
    const scroll = Math.max(0, Math.min(Math.max(0, dates.length - visible), nav.scroll ?? 0));
    for (let k = 0; k < visible && scroll + k < dates.length; k++) {
      const i = scroll + k;
      const d = dates[i];
      const r = rect(list.x, rowsY + k * ROW_H, list.w - 10, ROW_H);
      const hl = nav.highlight === i;
      rowBackground(ctx, r, i, { highlighted: hl });
      const cy = r.y + r.h / 2 + 1;
      const dim = hl ? C.text : C.textDim;
      const dw = text(ctx, `${String(d.when.getDate()).padStart(2, "0")} ${MONTHS[d.when.getMonth()]}`, cols[0].x + 10, cy, { size: SIZE.rowSmall, weight: 500, color: C.text });
      text(ctx, DAYS[d.when.getDay()], cols[0].x + 10 + dw + 8, cy + 1, { size: SIZE.header, color: dim });
      text(ctx, d.venue, cols[1].x + 10, cy, { size: SIZE.rowSmall, color: C.text, maxWidth: cols[1].w - 18 });
      text(ctx, d.city, cols[2].x + 10, cy, { size: SIZE.rowSmall, color: dim, maxWidth: cols[2].w - 18 });
      text(ctx, range(d), cols[3].x + 10, cy, { size: SIZE.rowSmall, color: hl ? C.text : C.textSoft, maxWidth: cols[3].w - 14 });
      api.region({ id: `date-${i}`, ...r, onTap: () => { if (api.nav.highlight !== i || api.nav.pendingLink) api.setNav({ highlight: i, pendingLink: null }); } });
    }
    scrollBar(ctx, rect(list.x + list.w - 8, rowsY, 8, visible * ROW_H), scroll, visible, dates.length);

    // details of the highlighted date (info panel of the SOURCE screen)
    const info = rect(SCREEN_W - L.infoW, L.bodyY + L.gap, L.infoW, L.bodyH - L.gap);
    fill(ctx, info, C.panel);
    const d = dates[nav.highlight];
    if (d) {
      const w = d.when;
      const rows = [
        ['Date', `${DAYS_LONG[w.getDay()]} ${w.getDate()} ${MONTHS_LONG[w.getMonth()]}`],
        ['Lieu', d.venue],
        ['Ville', d.city],
        ['Passage', range(d)],
        ['Warm-up', d.warmup],
        ['Ouverture', d.doors ?? '—'],
      ];
      rows.forEach(([k, v], i) => {
        const y = info.y + 6 + i * 42;
        text(ctx, k, info.x + 12, y + 21, { size: SIZE.label, color: C.textDim });
        text(ctx, v, info.x + info.w - 12, y + 19, { size: SIZE.value, align: 'right', color: C.text, maxWidth: info.w - 100 });
        fill(ctx, rect(info.x + 8, y + 40, info.w - 16, 1), '#3a3a3a');
      });
      const y = info.y + 6 + rows.length * 42;
      text(ctx, 'Adresse', info.x + 12, y + 21, { size: SIZE.label, color: C.textDim });
      paragraph(ctx, d.address, info.x + 12, y + 44, info.w - 24, { size: SIZE.value - 1, lineHeight: 23, color: C.text, maxLines: 3 });
      // links: ticketing, Instagram of the club
      const bh = 40, by = info.y + info.h - bh - 12, bw = Math.floor((info.w - 24 - 8) / 2);
      linkButton(ctx, api, { id: 'ticket', x: info.x + 12, y: by, w: bw, h: bh, label: 'Billetterie', url: d.ticketUrl });
      linkButton(ctx, api, { id: 'club-instagram', x: info.x + 12 + bw + 8, y: by, w: info.w - 24 - bw - 8, h: bh, label: 'Instagram', url: d.instagramUrl });
    }
    statusBar(ctx, api.deckInfo());
  },

  onPointer(e, api) {
    if (e.type === 'pointerdown') { api._datesAcc = 0; return; }
    const scrolling = e.type === 'scroll';
    if (!scrolling && (e.type !== 'pointermove' || !e.dragging)) return;
    const { visible } = geometry();
    const max = Math.max(0, api.library.dates.length - visible);
    api._datesAcc = (api._datesAcc ?? 0) + (scrolling ? scrollAmount(e, ROW_H, visible * ROW_H) : -e.dy);
    const steps = Math.trunc(api._datesAcc / ROW_H);
    if (!steps) return;
    api._datesAcc -= steps * ROW_H;
    api.setNav((prev) => {
      const scroll = Math.max(0, Math.min(max, (prev.scroll ?? 0) + steps));
      return scroll === (prev.scroll ?? 0) ? prev : { ...prev, scroll };
    });
  },
});
