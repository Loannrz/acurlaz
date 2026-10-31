// State of the movable controls (faders, knobs, selectors, jog, tempo...).
// One store for the whole set, persisted in localStorage. The 3D parts
// (src/controls/index.js) read and write it; later, the audio will subscribe.
//
// CONTRACT
//   ids: the click-zone ids of src/config/hotspots.js, prefixed by the unit
//   ('mixer_ch1_fader', 'mixer_ch2_eq_hi', 'mixer_crossfader', 'cdj_left_tempo',
//   'cdj_right_jog'...): the same ids as onButton / the dev panel.
//   Value per kind (store.def(id).kind):
//     'knob'     0..1, clamped (0 = fully counter-clockwise, 1 = fully clockwise,
//                0.5 = 12 o'clock). EQ, trim, color, levels...
//     'fader'    0..1, clamped. Channel faders: 0 = down (towards the DJ, -inf),
//                1 = up (away). Crossfader: 0 = left (A), 1 = right (B).
//                Tempo: 0 = slider away from the DJ (-range), 0.5 = 0 %,
//                1 = towards the DJ (+range), as on a CDJ.
//     'selector' integer 0..steps-1 (def.labels gives the printed positions).
//     'angle'    radians, wrapped to [0, 2pi), clockwise seen from above (jog,
//                browse rotary, endless encoders). Use `delta` (signed, not
//                wrapped) of the change event for relative motion (jog nudge /
//                scratch, browse steps).
//   store.get(id)                      -> value (default when unknown / not saved)
//   store.set(id, value, source?)      -> true if it changed (clamped / wrapped / rounded)
//   store.nudge(id, delta, source?)    -> adds delta (angles: unwrapped delta kept in the event)
//   store.reset(id, source?)           -> back to def.default (double-click)
//   store.def(id)                      -> { id, kind, default, steps?, labels?, label }
//   store.ids                          -> every id
//   store.onChange(fn) / store.onChange(id, fn) -> unsubscribe function
//       fn({ id, value, prev, delta, source })  source: 'user' | 'reset' | 'load' | any string
//   store.snapshot()                   -> { id: value } of every control
// Persistence: key STORAGE_KEY (bump the version if the meaning of a value
// changes), written 250 ms after the last change and on pagehide; every read and
// write is guarded (private mode, blocked storage): without localStorage the
// controls simply start at their defaults. Invalid saved values are ignored.
// Options: transient(id) -> true: never saved, a saved value is ignored (starts
// at its default); sanitise(values) -> ids whose restored value goes back to
// the default (src/controls/index.js: no silent site on the next visit).

export const STORAGE_KEY = 'acurlaz.controls.v1';
const TAU = Math.PI * 2;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const wrap = (a) => ((a % TAU) + TAU) % TAU;

function readStorage(key) {
  try {
    const raw = window.localStorage?.getItem(key);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}
function writeStorage(key, data) {
  try { window.localStorage?.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}

// defs: [{ id, kind, default, steps?, labels?, label? }]
export function createControlState(defs, { storageKey = STORAGE_KEY, persist = true, transient = () => false, sanitise = null } = {}) {
  const byId = new Map();
  const values = new Map();
  for (const d of defs) {
    if (byId.has(d.id)) continue;
    byId.set(d.id, Object.freeze({ ...d }));
    values.set(d.id, normalise(d, d.default));
  }
  const all = new Set();
  const per = new Map(); // id -> Set

  function normalise(d, v) {
    if (!Number.isFinite(v)) return null;
    switch (d.kind) {
      case 'knob': case 'fader': return clamp01(v);
      case 'selector': return Math.min(d.steps - 1, Math.max(0, Math.round(v)));
      case 'angle': return wrap(v);
      default: return v;
    }
  }

  const emit = (e) => {
    for (const fn of per.get(e.id) ?? []) fn(e);
    for (const fn of all) fn(e);
  };

  // --- persistence ---
  let timer = 0;
  const save = () => {
    clearTimeout(timer); timer = 0;
    if (!persist) return;
    const out = {};
    for (const [id, v] of values) if (!transient(id)) out[id] = Math.round(v * 1e5) / 1e5;
    writeStorage(storageKey, out);
  };
  const schedule = () => { if (persist && !timer) timer = setTimeout(save, 250); };
  if (persist) {
    const saved = readStorage(storageKey);
    if (saved) {
      for (const [id, v] of Object.entries(saved)) {
        const d = byId.get(id);
        const n = d && !transient(id) ? normalise(d, Number(v)) : null;
        if (n != null) values.set(id, n);
      }
      for (const id of sanitise?.(values) ?? []) { const d = byId.get(id); if (d) values.set(id, normalise(d, d.default)); }
    }
    try { window.addEventListener('pagehide', () => { if (timer) save(); }); } catch { /* no window */ }
  }

  const set = (id, value, source = 'user', delta = null) => {
    const d = byId.get(id);
    if (!d) return false;
    const v = normalise(d, value);
    if (v == null) return false;
    const prev = values.get(id);
    if (v === prev) return false;
    values.set(id, v);
    let dd = delta;
    if (dd == null) dd = d.kind === 'angle' ? Math.atan2(Math.sin(v - prev), Math.cos(v - prev)) : v - prev;
    emit({ id, value: v, prev, delta: dd, source });
    schedule();
    return true;
  };

  return {
    get ids() { return [...byId.keys()]; },
    def: (id) => byId.get(id) ?? null,
    get: (id) => values.get(id) ?? byId.get(id)?.default ?? null,
    set: (id, value, source) => set(id, value, source),
    nudge(id, delta, source = 'user') {
      const d = byId.get(id);
      if (!d || !Number.isFinite(delta) || delta === 0) return false;
      return set(id, values.get(id) + delta, source, d.kind === 'angle' ? delta : null);
    },
    reset: (id, source = 'reset') => { const d = byId.get(id); return d ? set(id, d.default, source) : false; },
    onChange(a, b) {
      if (typeof a === 'function') { all.add(a); return () => all.delete(a); }
      if (!per.has(a)) per.set(a, new Set());
      per.get(a).add(b);
      return () => per.get(a)?.delete(b);
    },
    snapshot: () => Object.fromEntries(values),
    flush: save,
  };
}
