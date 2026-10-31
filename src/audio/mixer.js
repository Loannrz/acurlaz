// Mixer audio (DJM-900NXS2): the real routing between the decks and the master.
// Every control of the 3D mixer (src/controls/, store ids 'mixer_*') and every
// mixer button with a state (src/audio/mixerButtons.js) acts on this graph.
//
//   import { mixer } from './mixer.js';
//   mixer.bind({ store, decks })   // main.js, once: subscribes to store.onChange (no polling)
//   mixer.input(unit)              // deck.js: AudioNode the deck output goes into (its channel
//                                  // strip), built on demand; null without AudioContext
//   mixer.setOption(key, value)    // button states (MIXER_OPTION_DEFAULTS), source of truth here
//   mixer.option(key) / mixer.options() / mixer.onOption(fn)  fn({ key, value, prev })
//   mixer.analyserFor(vuId)        // 'ch1'..'ch4' | 'masterL' | 'masterR' -> AnalyserNode | null
//   mixer.debug()                  // gains currently targeted (tests / dev panel)
//
// Signal flow (one strip per channel that has a source, VU_MAP in config.js:
// left CDJ -> CH1, right CDJ -> CH2; CH3/CH4 have no source: their controls
// move, nothing is built for them):
//   deck -> INPUT gate -> TRIM -> EQ (low shelf 70 Hz, peaking 1 kHz, high shelf 13 kHz,
//   -26..+6 dB) -> 3-band split (isolator / kill) -> COLOR filter (LPF left, HPF right)
//   -> CH FADER (curve) -> Beat FX insert -> [VU tap] -> assign A / THRU / B
//   bus A -> Beat FX insert -> crossfader gain A -+
//   bus B -> Beat FX insert -> crossfader gain B -+-> sum -> Beat FX insert (MASTER)
//   bus THRU ------------------------------------+     -> MASTER LEVEL -> BALANCE
//   -> limiter (+ soft clip ceiling) -> [master VU tap] -> engine.master -> speakers
// Nodes are created once (strip on the first output of its deck, the rest with
// it); a control change only moves AudioParams with setTargetAtTime (no click).
// Values saved by the store are applied with .value when the graph is built,
// i.e. before the first sample of a deck reaches it.
//
// Not audio on purpose (no separate output in a browser page; state only, kept by
// mixerButtons): CH CUE, MASTER CUE, LINK CUE, HEADPHONES LEVEL / MIXING, MONO
// SPLIT / STEREO (a headphones switch on the DJM), BOOTH MONITOR, MIC, SEND/RETURN,
// X-PAD, QUANTIZE, TAP, FX FREQUENCY, Sound Color FX other than FILTER, Beat FX
// SPIRAL / PITCH / SLIP ROLL / ROLL / VINYL BRAKE / HELIX.
import { engine } from './engine.js';
import { VU_MAP } from '../config.js';

export const MIXER_AUDIO = {
  smooth: 0.012, // s, time constant of every parameter move (setTargetAtTime)
  // EQ mode, DJM-900NXS2 spec: HI 13 kHz, MID 1 kHz, LOW 70 Hz, -26 dB to +6 dB
  eq: { hi: 13000, mid: 1000, midQ: 0.7, low: 70, minDb: -26, maxDb: 6 },
  // 3-band split (Linkwitz-Riley 24 dB/oct, flat when all bands are at 0 dB):
  // the band gains of ISOLATOR mode, and the KILL at the bottom of a knob in EQ mode
  iso: { low: 250, high: 2500 },
  // channel VU tap: 'postFader' = after fader, EQ, filter, before the crossfader
  // (asked for this site); 'preFader' = DJM manual ("before passing through the
  // channel faders")
  vuTap: 'postFader',
  limiter: { threshold: -1.5, knee: 0, ratio: 20, attack: 0.002, release: 0.12 },
  // Beat FX time: beat fractions of the BEAT < > buttons; 120 BPM without a track BPM
  beats: [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4, 8, 16, 32],
  defaultBpm: 120,
};

