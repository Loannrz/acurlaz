// Shared BROWSE screen (manual p19), used by the SOURCES page (inside a USB
// key: TRACK / ALBUM / BPM / KEY / PLAYLIST views) and the LINK page. Geometry
// measured on the native 1280 x 720 screenshot of the manual (x * 0.8; body
// rows 48 -> 40 px). Drawing helpers in ./cdj.js. Shared file: change it only
// for something both pages need.
//
//   const f = browseFrame(ctx, api, { title, icon, back, device, category, buttons,
//                                     onBack, onCategory, onDevice })
//     -> { list: rect, back: rect|null }
//     Draws the device tile, the title bar (back arrow box, folder / list icon,
//     title, view buttons), the category column and the status bar. Registers
//     the touch zones of the back box (onBack()), of the view buttons (below;
//     buttons: which ones, default ['preview', 'font', 'info']: only those that
//     change something in the view drawn), of the categories (onCategory(id))
//     and of the USB tile at the top left (onDevice(): back to the key list).
//     category: id of the selected category (CATEGORIES), or null.
//   drawTrackList(ctx, f.list, tracks, api, { navKey, from, sort })
//     Column header (touch a title to sort, again to reverse), rows (PREVIEW =
//     real mini waveform + artwork, #, TRACK, ARTIST, BPM, KEY), highlighted row
//     in blue, loaded track in green with a play mark, LOAD button, scroll bar,
//     INFO panel. Nav state in api.nav[navKey]:
//       { highlight: track id | null, armed: bool, lastTap: ms, scroll: px, sort }
//     sort ({ key, dir }): order of THIS list (BPM / KEY views); its header taps
//     are then kept in nav[navKey].sort instead of the shared view setting.
//   drawFolderList(ctx, f.list, items, api, { navKey, header, onOpen, icon,
//                                             openOnTap, trailing, emptyText })
//     Folder rows (albums, playlists, links): items [{ id, name, detail, dim }].
//     1st touch highlights, 2nd touch (or the chevron) opens: onOpen(index);
//     openOnTap: the 1st touch opens too (links). trailing: 'chevron' | 'arrow'
//     (opens elsewhere). Nav: { highlight, scroll }.
//   listPointer(e, api, { navKey })  drag to scroll the list drawn last with that
//     navKey (call it from the page's onPointer). trackListPointer = alias.
//   resetList(navKey) -> nav patch that clears highlight / scroll / LOAD.
//
// View settings, shared by both pages of a CDJ, in api.navOf('browse'):
//   { preview: bool (PREVIEW column: off by default on phones / tablets, where
//     each analysis decodes a whole file; on a PC only the visible rows are
//     analysed, one file at a time), font: 0 | 1 | 2 (font size, rows 32 / 40 /
//     52 px), info: bool (INFO panel), sort: { key, dir } (key: 'number' | 'title'
//     | 'artist' | 'bpm' | 'key', dir 1 | -1) }
// Touch, as on the CDJ: 1st tap highlights a track, a tap on the highlighted
// track shows [LOAD], a tap on LOAD loads it into this deck (player page); a
// quick double tap loads directly.
import { L, SCREEN_W, SCREEN_H, rect, statusBar, formatBpm, formatTime } from '../design.js';
import { DEVICE } from '../../utils/device.js';
import { waveformFor } from '../../audio/waveform.js';
import { K, kText, measure, box, strokeBox, icon, deviceTile, checker, artwork, previewWave } from './cdj.js';
import { arrowOut } from './external.js';

// Category column (the 8 tiles of the rekordbox browser). TRACK / ALBUM / BPM /
// KEY / PLAYLIST are views of the SOURCES page; FEAT, DATES and À PROPOS open
// those pages (src/screens/pages/sources.js decides, through onCategory).
export const CATEGORIES = [
  { id: 'track', label: 'TRACK', icon: 'note' },
  { id: 'feat', label: 'FEAT', icon: 'artist' },
  { id: 'album', label: 'ALBUM', icon: 'album' },
  { id: 'bpm', label: 'BPM', icon: 'bpm' },
  { id: 'key', label: 'KEY', icon: 'key' },
  { id: 'playlist', label: 'PLAYLIST', icon: 'playlist' },
  { id: 'dates', label: 'DATES', icon: 'date' },
  { id: 'about', label: 'À PROPOS', icon: 'info' },
];

