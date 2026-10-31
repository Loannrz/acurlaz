// Live levels of the mixer for the VU meters (src/scene/vu.js).
//   const live = createVuLive({ vu, decks });   // main.js, decks = screenUI.decks
//   live.update(dt)                              // render loop, dt in seconds
// Measure points (src/audio/mixer.js, mixer.analyserFor), as on the DJM:
//   - channel VU (ch1..ch4): the channel strip AFTER trim, EQ, COLOR filter, channel
//     fader (and its Beat FX), BEFORE the crossfader (MIXER_AUDIO.vuTap = 'preFader'
//     moves it before the fader, as written in the DJM manual);
//   - master VU (masterL / masterR): AFTER crossfader, master level, balance and
//     limiter (what leaves the mixer).
// Before the mixer graph exists (nothing played yet) the old taps are the fallback:
// deck.analyser (deck output) and a splitter on engine.master.
// The taps are side branches that are not connected to the output: the audible
// signal and its latency do not change.
// Level (dBFS): max(RMS + 3, peak - VU_MAP.crestWeight) of the last 1024 samples
// (~23 ms), + offsetDb, then ballistics: instant rise, fall of fallDbPerSec.
// Segments follow the dB scale of VU_MAP (grandeur reelle du DJM).
// Nothing runs while no deck plays (a source runs): update() returns at once, the
// VU are switched off a single time when playback stops. A texture is sent only
// when the number of lit segments changed.
import { VU_MAP } from '../config.js';
import { engine } from './engine.js';
import { mixer } from './mixer.js';

const FLOOR = -90;
const toDb = (x) => (x > 1e-5 ? 20 * Math.log10(x) : FLOOR);

export function createVuLive({ vu, decks }) {
  const buf = new Float32Array(1024);
  const state = {}; // id -> { db (displayed, scale dB), lit }
  for (const id of Object.keys(vu.meters)) state[id] = { db: FLOOR, lit: 0 };
  let master = null; // { L, R } analysers, created once engine.master exists
  let active = false;
  let dirtyOff = false;

  const refresh = () => {
    const was = active;
    active = Object.values(decks).some((d) => d.moving);
    if (was && !active) dirtyOff = true;
  };
  for (const d of Object.values(decks)) d.onChange(refresh);

  const ensureMaster = () => {
    if (master || mixer.built || !engine.context || !engine.master) return;
    const ctx = engine.context;
    const split = ctx.createChannelSplitter(2);
    const mk = (i) => { const a = ctx.createAnalyser(); a.fftSize = 1024; a.smoothingTimeConstant = 0; split.connect(a, i); return a; };
    master = { L: mk(0), R: mk(1) };
    engine.master.connect(split);
  };

  const measure = (an) => {
    if (!an) return FLOOR;
    an.getFloatTimeDomainData(buf);
    let sq = 0, pk = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; sq += v * v; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
    return Math.max(toDb(Math.sqrt(sq / buf.length)) + 3, toDb(pk) - VU_MAP.crestWeight);
  };

  const sourceNode = (id, src) => {
    const tap = mixer.analyserFor(id); // channel strip / master output of the mixer
    if (tap) return tap;
    if (!src) return null;
    if (src === 'masterL') return master?.L ?? null;
    if (src === 'masterR') return master?.R ?? null;
    return decks[src]?.analyser ?? null;
  };

  const apply = (id, lit) => {
    const s = state[id];
    if (s.lit === lit) return;
    s.lit = lit;
    vu.setSegments(id, lit); // repaints + uploads the texture
  };

  return {
    get active() { return active; },
    levels() { const o = {}; for (const id in state) o[id] = { db: state[id].db, lit: state[id].lit }; return o; },
    update(dt) {
      if (!active) {
        if (dirtyOff) { // playback just stopped: everything off, once
          dirtyOff = false;
          for (const id in state) { state[id].db = FLOOR; apply(id, 0); }
        }
        return;
      }
      ensureMaster();
      const fall = VU_MAP.fallDbPerSec * dt;
      for (const id in state) {
        const s = state[id];
        const an = sourceNode(id, VU_MAP[id]);
        const target = an ? measure(an) + VU_MAP.offsetDb : FLOOR;
        s.db = target > s.db ? target : Math.max(target, s.db - fall);
        const scale = id.startsWith('master') ? VU_MAP.masterDb : VU_MAP.channelDb;
        let lit = 0;
        while (lit < scale.length && s.db >= scale[lit]) lit++;
        apply(id, lit);
      }
    },
  };
}