// Button states (persisted by mixerButtons.js).
export const MIXER_OPTION_DEFAULTS = Object.freeze({
  xf1: 'A', xf2: 'B', xf3: 'THRU', xf4: 'THRU', // CROSSFADER ASSIGN per channel
  xfCurve: 0, // CROSS FADER CURVE: 0 slow (equal power), 1 fast (no dip), 2 cut
  chCurve: 1, // CH FADER CURVE: 0 slow, 1 smooth (default), 2 fast
  eqCurve: 0, // EQ CURVE: 0 EQ, 1 ISOLATOR
  colorFilter: true, // Sound Color FX FILTER lit (COLOR knob = LPF / HPF)
  fxOn: false, // Beat FX ON/OFF
  beat: 5, // index in MIXER_AUDIO.beats (1 beat)
  fxTimeMs: 0, // TIME knob turned: manual time in ms (0 = follows the beat)
  cue1: false, cue2: false, cue3: false, cue4: false, masterCue: false, linkCue: false,
  monoSplit: false, // false = STEREO
});
const OPTION_CHECK = {
  xf: (v) => v === 'A' || v === 'THRU' || v === 'B',
  curve: (v) => Number.isInteger(v) && v >= 0 && v <= 2,
};
function validOption(key, v) {
  const d = MIXER_OPTION_DEFAULTS[key];
  if (d === undefined) return false;
  if (/^xf\d$/.test(key)) return OPTION_CHECK.xf(v);
  if (key === 'xfCurve' || key === 'chCurve') return OPTION_CHECK.curve(v);
  if (key === 'eqCurve') return v === 0 || v === 1;
  if (key === 'beat') return Number.isInteger(v) && v >= 0 && v < MIXER_AUDIO.beats.length;
  if (key === 'fxTimeMs') return Number.isFinite(v) && v >= 0 && v <= 4000;
  return typeof v === typeof d;
}

// Beat FX of the FX SELECT labels (src/controls/defs.js): index -> implementation
const FX_KIND = ['delay', 'echo', 'pingpong', null, 'reverb', 'trans', 'filter', 'flanger', 'phaser', null, null, null, null, null];
// FX CHANNEL SELECT labels: 'CROSS FADER B', 'CROSS FADER A', 'MIC', '1'..'4', 'MASTER'
const FX_TARGET = ['xfB', 'xfA', null, 'ch1', 'ch2', 'ch3', 'ch4', 'master'];
const INPUT_HEARD = new Set([2, 3]); // INPUT SELECT: DIGITAL, LINE carry the CDJ; USB A/B, PHONO, RETURN AUX: nothing connected