// Layout (canvas px). Title band = L.titleH, status bar = L.statusH (design.js).
export const B = {
  titleH: L.titleH, // 72: bar 0..70 + 2 px black line
  barH: L.titleH - 2,
  sideW: 72, // device tile / category column
  listX: 74, // after the 2 px edge
  headerH: 48, // column header row
  bodyY: L.titleH,
  get bodyH() { return SCREEN_H - L.titleH - L.statusH; }, // 457
  infoW: 330, // INFO panel
};
export const FONT_SIZES = [
  { rowH: 32, size: 16 },
  { rowH: 40, size: 20 }, // default (manual)
  { rowH: 52, size: 25 },
];
// Track columns, fractions of the list width (manual: 240 / 78 / 325 / 345 / 110 / 90 of 1188 px).
const COLS = [
  { key: 'preview', label: 'PREVIEW', f: 240 },
  { key: 'number', label: '#', f: 78, sort: true },
  { key: 'title', label: 'TRACK', f: 325, sort: true },
  { key: 'artist', label: 'ARTIST', f: 345, sort: true },
  { key: 'bpm', label: 'BPM', f: 110, sort: true },
  { key: 'key', label: 'KEY', f: 90, sort: true },
];
const DOUBLE_TAP_MS = 380;
const SCROLL_W = 4;
const DEFAULT_VIEW = { preview: !DEVICE.mobile, font: 1, info: false, sort: { key: 'number', dir: 1 } };

export function browseView(api) {
  const v = api.navOf('browse');
  return { ...DEFAULT_VIEW, ...v, sort: { ...DEFAULT_VIEW.sort, ...(v.sort ?? {}) } };
}
const setView = (api, patch) => api.setNavOf('browse', (prev) => ({ ...DEFAULT_VIEW, ...prev, ...patch }));

export const resetList = (navKey = 'list') => ({ [navKey]: { highlight: null, armed: false, lastTap: 0, scroll: 0 } });

