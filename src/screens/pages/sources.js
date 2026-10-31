// SOURCES page (top key "Sources"): the SOURCE screen of the CDJ-3000 (manual
// p18: device icons + names on the left, information of the highlighted device
// on the right), then the BROWSE screen of the opened key (manual p19), whose
// category column is live:
//   TRACK    tracks of the opened USB key (as on the CDJ)
//   ALBUM    albums / collections (manifest `album`), then the tracks of one
//   BPM      every track, slowest to fastest
//   KEY      every track, by key (Camelot 1A..12B)
//   PLAYLIST playlists (Warm-up, Peak time, Closing), then the tracks of one
//   FEAT / DATES / À PROPOS  open those pages (BACK comes back here)
// The USB tile at the top left goes back to the key list (SOURCE screen).
// Geometry measured on the native 1280 x 720 screenshot of the manual
// (x * 0.8, rows of 92 px -> 76 px in the 457 px body).
//
// CONTRACT (for whoever edits this file; keep the work inside this file):
//   - reads: state (src/screens/state.js), api.library.sources / tracks /
//     albums / playlists, api.deckInfo(), api.state.loaded (green "Loaded")
//   - writes its own nav (+ the shared BROWSE view settings, see
//     widgets/browse.js): api.setNav(...) =
//       { level: 'devices' | 'tracks' (BROWSE screen), device: index of the
//         highlighted key, open: index of the opened key,
//         cat: 'track' | 'album' | 'bpm' | 'key' | 'playlist' (BROWSE view),
//         albumOpen / playlistOpen: index of the opened album / playlist or null,
//         list, albumList, bpmList, keyList, playlistList: track lists
//           { highlight: track id, armed, lastTap, scroll (px), sort },
//         albums, playlists: folder lists { highlight, scroll } }
//     and, when a track is loaded from a playlist, api.setNavOf('playlist',
//     { open }) (read by TRACK SEARCH in src/audio/cdjButtons.js).
//   - touch: 1st touch on a key highlights it, a touch on the highlighted key (or
//     its chevron) opens it. In a track list: 1st touch highlights, 2nd shows
//     LOAD, LOAD (or a quick double touch) loads the track with
//     api.loadTrack(track, { from }) (-> player page). The back box of the title
//     bar and the BACK button go up one level; drag scrolls.
//   - touch zones: api.region({ id, x, y, w, h, onTap }) inside draw(); drags in
//     onPointer(e, api). Zones only work while the screen is focused.
//   - shared helpers: ../design.js (status bar), ../widgets/cdj.js (CDJ look),
//     ../widgets/browse.js (BROWSE frame + lists, shared with link.js).
import { registerPage } from '../registry.js';
import { SCREEN_W, SCREEN_H, L, statusBar, statusBarFps } from '../design.js';
import { browseFrame, drawTrackList, drawFolderList, listPointer, resetList } from '../widgets/browse.js';
import { K, kText, measure, box, icon, deviceTile } from '../widgets/cdj.js';

// Display-only data of each key (the manifest has none of this).
const FAKE_INFO = [
  { date: '2026-09-14', total: '29.8', free: '21.2' },
  { date: '2026-10-02', total: '58.6', free: '40.9' },
  { date: '2026-10-27', total: '14.9', free: '12.0' },
];

const S = {
  titleH: L.titleH, // 72
  rowPitch: 76, // manual 92 px
  rowH: 74, // + 2 px separator (#191919)
  tileW: 72, // manual 90 px
  listW: 742, // manual 0..927
  infoX: 744, // manual 930
  get bodyBottom() { return SCREEN_H - L.statusH; }, // 529
};
// manual y (body 91..628) -> canvas y (72..529)
const my = (y) => Math.round(S.titleH + (y - 91) * ((S.bodyBottom - S.titleH) / 537));

registerPage('sources', {
  frameRate: statusBarFps, // status bar (REMAIN, playhead) while the deck plays, else 0
  initialNav: () => ({ level: 'devices', device: 0, open: 0, cat: 'track', albumOpen: null, playlistOpen: null, list: {} }),

  draw(ctx, state, api) {
    const nav = api.nav;
    const sources = api.library.sources;
    const open = sources[nav.open ?? 0];
    if (nav.level === 'tracks' && open) return drawBrowse(ctx, api, nav, open);
    drawDevices(ctx, api, nav, sources);
  },

  onPointer(e, api) {
    if (api.nav.level === 'tracks') listPointer(e, api, { navKey: listKey(api.nav) });
  },

  onBack(api) { return up(api); },
  onReselect(api) { if (api.nav.level === 'tracks') toDevices(api); },
});

// Pages opened by the category column (the others are views of this page).
const CATEGORY_PAGES = { feat: 'feat', dates: 'dates', about: 'about' };
const VIEWS = new Set(['track', 'album', 'bpm', 'key', 'playlist']);
const BPM_SORT = { key: 'bpm', dir: 1 };
const KEY_SORT = { key: 'key', dir: 1 };
const count = (n) => `${n} morceau${n > 1 ? 'x' : ''}`;
const catOf = (nav) => (VIEWS.has(nav.cat) ? nav.cat : 'track');