// --- curves -------------------------------------------------------------------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dbToGain = (db) => (db === -Infinity ? 0 : 10 ** (db / 20));
// piecewise-linear dB over a knob value; below the first point: off (-inf)
function knobDb(v, pts) {
  if (v < pts[0][0]) return -Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (v <= x1) { const [x0, y0] = pts[i - 1]; return y0 + ((y1 - y0) * (v - x0)) / (x1 - x0); }
  }
  return pts[pts.length - 1][1];
}
const TRIM_PTS = [[0.01, -60], [0.25, -18], [0.5, 0], [1, 9]]; // DJM TRIM: -inf .. +9 dB
const MASTER_PTS = [[0.01, -60], [0.25, -20], [0.5, -6], [0.75, 0], [1, 6]]; // default (0.5) = -6 dB
export const curves = {
  trim: (v) => dbToGain(knobDb(v, TRIM_PTS)),
  master: (v) => dbToGain(knobDb(v, MASTER_PTS)),
  // EQ mode shelf / peak gain (dB): -26 at the bottom, 0 at 12 o'clock, +6 at the top
  eqDb(v) {
    if (Math.abs(v - 0.5) < 0.01) return 0;
    return v < 0.5 ? (MIXER_AUDIO.eq.minDb * (0.5 - v)) / 0.5 : (MIXER_AUDIO.eq.maxDb * (v - 0.5)) / 0.5;
  },
  // EQ mode: KILL (band gain 0) in the last 2 % of the travel
  eqKill: (v) => clamp01((v - 0.004) / 0.02),
  // ISOLATOR band gain: -inf at the bottom, 0 dB at 12 o'clock, +6 dB at the top
  iso(v) {
    if (Math.abs(v - 0.5) < 0.01) return 1;
    if (v < 0.5) return v < 0.004 ? 0 : (2 * v) ** 2;
    return dbToGain((MIXER_AUDIO.eq.maxDb * (v - 0.5)) / 0.5);
  },
  // channel fader: 0 = bottom (silence) .. 1 = top (0 dB)
  fader(v, curve) {
    if (v < 0.003) return 0;
    if (curve === 0) return v ** 3; // slow: rises late
    if (curve === 2) return 1 - (1 - v) ** 3; // fast: rises early
    return v; // smooth (default): -6 dB at mid travel
  },
  // crossfader: x = 0 (A, left) .. 1 (B, right) -> [gain A, gain B]
  crossfader(x, curve) {
    if (curve === 2) { // cut: both full, cut in the last 4 % of each side
      return [clamp01((1 - x) / 0.04), clamp01(x / 0.04)];
    }
    if (curve === 1) return [clamp01(2 * (1 - x)), clamp01(2 * x)]; // fast: no dip at the centre
    // slow (default): equal power, -3 dB each at the centre
    return [x >= 0.999 ? 0 : Math.cos((x * Math.PI) / 2), x <= 0.001 ? 0 : Math.sin((x * Math.PI) / 2)];
  },
  balance: (v) => (Math.abs(v - 0.5) < 0.01 ? [1, 1] : [clamp01(2 * (1 - v)), clamp01(2 * v)]),
  // COLOR knob, FILTER: LPF cutoff down to 50 Hz on the left, HPF up to 9 kHz on the
  // right; neutral around 12 o'clock (LPF at Nyquist and HPF at 0 Hz are exact bypasses)
  color(v, nyquist) {
    const dz = 0.02;
    if (v < 0.5 - dz) return { lp: 18000 * (50 / 18000) ** ((0.5 - dz - v) / (0.5 - dz)), hp: 0 };
    if (v > 0.5 + dz) return { lp: nyquist, hp: 25 * (9000 / 25) ** ((v - 0.5 - dz) / (0.5 - dz)) };
    return { lp: nyquist, hp: 0 };
  },
  // PARAMETER knob with FILTER: resonance (dB, the Q of LPF / HPF biquads)
  resonanceDb: (p) => -3 + 15 * p,
};

// --- module state ---------------------------------------------------------------
const opts = { ...MIXER_OPTION_DEFAULTS };
const optionListeners = new Set();
let store = null;
let decks = null;
let G = null; // graph, built once
const strips = {}; // n -> strip
let fxTarget = null; // last target that received the FX (tail FX keep their return)

function channelOf(unit) {
  for (let n = 1; n <= 4; n++) if (VU_MAP[`ch${n}`] === unit) return n;
  return 0;
}
const val = (id) => store?.get(id) ?? 0.5;