// --- frame ---------------------------------------------------------------
export function browseFrame(ctx, api, opts = {}) {
  const { title = '', icon: titleIcon = 'listbox', back = true, device = 0, category = 'track', onBack = null, onCategory = null, onDevice = null, buttons = ['preview', 'font', 'info'] } = opts;
  const view = browseView(api);
  // title band
  box(ctx, 0, 0, SCREEN_W, B.titleH, '#000');
  box(ctx, B.sideW, 0, SCREEN_W - B.sideW, B.barH, K.bar);
  const src = api.library.sources[device];
  deviceTile(ctx, 0, 0, B.sideW, B.barH, { kind: 'usb', label: 'USB', color: K.device[(src?.index ?? device) % K.device.length], player: api.player });
  if (onDevice) {
    if (api.hovered === 'device') strokeBox(ctx, 1, 1, B.sideW - 2, B.barH - 2, K.highlight, 2);
    api.region({ id: 'device', x: 0, y: 0, w: B.sideW, h: B.barH, onTap: () => onDevice() });
  }
  // back arrow box (manual: 120..170 x 20..70)
  let backRect = null;
  let x = 96;
  if (back) {
    backRect = rect(96, 16, 40, 40);
    box(ctx, backRect.x, backRect.y, backRect.w, backRect.h, K.bar);
    strokeBox(ctx, backRect.x, backRect.y, backRect.w, backRect.h, K.backBorder, 1);
    icon(ctx, 'back', backRect.x + 20, backRect.y + 20, 24, K.label);
    if (onBack) api.region({ id: 'back', x: 84, y: 0, w: 64, h: B.barH, onTap: () => onBack() });
    x = 148;
  } else x = 96;
  // buttons (manual: PREVIEW 894..1007, font 1019..1131, INFO 1143..1280)
  // (only the buttons that change something in this view are drawn)
  const bPrev = rect(715, 0, 91, B.barH), bFont = rect(815, 0, 90, B.barH), bInfo = rect(914, 0, 110, B.barH);
  const has = (b) => buttons.includes(b);
  if (has('preview')) {
    if (view.preview) checker(ctx, bPrev.x, bPrev.y, bPrev.w, bPrev.h, K.highlight, K.highlightDeep, 3);
    else checker(ctx, bPrev.x, bPrev.y, bPrev.w, bPrev.h, K.checkerDark, K.checkerLight, 3);
    box(ctx, bPrev.x + 23, B.barH - 2, 45, 2, K.underline);
    kText(ctx, 'PREVIEW', bPrev.x + bPrev.w / 2, 34, { size: 15, weight: 700, align: 'center', color: view.preview ? K.text : K.label, letterSpacing: 0.3 });
    api.region({ id: 'btn-preview', ...bPrev, onTap: () => setView(api, { preview: !view.preview }) });
  }
  if (has('font')) {
    checker(ctx, bFont.x, bFont.y, bFont.w, bFont.h, K.checkerDark, K.checkerLight, 3);
    box(ctx, bFont.x + 23, B.barH - 2, 45, 2, K.underline);
    const sizes = [11, 17, 26], xs = [bFont.x + 24, bFont.x + 45, bFont.x + 67];
    sizes.forEach((s, i) => {
      const active = i === view.font;
      kText(ctx, 'A', xs[i], 38, { size: s, weight: 500, align: 'center', baseline: 'alphabetic', color: active ? K.text : '#5e5e5e' });
      if (active) box(ctx, xs[i] - s * 0.38, 43, s * 0.76, 2, K.text);
    });
    api.region({ id: 'btn-font', ...bFont, onTap: () => setView(api, { font: (view.font + 1) % FONT_SIZES.length }) });
  }
  if (has('info')) {
    box(ctx, bInfo.x + 0, 24, 24, 24, K.panel);
    icon(ctx, view.info ? 'infoArrowOpen' : 'infoArrow', bInfo.x + 12, 36, 12, view.info ? K.text : K.label);
    kText(ctx, 'INFO', bInfo.x + 36, 36, { size: 18, align: 'left', color: view.info ? K.text : K.label, letterSpacing: 0.4 });
    api.region({ id: 'btn-info', ...bInfo, onTap: () => setView(api, { info: !view.info }) });
  }
  const titleRight = has('preview') ? bPrev.x : has('font') ? bFont.x : has('info') ? bInfo.x : SCREEN_W - 12;
  // title (icon + name)
  if (titleIcon) { icon(ctx, titleIcon, x + 9, 36, 19, K.text); x += 28; }
  kText(ctx, title, x, 37, { size: 23, color: K.text, maxWidth: titleRight - x - 12 });

  // category column (manual: 0..89, tiles of 67 px + 1 px black)
  const colY = B.bodyY, colH = B.bodyH;
  box(ctx, 0, colY, B.listX, colH, K.sideEdge);
  const n = CATEGORIES.length;
  const pitch = colH / n;
  CATEGORIES.forEach((c, i) => {
    const ty = Math.round(colY + 1 + i * pitch), th = Math.round(colY + 1 + (i + 1) * pitch) - ty - 1;
    const sel = c.id === category;
    const hov = !sel && !!onCategory && api.hovered === `cat-${c.id}`;
    const bg = sel ? K.tileSelected : hov ? K.tileHover : K.tile;
    box(ctx, 0, ty, B.sideW - 3, th, bg);
    const col = sel ? K.green : hov ? K.text : K.tileIcon;
    icon(ctx, c.icon, (B.sideW - 3) / 2, ty + th * 0.37, th * 0.47, col, { bg });
    kText(ctx, c.label, (B.sideW - 3) / 2, ty + th * 0.8, { size: c.label.length > 7 ? 11 : 12.5, align: 'center', color: sel ? K.green : K.tileText, letterSpacing: c.label.length > 7 ? 0 : 0.6, maxWidth: B.sideW - 5 });
    box(ctx, 0, ty + th, B.sideW - 3, 1, '#000');
    if (onCategory) api.region({ id: `cat-${c.id}`, x: 0, y: ty, w: B.sideW - 3, h: th, onTap: () => onCategory(c.id) });
  });
  // thin strip on the right edge of the column (all 8 categories are shown: no thumb)
  box(ctx, B.sideW - 3, colY, 3, colH, K.catStrip);

  statusBar(ctx, api.deckInfo());
  return { list: rect(B.listX, B.bodyY, SCREEN_W - B.listX, B.bodyH), back: backRect };
}

