// Waveform analysis of a REAL decoded AudioBuffer (no fake data).
//   const wf = await computeWaveform(buffer)        // chunked, never blocks a frame for long
//   wf.duration (s), wf.rate (bins per second), wf.length (bins)
//   wf.peak, wf.rms, wf.low, wf.mid, wf.high : Uint8Array(length), 0..255, normalised
//     peak = full band envelope (max |sample| per bin); rms = loudness per bin
//     (same scale, smaller: use it for the body of overviews); low / mid / high = rough
//     3-band split (one-pole filters ~250 Hz / ~2.5 kHz), same scale as peak.
//   wf.overview(n)  -> { peak, rms, low, mid, high } Uint8Array(n), max-pooled (cached per n):
//                      the whole track in n columns (overall waveform, previews).
//   wf.binAt(t)     -> bin index of time t (s); wf.timeAt(i) -> s
// Beat grid, estimated on the audio (constant tempo assumed, like a rekordbox grid):
//   wf.bpm          -> detected tempo (BPM, 1 decimal; snapped to an integer when the
//                      audio agrees), or null when no clear pulse was found (then
//                      use the manifest BPM). Range 70..180, octave chosen with a
//                      prior centred on 120 (a 80 / 160 track may come out doubled / halved).
//   wf.firstBeat    -> time (s) of the first beat of the grid, in [0, 60 / bpm)
//   wf.barOffset    -> index (0..3) of the first beat that starts a bar
//                      (beat k is at firstBeat + k * 60 / bpm; bar starts: k % 4 === barOffset)
//   wf.beatConfidence -> 0..1, how periodic the onsets are at that tempo
//   wf.firstSound   -> time (s) of the first audible sound (AUTO CUE)
//   wf.autoCues     -> [{ time, label: 'A'..'H' }] section changes snapped to bars
//                      (automatic hot cues, sorted by time, at most 8)
// For the scrolling (enlarged) waveform, read wf.peak / wf.low ... directly
// around wf.binAt(position): at the default zoom ~150 bins per second.
//   analyse(url, getBuffer) caches the result per URL (waveformFor(url) returns
//   it synchronously once known, or null). A failure is not retried in a loop:
//   growing wait (2 s, 4 s, 8 s), given up after 3 failures (./retry.js);
//   canAnalyse(url) tells whether an attempt is allowed now.

import { createRetryGate } from './retry.js';

export const BINS_PER_SECOND = 150;
const CHUNK_SECONDS = 4; // processed between two yields to the event loop
const LOW_HZ = 250;
const HIGH_HZ = 2500;
const BPM_MIN = 70;
const BPM_MAX = 180;
const MIN_CONFIDENCE = 0.04; // demo tracks: 0.11 .. 0.45

const cache = new Map(); // url -> Promise<Waveform>
const done = new Map(); // url -> Waveform

const yieldToLoop = () => new Promise((r) => setTimeout(r, 0));

export async function computeWaveform(buffer) {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const chans = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chans.push(buffer.getChannelData(c));
  const per = Math.max(1, Math.round(sr / BINS_PER_SECOND));
  const length = Math.ceil(n / per);
  const peak = new Float32Array(length), low = new Float32Array(length), mid = new Float32Array(length), high = new Float32Array(length);
  const sq = new Float32Array(length), eL = new Float32Array(length), eM = new Float32Array(length), eH = new Float32Array(length);
  // one-pole coefficients
  const aL = 1 - Math.exp((-2 * Math.PI * LOW_HZ) / sr);
  const aH = 1 - Math.exp((-2 * Math.PI * HIGH_HZ) / sr);
  let lp = 0, lpH = 0;
  const L = chans[0], R = chans[1] ?? chans[0];
  const chunk = Math.max(per, Math.round((CHUNK_SECONDS * sr) / per) * per);
  for (let start = 0; start < n; start += chunk) {
    const end = Math.min(n, start + chunk);
    for (let i = start; i < end; i++) {
      const s = (L[i] + R[i]) * 0.5;
      lp += aL * (s - lp); // low band
      lpH += aH * (s - lpH); // everything under ~2.5 kHz
      const hi = s - lpH;
      const md = lpH - lp;
      const b = (i / per) | 0;
      const as = s < 0 ? -s : s, al = lp < 0 ? -lp : lp, am = md < 0 ? -md : md, ah = hi < 0 ? -hi : hi;
      sq[b] += s * s;
      eL[b] += lp * lp; eM[b] += md * md; eH[b] += hi * hi;
      if (as > peak[b]) peak[b] = as;
      if (al > low[b]) low[b] = al;
      if (am > mid[b]) mid[b] = am;
      if (ah > high[b]) high[b] = ah;
    }
    if (end < n) await yieldToLoop();
  }
  // Normalise on a high percentile of the full band (a few clipped peaks must
  // not flatten everything), same factor for every band so they stay comparable.
  const sorted = Float32Array.from(peak).sort();
  const ref = sorted[Math.floor(sorted.length * 0.995)] || sorted[sorted.length - 1] || 1;
  const toU8 = (a) => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.min(255, Math.round((a[i] / ref) * 240)); return o; };
  const rms = new Float32Array(length);
  for (let b = 0; b < length; b++) rms[b] = Math.sqrt(sq[b] / Math.max(1, Math.min(per, n - b * per))) * 1.41; // sine RMS -> its peak
  const rate = sr / per;
  await yieldToLoop();
  const grid = await analyseBeats({ sq, eL, eM, eH, peak, ref, rate, length });
  return makeWaveform({ duration: buffer.duration, rate, peak: toU8(peak), rms: toU8(rms), low: toU8(low), mid: toU8(mid), high: toU8(high), ...grid });
}