// --- graph ----------------------------------------------------------------------
function build(ctx) {
  const g = { ctx, nyquist: ctx.sampleRate / 2 };
  const gain = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  g.gain = gain;

  g.fx = buildFx(ctx, gain);
  // FX insert at a point of the chain: pre -> dry -> post, pre -> send -> FX -> ret -> post
  g.insert = () => {
    const ins = { pre: gain(1), dry: gain(1), send: gain(0), ret: gain(0), post: gain(1) };
    ins.pre.connect(ins.dry); ins.dry.connect(ins.post);
    ins.pre.connect(ins.send); ins.send.connect(g.fx.input);
    g.fx.output.connect(ins.ret); ins.ret.connect(ins.post);
    return ins;
  };
  g.inserts = {};

  // master section
  g.sum = gain(1);
  g.inserts.master = g.insert();
  g.sum.connect(g.inserts.master.pre);
  g.level = gain(curves.master(0.5));
  g.inserts.master.post.connect(g.level);
  const up = gain(1); // mono sources: up-mixed to L+R before the splitter (discrete)
  up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers';
  g.level.connect(up);
  const split = ctx.createChannelSplitter(2);
  up.connect(split);
  g.balL = gain(1); g.balR = gain(1);
  split.connect(g.balL, 0); split.connect(g.balR, 1);
  const merge = ctx.createChannelMerger(2);
  g.balL.connect(merge, 0, 0); g.balR.connect(merge, 0, 1);
  g.limiter = ctx.createDynamicsCompressor();
  const L = MIXER_AUDIO.limiter;
  g.limiter.threshold.value = L.threshold; g.limiter.knee.value = L.knee; g.limiter.ratio.value = L.ratio;
  g.limiter.attack.value = L.attack; g.limiter.release.value = L.release;
  merge.connect(g.limiter);
  // The compressor adds a make-up gain (Web Audio spec: (1 / gain at 0 dBFS)^0.6):
  // compensated, so the chain stays at unity below the threshold.
  const makeupDb = 0.6 * -L.threshold * (1 - 1 / L.ratio);
  const unity = gain(dbToGain(-makeupDb));
  g.limiter.connect(unity);
  // Safety ceiling for the attack overshoot of the compressor: soft clip above
  // -1.9 dBFS, never above 0.96 (|x| <= 0.8 passes untouched).
  g.output = ctx.createWaveShaper();
  g.output.curve = softClipCurve();
  g.output.oversample = '2x';
  unity.connect(g.output);
  g.output.connect(engine.master);
  const tapSplit = ctx.createChannelSplitter(2);
  g.output.connect(tapSplit);
  const an = () => { const a = ctx.createAnalyser(); a.fftSize = 1024; a.smoothingTimeConstant = 0; return a; };
  g.masterL = an(); g.masterR = an();
  tapSplit.connect(g.masterL, 0); tapSplit.connect(g.masterR, 1);
  g.analyser = an;

  // crossfader buses
  g.bus = { A: gain(1), B: gain(1), THRU: gain(1) };
  g.inserts.xfA = g.insert(); g.inserts.xfB = g.insert();
  g.xfA = gain(1); g.xfB = gain(1);
  g.bus.A.connect(g.inserts.xfA.pre); g.inserts.xfA.post.connect(g.xfA); g.xfA.connect(g.sum);
  g.bus.B.connect(g.inserts.xfB.pre); g.inserts.xfB.post.connect(g.xfB); g.xfB.connect(g.sum);
  g.bus.THRU.connect(g.sum);
  return g;
}

function softClipCurve(n = 4097) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
  }
  return c;
}

function buildStrip(n) {
  const { ctx, gain } = G;
  const bq = (type, f, q, gainDb = 0) => {
    const b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gainDb;
    return b;
  };
  const BW = -3.0103; // Butterworth Q, in dB for lowpass / highpass biquads
  const lr4 = (type, f) => { const a = bq(type, f, BW), b = bq(type, f, BW); a.connect(b); return { in: a, out: b }; };
  const s = { n };
  s.input = gain(1);
  s.gate = gain(1); // INPUT SELECT
  s.trim = gain(1);
  const E = MIXER_AUDIO.eq;
  s.low = bq('lowshelf', E.low, 0);
  s.mid = bq('peaking', E.mid, E.midQ);
  s.hi = bq('highshelf', E.hi, 0);
  s.input.connect(s.gate); s.gate.connect(s.trim);
  s.trim.connect(s.low); s.low.connect(s.mid); s.mid.connect(s.hi);
  // 3-band split: low = LP(fl) * AP(fh), mid = HP(fl) * LP(fh), high = HP(fl) * HP(fh)
  const I = MIXER_AUDIO.iso;
  const lpL = lr4('lowpass', I.low), hpL = lr4('highpass', I.low);
  const apLo = lr4('lowpass', I.high), apHi = lr4('highpass', I.high);
  const lpH = lr4('lowpass', I.high), hpH = lr4('highpass', I.high);
  s.bandLow = gain(1); s.bandMid = gain(1); s.bandHigh = gain(1);
  s.hi.connect(lpL.in); s.hi.connect(hpL.in);
  lpL.out.connect(apLo.in); lpL.out.connect(apHi.in);
  apLo.out.connect(s.bandLow); apHi.out.connect(s.bandLow);
  hpL.out.connect(lpH.in); hpL.out.connect(hpH.in);
  lpH.out.connect(s.bandMid); hpH.out.connect(s.bandHigh);
  // COLOR (Sound Color FX FILTER)
  s.colorLP = bq('lowpass', G.nyquist, curves.resonanceDb(0.5));
  s.colorHP = bq('highpass', 0, curves.resonanceDb(0.5));
  s.bandLow.connect(s.colorLP); s.bandMid.connect(s.colorLP); s.bandHigh.connect(s.colorLP);
  s.colorLP.connect(s.colorHP);
  s.fader = gain(1);
  s.colorHP.connect(s.fader);
  s.ins = G.insert();
  G.inserts[`ch${n}`] = s.ins;
  s.fader.connect(s.ins.pre);
  // VU tap (side branch, not connected to the output)
  s.tap = G.analyser();
  (MIXER_AUDIO.vuTap === 'preFader' ? s.colorHP : s.ins.post).connect(s.tap);
  // CROSSFADER ASSIGN
  s.assign = { A: gain(0), B: gain(0), THRU: gain(0) };
  for (const k of ['A', 'B', 'THRU']) { s.ins.post.connect(s.assign[k]); s.assign[k].connect(G.bus[k]); }
  strips[n] = s;
  return s;
}