// --- list geometry (shared by draw and drag) --------------------------------
const geometry = new Map(); // `${unit}|${page}|${navKey}` -> { area: rect, content, view }
const geoKey = (api, navKey) => `${api.unit}|${api.state.page}|${navKey}`;
const clampScroll = (s, content, view) => Math.max(0, Math.min(Math.max(0, content - view), s || 0));

export function listPointer(e, api, { navKey = 'list' } = {}) {
  const g = geometry.get(geoKey(api, navKey));
  if (!g) return;
  if (e.type === 'pointerdown') {
    const a = g.area;
    api._dragList = e.x >= a.x && e.x < a.x + a.w && e.y >= a.y && e.y < a.y + a.h ? navKey : null;
    return;
  }
  if (e.type === 'pointerup' || e.type === 'pointercancel') { api._dragList = null; return; }
  if (e.type === 'scroll') {
    const a = g.area;
    if ((e.source === 'wheel' || e.source === 'inertia') && !(e.x >= a.x && e.x < a.x + a.w && e.y >= a.y && e.y < a.y + a.h)) return;
    if (g.content <= g.view) return;
    const rowH = g.rowH || 40;
    const dy = (e.scrollY || 0) + (e.lines || 0) * rowH + (e.page || 0) * Math.max(rowH, Math.floor(g.view / rowH - 1) * rowH);
    if (!dy) return;
    api.setNav((prev) => {
      const n = prev[navKey] ?? {};
      const scroll = clampScroll((n.scroll ?? 0) + dy, g.content, g.view);
      return scroll === (n.scroll ?? 0) ? prev : { ...prev, [navKey]: { ...n, scroll } };
    });
    return;
  }
  if (e.type !== 'pointermove' || !e.dragging || api._dragList !== navKey || !e.dy) return;
  if (g.content <= g.view) return;
  api.setNav((prev) => {
    const n = prev[navKey] ?? {};
    const scroll = clampScroll((n.scroll ?? 0) - e.dy, g.content, g.view);
    return scroll === (n.scroll ?? 0) ? prev : { ...prev, [navKey]: { ...n, scroll, armed: false } };
  });
}
export const trackListPointer = listPointer;

function scrollBar(ctx, x, y, h, scroll, content, view) {
  if (content <= view) return; // nothing to scroll: no bar
  box(ctx, x, y, SCROLL_W, h, K.scrollTrack);
  const th = content > view ? Math.max(18, (h * view) / content) : h;
  const ty = content > view ? y + ((h - th) * scroll) / (content - view) : y;
  box(ctx, x, ty, SCROLL_W, th, K.scrollThumb);
}

function layout(r, cols) {
  const total = cols.reduce((a, c) => a + c.f, 0);
  let x = r.x;
  return cols.map((c, i) => {
    const w = i === cols.length - 1 ? r.x + r.w - x : Math.round((c.f / total) * r.w);
    const out = { ...c, x, w };
    x += w;
    return out;
  });
}

