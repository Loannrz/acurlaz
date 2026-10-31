// Physical controls of both CDJ-3000 -> their deck (src/audio/deck.js), the
// tempo master / BEAT SYNC (src/audio/sync.js). No light is drawn on the model's
// buttons (they keep their baked look; the states live in the decks and screens).
//   const cdj = createCdjButtons({ ui: screenUI, controlStore: controls.store });  // main.js
//   cdj.handlePress(info)   // hotspots onPress   -> { hold, slop } when the zone acts on the press
//   cdj.handleRelease(info) // hotspots onRelease
//   cdj.handleButton(info)  // hotspots onButton (click): setting toggles
//   cdj.releaseAll()        // replay: everything held is released
// Zone ids: cdj_left_<id> / cdj_right_<id> (src/config/hotspots.js). Both decks are
// independent.
//
// On the PRESS (held buttons react at once, as on a CDJ; the press never turns into
// a camera orbit, and a small slide of the finger does not release it):
//   play            PLAY/PAUSE
//   cue             CUE (held: cue point sampler, see deck.js)
//   hot_cue_a..h    HOT CUE A-H: set / jump / play while held (paused)
//   in_cue, out     LOOP IN (and real-time cue) / LOOP OUT; IN / OUT ADJUST during a loop
//   reloop_exit     RELOOP / EXIT
//   beat_loop_4/8   4 BEAT LOOP (1/2X during a loop) / 8 BEAT LOOP (2X during a loop)
//   beat_jump_back/fwd  BEAT JUMP < > (size of the screen BEAT JUMP; moves a running loop)
//   search_rev/fwd  SEARCH << >> held: 4x scan (audible scrub when paused)
//   track_search_prev/next  previous / next track of the list the track was loaded from
//                   (previous = back to the start when past 2 s)
//   call            HOT CUE CALL: the hot cues found on the audio fill the empty pads
//   memory          MEMORY: stores the cue point (or the running loop)
//   cue_loop_call_prev/next  calls the previous / next memory cue
//   delete          DELETE: deletes the memory cue the deck is paused on, else arms the
//                   deletion of the next hot cue pad pressed (4 s)
//   jog             touch of the platter top (VINYL mode: holds the record / scratch);
//                   a press on the side ring is no touch (pitch bend, as on the CDJ)
// On the CLICK (settings):
//   quantize, beat_sync, master, master_tempo, tempo_range, tempo_reset,
//   time_mode (REMAIN / elapsed), auto_cue, vinyl + jog_mode (VINYL / CDJ),
//   key_sync (key of the master, through KEY SHIFT), usb_stop (eject when stopped).
// 3D controls (src/controls store): <unit>_tempo -> tempo, <unit>_jog -> jog
// (bend / search / scratch), <unit>_jog_adjust -> bend sensitivity.
// Not wired (nothing real behind them here): direction, slip_reverse (reverse
// playback), shortcut, tag_track, vinyl_speed_adjust, browse rotary (pages).
import { HOTSPOTS } from '../config/hotspots.js';
import { JOG } from '../controls/geometry.js';
import { UNITS, UNIT_NAMES, UNIT_KEYS } from '../screens/state.js';

const ZONE = /^(cdj_left|cdj_right)_(.+)$/;
const HOT = { hot_cue_a: 'A', hot_cue_b: 'B', hot_cue_c: 'C', hot_cue_d: 'D', hot_cue_e: 'E', hot_cue_f: 'F', hot_cue_g: 'G', hot_cue_h: 'H' };
const HOLD = { hold: true, slop: 80 }; // px: a slide of the finger keeps the button down
const HOLD_FREE = { hold: true, slop: Infinity }; // jog: the drag turns the platter
const SEARCH_HZ = 20;
// Jog centre (unit-local mm, its click zone) and the edge of its top: platter +
// polished bevel (src/controls/geometry.js); beyond, the sloping dimpled ring.
const JOG_ZONE = HOTSPOTS.cdjLeft?.find?.((z) => z.id === 'jog') ?? { x: 0, z: 81 };
const JOG_TOP_R = JOG.rTop + 2.7; // mm (80.7: bevel included)
const jogTop = (p) => !p || Math.hypot(p.x - JOG_ZONE.x, p.z - JOG_ZONE.z) <= JOG_TOP_R;
const SEARCH_STEP = 0.2; // s per step: 4x the real time