// --- Beat FX --------------------------------------------------------------------
function buildFx(ctx, gain) {
  const input = gain(1), output = gain(1);
  const lfo = (type) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = 0.5; o.start(); return o; };
  const bq = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const procs = {};
  // DELAY (one repeat), ECHO (repeats fading out)
  const delayFx = (feedback) => {
    const p = { in: gain(1), out: gain(0), tail: true };
    const d = ctx.createDelay(4.5);
    d.delayTime.value = 0.5;
    const hp = bq('highpass', 150, -3), lp = bq('lowpass', 7000, -3), fb = gain(feedback);
    p.in.connect(d); d.connect(p.out);
    d.connect(hp); hp.connect(lp); lp.connect(fb); fb.connect(d);
    p.setTime = (T, t, k) => d.delayTime.setTargetAtTime(Math.min(4.4, T), t, k);
    p.wet = (dep) => dep; p.dry = () => 1;
    return p;
  };
  procs.delay = delayFx(0);
  procs.echo = delayFx(0.55);
  // PING PONG: repeats alternate left / right
  {
    const p = { in: gain(1), out: gain(0), tail: true };
    const mono = gain(1); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    const dL = ctx.createDelay(4.5), dR = ctx.createDelay(4.5);
    dL.delayTime.value = 0.5; dR.delayTime.value = 0.5;
    const merge = ctx.createChannelMerger(2);
    const hp = bq('highpass', 150, -3), lp = bq('lowpass', 7000, -3), fb = gain(0.55);
    p.in.connect(mono); mono.connect(dL); dL.connect(dR);
    dL.connect(merge, 0, 0); dR.connect(merge, 0, 1); merge.connect(p.out);
    dR.connect(hp); hp.connect(lp); lp.connect(fb); fb.connect(dL);
    p.setTime = (T, t, k) => { const v = Math.min(4.4, T); dL.delayTime.setTargetAtTime(v, t, k); dR.delayTime.setTargetAtTime(v, t, k); };
    p.wet = (dep) => dep; p.dry = () => 1;
    procs.pingpong = p;
  }
  // REVERB: convolution with a generated decaying noise impulse (stereo, 2.6 s)
  {
    const p = { in: gain(1), out: gain(0), tail: true };
    const len = Math.round(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 0x2545f491; // deterministic noise (same room on every visit)
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1; };
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c);
      for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; data[i] = rnd() * Math.exp(-t / 0.55) * Math.min(1, t / 0.004); }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir; // normalised by the node
    const hp = bq('highpass', 250, -3);
    p.in.connect(hp); hp.connect(conv); conv.connect(p.out);
    p.setTime = () => {}; // room fixed; LEVEL/DEPTH sets the amount
    p.wet = (dep) => dep * 1.2; p.dry = () => 1;
    procs.reverb = p;
  }
  // TRANS: rhythmic cut (square LFO on a gain, edges softened)
  {
    const p = { in: gain(1), out: gain(1), tail: false };
    const vca = gain(1), osc = lfo('square'), smooth = bq('lowpass', 120, -3), amt = gain(0);
    osc.connect(smooth); smooth.connect(amt); amt.connect(vca.gain);
    p.in.connect(vca); vca.connect(p.out);
    p.setTime = (T, t, k) => osc.frequency.setTargetAtTime(1 / Math.max(0.02, T), t, k);
    p.setDepth = (dep, t, k) => { vca.gain.setTargetAtTime(1 - dep / 2, t, k); amt.gain.setTargetAtTime(dep / 2, t, k); };
    p.wet = () => 1; p.dry = () => 0;
    procs.trans = p;
  }
  // FILTER: low-pass whose cutoff sweeps (triangle LFO, +-2.5 octaves around 1 kHz)
  {
    const p = { in: gain(1), out: gain(0), tail: false };
    const f = bq('lowpass', 1000, 6), osc = lfo('triangle'), amt = gain(3000);
    osc.connect(amt); amt.connect(f.detune);
    p.in.connect(f); f.connect(p.out);
    p.setTime = (T, t, k) => osc.frequency.setTargetAtTime(1 / Math.max(0.05, 8 * T), t, k);
    p.wet = (dep) => dep; p.dry = (dep) => 1 - dep;
    procs.filter = p;
  }
  // FLANGER: short modulated delay (0.5..4.5 ms) mixed with the dry signal
  {
    const p = { in: gain(1), out: gain(0), tail: false };
    const d = ctx.createDelay(0.02), osc = lfo('sine'), amt = gain(0.002);
    d.delayTime.value = 0.0025;
    osc.connect(amt); amt.connect(d.delayTime);
    p.in.connect(d); d.connect(p.out);
    p.setTime = (T, t, k) => osc.frequency.setTargetAtTime(1 / Math.max(0.05, 8 * T), t, k);
    p.wet = (dep) => dep * 0.9; p.dry = () => 1;
    procs.flanger = p;
  }
  // PHASER: 4 all-pass stages swept by an LFO, mixed with the dry signal
  {
    const p = { in: gain(1), out: gain(0), tail: false };
    const osc = lfo('sine'), amt = gain(1800);
    osc.connect(amt);
    let prev = p.in;
    for (let i = 0; i < 4; i++) { const ap = bq('allpass', 700, 0.6); amt.connect(ap.detune); prev.connect(ap); prev = ap; }
    prev.connect(p.out);
    p.setTime = (T, t, k) => osc.frequency.setTargetAtTime(1 / Math.max(0.05, 8 * T), t, k);
    p.wet = (dep) => dep; p.dry = () => 1;
    procs.phaser = p;
  }
  for (const p of Object.values(procs)) {
    p.gate = gain(0); // only the selected effect is fed and heard
    p.outGate = gain(0);
    input.connect(p.gate); p.gate.connect(p.in);
    p.out.connect(p.outGate); p.outGate.connect(output);
  }
  return { input, output, procs };
}

