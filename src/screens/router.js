// Screen router: draws the current page of each screen (both CDJs, and the
// CRÉDITS screen of the mixer) into its canvas (src/scene/screens.js),
// dispatches the touch events of the focused screen to that page, and redraws
// only when needed.
//
//   const router = createScreenRouter({ screens, store, decks, library, focus, sync });
//   router.update(now)          // render loop (main.js), before render(): redraws the
//                               // screens marked dirty, plus pages whose frameRate() > 0
//   router.show(unit, page)     // change the page of one screen ('cdjLeft' | 'cdjRight' | 'mixer')
//   router.invalidate(unit?)    // mark one screen dirty (none given: every non-`static` page)
//   router.api(unit)            // the page API of a unit (tests, dev)
//
// When is a screen redrawn?
//   - store change of that unit (page, nav, loaded track, deck status), library
//     change (manifest, image loaded) and waveform analysed (except pages marked
//     `static`: they do not read them), focus change, hover change,
//     api.invalidate(): once, at the next frame (several changes = one redraw);
//   - continuously only while the page's frameRate(state, api) returns > 0
//     (the player page while its deck plays), at most MAX_FPS for the focused
//     screen and UNFOCUSED_FPS for a screen that is not the focused one (both in
//     the overview); two unfocused screens take turns (never both in one frame).
//     Nothing else animates.
// Each redraw repaints the whole canvas and uploads the texture once.
//
// Page API (second argument of draw / onPointer...), one object per screen:
//   api.unit ('cdjLeft'), api.name ('cdj_left'), api.player (1 | 2; mixer: null),
//   api.width, api.height (canvas px: 1024 x 597 on a CDJ, 1024 x 816 on the mixer)
//   api.state                  current unit state (src/screens/state.js)
//   api.nav / api.setNav(patch | fn)        nav state of the CURRENT page
//   api.navOf(page) / api.setNavOf(page, p) nav state of another page
//   api.go(page) / api.back()  change page (back = previous page, else 'about')
//   api.region({ id, x, y, w, h, onTap(e, api), onPress(e, api), onHover(over, api) })
//                              touch zone, canvas px, valid until the next redraw: call it
//                              from draw() next to what it covers. Ids are local to the
//                              page (prefixed internally). Zones only react while this
//                              screen is focused (touch surface). Avoid overlaps (the
//                              last added wins).
//   api.hovered                id of the zone under the mouse (or null): hover look
//   api.focused                this screen is the focused touch surface
//   api.invalidate()           ask for a redraw
//   api.library                src/data/library.js
//   api.deck                   this CDJ's deck (src/audio/deck.js): play(), position...
//                              (mixer: none; deckInfo() is for the CDJ pages only)
//   api.loadTrack(track, { from, autoPlay, list })  load into THIS deck + show the player page
//                              (autoPlay: starts as soon as decoded, TRACK SEARCH while playing;
//                              list: track ids TRACK SEARCH walks, default: the last list
//                              shown on this screen if it holds the track)
//   api.setList({ ids, from, navKey })  the track list on screen, in display order
//                              (drawTrackList; read by TRACK SEARCH through the store)
//   api.deckInfo()             snapshot for drawing: { loaded, track, status, playing,
//                              cueing, position, duration, cuePoint, waveform, bpm (track
//                              BPM: detected on the audio, else the manifest), tempo (%),
//                              range, effectiveBpm, isMaster, synced, masterTempo, keyShift,
//                              quantize, beatJump, autoCue, vinyl, loop, hotCues, memory,
//                              elapsed (TIME MODE), player }
//   api.deckInfoOf(unit)       the same for another CDJ; api.decks, api.sync (src/audio/sync.js)
//   api.requestPreview(track)  queue a background waveform analysis (PREVIEW column)
//   api.now                    performance.now() of the current redraw
//   api.lastDraw               performance.now() of the previous redraw of this screen
import { SCREEN_UNITS, UNIT_NAMES } from './state.js';
import { getPage } from './registry.js';
import { requestAnalysis, onAnalysed } from '../audio/buffers.js';
import { waveformFor } from '../audio/waveform.js';

