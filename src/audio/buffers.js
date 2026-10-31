// Fetch + decode of audio files, with a small cache, and a background queue
// that only computes waveforms (for the PREVIEW column of the track lists).
//   loadBuffer(url)        -> Promise<AudioBuffer>  (LRU of MAX_BUFFERS decoded files)
//   keepBuffers(fn)        -> fn() lists the urls the decks hold: never evicted
//   requestAnalysis(url)   -> queues a waveform analysis (one file at a time, the
//                             decoded buffer is dropped afterwards: only the peaks stay)
//   onAnalysed(fn)         -> fn(url) each time a queued analysis finishes
//   hasFailed(url)         -> true once the file was found missing / undecodable
// A file that is missing (HTTP error, HTML fallback page) or undecodable is
// remembered in `failed`: it is never fetched again during the visit (the track
// lists ask for previews on every redraw; without this they would retry forever).
// Other failures (network down, an exception) are counted per URL (./retry.js):
// a background analysis waits 2 s, 4 s, 8 s before trying the same file again,
// and gives it up after 3 failures. A LOAD asked by the user always tries (it
// is a single attempt, never a loop) and its failure is counted too.
// Decoded audio is big (~10 MB per stereo minute), so only a few buffers stay.
import { engine } from './engine.js';
import { analyse, waveformFor, canAnalyse } from './waveform.js';
import { createRetryGate } from './retry.js';
import { AUDIO } from '../config.js';

// Decoded audio is ~10 MB per stereo minute (a 2.5 min track: ~50 MB): the two
// decks + one previous track (4 kept up to ~200 MB; phones: 2, AUDIO in config). Track list previews never
// enter this cache (analysed one at a time, buffer dropped: see pump below).
const MAX_BUFFERS = AUDIO.maxBuffers ?? 3; // MOBILE profile: 2
const buffers = new Map(); // url -> Promise<AudioBuffer>, insertion order = LRU
let inUse = () => []; // urls loaded (or loading) in a deck: evicted last
const failed = new Map(); // url -> Error (missing or undecodable: not fetched again)
const net = createRetryGate({ max: 3, baseMs: 2000 }); // temporary failures (network...)

export const hasFailed = (url) => failed.has(url);

// fetch + decode; definitive failures (HTTP error, HTML page, decode error) are
// remembered, a network error (offline) is counted (growing wait, at most 3).
function fetchDecode(url) {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { missing: true });
      const type = r.headers.get('content-type') || '';
      if (/text\/html/.test(type)) throw Object.assign(new Error('fichier audio introuvable'), { missing: true });
      return r.arrayBuffer();
    })
    .then((ab) => engine.decode(ab).catch((e) => { throw Object.assign(new Error(e?.message || 'fichier audio illisible'), { missing: true }); }))
    .then((buf) => { net.ok(url); return buf; })
    .catch((e) => { if (e?.missing) failed.set(url, e); else net.fail(url, e); throw e; });
}

export function loadBuffer(url) {
  if (failed.has(url)) return Promise.reject(failed.get(url));
  let p = buffers.get(url);
  if (p) { buffers.delete(url); buffers.set(url, p); return p; }
  p = fetchDecode(url);
  p.catch(() => buffers.delete(url));
  buffers.set(url, p);
  evict();
  return p;
}

export function keepBuffers(fn) { inUse = fn; }

// Over MAX_BUFFERS: drop the least recently used file that no deck holds (a
// deck keeps its own AudioBuffer anyway; dropping its cache entry would only
// force a new fetch + decode if it is loaded again). Never more than MAX_BUFFERS
// unless every cached file is on a deck.
function evict() {
  if (buffers.size <= MAX_BUFFERS) return;
  const held = new Set(inUse());
  for (const url of [...buffers.keys()]) {
    if (buffers.size <= MAX_BUFFERS) break;
    if (!held.has(url)) buffers.delete(url);
  }
}

// --- background waveform analysis (previews) ---
const queue = [];
const queued = new Set();
const listeners = new Set();
let running = false;

export function requestAnalysis(url) {
  if (!url || waveformFor(url) || queued.has(url) || failed.has(url)) return;
  if (!net.allowed(url) || !canAnalyse(url)) return; // failed recently (waiting) or given up
  queued.add(url);
  queue.push(url);
  pump();
}
export function onAnalysed(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const url = queue.shift();
    try {
      // Decoded here without entering the playback LRU (the buffer is dropped after).
      const cached = buffers.get(url);
      await analyse(url, () => cached ?? fetchDecode(url));
      for (const fn of listeners) fn(url);
    } catch { /* missing or undecodable file: no preview, nothing else */ }
    queued.delete(url);
  }
  running = false;
}
export const cachedUrls = () => [...buffers.keys()]; // tests / dev
