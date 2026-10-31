// Mixer buttons and switches with a state (clicks on the 3D mixer zones,
// src/config/hotspots.js): they set the options of src/audio/mixer.js and the
// state is saved in localStorage (STORAGE_KEY), restored at start-up before any
// sound is built. The knobs / faders are not here (src/controls/state.js).
//   const mb = createMixerButtons({ mixer });   // main.js, at start-up
//   mb.handleButton(info)  // onButton: true when the click was a mixer button with a state
//   mb.state()             // options (same as mixer.options())
// Zone (id 'mixer_<zone>')      action                                   audio
//   ch1..4_xf_assign             CROSSFADER ASSIGN cycle A -> THRU -> B    yes
//   crossfader_curve             curve slow (equal power) -> fast -> cut   yes
//   ch_fader_curve               curve slow -> smooth -> fast              yes
//   eq_curve                     EQ <-> ISOLATOR                           yes
//   fx_filter                    Sound Color FX FILTER on / off (COLOR)    yes
//   fx_on_off                    Beat FX on / off                          yes
//   beat_prev / beat_next        Beat FX beat fraction (resets TIME)       yes
//   ch1..4_cue, master_cue,      state only: a web page has a single audio
//   link_cue, mono_split         output, there is no headphones bus to feed
// No LED is modelled on these buttons: the state is not drawn (dev panel /
// mixer.options() show it). Other mixer zones are not handled (return false).
import { MIXER_OPTION_DEFAULTS } from './mixer.js';

export const STORAGE_KEY = 'acurlaz.mixer.v1';
const XF_CYCLE = ['A', 'THRU', 'B'];

function read() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}
function write(data) {
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* private mode / blocked */ }
}

export function createMixerButtons({ mixer }) {
  const saved = read();
  if (saved) mixer.setOptions(saved); // invalid values are ignored by the mixer
  let timer = 0;
  const save = () => {
    clearTimeout(timer); timer = 0;
    const o = mixer.options();
    const out = {};
    for (const k of Object.keys(MIXER_OPTION_DEFAULTS)) out[k] = o[k];
    write(out);
  };
  mixer.onOption(() => { if (!timer) timer = setTimeout(save, 250); });
  try { window.addEventListener('pagehide', () => { if (timer) save(); }); } catch { /* no window */ }

  const toggle = (k) => mixer.setOption(k, !mixer.option(k));
  const cycle = (k, n) => mixer.setOption(k, (mixer.option(k) + 1) % n);

  return {
    state: () => mixer.options(),
    handleButton(info) {
      const m = /^mixer_(.+)$/.exec(info?.id ?? '');
      if (!m) return false;
      const zone = m[1];
      let ch = /^ch(\d)_xf_assign$/.exec(zone);
      if (ch) {
        const k = `xf${ch[1]}`;
        mixer.setOption(k, XF_CYCLE[(XF_CYCLE.indexOf(mixer.option(k)) + 1) % XF_CYCLE.length]);
        return true;
      }
      ch = /^ch(\d)_cue$/.exec(zone);
      if (ch) { toggle(`cue${ch[1]}`); return true; }
      switch (zone) {
        case 'crossfader_curve': cycle('xfCurve', 3); return true;
        case 'ch_fader_curve': cycle('chCurve', 3); return true;
        case 'eq_curve': cycle('eqCurve', 2); return true;
        case 'fx_filter': toggle('colorFilter'); return true;
        case 'fx_on_off': toggle('fxOn'); return true;
        case 'beat_prev': case 'beat_next': {
          const step = zone === 'beat_next' ? 1 : -1;
          // out of range: refused by the mixer; the TIME knob still goes back to the beat
          if (!mixer.setOption('beat', mixer.option('beat') + step)) mixer.setOption('fxTimeMs', 0);
          return true;
        }
        case 'master_cue': toggle('masterCue'); return true;
        case 'link_cue': toggle('linkCue'); return true;
        case 'mono_split': toggle('monoSplit'); return true;
        default: return false;
      }
    },
  };
}