// --- beat grid ---------------------------------------------------------------

// Onset strength per bin: half-wave rectified difference (over 2 bins) of the
// compressed, lightly smoothed energy of each band (spectral-flux-like), each
// band normalised by its mean flux. The 6.7 ms bins are too short for a raw
// bin-to-bin difference (the low band fluctuates with the phase of the bass).
const SMOOTH = 3, GAP = 2;
export const TEMPO_BANDS = (e) => [[e.sq, 1.0], [e.eH, 1.0], [e.eL, 0.5], [e.eM, 0.3]];
export const PHASE_BANDS = (e) => [[e.eL, 1.0], [e.sq, 0.5]]; // kick first (not the off-beat hats)
export function onsetEnvelope(e, bands = TEMPO_BANDS(e)) {
  const { length } = e;
  const o = new Float32Array(length);
  const c = new Float32Array(length), s = new Float32Array(length), d = new Float32Array(length);
  for (const [e, w] of bands) {
    let mean = 0;
    for (let i = 0; i < length; i++) mean += e[i];
    mean = mean / length || 1e-12;
    let acc = 0;
    for (let i = 0; i < length; i++) {
      c[i] = Math.log1p((100 * e[i]) / mean);
      acc += c[i];
      if (i >= SMOOTH) acc -= c[i - SMOOTH];
      s[i] = acc / Math.min(i + 1, SMOOTH);
    }
    let fm = 0;
    for (let i = GAP; i < length; i++) { const v = s[i] - s[i - GAP]; d[i] = v > 0 ? v : 0; fm += d[i]; }
    fm = fm / length || 1;
    for (let i = GAP; i < length; i++) o[i] += (w * d[i]) / fm;
  }
  return o;
}
// The flux of a step at bin j peaks ~1.5 bins later (smoothing + gap): grid
// times are moved back by this much (calibrated on the attacks of the samples).
const ONSET_DELAY_BINS = 1.5;

// Magnitude / phase of the onsets at one beat frequency (and its 2nd harmonic).
export function periodicity(o, rate, bpm) {
  const w = (2 * Math.PI * bpm) / (60 * rate);
  let re = 0, im = 0, re2 = 0, im2 = 0;
  // rotation recurrence, renormalised every 1024 steps
  let c = 1, s = 0, c2 = 1, s2 = 0;
  const cw = Math.cos(w), sw = Math.sin(w), cw2 = Math.cos(2 * w), sw2 = Math.sin(2 * w);
  for (let i = 0; i < o.length; i++) {
    const v = o[i];
    if (v) { re += v * c; im -= v * s; re2 += v * c2; im2 -= v * s2; }
    const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc;
    const nc2 = c2 * cw2 - s2 * sw2; s2 = s2 * cw2 + c2 * sw2; c2 = nc2;
    if ((i & 1023) === 1023) {
      const k = 1 / Math.hypot(c, s); c *= k; s *= k;
      const k2 = 1 / Math.hypot(c2, s2); c2 *= k2; s2 *= k2;
    }
  }
  return { mag: Math.hypot(re, im) + 0.5 * Math.hypot(re2, im2), re, im, w };
}