// BPM of a track: detected on the audio once analysed, else the manifest value
// (the same value as the player page and the status bar).
const trackBpm = (t) => waveformFor(t?.url)?.bpm ?? t?.bpm ?? null;
const keyRank = (k) => { const m = /^(\d+)([AB])$/i.exec(k || ''); return m ? Number(m[1]) * 2 + (m[2].toUpperCase() === 'B' ? 1 : 0) : 999; };
function sortTracks(tracks, sort) {
  const rows = tracks.map((t, i) => ({ t, n: i + 1 }));
  const d = sort.dir === -1 ? -1 : 1;
  const by = {
    number: (a, b) => a.n - b.n,
    title: (a, b) => a.t.title.localeCompare(b.t.title, 'fr', { sensitivity: 'base' }),
    artist: (a, b) => a.t.artist.localeCompare(b.t.artist, 'fr', { sensitivity: 'base' }) || a.n - b.n,
    bpm: (a, b) => (trackBpm(a.t) ?? 0) - (trackBpm(b.t) ?? 0) || a.n - b.n,
    key: (a, b) => keyRank(a.t.key) - keyRank(b.t.key) || a.n - b.n,
  }[sort.key] ?? ((a, b) => a.n - b.n);
  return rows.sort((a, b) => d * by(a, b));
}
// The order of a list is FROZEN while it stays on screen: the detected BPM of
// the rows arrives with the PREVIEW analyses during the display, and re-sorting
// then would swap rows under the finger (and the order TRACK SEARCH captured).
// It is sorted again when the list is shown anew (another view or page drawn in
// between: api.lastDraw is the time of the previous redraw of this screen) or
// when its sort or its tracks change.
const frozen = new Map(); // unit -> { sig, ids, drawnAt }
function listOrder(api, tracks, sort, navKey) {
  const sig = `${api.state.page}|${navKey}|${sort.key}|${sort.dir}|${tracks.map((t) => t.id).join(',')}`;
  let f = frozen.get(api.unit);
  if (!f || f.sig !== sig || f.drawnAt !== api.lastDraw) {
    f = { sig, ids: sortTracks(tracks, sort).map((x) => x.t.id), drawnAt: 0 };
    frozen.set(api.unit, f);
  }
  f.drawnAt = api.now;
  const byId = new Map(tracks.map((t, i) => [t.id, { t, n: i + 1 }]));
  return f.ids.map((id) => byId.get(id));
}