// Camelot key -> pitch class of its major key (8B = C). Relative keys (nA / nB) share n.
const camelot = (k) => { const m = /^(\d{1,2})([AB])$/i.exec(String(k ?? '').trim()); return m && +m[1] >= 1 && +m[1] <= 12 ? +m[1] : null; };
export function keyShiftTo(mine, target) {
  const a = camelot(mine), b = camelot(target);
  if (a == null || b == null) return null;
  let d = (((7 * (b - a)) % 12) + 12) % 12;
  if (d > 5) d -= 12;
  return d;
}

export function createCdjButtons({ ui, controlStore = null }) {
  const { decks, sync, router, store, library } = ui;
  const held = new Map(); // zone id -> { unit, zone, timer }
  const parse = (info) => {
    const m = ZONE.exec(info?.id ?? '');
    return m ? { unit: UNIT_KEYS[m[1]], zone: m[2] } : null;
  };

  // --- 3D controls: tempo slider, jog, JOG ADJUST ---
  if (controlStore) {
    for (const unit of UNITS) {
      const n = UNIT_NAMES[unit], d = decks[unit];
      const tempo = `${n}_tempo`, jog = `${n}_jog`, adj = `${n}_jog_adjust`;
      if (controlStore.def(tempo)) { d.setTempoFader(controlStore.get(tempo)); controlStore.onChange(tempo, (e) => d.setTempoFader(e.value)); }
      if (controlStore.def(adj)) { d.setJogAdjust(controlStore.get(adj)); controlStore.onChange(adj, (e) => d.setJogAdjust(e.value)); }
      // only real motion (drag, wheel): a reset / reload of the angle is not a turn
      if (controlStore.def(jog)) controlStore.onChange(jog, (e) => { if (e.source === 'user') d.jog(e.delta); });
    }
  }

  // --- track lists (TRACK SEARCH) ---
  // The list the track was loaded from, in the order it was shown (ALBUM, BPM,
  // KEY, PLAYLIST or TRACK view, sort applied: loaded.list, src/screens/state.js);
  // without one (older state), the playlist / USB key order.
  const listFor = (unit, loaded) => {
    if (loaded.list?.length) {
      const tracks = loaded.list.map((id) => library.track(id)).filter(Boolean);
      if (tracks.some((t) => t.id === loaded.trackId)) return tracks;
    }
    if (loaded.from === 'playlist') {
      const open = library.playlists[store.nav(unit, 'playlist').open ?? -1];
      if (open?.trackIds.includes(loaded.trackId)) return library.playlistTracks(open);
      const pl = library.playlists.find((p) => p.trackIds.includes(loaded.trackId));
      if (pl) return library.playlistTracks(pl);
    }
    return library.sources.find((s) => s.id === loaded.sourceId)?.tracks ?? [];
  };
  const trackSearch = (unit, dir) => {
    const d = decks[unit];
    const loaded = store.get(unit).loaded;
    if (!loaded) return;
    if (dir < 0 && d.status === 'ready' && d.position > 2) { d.seek(0); return; }
    const list = listFor(unit, loaded);
    const t = list[list.findIndex((x) => x.id === loaded.trackId) + dir];
    if (t) router.api(unit)?.loadTrack(t, { from: loaded.from, autoPlay: d.playing || d.pendingPlay, list: loaded.list ?? null });
  };

  const keySync = (unit) => {
    const d = decks[unit];
    const m = sync.masterUnit && sync.masterUnit !== unit ? decks[sync.masterUnit] : decks[UNITS.find((u) => u !== unit)];
    const s = keyShiftTo(d.track?.key, m?.track?.key);
    if (s == null) return;
    d.setKeyShift(d.keyShift === s && s !== 0 ? 0 : s);
  };
  const stopHeld = (h) => { if (h?.timer) clearInterval(h.timer); };

  return {
    handlePress(info) {
      const p = parse(info);
      if (!p) return null;
      const d = decks[p.unit];
      const keep = (extra = {}) => { stopHeld(held.get(info.id)); held.set(info.id, { ...p, ...extra }); };
      const L = HOT[p.zone];
      if (L) { d.hotCueDown(L); keep(); return HOLD; }
      switch (p.zone) {
        case 'play': d.toggle(); return HOLD;
        case 'cue': d.cueDown(); keep(); return HOLD;
        case 'jog':
          // top of the platter = touch (VINYL: holds the record, scratch); the side
          // ring = no touch, the turn bends the pitch (or searches when paused)
          if (jogTop(info.point)) { d.jogTouch(true); keep(); }
          return HOLD_FREE;
        case 'search_rev': case 'search_fwd': {
          const step = (p.zone === 'search_fwd' ? 1 : -1) * SEARCH_STEP;
          d.scrubBy(step);
          keep({ timer: setInterval(() => d.scrubBy(step), 1000 / SEARCH_HZ) });
          return HOLD;
        }
        case 'in_cue': d.loopIn(); return HOLD;
        case 'out': d.loopOut(); return HOLD;
        case 'reloop_exit': d.reloopExit(); return HOLD;
        case 'beat_loop_4': d.beatLoopButton(4); return HOLD;
        case 'beat_loop_8': d.beatLoopButton(8); return HOLD;
        case 'beat_jump_back': d.beatJump(-1); return HOLD;
        case 'beat_jump_fwd': d.beatJump(1); return HOLD;
        case 'track_search_prev': trackSearch(p.unit, -1); return HOLD;
        case 'track_search_next': trackSearch(p.unit, 1); return HOLD;
        case 'call': d.callHotCues(); return HOLD;
        case 'memory': d.memoryStore(); return HOLD;
        case 'cue_loop_call_prev': d.memoryCall(-1); return HOLD;
        case 'cue_loop_call_next': d.memoryCall(1); return HOLD;
        case 'delete': d.deletePress(); return HOLD;
        default: return null;
      }
    },
    handleRelease(info) {
      const h = held.get(info?.id);
      if (!h) return false;
      held.delete(info.id);
      stopHeld(h);
      const d = decks[h.unit];
      const L = HOT[h.zone];
      if (L) d.hotCueUp(L);
      else if (h.zone === 'cue') d.cueUp();
      else if (h.zone === 'jog') d.jogTouch(false);
      return true;
    },
    // Release everything held (window lost focus...). hotspots.js does it per press.
    releaseAll() { for (const id of [...held.keys()]) this.handleRelease({ id }); },
    handleButton(info) {
      const p = parse(info);
      if (!p) return false;
      const d = decks[p.unit];
      switch (p.zone) {
        case 'quantize': d.toggleQuantize(); return true;
        case 'beat_sync': sync.toggleSync(p.unit); return true;
        case 'master': sync.setMaster(p.unit); return true;
        case 'master_tempo': d.toggleMasterTempo(); return true;
        case 'tempo_range': d.cycleTempoRange(); return true;
        case 'tempo_reset': d.toggleTempoReset(); return true;
        case 'time_mode': { const api = router.api(p.unit); api?.setNavOf('player', { elapsed: !api.navOf('player').elapsed }); return true; }
        case 'auto_cue': d.toggleAutoCue(); return true;
        case 'vinyl': case 'jog_mode': d.toggleVinyl(); return true;
        case 'key_sync': keySync(p.unit); return true;
        case 'usb_stop':
          if (d.status !== 'empty' && !d.playing && !d.sampling) { d.unload(); store.setLoaded(p.unit, null); }
          return true;
        default:
          return HOT[p.zone] != null || PRESS_ZONES.has(p.zone); // handled on the press
      }
    },
  };
}

const PRESS_ZONES = new Set(['play', 'cue', 'jog', 'search_rev', 'search_fwd', 'in_cue', 'out', 'reloop_exit', 'beat_loop_4', 'beat_loop_8',
  'beat_jump_back', 'beat_jump_fwd', 'track_search_prev', 'track_search_next', 'call', 'memory', 'cue_loop_call_prev', 'cue_loop_call_next', 'delete']);