// nav key of the list drawn in the current view (drag / wheel scrolling)
function listKey(nav) {
  switch (catOf(nav)) {
    case 'album': return nav.albumOpen != null ? 'albumList' : 'albums';
    case 'playlist': return nav.playlistOpen != null ? 'playlistList' : 'playlists';
    case 'bpm': return 'bpmList';
    case 'key': return 'keyList';
    default: return 'list';
  }
}

function toDevices(api) { api.setNav({ level: 'devices', device: api.nav.open ?? 0 }); }

// One level up: opened album / playlist -> its list; any BROWSE view -> keys.
function up(api) {
  const nav = api.nav;
  if (nav.level !== 'tracks') return false;
  const cat = catOf(nav);
  if (cat === 'album' && nav.albumOpen != null) { api.setNav({ albumOpen: null }); return true; }
  if (cat === 'playlist' && nav.playlistOpen != null) { api.setNav({ playlistOpen: null }); return true; }
  toDevices(api);
  return true;
}

function onCategory(api, id) {
  if (CATEGORY_PAGES[id]) { api.go(CATEGORY_PAGES[id]); return; }
  if (!VIEWS.has(id)) return;
  const nav = api.nav;
  if (catOf(nav) === id) { // touched again: back to the root of that view
    if (id === 'album' && nav.albumOpen != null) api.setNav({ albumOpen: null });
    else if (id === 'playlist' && nav.playlistOpen != null) api.setNav({ playlistOpen: null });
    return;
  }
  api.setNav({ level: 'tracks', cat: id });
}

function openKey(api, i) {
  const nav = api.nav;
  api.setNav({ level: 'tracks', cat: 'track', device: i, open: i, ...(nav.open === i ? {} : resetList('list')) });
}

function drawDevices(ctx, api, nav, sources) {
  // title bar
  box(ctx, 0, 0, SCREEN_W, S.titleH, K.bar);
  kText(ctx, 'SOURCE', 29, 36, { size: 22, color: K.text, letterSpacing: 0.3 });
  // list: 6 row slots, keys first
  box(ctx, 0, S.titleH, S.listW, S.bodyBottom - S.titleH, K.bar);
  box(ctx, S.listW, S.titleH, S.infoX - S.listW, S.bodyBottom - S.titleH, K.bar);
  const loadedSource = api.state.loaded?.sourceId ?? null;
  const slots = Math.ceil((S.bodyBottom - S.titleH) / S.rowPitch);
  const hl = Math.min(nav.device ?? 0, Math.max(0, sources.length - 1));
  for (let k = 0; k < slots; k++) {
    const y = S.titleH + k * S.rowPitch;
    const h = Math.min(S.rowH, S.bodyBottom - y);
    const s = sources[k];
    const sel = !!s && k === hl;
    box(ctx, 0, y, S.listW, h, sel ? K.highlight : K.panel);
    if (!s) continue;
    const color = K.device[s.index % K.device.length];
    if (sel) deviceTile(ctx, 2, y + 2, S.tileW - 2, h - 2, { kind: 'usb', color, player: api.player });
    else deviceTile(ctx, 0, y, S.tileW, h, { kind: 'usb', color, player: api.player });
    const loaded = s.id === loadedSource;
    let right = S.listW - 14;
    if (sel) {
      icon(ctx, 'chevron', 699, y + h / 2, 28, K.text);
      api.region({ id: `open-${k}`, x: 676, y, w: S.listW - 676, h, onTap: () => openKey(api, k) });
      right = 676;
    }
    if (loaded) {
      const bx0 = 568, bx1 = 679, by0 = y + 16, by1 = y + h - 16;
      ctx.strokeStyle = K.bracket; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx0 + 6, by0 + 0.5); ctx.lineTo(bx0 + 0.5, by0 + 0.5); ctx.lineTo(bx0 + 0.5, by1 - 0.5); ctx.lineTo(bx0 + 6, by1 - 0.5);
      ctx.moveTo(bx1 - 6, by0 + 0.5); ctx.lineTo(bx1 - 0.5, by0 + 0.5); ctx.lineTo(bx1 - 0.5, by1 - 0.5); ctx.lineTo(bx1 - 6, by1 - 0.5);
      ctx.stroke();
      kText(ctx, 'Loaded', (bx0 + bx1) / 2, y + h / 2 + 1, { size: 20, align: 'center', color: K.green });
      right = bx0;
    }
    kText(ctx, s.name, 92, y + h / 2 + 1, { size: 24, weight: 700, color: loaded ? K.green : K.text, maxWidth: right - 92 - 12 });
    api.region({ id: `device-${k}`, x: 0, y, w: sel ? 676 : S.listW, h, onTap: () => {
      if ((api.nav.device ?? 0) === k) openKey(api, k); else api.setNav({ device: k });
    } });
  }
  if (!sources.length) {
    kText(ctx, api.library.error ? 'Aucune clé USB' : 'Chargement des clés USB…', S.listW / 2, S.titleH + 2 * S.rowPitch + 37, { size: 19, align: 'center', color: K.label });
    if (api.library.error) kText(ctx, api.library.error, S.listW / 2, S.titleH + 2 * S.rowPitch + 64, { size: 14, align: 'center', color: '#777', maxWidth: S.listW - 40 });
  }
  drawInfo(ctx, api, sources[hl] ?? null, hl);
  statusBar(ctx, api.deckInfo());
}