// --- track list ---------------------------------------------------------------
export function drawTrackList(ctx, r, tracks, api, { navKey = 'list', from = api.state.page, sort: listSort = null } = {}) {
  const view = browseView(api);
  const fs = FONT_SIZES[view.font] ?? FONT_SIZES[1];
  const nav = api.nav[navKey] ?? {};
  const setNav = (patch) => api.setNav((prev) => ({ ...prev, [navKey]: { ...(prev[navKey] ?? {}), ...patch } }));
  // order: this list's own (BPM / KEY views), else the shared view setting
  const sort = listSort ? { ...listSort, ...(nav.sort ?? {}) } : view.sort;
  const setSort = (s) => (listSort ? setNav({ sort: s, scroll: 0 }) : setView(api, { sort: s }));
  const info = view.info ? rect(r.x + r.w - B.infoW, r.y, B.infoW, r.h) : null;
  const lr = info ? rect(r.x, r.y, r.w - B.infoW - 2, r.h) : r;
  let cols = COLS.filter((c) => (view.preview || c.key !== 'preview') && (!info || (c.key !== 'bpm' && c.key !== 'key')));
  cols = layout(lr, cols);
  const c = Object.fromEntries(cols.map((k) => [k.key, k]));

  // background + header
  box(ctx, lr.x, lr.y, lr.w, lr.h, K.panel);
  const hy = lr.y, hh = B.headerH;
  box(ctx, lr.x, hy, lr.w, hh, K.header);
  for (const col of cols) {
    if (col.x > lr.x) box(ctx, col.x - 1, hy, 1, hh, K.headerSep);
    const active = col.sort && sort.key === col.key;
    const color = active ? K.highlight : K.headerText;
    const ty = hy + hh / 2 + 1;
    let tx = col.x + 10;
    tx += kText(ctx, col.label, tx, ty, { size: 15, color, maxWidth: col.w - 20 });
    if (col.sort) {
      icon(ctx, active && sort.dir === -1 ? 'sortDown' : 'sortUp', tx + 17, ty, 17, active ? K.highlight : K.headerText);
      tx += 32;
      api.region({ id: `sort-${col.key}`, x: col.x, y: hy, w: col.w, h: hh, onTap: () => setSort({ key: col.key, dir: active ? -sort.dir : 1 }) });
    }
    if (col.key === 'title') kText(ctx, `[${String(tracks.length).padStart(4, '0')}]`, tx + 6, ty, { size: 13, color: K.headerText, maxWidth: col.x + col.w - tx - 10 });
    // (the CDJ's sub-column selector of ARTIST is not drawn: it would do nothing here)
  }

  const rowsY = hy + hh;
  const viewH = lr.y + lr.h - rowsY;
  const rowH = fs.rowH;
  const contentH = tracks.length * rowH;
  geometry.set(geoKey(api, navKey), { area: rect(lr.x, rowsY, lr.w, viewH), content: contentH, view: viewH, rowH });
  if (!tracks.length) {
    kText(ctx, api.library.loaded || api.library.error ? 'Aucun morceau' : 'Chargement…', lr.x + lr.w / 2, rowsY + viewH / 2, { size: 19, align: 'center', color: K.label });
    if (info) drawInfoPanel(ctx, info, null, api);
    return;
  }
  const scroll = clampScroll(nav.scroll, contentH, viewH);
  const sorted = listOrder(api, tracks, sort, navKey);
  // the list as shown (TRACK SEARCH follows this order: src/audio/cdjButtons.js)
  api.setList?.({ ids: sorted.map((x) => x.t.id), from, navKey });
  const loadedId = api.state.loaded?.trackId ?? null;
  const listW = lr.w - SCROLL_W;

  ctx.save();
  ctx.beginPath(); ctx.rect(lr.x, rowsY, lr.w, viewH); ctx.clip();
  const first = Math.floor(scroll / rowH);
  for (let k = first; k < sorted.length; k++) {
    const y = rowsY + k * rowH - scroll;
    if (y >= rowsY + viewH) break;
    const { t, n } = sorted[k];
    const hl = nav.highlight === t.id;
    const loaded = t.id === loadedId;
    const bg = k % 2 ? K.rowB : K.rowA;
    const color = loaded ? K.green : K.text;
    const mid = y + rowH / 2 + 1;
    // row background: the PREVIEW cell keeps its black waveform box
    const restX = c.preview ? c.number.x : lr.x;
    box(ctx, lr.x, y, listW, rowH, bg);
    box(ctx, restX, y, lr.x + listW - restX, rowH, hl ? K.highlight : bg);
    if (c.preview) {
      const art = rowH - 2;
      const pw = c.preview.w - art - 2;
      const wf = waveformFor(t.url);
      if (!wf) api.requestPreview(t);
      previewWave(ctx, wf, c.preview.x, y + 1, pw, rowH - 2);
      artwork(ctx, t, c.preview.x + pw + 1, y + 1, art);
    }
    for (const col of cols) if (col.x > lr.x) box(ctx, col.x - 1, y, 1, rowH, K.rowSep);
    kText(ctx, String(n).padStart(3, '0'), c.number.x + c.number.w - 9, mid, { size: fs.size, align: 'right', color, maxWidth: c.number.w - 12 });
    const ic = c.title.x + 8 + fs.size * 0.45;
    if (loaded) icon(ctx, 'play', ic + 2, mid - 1, fs.size * 1.2, K.green);
    else icon(ctx, 'track', ic, mid - 1, fs.size * 0.95, color);
    const tx = c.title.x + 14 + fs.size * 1.05;
    kText(ctx, t.title, tx, mid, { size: fs.size, color, maxWidth: c.title.x + c.title.w - tx - 6, letterSpacing: 0.2 });
    kText(ctx, t.artist, c.artist.x + 9, mid, { size: fs.size, color, maxWidth: c.artist.w - 16, letterSpacing: 0.2 });
    if (c.bpm) kText(ctx, formatBpm(trackBpm(t)), c.bpm.x + c.bpm.w - 9, mid, { size: fs.size, align: 'right', color, maxWidth: c.bpm.w - 12 });
    if (c.key) kText(ctx, t.key || '', c.key.x + 9, mid, { size: fs.size, color, maxWidth: c.key.w - SCROLL_W - 12 });
    // touch zones (only the visible part of the row)
    const zy = Math.max(rowsY, y), zh = Math.min(y + rowH, rowsY + viewH) - zy;
    if (zh < 6) continue;
    if (hl && nav.armed) {
      const lw = Math.min(150, Math.round(listW * 0.2));
      const lb = rect(lr.x + listW - lw - 8, y + 4, lw, rowH - 8);
      box(ctx, lb.x, lb.y, lb.w, lb.h, K.boxFill);
      strokeBox(ctx, lb.x, lb.y, lb.w, lb.h, K.boxBorder, 1.5);
      kText(ctx, 'LOAD', lb.x + lb.w / 2, lb.y + lb.h / 2 + 1, { size: Math.min(19, fs.size), weight: 500, align: 'center', color: K.text, letterSpacing: 1.5 });
      api.region({ id: `load-${t.id}`, x: lb.x - 8, y: zy, w: lr.x + listW - lb.x + 8, h: zh, onTap: () => { setNav({ armed: false, lastTap: 0 }); api.loadTrack(t, { from }); } });
      api.region({ id: `row-${t.id}`, x: lr.x, y: zy, w: lb.x - 8 - lr.x, h: zh, onTap: () => onRowTap(t) });
    } else {
      api.region({ id: `row-${t.id}`, x: lr.x, y: zy, w: listW, h: zh, onTap: () => onRowTap(t) });
    }
  }
  ctx.restore();
  scrollBar(ctx, lr.x + lr.w - SCROLL_W, rowsY, viewH, scroll, contentH, viewH);
  if (info) {
    const sel = tracks.find((t) => t.id === nav.highlight) ?? tracks.find((t) => t.id === loadedId) ?? null;
    drawInfoPanel(ctx, info, sel, api);
  }

  function onRowTap(t) {
    const now = performance.now();
    const cur = api.nav[navKey] ?? {};
    if (cur.highlight !== t.id) { setNav({ highlight: t.id, armed: false, lastTap: now }); return; }
    if (now - (cur.lastTap ?? 0) < DOUBLE_TAP_MS) { setNav({ armed: false, lastTap: 0 }); api.loadTrack(t, { from }); return; }
    setNav({ armed: !cur.armed, lastTap: now });
  }
}