// --- applying values ----------------------------------------------------------
function setP(param, v, now) {
  if (now) { param.cancelScheduledValues(0); param.value = v; return; }
  param.setTargetAtTime(v, G.ctx.currentTime, MIXER_AUDIO.smooth);
}

function applyStrip(s, now) {
  const n = s.n;
  const p = `mixer_ch${n}_`;
  setP(s.gate.gain, INPUT_HEARD.has(Math.round(val(`${p}input`))) ? 1 : 0, now);
  setP(s.trim.gain, curves.trim(val(`${p}trim`)), now);
  const iso = opts.eqCurve === 1;
  const bands = [['low', 'bandLow', 'eq_low'], ['mid', 'bandMid', 'eq_mid'], ['hi', 'bandHigh', 'eq_hi']];
  for (const [f, band, id] of bands) {
    const v = val(p + id);
    setP(s[f].gain, iso ? 0 : curves.eqDb(v), now);
    setP(s[band].gain, iso ? curves.iso(v) : curves.eqKill(v), now);
  }
  applyColor(s, now);
  setP(s.fader.gain, curves.fader(val(`${p}fader`), opts.chCurve), now);
  const a = opts[`xf${n}`];
  for (const k of ['A', 'B', 'THRU']) setP(s.assign[k].gain, a === k ? 1 : 0, now);
}

function applyColor(s, now) {
  const c = opts.colorFilter ? curves.color(val(`mixer_ch${s.n}_color`), G.nyquist) : { lp: G.nyquist, hp: 0 };
  setP(s.colorLP.frequency, c.lp, now);
  setP(s.colorHP.frequency, c.hp, now);
  const q = curves.resonanceDb(val('mixer_fx_parameter'));
  setP(s.colorLP.Q, q, now);
  setP(s.colorHP.Q, q, now);
}

