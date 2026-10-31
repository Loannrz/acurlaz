// Page registry of the CDJ screens. Each page lives in its own file under
// src/screens/pages/ and registers itself once, at import time:
//
//   import { registerPage } from '../registry.js';
//   registerPage('dates', {
//     draw(ctx, state, api) {},      // REQUIRED. Full redraw of the canvas (CDJ: 1024 x 597,
//                                    // mixer: 1024 x 816; api.width / api.height), already
//                                    // cleared to black. state = unit state
//                                    // (src/screens/state.js), api: see src/screens/router.js
//     onPointer(e, api) {},          // optional: raw touch events of the focused screen
//                                    // (pointerdown / pointermove / pointerup / tap ...,
//                                    // canvas px; e.region = id of the region under it)
//     onShow(api) {}, onHide(api) {},// optional: the page appears / leaves this screen
//     onBack(api) {},                // optional: BACK button of the CDJ (return true if handled)
//     onReselect(api) {},            // optional: its top key pressed while already shown
//     regions(state, api) { return [] }, // optional: static touch zones (same shape as
//                                    // api.region(), see router.js); api.region() during
//                                    // draw() is usually simpler
//     frameRate(state, api) { return 0 },// optional: redraws per second wanted right now
//                                    // (0 = only on change). Keep 0 unless something moves
//                                    // (the player page asks 60 only while the deck plays).
//     initialNav: () => ({}),        // optional: initial nav state of the page
//     static: true,                  // optional: the page reads neither the library nor the
//                                    // waveforms (no redraw when they change)
//   });
//
// src/screens/pages/index.js imports every page file (the only shared list).

const pages = new Map();

export function registerPage(name, def) {
  if (!name || typeof def?.draw !== 'function') throw new Error(`registerPage(${name}): draw(ctx, state, api) is required`);
  pages.set(name, { name, ...def });
}
export const getPage = (name) => pages.get(name) ?? null;
export const pageNames = () => [...pages.keys()];

// Keys of the row above the screen -> page. Matched on the printed label
// (onButton `label`, e.g. 'Sources', 'À propos'), case and accents ignored.
// 'Échap' is not a page: it only leaves the screen focus (src/input/screenFocus.js).
// Pages without a key: 'player' (LOAD); the mixer's CRÉDITS screen shows
// 'standby' at rest and 'credits' while it is focused (src/screens/index.js).
export const TOP_KEY_PAGES = {
  sources: 'sources',
  link: 'link',
  dates: 'dates',
  feat: 'feat',
  'a propos': 'about',
};
export const normaliseLabel = (label) => String(label ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const pageForLabel = (label) => TOP_KEY_PAGES[normaliseLabel(label)] ?? null;