// INFO panel: details of the highlighted (else loaded) track.
function drawInfoPanel(ctx, r, t, api) {
  box(ctx, r.x - 2, r.y, 2, r.h, K.bar);
  box(ctx, r.x, r.y, r.w, r.h, K.panel);
  if (!t) { kText(ctx, 'Aucun morceau sélectionné', r.x + r.w / 2, r.y + r.h / 2, { size: 16, align: 'center', color: K.label, maxWidth: r.w - 20 }); return; }
  const pad = 16;
  const art = 96;
  artwork(ctx, t, r.x + pad, r.y + pad, art);
  const tx = r.x + pad + art + 14, tw = r.x + r.w - pad - tx;
  kText(ctx, t.title, tx, r.y + pad + 18, { size: 19, weight: 500, color: api.state.loaded?.trackId === t.id ? K.green : K.text, maxWidth: tw });
  kText(ctx, t.artist, tx, r.y + pad + 46, { size: 16, color: K.soft, maxWidth: tw });
  kText(ctx, t.sourceName, tx, r.y + pad + 74, { size: 14, color: K.label, maxWidth: tw });
  const rows = [
    ['BPM', formatBpm(trackBpm(t))],
    ['Key', t.key || '--'],
    ['Time', formatTime(t.duration)],
    ['Source', t.sourceName],
    ['License', t.license || '--'],
  ];
  let y = r.y + pad + art + 14;
  for (const [k, v] of rows) {
    box(ctx, r.x + pad, y, r.w - pad * 2, 1, K.line);
    kText(ctx, k, r.x + pad, y + 22, { size: 14, color: K.label });
    kText(ctx, v, r.x + r.w - pad, y + 21, { size: 18, align: 'right', color: K.text, maxWidth: r.w - pad * 2 - 80 });
    y += 42;
  }
}