function applyCrossfader(now) {
  const [a, b] = curves.crossfader(val('mixer_crossfader'), opts.xfCurve);
  setP(G.xfA.gain, a, now);
  setP(G.xfB.gain, b, now);
}

function applyMaster(now) {
  setP(G.level.gain, curves.master(val('mixer_master_level')), now);
  const [l, r] = curves.balance(val('mixer_balance'));
  setP(G.balL.gain, l, now);
  setP(G.balR.gain, r, now);
}

function fxTimeSec() {
  if (opts.fxTimeMs > 0) return opts.fxTimeMs / 1000;
  return (MIXER_AUDIO.beats[opts.beat] * 60) / fxBpm();
}
function fxBpm() {
  if (!decks) return MIXER_AUDIO.defaultBpm;
  const bpmOf = (d) => (d && Number.isFinite(d.bpm) && d.bpm > 0 ? d.bpm : d?.track?.bpm > 0 ? d.track.bpm : 0);
  const t = FX_TARGET[Math.round(val('mixer_fx_channel'))];
  const n = t && /^ch\d$/.test(t) ? +t[2] : 0;
  const own = n ? bpmOf(decks[VU_MAP[`ch${n}`]]) : 0;
  if (own) return own;
  const list = Object.values(decks);
  return bpmOf(list.find((d) => d.playing)) || bpmOf(list.find((d) => d.track)) || MIXER_AUDIO.defaultBpm;
}

function applyFx(now) {
  const kind = FX_KIND[Math.round(val('mixer_fx_select'))] ?? null;
  const target = FX_TARGET[Math.round(val('mixer_fx_channel'))] ?? null;
  const depth = val('mixer_fx_level_depth');
  const procs = G.fx.procs;
  const proc = kind ? procs[kind] : null;
  const t = G.ctx.currentTime, k = MIXER_AUDIO.smooth;
  for (const [name, p] of Object.entries(procs)) {
    const sel = name === kind;
    setP(p.gate.gain, sel ? 1 : 0, now);
    setP(p.outGate.gain, sel ? 1 : 0, now);
  }
  if (proc) {
    proc.setTime(fxTimeSec(), t, now ? 0.001 : 0.05);
    if (proc.setDepth) proc.setDepth(depth, t, k); else setP(proc.out.gain, proc.wet(depth), now);
  }
  const live = !!(opts.fxOn && proc && target && G.inserts[target]);
  if (live) fxTarget = target;
  for (const [name, ins] of Object.entries(G.inserts)) {
    const here = live && name === target;
    setP(ins.send.gain, here ? 1 : 0, now);
    setP(ins.dry.gain, here ? proc.dry(depth) : 1, now);
    // tail effects (echo, reverb) ring out after OFF on the channel they were on
    const ringing = !live && proc?.tail && name === fxTarget;
    setP(ins.ret.gain, here || ringing ? 1 : 0, now);
  }
}

function applyAll(now) {
  for (const s of Object.values(strips)) applyStrip(s, now);
  applyCrossfader(now);
  applyMaster(now);
  applyFx(now);
}

function onStoreChange(e) {
  if (!G || !e.id.startsWith('mixer_')) return;
  const m = /^mixer_ch(\d)_(\w+)$/.exec(e.id);
  if (m) {
    const s = strips[+m[1]];
    if (!s) return; // CH3 / CH4: no source, the control just moves
    if (m[2] === 'color') applyColor(s, false); else applyStrip(s, false);
    return;
  }
  switch (e.id) {
    case 'mixer_crossfader': applyCrossfader(false); break;
    case 'mixer_master_level': case 'mixer_balance': applyMaster(false); break;
    case 'mixer_fx_parameter': for (const s of Object.values(strips)) applyColor(s, false); break;
    case 'mixer_fx_time': { // endless TIME knob: relative, sets a manual time (ms)
      const ms = Math.min(4000, Math.max(1, fxTimeSec() * 1000 * Math.exp(e.delta * 0.6)));
      setOption('fxTimeMs', Math.round(ms));
      break;
    }
    case 'mixer_fx_select': case 'mixer_fx_channel': case 'mixer_fx_level_depth': applyFx(false); break;
    default: break; // booth, headphones, mic, send/return: no audio here (see header)
  }
}

