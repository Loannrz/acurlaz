// Screen UI store, one state per screen: the two CDJs ('cdjLeft' | 'cdjRight')
// and the CRÉDITS screen of the mixer ('mixer', pages 'standby' / 'credits', no
// deck). Data only: no drawing, no audio (the deck itself lives in
// src/audio/deck.js; its status is mirrored here by src/screens/index.js so
// screens redraw when it changes).
//
//   const store = createStore();
//   store.get('cdjLeft') -> unit state (treat as read-only):
//     {
//       unit: 'cdjLeft', name: 'cdj_left', player: 1 (mixer: null),
//       page: 'about',             // page on screen ('sources' | 'link' | 'dates' |
//                                  //  'feat' | 'about' | 'player'; mixer: 'standby' |
//                                  //  'credits' while focused, see src/screens/index.js)
//       lastPage: null,            // previous page (BACK from the player, etc.)
//       nav: { [page]: {...} },    // per-page navigation, owned by each page (folder,
//                                  //  highlighted index, scroll...): see the page files
//       loaded: null | { trackId, sourceId, from, list },  // track loaded in THIS deck
//                                  //  (from: 'sources', or 'playlist' for a track loaded
//                                  //  from a playlist of SOURCES; list: track ids of the
//                                  //  list it was loaded from, in the order shown, or
//                                  //  null: TRACK SEARCH walks it)
//       list: null | { ids, from, page, navKey },     // last track list shown on this
//                                  //  screen (TRACK / ALBUM / BPM / KEY / PLAYLIST view),
//                                  //  ids in display order (sort applied); written by
//                                  //  src/screens/widgets/browse.js
//       deck: { status, playing, cueing, error },    // mirror of the deck (no position)
//     }
//   store.setPage(unit, page)            // lastPage = previous page (if different)
//   store.setNav(unit, page, patch)      // shallow merge into nav[page] (patch may be a
//                                        // function prev -> next; same object = no event)
//   store.nav(unit, page)                // nav[page] (empty object if never set)
//   store.setLoaded(unit, loaded|null)
//   store.setList(unit, list|null)       // no change (no event) if the same ids / origin
//   store.setDeck(unit, patch)
//   store.onChange((unit, state, what) => {})  // what: 'page' | 'nav' | 'loaded' | 'list' | 'deck'
//                                              // returns an unsubscribe function
// Every setter replaces the unit state object (new reference), so a page can
// compare references to know whether something changed.

export const UNITS = ['cdjLeft', 'cdjRight']; // the CDJs (one deck each)
export const SCREEN_UNITS = [...UNITS, 'mixer']; // every screen drawn by the router
export const UNIT_NAMES = { cdjLeft: 'cdj_left', cdjRight: 'cdj_right', mixer: 'mixer' };
export const UNIT_KEYS = { cdj_left: 'cdjLeft', cdj_right: 'cdjRight', mixer: 'mixer' };
export const DEFAULT_PAGE = 'about';
export const MIXER_PAGE = 'standby'; // the CRÉDITS screen at rest

export function createStore({ initialPage = DEFAULT_PAGE } = {}) {
  const states = {};
  SCREEN_UNITS.forEach((unit, i) => {
    const cdj = UNITS.includes(unit);
    states[unit] = {
      unit, name: UNIT_NAMES[unit], player: cdj ? i + 1 : null,
      page: cdj ? initialPage : MIXER_PAGE, lastPage: null,
      nav: {},
      loaded: null,
      list: null,
      deck: { status: 'empty', playing: false, cueing: false, error: null },
    };
  });
  const listeners = new Set();
  const commit = (unit, next, what) => {
    states[unit] = next;
    for (const fn of listeners) fn(unit, next, what);
  };
  const check = (unit) => { if (!states[unit]) throw new Error(`store: unknown unit ${unit}`); return states[unit]; };

  return {
    units: SCREEN_UNITS,
    get: (unit) => check(unit),
    nav: (unit, page) => check(unit).nav[page] ?? {},
    setPage(unit, page) {
      const s = check(unit);
      if (s.page === page) return;
      commit(unit, { ...s, page, lastPage: s.page }, 'page');
    },
    setNav(unit, page, patch) {
      const s = check(unit);
      const prev = s.nav[page] ?? {};
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      if (next === prev) return; // unchanged (a function returned prev): no event, no redraw
      commit(unit, { ...s, nav: { ...s.nav, [page]: next } }, 'nav');
    },
    setLoaded(unit, loaded) {
      const s = check(unit);
      commit(unit, { ...s, loaded: loaded ? { ...loaded } : null }, 'loaded');
    },
    setList(unit, list) {
      const s = check(unit);
      const a = s.list, b = list;
      if (a === b || (a && b && a.from === b.from && a.page === b.page && a.navKey === b.navKey
        && a.ids.length === b.ids.length && a.ids.every((id, i) => id === b.ids[i]))) return;
      commit(unit, { ...s, list: b ? { ids: [...b.ids], from: b.from, page: b.page, navKey: b.navKey } : null }, 'list');
    },
    setDeck(unit, patch) {
      const s = check(unit);
      const d = { ...s.deck, ...patch };
      if (d.status === s.deck.status && d.playing === s.deck.playing && d.cueing === s.deck.cueing && d.error === s.deck.error && !patch.force) return;
      delete d.force;
      commit(unit, { ...s, deck: d }, 'deck');
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
