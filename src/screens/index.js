// Screen UI: wires the store, the library, the two decks and the router, routes
// the physical buttons of each CDJ, and drives the CRÉDITS screen of the mixer.
//   const ui = createScreenUI({ screens, focus, library });   // main.js (library: optional,
//                           // created early there so the manifest loads with the model)
//   ui.handleButton(info)   // onButton (click): top keys -> page, BACK -> page
//   ui.update(now)          // render loop
//   ui.store, ui.router, ui.decks, ui.library, ui.sync (tempo master / BEAT SYNC)
//   ui.togglePlay()         // Space key (main.js, after the intro): play / pause, see below
//   ui.openCredits() / ui.closeCredits()  // focus the mixer's CRÉDITS screen / leave it
// Buttons, per CDJ (zone ids cdj_left_* / cdj_right_*, src/config/hotspots.js):
//   top keys 'Sources', 'Link', 'Dates', 'Feat', 'À propos' (printed label) ->
//   page of THAT CDJ, focused or not; 'Échap' only leaves the focus (the page stays).
//   back -> page.onBack (else previous page).
// Mixer CRÉDITS screen (zone mixer_screen, its 3D key mixer_menu "Échap"): the
// click and the exit are handled by the screen focus (src/input/screenFocus.js);
// here its page follows the focus: 'standby' at rest, 'credits' from the start
// of the zoom in (the roll starts once the camera has arrived) to the start of
// the zoom out.
// Every other CDJ button (PLAY, CUE, hot cues, loops, tempo, jog...) is wired in
// src/audio/cdjButtons.js (they act on the press, not on the click).
import { createStore, UNITS, UNIT_KEYS, MIXER_PAGE } from './state.js';
import { createScreenRouter } from './router.js';
import { getPage, pageForLabel } from './registry.js';
import './pages/index.js';
import { createLibrary } from '../data/library.js';
import { createDeck } from '../audio/deck.js';
import { createSync } from '../audio/sync.js';
import { engine } from '../audio/engine.js';

const ZONE = /^(cdj_left|cdj_right)_(.+)$/;
const CREDITS_PAGE = 'credits'; // end credits (src/screens/pages/credits.js)
const MIXER = 'mixer'; // the CRÉDITS screen: store unit and focus name

export function createScreenUI({ screens, focus, library = createLibrary() }) {
  engine.installUnlock();
  const store = createStore();
  const decks = {};
  for (const unit of UNITS) {
    const deck = createDeck(unit);
    decks[unit] = deck;
  }
  const sync = createSync(decks);
  const router = createScreenRouter({ screens, store, decks, library, focus, sync });
  // Deck the Space key acts on when no screen is focused: the last one that got
  // a track or started / stopped (lastActive).
  let lastActive = null;
  const wasPlaying = {};
  for (const unit of UNITS) {
    decks[unit].onChange((d) => {
      store.setDeck(unit, { status: d.status, playing: d.playing, cueing: d.sampling, error: d.error });
      if (!!d.playing !== !!wasPlaying[unit]) { wasPlaying[unit] = !!d.playing; lastActive = unit; }
      router.invalidate(); // waveform ready, cue point moved, tempo... (the other screen shows its phase / key match)
    });
  }
  store.onChange((unit, s, what) => { if (what === 'loaded' && s.loaded) lastActive = unit; });
  const hasTrack = (unit) => !!unit && !!store.get(unit).loaded && decks[unit].status !== 'error';
  // Space (keyboard): play / pause. Deck: the focused CDJ if it has a track, else
  // the last active one (last track loaded, or last started / paused), else the
  // only deck with a track. Returns false when there is nothing to play.
  const togglePlay = () => {
    const focused = focus?.current ? UNIT_KEYS[focus.current] : null;
    const unit = [focused, lastActive, ...UNITS].find(hasTrack);
    if (!unit) return false;
    lastActive = unit;
    decks[unit].toggle();
    return true;
  };
  sync.onChange(() => router.invalidate()); // MASTER / SYNC badges

  // CRÉDITS screen of the mixer: its page follows the focus of that screen.
  const openCredits = () => (focus && !focus.current ? focus.enter(MIXER) : false);
  const closeCredits = () => (focus?.current === MIXER ? focus.exit() : false);
  focus?.onChange?.((e) => {
    if (e.unit !== MIXER) return;
    if (e.type === 'enter') router.show(MIXER, CREDITS_PAGE);
    else router.show(MIXER, MIXER_PAGE); // 'exit' (zoom out starts) or 'exited' (reset)
  });

  const parse = (info) => {
    const m = ZONE.exec(info?.id ?? '');
    return m ? { unit: UNIT_KEYS[m[1]], zone: m[2] } : null;
  };
  return {
    store, router, decks, library, sync,
    update: (now) => router.update(now),
    openCredits, closeCredits, togglePlay,
    handleButton(info) {
      const p = parse(info);
      if (!p) return false;
      // only the printed keys of the row above the screen (main.js sets bakedLabel)
      const page = info.bakedLabel != null ? pageForLabel(info.label) : null;
      if (page) {
        if (store.get(p.unit).page === page) {
          const def = getPage(page);
          def?.onReselect?.(router.api(p.unit));
        } else router.show(p.unit, page);
        return true;
      }
      if (p.zone === 'back') {
        const api = router.api(p.unit);
        const def = getPage(store.get(p.unit).page);
        if (!def?.onBack?.(api)) api.back();
        return true;
      }
      return false;
    },
  };
}