function onOptionChange(key) {
  if (!G) return;
  if (key === 'xfCurve') applyCrossfader(false);
  else if (/^xf\d$/.test(key) || key === 'chCurve' || key === 'eqCurve') for (const s of Object.values(strips)) applyStrip(s, false);
  else if (key === 'colorFilter') for (const s of Object.values(strips)) applyColor(s, false);
  else if (key === 'fxOn' || key === 'beat' || key === 'fxTimeMs') applyFx(false);
}

function setOption(key, value) {
  if (!validOption(key, value) || opts[key] === value) return false;
  const prev = opts[key];
  opts[key] = value;
  if (key === 'beat') opts.fxTimeMs = 0; // BEAT < > : back to the beat-synced time
  onOptionChange(key);
  for (const fn of optionListeners) fn({ key, value, prev });
  return true;
}

function ensureGraph() {
  if (G) return G;
  const ctx = engine.ensure();
  if (!ctx || !engine.master) return null;
  G = build(ctx);
  applyAll(true);
  return G;
}

export const mixer = {
  bind({ store: s, decks: d } = {}) {
    if (s && !store) { store = s; store.onChange(onStoreChange); }
    if (d && !decks) {
      decks = d;
      // the Beat FX time follows the BPM of the loaded / playing tracks
      let lastT = 0;
      for (const deck of Object.values(decks)) {
        deck.onChange(() => {
          if (!G || opts.fxTimeMs !== 0) return;
          const T = fxTimeSec();
          if (Math.abs(T - lastT) > 1e-4) { lastT = T; applyFx(false); }
        });
      }
    }
    if (G) applyAll(true);
  },
  input(unit) {
    const n = channelOf(unit);
    if (!n || !ensureGraph()) return null;
    const s = strips[n] ?? buildStrip(n);
    applyStrip(s, true);
    return s.input;
  },
  // Replay (R): every FX return is closed at once, so the echo / reverb tails
  // stop ringing (the decks are stopped); resumeFx() at the end of the intro
  // opens the return of a live effect again (the tails have died out by then).
  cutTails() {
    fxTarget = null;
    if (!G) return;
    for (const ins of Object.values(G.inserts)) setP(ins.ret.gain, 0, false); // short ramp: no click
  },
  resumeFx() { if (G) applyFx(false); },
  setOption,
  setOptions(o) { for (const [k, v] of Object.entries(o ?? {})) setOption(k, v); },
  option: (key) => opts[key],
  options: () => ({ ...opts }),
  onOption(fn) { optionListeners.add(fn); return () => optionListeners.delete(fn); },
  get built() { return !!G; },
  get graph() { return G; },
  analyserFor(id) {
    if (!G) return null;
    if (id === 'masterL') return G.masterL;
    if (id === 'masterR') return G.masterR;
    const m = /^ch(\d)$/.exec(id);
    return m ? strips[+m[1]]?.tap ?? null : null;
  },
  fxTime: () => fxTimeSec(),
  debug() {
    if (!G) return null;
    const v = (p) => +p.value.toFixed(4);
    const out = { xfA: v(G.xfA.gain), xfB: v(G.xfB.gain), level: v(G.level.gain), balance: [v(G.balL.gain), v(G.balR.gain)], strips: {}, inserts: {} };
    for (const s of Object.values(strips)) {
      out.strips[s.n] = { gate: v(s.gate.gain), trim: v(s.trim.gain), low: v(s.low.gain), mid: v(s.mid.gain), hi: v(s.hi.gain),
        bands: [v(s.bandLow.gain), v(s.bandMid.gain), v(s.bandHigh.gain)], lp: v(s.colorLP.frequency), hp: v(s.colorHP.frequency),
        fader: v(s.fader.gain), assign: { A: v(s.assign.A.gain), B: v(s.assign.B.gain), THRU: v(s.assign.THRU.gain) } };
    }
    for (const [k, ins] of Object.entries(G.inserts)) out.inserts[k] = { dry: v(ins.dry.gain), send: v(ins.send.gain), ret: v(ins.ret.gain) };
    out.fxTime = +fxTimeSec().toFixed(4);
    return out;
  },
};