function drawInfo(ctx, api, s, index) {
  const x0 = S.infoX, w = SCREEN_W - x0;
  box(ctx, x0, S.titleH, w, S.bodyBottom - S.titleH, K.panel);
  if (!s) return;
  const lx = 759, rx = 1004, lw = rx - lx + 4;
  const fake = FAKE_INFO[index % FAKE_INFO.length];
  const playlists = api.library.playlists.filter((p) => p.trackIds.some((id) => id.startsWith(`${s.id}:`))).length;
  const rows = [
    ['Songs', String(s.tracks.length), '', 120, 117],
    ['Playlists', String(playlists), '', 166, 167],
    ['Date', fake.date, '', 219, 218],
    ['Total', fake.total, 'GB', 270, 269],
    ['Available', fake.free, 'GB', 322, 320],
  ];
  const lines = [142, 193, 244, 295, 346];
  for (const ly of lines) box(ctx, lx, my(ly), lw, 1, K.line);
  for (const [k, v, unit, yl, yv] of rows) {
    kText(ctx, k, lx, my(yl), { size: 13.5, color: K.label, letterSpacing: 0.3 });
    let vr = rx;
    if (unit) { kText(ctx, unit, rx, my(yv) + 2, { size: 15, align: 'right', color: K.unit }); vr = rx - measure(ctx, unit, 15) - 9; }
    kText(ctx, v, vr, my(yv), { size: 19.5, align: 'right', color: K.text });
  }
  // (the CDJ's "Background Color" menu and "MY SETTINGS LOAD" key are not
  // drawn: they would look like buttons with nothing behind them)
}

// Opens a playlist. Its index is also written to the nav of 'playlist': TRACK
// SEARCH (src/audio/cdjButtons.js, tracks loaded with from: 'playlist') walks
// the playlist the track came from.
function openPlaylist(api, k) {
  api.setNav({ playlistOpen: k, playlists: { ...(api.nav.playlists ?? {}), highlight: k }, ...(api.nav.playlistOpen === k ? {} : resetList('playlistList')) });
  api.setNavOf('playlist', { open: k });
}

// BROWSE screen: frame (USB tile, title, categories) + the list of the view.
function drawBrowse(ctx, api, nav, src) {
  const lib = api.library;
  const cat = catOf(nav);
  const frame = (title, icon, buttons) => browseFrame(ctx, api, {
    title, icon, back: true, device: src.index, category: cat, buttons,
    onBack: () => up(api),
    onCategory: (id) => onCategory(api, id),
    onDevice: () => toDevices(api),
  });
  const tracks = (f, list, opts) => drawTrackList(ctx, f.list, list, api, { from: 'sources', ...opts });

  if (cat === 'album') {
    const album = nav.albumOpen != null ? lib.albums[nav.albumOpen] : null;
    if (album) return tracks(frame(album.name, 'album'), lib.playlistTracks(album), { navKey: 'albumList' });
    const f = frame('Albums', 'album', ['font']);
    return drawFolderList(ctx, f.list, lib.albums.map((a) => ({ id: a.id, name: a.name, detail: count(a.trackIds.length) })), api, {
      navKey: 'albums', header: 'ALBUM', icon: 'album', emptyText: 'Aucun album',
      onOpen: (i) => api.setNav({ albumOpen: i, albums: { ...(api.nav.albums ?? {}), highlight: i }, ...(api.nav.albumOpen === i ? {} : resetList('albumList')) }),
    });
  }
  if (cat === 'playlist') {
    const i = nav.playlistOpen;
    const pl = i != null ? lib.playlists[i] : null;
    if (pl) return tracks(frame(pl.name, 'listbox'), lib.playlistTracks(pl), { navKey: 'playlistList', from: 'playlist' });
    const f = frame('Mes playlists', 'listbox', ['font']);
    return drawFolderList(ctx, f.list, lib.playlists.map((p) => ({ id: p.id, name: p.name, detail: count(p.trackIds.length) })), api, {
      navKey: 'playlists', header: 'PLAYLIST', icon: 'listbox',
      onOpen: (k) => openPlaylist(api, k),
    });
  }
  if (cat === 'bpm') return tracks(frame('Tous les morceaux, par tempo', 'bpm'), lib.tracks, { navKey: 'bpmList', sort: BPM_SORT });
  if (cat === 'key') return tracks(frame('Tous les morceaux, par tonalité', 'key'), lib.tracks, { navKey: 'keyList', sort: KEY_SORT });
  return tracks(frame(src.name, 'folder'), src.tracks, { navKey: 'list' });
}