const PREFIX = 'ui:';
const MAX_FPS = 60;
// A screen that is not the focused one (overview, or the other CDJ during a
// focus) is small or out of view: its animated page (player while playing) is
// redrawn and uploaded at most this often (a 1024 px canvas upload + mipmaps
// each time). Positions, waveforms and the timer are computed from the clock at
// each redraw, so they only advance in steps of 33 ms (a 60 Hz display shows
// each image twice): no drift, no catch-up. The focused screen keeps MAX_FPS.
const UNFOCUSED_FPS = 30;

export function createScreenRouter({ screens, store, decks, library, focus, sync = null }) {
  const units = {};

  const makeApi = (unit) => {
    const u = { unit, screen: screens[unit], dirty: true, lastDraw: -Infinity, shown: null, collecting: null, handlers: new Map(), keys: new Map(), hovered: null, now: 0, failed: new Set() };
    const deck = decks[unit];
    const current = () => store.get(unit).page;
    const api = {
      unit,
      name: UNIT_NAMES[unit],
      get player() { return store.get(unit).player; },
      get width() { return u.screen.width; },
      get height() { return u.screen.height; },
      get state() { return store.get(unit); },
      get nav() { return store.nav(unit, current()); },
      setNav(patch) { store.setNav(unit, current(), patch); },
      navOf: (page) => store.nav(unit, page),
      setNavOf: (page, patch) => store.setNav(unit, page, patch),
      go: (page) => show(unit, page),
      back() { const s = store.get(unit); show(unit, s.lastPage && s.lastPage !== s.page ? s.lastPage : 'about'); },
      region(def) {
        if (!u.collecting) { console.warn('[screens] api.region() outside draw() ignored', def?.id); return; }
        if (def?.id == null || ![def.x, def.y, def.w, def.h].every(Number.isFinite)) return;
        u.collecting.push(def);
      },
      get hovered() { return u.hovered; },
      get focused() { return focus?.current === UNIT_NAMES[unit] && !focus.busy; },
      invalidate() { u.dirty = true; },
      library,
      deck,
      store,
      loadTrack(track, { from = current(), autoPlay = false, list = undefined } = {}) {
        if (!track?.url) return;
        const shown = store.get(unit).list;
        const ids = list !== undefined ? list : shown?.ids.includes(track.id) ? shown.ids : null;
        store.setLoaded(unit, { trackId: track.id, sourceId: track.sourceId, from, list: ids });
        deck.load(track.url, track, { autoPlay });
        show(unit, 'player');
      },
      deckInfo: () => deckInfo(unit),
      deckInfoOf: (other) => (decks[other] ? deckInfo(other) : null),
      decks,
      sync,
      setList({ ids, from = current(), navKey = null } = {}) { store.setList(unit, { ids, from, page: current(), navKey }); },
      requestPreview(track) { if (track?.url) requestAnalysis(track.url); },
      get now() { return u.now; },
      get lastDraw() { return u.lastDraw; }, // during draw(): the previous redraw
    };
    u.api = api;
    return u;
  };

  function deckInfo(unit) {
    const deck = decks[unit];
    const t = deck.track;
    const waveform = deck.waveform ?? (deck.url ? waveformFor(deck.url) : null);
    const bpm = waveform?.bpm ?? t?.bpm ?? null;
    const tempo = deck.tempoPct ?? 0;
    return {
      loaded: deck.status === 'ready', track: t, status: deck.status, error: deck.error,
      playing: deck.playing, cueing: deck.cueing, sampling: deck.sampling, moving: deck.moving,
      position: deck.position, duration: deck.duration, cuePoint: deck.cuePoint,
      waveform, bpm, key: t?.key ?? '', tempo, range: deck.tempoRange ?? 10,
      effectiveBpm: bpm ? bpm * (1 + tempo / 100) : null,
      isMaster: !!t && sync?.masterUnit === unit, synced: !!sync?.isSynced(unit),
      masterTempo: !!deck.masterTempo, keyShift: deck.keyShift ?? 0, tempoReset: !!deck.tempoReset,
      quantize: deck.quantize ?? false, beatJump: deck.beatJumpSize ?? 16, autoCue: deck.autoCue ?? false,
      vinyl: deck.vinyl ?? false, loop: deck.loop ?? null, hotCues: deck.hotCues ?? {}, memory: deck.memory ?? [],
      deleteArmed: !!deck.deleteArmed, touching: !!deck.touching,
      elapsed: !!store.nav(unit, 'player').elapsed,
      player: store.get(unit).player,
    };
  }

  for (const unit of SCREEN_UNITS) {
    if (!screens[unit]) continue;
    const u = makeApi(unit);
    units[unit] = u;
    // Raw touch events -> page.onPointer (region taps are dispatched by the screen itself).
    u.screen.onPointer((e) => {
      const page = getPage(store.get(unit).page);
      if (!page?.onPointer) return;
      const region = typeof e.region === 'string' && e.region.startsWith(PREFIX) ? e.region.slice(PREFIX.length) : null;
      safe(u, page, 'onPointer', () => page.onPointer({ ...e, region }, u.api));
    });
  }

  function safe(u, page, what, fn) {
    try { return fn(); } catch (err) {
      const key = `${page?.name}:${what}`;
      if (!u.failed.has(key)) { u.failed.add(key); console.error(`[screens] page "${page?.name}" ${what} failed`, err); }
      return undefined;
    }
  }

  // Registers the zones collected during a draw, keeping the screen's region
  // objects of unchanged zones (so a press in progress survives a redraw, e.g.
  // on the player page that redraws every frame while playing).
  function syncRegions(u, list) {
    const next = new Map();
    for (const r of list) next.set(PREFIX + r.id, r);
    for (const id of [...u.keys.keys()]) {
      if (!next.has(id)) { u.keys.delete(id); u.handlers.delete(id); u.screen.removeHitRegion(id); }
    }
    for (const [id, r] of next) {
      u.handlers.set(id, r);
      const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;
      if (u.keys.get(id) === key) continue;
      u.keys.set(id, key);
      const localId = r.id;
      u.screen.addHitRegion({
        id, x: r.x, y: r.y, w: r.w, h: r.h,
        onTap: (e) => { const h = u.handlers.get(id); if (h?.onTap) safe(u, getPage(store.get(u.unit).page), 'onTap', () => h.onTap({ ...e, region: localId }, u.api)); },
        onPress: (e) => { const h = u.handlers.get(id); if (h?.onPress) safe(u, getPage(store.get(u.unit).page), 'onPress', () => h.onPress({ ...e, region: localId }, u.api)); },
        onHover: (over) => {
          const h = u.handlers.get(id);
          const prev = u.hovered;
          if (over) u.hovered = localId; else if (u.hovered === localId) u.hovered = null;
          if (prev !== u.hovered) u.dirty = true;
          h?.onHover?.(over, u.api);
        },
      });
    }
  }

  function render(u, now) {
    const unit = u.unit;
    let state = store.get(unit);
    let page = getPage(state.page);
    if (u.shown !== state.page) {
      const prev = getPage(u.shown);
      if (prev?.onHide) safe(u, prev, 'onHide', () => prev.onHide(u.api));
      u.shown = state.page;
      u.hovered = null;
      if (page?.initialNav && !state.nav[state.page]) store.setNav(unit, state.page, page.initialNav());
      if (page?.onShow) safe(u, page, 'onShow', () => page.onShow(u.api));
      state = store.get(unit);
      page = getPage(state.page);
    }
    u.now = now;
    u.collecting = [];
    // cleared BEFORE drawing: an invalidate() asked during draw() (or by a deck event
    // it triggers) is kept for the next frame instead of being lost
    u.dirty = false;
    u.screen.draw((ctx, w, h) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (!page) { drawMissing(ctx, w, h, state.page); return; }
      const ok = safe(u, page, 'draw', () => { page.draw(ctx, state, u.api); return true; });
      if (!ok) drawMissing(ctx, w, h, state.page, true);
    });
    if (page?.regions) {
      const extra = safe(u, page, 'regions', () => page.regions(state, u.api));
      if (Array.isArray(extra)) u.collecting.push(...extra.filter((r) => r?.id != null && [r.x, r.y, r.w, r.h].every(Number.isFinite)));
    }
    const list = u.collecting;
    u.collecting = null;
    syncRegions(u, list);
    u.lastDraw = now;
  }

  function show(unit, page) {
    if (!units[unit]) return;
    store.setPage(unit, page); // store change -> dirty
  }

  // invalidate(unit): that screen; invalidate(): every screen whose page reads
  // shared data (library, waveforms, decks), not the `static` ones (CRÉDITS screen)
  const invalidate = (unit) => {
    if (unit) { if (units[unit]) units[unit].dirty = true; return; }
    for (const u of Object.values(units)) if (!getPage(store.get(u.unit).page)?.static) u.dirty = true;
  };

  // (the shown list, 'list', is written BY a redraw: never a reason for another)
  store.onChange((unit, s, what) => { if (what !== 'list') invalidate(unit); });
  library?.onChange?.(() => invalidate());
  onAnalysed(() => invalidate());
  focus?.onChange?.(() => { for (const u of Object.values(units)) u.dirty = true; }); // focused / not: every page

  let lastUpdate = -Infinity;
  const update = (now = performance.now()) => {
    let paced = null; // the unfocused screen allowed a continuous redraw this frame
    const draw = [], waiting = [];
    for (const u of Object.values(units)) {
      if (u.dirty) { draw.push(u); continue; }
      const page = getPage(store.get(u.unit).page);
      const focused = focus?.current === UNIT_NAMES[u.unit];
      const cap = focused ? MAX_FPS : UNFOCUSED_FPS;
      const fps = page?.frameRate ? Math.min(cap, safe(u, page, 'frameRate', () => page.frameRate(store.get(u.unit), u.api)) || 0) : 0;
      // (-4 ms: a frame arriving slightly early still counts, so 30 / s stays
      // exactly every other frame at 60 Hz)
      if (!(fps > 0 && now - u.lastDraw >= 1000 / fps - 4)) continue;
      if (focused || fps >= MAX_FPS) { draw.push(u); continue; }
      // two unfocused screens due together: only the one drawn longest ago, the
      // other waits a frame (they settle on alternate frames, half the upload
      // cost per frame; with a 30 Hz loop they still take turns, never starve)
      waiting.push(u);
      if (!paced || u.lastDraw < paced.lastDraw) paced = u;
    }
    if (paced) draw.push(paced);
    // slow loop (power saving: ~30 Hz or less): taking turns would halve each
    // screen again (15 / s), so every due screen is drawn
    if (now - lastUpdate > 25) for (const u of waiting) if (u !== paced) draw.push(u);
    lastUpdate = now;
    for (const u of draw) render(u, now);
  };

  // First image right away (before the shader / texture warm-up of main.js).
  update(performance.now());

  return {
    update,
    show,
    invalidate,
    api: (unit) => units[unit]?.api ?? null,
    get units() { return units; },
  };
}

function drawMissing(ctx, w, h, name, failed = false) {
  ctx.fillStyle = '#7a7a7a';
  ctx.font = '400 20px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(failed ? `Page « ${name} » : erreur d’affichage` : `Page « ${name} » non enregistrée`, w / 2, h / 2);
}