// --- folder list (playlists) -----------------------------------------------------
export function drawFolderList(ctx, r, items, api, { navKey = 'lists', header = 'PLAYLIST', onOpen, icon: rowIcon = 'listbox', openOnTap = false, trailing = 'chevron', emptyText = 'Aucune playlist' } = {}) {
  const view = browseView(api);
  const fs = FONT_SIZES[view.font] ?? FONT_SIZES[1];
  const nav = api.nav[navKey] ?? {};
  const setNav = (patch) => api.setNav((prev) => ({ ...prev, [navKey]: { ...(prev[navKey] ?? {}), ...patch } }));
  box(ctx, r.x, r.y, r.w, r.h, K.panel);
  const hh = B.headerH;
  box(ctx, r.x, r.y, r.w, hh, K.header);
  const ty = r.y + hh / 2 + 1;
  let tx = r.x + 10 + kText(ctx, header, r.x + 10, ty, { size: 15, color: K.highlight });
  icon(ctx, 'sortUp', tx + 17, ty, 17, K.highlight);
  kText(ctx, `[${String(items.length).padStart(4, '0')}]`, tx + 36, ty, { size: 13, color: K.headerText });
  const rowsY = r.y + hh, viewH = r.y + r.h - rowsY, rowH = fs.rowH;
  const contentH = items.length * rowH;
  geometry.set(geoKey(api, navKey), { area: rect(r.x, rowsY, r.w, viewH), content: contentH, view: viewH, rowH });
  if (!items.length) {
    kText(ctx, api.library.loaded || api.library.error ? emptyText : 'Chargement…', r.x + r.w / 2, rowsY + viewH / 2, { size: 19, align: 'center', color: K.label });
    return;
  }
  const scroll = clampScroll(nav.scroll, contentH, viewH);
  const listW = r.w - SCROLL_W;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, rowsY, r.w, viewH); ctx.clip();
  items.forEach((it, i) => {
    const y = rowsY + i * rowH - scroll;
    if (y + rowH <= rowsY || y >= rowsY + viewH) return;
    const hl = nav.highlight === i;
    box(ctx, r.x, y, listW, rowH, hl ? K.highlight : i % 2 ? K.rowB : K.rowA);
    const mid = y + rowH / 2 + 1;
    const color = it.loaded ? K.green : K.text;
    icon(ctx, rowIcon, r.x + 26, mid - 1, fs.size * 0.9, color);
    let right = r.x + listW - 16;
    if (trailing === 'arrow') { arrowOut(ctx, right - 14, mid, fs.size * 0.7, hl ? K.text : K.label); right -= 34; }
    else if (hl) { icon(ctx, 'chevron', right - 6, mid, fs.size * 0.85, K.text); right -= 34; }
    if (it.detail) right -= 8 + kText(ctx, it.detail, right, mid, { size: fs.size * 0.8, align: 'right', color: hl ? K.text : it.dim ? '#7d7d7d' : K.label });
    kText(ctx, it.name, r.x + 52, mid, { size: fs.size, color, maxWidth: right - r.x - 64, letterSpacing: 0.2 });
    const zy = Math.max(rowsY, y), zh = Math.min(y + rowH, rowsY + viewH) - zy;
    if (zh < 6) return;
    if (hl && !openOnTap) api.region({ id: `open-${i}`, x: r.x + listW - 56, y: zy, w: 56, h: zh, onTap: () => onOpen?.(i) });
    api.region({ id: `item-${i}`, x: r.x, y: zy, w: hl && !openOnTap ? listW - 56 : listW, h: zh, onTap: () => {
      const cur = api.nav[navKey] ?? {};
      if (openOnTap) { if (cur.highlight !== i) setNav({ highlight: i }); onOpen?.(i); return; }
      if (cur.highlight === i) onOpen?.(i); else setNav({ highlight: i });
    } });
  });
  ctx.restore();
  scrollBar(ctx, r.x + r.w - SCROLL_W, rowsY, viewH, scroll, contentH, viewH);
}

export { measure };
