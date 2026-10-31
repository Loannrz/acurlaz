// Per-track cue storage in the browser (localStorage), like the rekordbox data
// a CDJ reads from the USB stick: cue point, hot cues A-H (point or loop),
// memory cues (point or loop). Plus per-deck player settings (quantize, tempo
// range, MT...). Every access is guarded: without localStorage (private mode,
// blocked storage, quota) the decks simply start empty and nothing is saved.
//   trackKey(meta, url)        -> stable id of a track (file name of the manifest)
//   loadCues(key)              -> { cue: number|null, hot: { A: { time, loop? } }, memory: [{ time, loop? }] }
//   saveCues(key, data)        -> true if written
//   loadPrefs(unit) / savePrefs(unit, prefs)
// Keys (bump the version if the meaning of a value changes):
//   acurlaz:v1:cues:<track key>    acurlaz:v1:prefs:<unit>
// A loop is { in, out } in track seconds. Invalid saved values are dropped.

const PREFIX = 'acurlaz:v1:';
export const HOT_CUE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const MAX_MEMORY = 32;

function read(key) {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}
function write(key, value) {
  try { window.localStorage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function remove(key) {
  try { window.localStorage?.removeItem(key); return true; } catch { return false; }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 1e4) / 1e4 : null);
const loopOf = (l) => {
  const a = num(l?.in), b = num(l?.out);
  return a != null && b != null && b > a ? { in: a, out: b } : null;
};
const pointOf = (p) => {
  const time = num(p?.time);
  if (time == null) return null;
  const loop = loopOf(p.loop);
  return loop ? { time, loop } : { time };
};

// Stable id of a track: the file name of the manifest (the manifest order, and
// so `track.id`, may change; the file is what the cues belong to).
export function trackKey(meta, url) {
  return String(meta?.file || meta?.id || url || '').trim() || null;
}

export function emptyCues() { return { cue: null, hot: {}, memory: [] }; }

export function loadCues(key) {
  const out = emptyCues();
  if (!key) return out;
  const d = read(PREFIX + 'cues:' + key);
  if (!d) return out;
  out.cue = num(d.cue);
  if (d.hot && typeof d.hot === 'object') {
    for (const l of HOT_CUE_LABELS) { const p = pointOf(d.hot[l]); if (p) out.hot[l] = p; }
  }
  if (Array.isArray(d.memory)) out.memory = d.memory.map(pointOf).filter(Boolean).sort((a, b) => a.time - b.time).slice(0, MAX_MEMORY);
  return out;
}

export function saveCues(key, { cue = null, hot = {}, memory = [] } = {}) {
  if (!key) return false;
  const data = { v: 1, cue: num(cue), hot: {}, memory: [] };
  for (const l of HOT_CUE_LABELS) { const p = pointOf(hot[l]); if (p) data.hot[l] = p; }
  data.memory = memory.map(pointOf).filter(Boolean).slice(0, MAX_MEMORY);
  if (data.cue == null && !Object.keys(data.hot).length && !data.memory.length) return remove(PREFIX + 'cues:' + key);
  return write(PREFIX + 'cues:' + key, data);
}

export function loadPrefs(unit) { return read(PREFIX + 'prefs:' + unit) ?? {}; }
export function savePrefs(unit, prefs) { return write(PREFIX + 'prefs:' + unit, prefs); }