export async function analyseBeats({ sq, eL, eM, eH, peak, ref, rate, length }) {
  const none = { bpm: null, firstBeat: 0, barOffset: 0, beatConfidence: 0, firstSound: 0, autoCues: [] };
  // first audible sound (-40 dB under the normalisation reference)
  let firstSound = 0;
  for (let i = 0; i < length; i++) if (peak[i] > ref * 0.01) { firstSound = i / rate; break; }
  none.firstSound = firstSound;
  if (length < rate * 8) return none;
  const o = onsetEnvelope({ sq, eL, eM, eH, length });
  let total = 0;
  for (let i = 0; i < length; i++) total += o[i];
  if (!(total > 0)) return none;

  // 1. coarse: periodicity of the onsets (fundamental + 2nd harmonic) from
  //    BPM_MIN to BPM_MAX, weighted by a tempo prior centred on 120 BPM
  //    (octave errors: 80 / 160...).
  //    Done on the envelope decimated by 2 (75 Hz is plenty for <= 6 Hz).
  const o2 = new Float32Array(length >> 1);
  for (let i = 0; i < o2.length; i++) o2[i] = o[2 * i] + o[2 * i + 1];
  let best = 0, bestScore = -Infinity;
  let k = 0;
  for (let bpm = BPM_MIN; bpm <= BPM_MAX; bpm += 0.2, k++) {
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.5) ** 2);
    const score = periodicity(o2, rate / 2, bpm).mag * (0.5 + prior);
    if (score > bestScore) { bestScore = score; best = bpm; }
    if ((k & 31) === 31) await yieldToLoop();
  }
  // 2. fine: +-0.3 BPM around it, 0.01 steps (the whole track is ~150 beats long)
  let fine = best, fineMag = -Infinity;
  const mags = new Map();
  for (let j = -30; j <= 30; j++) {
    const bpm = best + j * 0.01;
    const m = periodicity(o, rate, bpm).mag;
    mags.set(Math.round(bpm * 100), m);
    if (m > fineMag) { fineMag = m; fine = bpm; }
    if ((j & 15) === 15) await yieldToLoop();
  }
  // snap to an integer tempo when the audio agrees (DAW-made tracks)
  let bpm = Math.round(fine * 10) / 10;
  const int = Math.round(fine);
  if (Math.abs(int - fine) <= 0.15) {
    const mi = mags.get(int * 100) ?? periodicity(o, rate, int).mag;
    if (mi >= fineMag * 0.95) bpm = int;
  }
  // 3. phase: comb over the kick-weighted onsets (strongest pulse position)
  const op = onsetEnvelope({ sq, eL, eM, eH, length }, PHASE_BANDS({ sq, eL, eM, eH }));
  const period = (60 * rate) / bpm; // bins per beat
  let i0 = 0, bestSum = -Infinity;
  for (let ph = 0; ph < period; ph += 0.25) {
    let sum = 0;
    for (let x = ph; x < length - 1; x += period) {
      const i = Math.floor(x), f = x - i;
      sum += op[i] * (1 - f) + op[i + 1] * f;
    }
    if (sum > bestSum) { bestSum = sum; i0 = ph; }
  }
  // attack time = onset peak minus the delay of the flux (smoothing + gap)
  const spb = 60 / bpm;
  let firstBeat = ((((i0 - ONSET_DELAY_BINS) / rate) % spb) + spb) % spb;
  // confidence: share of the onset mass falling near the beats (+-10 % of a beat)
  let near = 0;
  const tol = period * 0.1;
  for (let i = 0; i < length; i++) {
    const ph = (((i - i0) % period) + period) % period;
    if (ph < tol || ph > period - tol) near += o[i];
  }
  const beatConfidence = Math.max(0, Math.min(1, (near / total - 0.2) / 0.6));
  if (beatConfidence < MIN_CONFIDENCE) return none; // no clear pulse: keep the manifest BPM
  await yieldToLoop();

  // 4. bars: energy per beat, section changes happen on bar starts
  const beats = Math.floor((length / rate - firstBeat) / spb);
  const beatE = new Float32Array(Math.max(0, beats));
  for (let k = 0; k < beats; k++) {
    const a = Math.floor((firstBeat + k * spb) * rate), b = Math.min(length, Math.floor((firstBeat + (k + 1) * spb) * rate));
    let s = 0;
    for (let i = a; i < b; i++) s += sq[i];
    beatE[k] = Math.log(1e-9 + s / Math.max(1, b - a));
  }
  const score4 = [0, 0, 0, 0];
  for (let k = 1; k < beats; k++) score4[k % 4] += Math.abs(beatE[k] - beatE[k - 1]);
  // kick accent on the 1 as a tie breaker (low band onset on the beat)
  for (let k = 0; k < beats; k++) {
    const i = Math.round((firstBeat + k * spb) * rate);
    if (i > 0 && i < length) score4[k % 4] += 0.05 * Math.max(0, Math.log1p(eL[i]) - Math.log1p(eL[i - 1]));
  }
  const barOffset = score4.indexOf(Math.max(...score4));

  // 5. automatic hot cues: first bar with sound + strongest section changes
  const autoCues = [];
  const bars = Math.floor((beats - barOffset) / 4);
  if (bars > 4) {
    const barT = (j) => firstBeat + (barOffset + 4 * j) * spb;
    const barE = new Float32Array(bars);
    for (let j = 0; j < bars; j++) { let s = 0; for (let q = 0; q < 4; q++) s += beatE[barOffset + 4 * j + q]; barE[j] = s / 4; }
    const maxE = Math.max(...barE);
    let start = 0;
    while (start < bars - 1 && barE[start] < maxE - 6) start++; // ~ -26 dB
    if (barT(start) + spb * 4 < firstSound) start++;
    const picks = [start];
    const cand = [];
    for (let j = start + 2; j < bars - 2; j++) {
      const span = Math.min(4, j - start, bars - j);
      let before = 0, after = 0;
      for (let q = 1; q <= span; q++) { before += barE[j - q]; after += barE[j + q - 1]; }
      const nov = Math.abs(after - before) / span;
      cand.push({ j, s: nov * ((j - start) % 4 === 0 ? 1.25 : 1) });
    }
    cand.sort((a, b) => b.s - a.s);
    const minScore = Math.max(0.1, 0.1 * (cand[0]?.s ?? 0));
    for (const c of cand) {
      if (picks.length >= 8 || c.s < minScore) break;
      if (picks.every((j) => Math.abs(j - c.j) >= 8)) picks.push(c.j);
    }
    picks.sort((a, b) => a - b).forEach((j, i) => autoCues.push({ time: barT(j), label: 'ABCDEFGH'[i] }));
  }
  firstBeat = Math.round(firstBeat * 1e4) / 1e4;
  return { bpm, firstBeat, barOffset, beatConfidence, firstSound, autoCues };
}

function makeWaveform(w) {
  const overviews = new Map();
  return {
    ...w,
    length: w.peak.length,
    binAt: (t) => Math.floor(t * w.rate),
    timeAt: (i) => i / w.rate,
    overview(n) {
      n = Math.max(1, Math.round(n));
      let o = overviews.get(n);
      if (!o) {
        o = { peak: pool(w.peak, n), rms: pool(w.rms, n), low: pool(w.low, n), mid: pool(w.mid, n), high: pool(w.high, n) };
        overviews.set(n, o);
      }
      return o;
    },
  };
}

// Max-pooling of a Uint8Array into n columns.
function pool(src, n) {
  const out = new Uint8Array(n);
  const len = src.length;
  for (let k = 0; k < n; k++) {
    const a = Math.floor((k * len) / n), b = Math.max(a + 1, Math.floor(((k + 1) * len) / n));
    let m = 0;
    for (let i = a; i < b && i < len; i++) if (src[i] > m) m = src[i];
    out[k] = m;
  }
  return out;
}

// Cached analysis per URL. `getBuffer` returns a Promise<AudioBuffer>.
const gate = createRetryGate({ max: 3, baseMs: 2000 });
export const canAnalyse = (url) => !!done.get(url) || cache.has(url) || gate.allowed(url);
export function analyse(url, getBuffer) {
  let p = cache.get(url);
  if (!p) {
    if (!gate.allowed(url)) return Promise.reject(gate.error(url) ?? new Error('analyse indisponible'));
    p = getBuffer().then(computeWaveform).then((wf) => { done.set(url, wf); gate.ok(url); return wf; });
    p.catch((e) => { cache.delete(url); gate.fail(url, e); });
    cache.set(url, p);
  }
  return p;
}
export function waveformFor(url) { return done.get(url) ?? null; }
