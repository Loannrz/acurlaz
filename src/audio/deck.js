// One playback deck per CDJ (Web Audio), independent from the other one. Every
// signal decision of the CDJ lives here: transport, CUE, hot cues, memory cues,
// loops, beat jump, quantize, tempo (slider, range, reset, sync rate, jog bend),
// master tempo / key shift, jog (bend, search, vinyl scratch).
//   const deck = createDeck('cdjLeft');
//   await deck.load(url, meta, { autoPlay })  // fetch + decode (cached) -> 'ready'; saved cues
//                                // (src/audio/cueStore.js) are applied, then the waveform
//   deck.play() / deck.pause() / deck.toggle()
//   deck.cueDown() / deck.cueUp() // CUE button, press / release (see below)
//   deck.seek(seconds)           // track seconds
//   deck.position (s of the TRACK, live), deck.duration (s)
//   deck.status: 'empty' | 'loading' | 'ready' | 'error'
//   deck.playing, deck.cueing (CUE held, cue sampler), deck.sampling (CUE or hot cue held)
//   deck.cuePoint (s), deck.hotCues ({ A: { time, loop? } }), deck.memory ([{ time, loop? }])
//   deck.loop ({ in, out, active, beats } | null)
//   deck.track (meta passed to load), deck.waveform (computeWaveform result or null)
//   deck.grid ({ bpm, spb, first, bar, detected } | null): beat grid of the track
//   deck.trackBpm (BPM of the track: detected on the audio, else the manifest)
//   deck.bpm (BPM heard now: trackBpm x tempo, without the jog bend; the mixer's Beat FX
//            time reads it), deck.baseRate, deck.rate (with the bend), deck.tempoPct
//   deck.onChange(fn)            // fn(deck) on every state change (not on position)
//   deck.analyser                // AnalyserNode tapping the signal AFTER the deck gain (VU
//                                // meters, src/audio/levels.js); null until first output
//   deck.moving                  // true while a source runs (playing or a sampler held)
//   deck.scratching              // true while the top of the jog is held with the scratch voice
// Time: positions are TRACK seconds. The playback rate (tempo x bend) changes the
// speed at which they advance; every rate change is a short linear ramp of
// playbackRate and the position model integrates that ramp exactly, so the
// waveform, beat grid and time display stay on the audio.
// CUE, as on a CDJ:
//   - playing: press = back to the cue point and pause (Back Cue);
//   - paused: press = the paused position becomes the cue point (Cue set; no
//     change when already on it) and the track plays from it while the button
//     is held (Cue Point Sampler); release = back to the cue point, paused.
//   - PLAY pressed while CUE (or a hot cue) is held: playback simply continues after release.
// Hot cues: empty pad = set at the position (on the nearest beat with QUANTIZE; a
// running loop is stored as a loop hot cue); set pad while playing = jump (with
// QUANTIZE, from the beat before so the cue lands on the beat); while paused = play
// while held, back to the hot cue on release.
// Loops: native looping of the buffer source (loopStart / loopEnd, sample accurate,
// no restart); a restart (5 ms fades) only when the position must move.
// Jog, as on a CDJ-3000:
//   - VINYL mode, top of the platter held (jogTouch): the record follows the hand
//     (scratch). Playback stops while it is held; turning it plays the audio at
//     the speed and in the direction of the hand, backwards included, silent when
//     the hand holds still (scratch voice, src/audio/scratch.js, AudioWorklet).
//     Released: playback resumes from where the record is, at the tempo, with no
//     jump (the source starts exactly where and when the voice ends). Without
//     AudioWorklet: short scrub grains (older path).
//   - side ring, CDJ mode, or wheel: pitch bend while playing (nudge, +-15 %),
//     search (audible scrub) while paused.
// Audio starts only after a user gesture (src/audio/engine.js); before that a
// play() is accepted and starts as soon as the context resumes.
import { engine } from './engine.js';
import { mixer } from './mixer.js';
import { loadBuffer, keepBuffers } from './buffers.js';
import { analyse } from './waveform.js';
import { trackKey, loadCues, saveCues, loadPrefs, savePrefs, HOT_CUE_LABELS } from './cueStore.js';
import { createPitchShifter } from './pitchShift.js';
import { ensureScratchModule, createScratchVoice } from './scratch.js';

export { HOT_CUE_LABELS };
export const TEMPO_RANGES = [6, 10, 16, 100]; // %, 100 = WIDE
export const BEAT_JUMPS = [0.5, 1, 2, 4, 8, 16, 32]; // beats (screen BEAT JUMP)
export const BEAT_LOOPS = [0.5, 1, 2, 4, 8, 16]; // beats (screen BEAT LOOP)
export const KEY_SHIFT_MAX = 6; // semitones
const DECLICK = 0.005; // s, fade of a source start / stop (no click on a jump)
const TEMPO_RAMP = 0.06; // s, playbackRate ramp on a tempo change (no audible step)
const BEND_RAMP = 0.03;
const BEND_RELEASE = 0.09; // s without jog motion -> bend back to 0
const BEND_PER_RAD_S = 0.012; // rate change per rad/s of jog motion (x JOG ADJUST)
const BEND_MAX = 0.15;
export const SEC_PER_RAD = 1.8 / (2 * Math.PI); // one jog turn = 1.8 s of audio (33 1/3 rpm)
const DELETE_ARM_MS = 4000;
const MIN_LOOP = 0.01; // s

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Every deck's current file stays in the decoded-buffer cache (src/audio/buffers.js).
const liveDecks = new Set();
keepBuffers(() => [...liveDecks].map((d) => d.url).filter(Boolean));

export function createDeck(unit) {
  const listeners = new Set();
  let status = 'empty';
  let error = null;
  let track = null;
  let url = null;
  let autoPending = 0; // token of a load that will start playing once decoded (autoPlay)
  let key = null; // cue storage key
  let buffer = null;
  let waveform = null;
  let playing = false;
  let hold = null; // { kind: 'cue' | 'hot', label, back } while a sampler is held
  let cuePoint = 0;
  let storedCue = false; // a saved cue point exists for this track: AUTO CUE leaves it alone
  let hot = {}; // label -> { time, loop? }
  let memory = []; // [{ time, loop? }] sorted
  let loop = null; // { in, out, active }
  let pos = 0; // position while stopped (s)
  let run = null; // running source: { src, env, t0, p0, r0, r1, t1, loop: {in,out}|null }
  let gain = null;
  let analyser = null; // side tap after the gain: not connected to the output, no audible effect
  let token = 0;
  let playHook = null; // (deck, from) -> from (beat sync phase alignment at start)
  let deleteUntil = 0, deleteTimer = 0;
  let autoPlayToken = 0;

  // --- settings (saved per deck) ---
  const prefs = { quantize: true, range: 10, mt: false, autoCue: true, vinyl: true, beatJump: 16, ...sanitizePrefs(loadPrefs(unit)) };
  const savePref = () => savePrefs(unit, prefs);
  let fader = 0.5; // tempo slider, 0..1 (0.5 = 0 %)
  let tempoReset = false;
  let syncRate = null; // set by the sync manager while BEAT SYNC is on
  let bend = 1, bendVel = 0, bendT = 0, bendTimer = 0;
  let bendSens = 1; // JOG ADJUST
  let keyShift = 0; // semitones
  let touch = null; // vinyl touch: { wasPlaying, moved }
  let voice = null; // scratch voice (created with the audio graph once the worklet is loaded)
  let lastGrainT = 0, grain = null;

  const duration = () => buffer?.duration ?? track?.duration ?? 0;
  const emit = () => { for (const fn of listeners) fn(api); };

  // --- beat grid ---
  const grid = () => {
    const wf = waveform;
    const bpm = wf?.bpm ?? track?.bpm;
    if (!(bpm > 0)) return null;
    const det = !!wf?.bpm;
    return { bpm, spb: 60 / bpm, first: det ? wf.firstBeat : 0, bar: det ? wf.barOffset : 0, detected: det };
  };
  const snap = (t) => { const g = grid(); return g ? Math.max(0, g.first + Math.round((t - g.first) / g.spb) * g.spb) : t; };
  const beatFloor = (t) => { const g = grid(); return g ? Math.max(0, g.first + Math.floor((t - g.first) / g.spb + 1e-6) * g.spb) : t; };

  // --- rate ---
  const sliderRate = () => 1 + ((fader - 0.5) * 2 * prefs.range) / 100;
  const baseRate = () => syncRate ?? (tempoReset ? 1 : sliderRate());
  const targetRate = () => Math.max(0, baseRate() * bend);
  const rateAt = (t) => {
    if (!run) return targetRate();
    if (t >= run.t1 || run.t1 <= run.t0) return run.r1;
    return run.r0 + ((run.r1 - run.r0) * (t - run.t0)) / (run.t1 - run.t0);
  };
  // track seconds advanced by the running source since its anchor (exact for a linear ramp)
  const advance = (t) => {
    const a = run;
    const dt = t - a.t0;
    if (dt <= 0) return 0;
    const T = a.t1 - a.t0;
    if (T <= 0) return a.r1 * dt;
    if (dt >= T) return ((a.r0 + a.r1) / 2) * T + a.r1 * (dt - T);
    return a.r0 * dt + ((a.r1 - a.r0) * dt * dt) / (2 * T);
  };
  const wrapIn = (p, L) => (L && p >= L.out ? L.in + ((p - L.in) % (L.out - L.in)) : p);
  const live = () => {
    if (!run) return pos;
    const p = wrapIn(run.p0 + advance(engine.currentTime), run.loop);
    return clamp(p, 0, duration());
  };
  // Re-anchor the model at "now" (same line, new origin) before changing anything.
  const reanchor = () => {
    const now = engine.currentTime;
    const p = live();
    const r = rateAt(now);
    run.p0 = p; run.t0 = now; run.r0 = r;
    if (run.t1 < now) run.t1 = now;
    return p;
  };
  const applyRate = (ramp = TEMPO_RAMP) => {
    shifterRatio(ramp);
    if (!run) return;
    const now = engine.currentTime;
    reanchor();
    const target = targetRate();
    run.r0 = rateAt(now); run.r1 = target; run.t0 = now; run.t1 = now + ramp;
    const pr = run.src.playbackRate;
    try {
      pr.cancelScheduledValues(now);
      pr.setValueAtTime(run.r0, now);
      pr.linearRampToValueAtTime(target, now + ramp);
    } catch { pr.value = target; run.r0 = run.r1 = target; run.t1 = now; }
  };

  // --- audio graph: source -> env (declick) -> bus -> dry | pitch shifter -> gain (deck output) ---
  let bus = null, dry = null, wet = null, shifter = null;
  const output = () => {
    const ctx = engine.ensure();
    if (!ctx) return null;
    if (!gain) { gain = ctx.createGain(); gain.gain.value = 1; gain.connect(mixer.input(unit) ?? engine.master); // its mixer channel (src/audio/mixer.js)
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0;
      gain.connect(analyser);
      ensureScratchModule(ctx); // loaded in the background: ready long before the first scratch
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    return ctx;
  };
  const chain = () => {
    const ctx = output();
    if (!ctx) return null;
    if (!bus) {
      bus = ctx.createGain();
      dry = ctx.createGain(); dry.gain.value = shifted() ? 0 : 1;
      wet = ctx.createGain(); wet.gain.value = shifted() ? 1 : 0;
      shifter = createPitchShifter(ctx);
      bus.connect(dry); dry.connect(gain);
      bus.connect(shifter.input); shifter.output.connect(wet); wet.connect(gain);
      shifter.setRatio(shiftRatio(), 0);
    }
    return ctx;
  };
  // MASTER TEMPO: the pitch shifter cancels the tempo rate (key kept); KEY SHIFT adds semitones.
  const shifted = () => prefs.mt || keyShift !== 0;
  const shiftRatio = () => (prefs.mt ? 1 / Math.max(0.5, baseRate()) : 1) * 2 ** (keyShift / 12);
  const shifterRatio = (ramp) => { if (shifter) shifter.setRatio(shiftRatio(), ramp); };
  const shifterRoute = () => {
    if (!shifter) return;
    const now = engine.currentTime, on = shifted();
    dry.gain.setTargetAtTime(on ? 0 : 1, now, 0.01);
    wet.gain.setTargetAtTime(on ? 1 : 0, now, 0.01);
    shifterRatio(0.03);
    shifterRun();
  };
  // the modulation of the shifter runs only while audio plays through it
  const shifterRun = () => {
    if (!shifter) return;
    if (run && shifted()) shifter.start(); else shifter.stop();
  };

  // the scratch voice (null until the worklet is loaded: grain fallback meanwhile)
  const scratchVoice = () => {
    if (voice) return voice;
    const ctx = output();
    if (!ctx || !gain) return null;
    voice = createScratchVoice(ctx, gain); // dry: the shifter only runs with a playing source
    return voice;
  };
  const stopScratch = () => { if (voice?.active) voice.cancel(); };

  const stopSource = () => {
    if (!run) return;
    const { src, env } = run;
    run = null;
    src.onended = () => { src.disconnect(); env.disconnect(); };
    const now = engine.currentTime;
    try {
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(env.gain.value, now);
      env.gain.linearRampToValueAtTime(0, now + DECLICK);
      src.stop(now + DECLICK + 0.002);
    } catch { try { src.stop(); } catch { /* not started */ } }
    shifterRun();
  };
  // when: context time to start at (default now; the release of a scratch starts
  // the source a few ms ahead, exactly when the scratch voice reaches `from`)
  const startSource = (from, when = 0) => {
    const ctx = chain();
    if (!ctx || !buffer) return false;
    stopSource();
    const L = loop?.active ? { in: loop.in, out: loop.out } : null;
    from = clamp(wrapIn(from, L), 0, Math.max(0, duration() - 0.001));
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    const env = ctx.createGain();
    const now = Math.max(ctx.currentTime, when);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(1, now + DECLICK);
    s.connect(env); env.connect(bus);
    const r = targetRate();
    s.playbackRate.value = r;
    if (L) { s.loopStart = L.in; s.loopEnd = L.out; s.loop = true; }
    const me = { src: s, env, t0: now, p0: from, r0: r, r1: r, t1: now, loop: L };
    s.onended = () => {
      s.disconnect(); env.disconnect();
      if (run !== me) return;
      // end of the track (SINGLE play mode): stop at the end; a held sampler
      // stays held and goes back to its point on release
      run = null;
      pos = duration();
      playing = false;
      shifterRun();
      emit();
    };
    s.start(now, from);
    run = me;
    shifterRun();
    return true;
  };
  // Apply the loop settings to the running source, keeping the audio continuous
  // when the position is inside the new loop (or before it).
  const applyLoop = () => {
    if (!run) { if (loop?.active && pos >= loop.out) pos = wrapIn(pos, loop); return; }
    const p = reanchor();
    const L = loop?.active ? { in: loop.in, out: loop.out } : null;
    if (L && p >= L.out) { startSource(wrapIn(p, L)); return; }
    run.loop = L;
    const s = run.src;
    if (L) { s.loopEnd = L.out; s.loopStart = L.in; s.loop = true; } else s.loop = false;
  };
  const moveTo = (t) => {
    t = clamp(t, 0, Math.max(0, duration() - 0.001));
    if (run) startSource(t); else pos = t;
  };

  // --- scrub grains (jog search / scratch / SEARCH while paused): the audio
  // between the old and the new position, played in the time since the last grain ---
  const playGrain = (from, to) => {
    const ctx = output();
    if (!ctx || !buffer) return;
    const d = to - from;
    if (Math.abs(d) < 2e-4) return;
    const now = ctx.currentTime;
    const dur = clamp(now - lastGrainT, 0.025, 0.09);
    lastGrainT = now;
    const rate = clamp(Math.abs(d) / dur, 0.08, 4);
    const len = Math.abs(d) / rate;
    if (grain) { const g = grain; try { g.env.gain.cancelScheduledValues(now); g.env.gain.setTargetAtTime(0, now, 0.002); g.src.stop(now + 0.012); } catch { /* ended */ } }
    const src = ctx.createBufferSource();
    if (d > 0) src.buffer = buffer;
    else { // backwards: a small reversed copy of the segment
      const sr = buffer.sampleRate;
      const a = Math.max(0, Math.floor(to * sr)), b = Math.min(buffer.length, Math.ceil(from * sr));
      if (b - a < 8) return;
      const rev = ctx.createBuffer(buffer.numberOfChannels, b - a, sr);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const s = buffer.getChannelData(c), o = rev.getChannelData(c);
        for (let i = 0; i < b - a; i++) o[i] = s[b - 1 - i];
      }
      src.buffer = rev;
    }
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    const f = Math.min(0.004, len / 3);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(1, now + f);
    env.gain.setValueAtTime(1, now + len - f);
    env.gain.linearRampToValueAtTime(0, now + len);
    src.connect(env); env.connect(gain); // dry: the shifter only runs with a playing source
    src.start(now, d > 0 ? from : 0);
    src.stop(now + len + 0.005);
    const me = { src, env };
    src.onended = () => { src.disconnect(); env.disconnect(); if (grain === me) grain = null; };
    grain = me;
  };

  // --- cues (saved per track) ---
  const persist = () => { if (key) saveCues(key, { cue: storedCue ? cuePoint : null, hot, memory }); };
  const setCue = (t, save = true) => {
    cuePoint = clamp(t, 0, duration());
    if (save) { storedCue = true; persist(); }
  };

  const loopBeats = () => {
    if (!loop || loop.out == null) return null;
    const g = grid();
    return g ? (loop.out - loop.in) / g.spb : null;
  };
  const setLoop = (a, b, active = true) => {
    const d = duration();
    a = clamp(a, 0, d); b = clamp(b, 0, d);
    if (!(b - a >= MIN_LOOP)) return false;
    loop = { in: a, out: b, active };
    applyLoop();
    return true;
  };
  const exitLoop = () => { if (loop?.active) { loop = { ...loop, active: false }; applyLoop(); } };

  const disarmDelete = () => { if (deleteUntil) { deleteUntil = 0; clearTimeout(deleteTimer); } };

  const api = {
    unit,
    get status() { return status; },
    get error() { return error; },
    get track() { return track; },
    get url() { return url; },
    get waveform() { return waveform; },
    get playing() { return playing; },
    get cueing() { return hold?.kind === 'cue'; },
    get sampling() { return !!hold; },
    get held() { return hold ? { ...hold } : null; },
    get cuePoint() { return cuePoint; },
    get hotCues() { return hot; },
    get memory() { return memory; },
    get loop() { return loop ? { ...loop, beats: loopBeats() } : null; },
    get duration() { return duration(); },
    get position() { return live(); },
    get ready() { return status === 'ready'; },
    get analyser() { return analyser; },
    // true while the position moves (playing or a sampler held): screens animate only then
    get moving() { return !!run; },
    get grid() { return grid(); },
    get trackBpm() { return grid()?.bpm ?? null; },
    get bpm() { const g = grid(); return g ? g.bpm * baseRate() : null; },
    get baseRate() { return baseRate(); },
    get rate() { return run ? rateAt(engine.currentTime) : targetRate(); },
    get tempoPct() { return (baseRate() - 1) * 100; },
    get tempoRange() { return prefs.range; },
    get tempoReset() { return tempoReset; },
    get syncRate() { return syncRate; },
    get masterTempo() { return prefs.mt; },
    get keyShift() { return keyShift; },
    get quantize() { return prefs.quantize; },
    get beatJumpSize() { return prefs.beatJump; },
    get autoCue() { return prefs.autoCue; },
    get vinyl() { return prefs.vinyl; },
    get deleteArmed() { return deleteUntil > performance.now(); },
    get touching() { return !!touch; },
    get scratching() { return !!touch?.voice; },
    get playIntent() { return playing || !!touch?.wasPlaying; }, // playing, or held by a vinyl touch

    async load(newUrl, meta = null, { autoPlay = false } = {}) {
      const my = ++token;
      autoPending = autoPlay ? my : 0;
      stopSource(); stopScratch();
      playing = false; hold = null; touch = null;
      status = 'loading'; error = null;
      track = meta; url = newUrl; buffer = null; waveform = null;
      key = trackKey(meta, newUrl);
      const saved = loadCues(key);
      cuePoint = saved.cue ?? 0; storedCue = saved.cue != null;
      hot = saved.hot; memory = saved.memory; loop = null;
      pos = cuePoint;
      keyShift = 0;
      disarmDelete();
      emit();
      try {
        const b = await loadBuffer(newUrl);
        if (my !== token) return false;
        buffer = b;
        status = 'ready';
        cuePoint = clamp(cuePoint, 0, duration()); pos = cuePoint;
        emit();
        if (autoPlay && autoPending === my) { autoPending = 0; api.play(); }
        // waveform + beat grid: a failure of the analysis leaves the deck playable
        // ('ready', no waveform), it never turns a playing deck into 'error'
        let wf = null;
        try { wf = await analyse(newUrl, () => Promise.resolve(b)); } catch (err) { if (import.meta.env.DEV) console.warn('[deck] waveform analysis failed', err); }
        if (my !== token) return true;
        if (!wf) return true;
        waveform = wf;
        // AUTO CUE: a stopped deck still at 0 s, without a saved cue point, goes to
        // the first audible sound (per deck, on every load; never saved)
        if (prefs.autoCue && !storedCue && !run && !playing && pos === 0 && cuePoint === 0 && wf.firstSound > 0.003) {
          cuePoint = pos = wf.firstSound;
        }
        emit();
        return true;
      } catch (e) {
        if (my !== token) return false;
        status = 'error';
        error = e?.message || String(e);
        emit();
        return false;
      }
    },
    unload() {
      token++;
      stopSource(); stopScratch();
      status = 'empty'; error = null; track = null; url = null; key = null; buffer = null; waveform = null;
      playing = false; hold = null; touch = null; pos = 0; cuePoint = 0; storedCue = false;
      hot = {}; memory = []; loop = null; keyShift = 0;
      disarmDelete();
      shifterRatio(0);
      emit();
    },

    // --- transport ---
    play() {
      if (status !== 'ready') return false;
      if (hold) { hold = null; if (run) { playing = true; emit(); return true; } }
      if (playing) return true;
      if (touch) { touch.wasPlaying = true; emit(); return true; } // vinyl: plays on release
      let from = pos >= duration() - 0.05 ? cuePoint : pos;
      if (playHook) { const f = playHook(api, from); if (Number.isFinite(f)) from = f; }
      if (!startSource(from)) return false;
      playing = true;
      emit();
      return true;
    },
    pause() {
      autoPending = 0; // a track still decoding with autoPlay will not start by itself
      if (touch?.wasPlaying) { touch.wasPlaying = false; emit(); return true; }
      if (!playing) return false;
      pos = live();
      stopSource();
      playing = false;
      emit();
      return true;
    },
    // (PLAY/PAUSE while a track decodes to start by itself: cancels that start)
    toggle() { return playing || touch?.wasPlaying || autoPending ? api.pause() : api.play(); },
    get pendingPlay() { return !!autoPending; }, // will start by itself once decoded
    cueDown() {
      if (status !== 'ready') return null;
      if (playing || hold) {
        stopSource();
        playing = false; hold = null;
        pos = cuePoint;
        emit();
        return 'back';
      }
      if (Math.abs(pos - cuePoint) > 0.02 && pos < duration() - 0.05) setCue(pos); // Cue set
      if (!startSource(cuePoint)) return null;
      hold = { kind: 'cue', back: cuePoint };
      emit();
      return 'sampler';
    },
    cueUp() {
      if (hold?.kind !== 'cue') return false;
      stopSource();
      hold = null;
      pos = cuePoint;
      emit();
      return true;
    },
    seek(t) {
      if (status !== 'ready') return;
      t = clamp(t, 0, duration());
      if (loop?.active && (t < loop.in || t >= loop.out)) { loop = { ...loop, active: false }; if (run) { run.loop = null; run.src.loop = false; } }
      moveTo(t);
      emit();
    },
    setCuePoint(t) { setCue(t); emit(); },

    // --- tempo ---
    setTempoFader(v) {
      v = clamp(Number(v), 0, 1);
      if (!Number.isFinite(v) || v === fader) return;
      fader = v;
      if (syncRate == null && !tempoReset) { applyRate(); emit(); }
    },
    cycleTempoRange() {
      prefs.range = TEMPO_RANGES[(TEMPO_RANGES.indexOf(prefs.range) + 1) % TEMPO_RANGES.length];
      savePref();
      applyRate(); emit();
    },
    toggleTempoReset() { tempoReset = !tempoReset; applyRate(); emit(); },
    setSyncRate(r) {
      const next = r == null || !Number.isFinite(r) ? null : clamp(r, 0.25, 4);
      if (next === syncRate || (next != null && syncRate != null && Math.abs(next - syncRate) < 1e-7)) return;
      syncRate = next;
      applyRate(); emit();
    },
    toggleMasterTempo() { prefs.mt = !prefs.mt; savePref(); shifterRoute(); emit(); },
    setKeyShift(n) {
      n = clamp(Math.round(Number(n) || 0), -KEY_SHIFT_MAX, KEY_SHIFT_MAX);
      if (n === keyShift) return;
      chain();
      keyShift = n; shifterRoute(); emit();
    },
    setJogAdjust(v) { bendSens = 0.4 + clamp(Number(v) || 0, 0, 1) * 1.6; },

    // --- jog ---
    // Turning the platter: vinyl touch held = scratch, playing = pitch bend (nudge),
    // paused = search (audible scrub).
    jog(dRad) {
      if (status !== 'ready' || !Number.isFinite(dRad) || dRad === 0) return;
      if (touch) {
        touch.moved = true;
        if (touch.voice?.active) { // the record follows the hand
          pos = clamp(pos + dRad * SEC_PER_RAD, 0, Math.max(0, duration() - 0.001));
          touch.voice.move(pos);
          emit();
          return;
        }
        api.scrubBy(dRad * SEC_PER_RAD);
        return;
      }
      if (run && !hold) { api.bendBy(dRad); return; }
      if (!run) api.scrubBy(dRad * SEC_PER_RAD);
    },
    bendBy(dRad) {
      if (!run) return;
      const t = performance.now();
      const dt = clamp((t - bendT) / 1000, 0.008, 0.1);
      bendT = t;
      bendVel = bendVel * 0.4 + (dRad / dt) * 0.6;
      bend = 1 + clamp(bendVel * BEND_PER_RAD_S * bendSens, -BEND_MAX, BEND_MAX);
      applyRate(BEND_RAMP);
      clearTimeout(bendTimer);
      bendTimer = setTimeout(() => { bendVel = 0; bend = 1; applyRate(0.08); }, BEND_RELEASE * 1000);
    },
    // VINYL mode: touching the platter top holds the record (playback stops), turning
    // it scratches, releasing it starts again. CDJ mode: no touch (jog = bend / search).
    jogTouch(down) {
      if (status !== 'ready') return;
      if (down) {
        if (!prefs.vinyl || touch || hold) return;
        touch = { wasPlaying: playing, moved: false, voice: null };
        if (playing) { pos = live(); stopSource(); playing = false; }
        const v = scratchVoice();
        if (v) { v.begin(buffer, pos); touch.voice = v; }
        emit();
        return;
      }
      if (!touch) return;
      const t = touch;
      touch = null;
      // the voice reaches the last hand position at `when`: the source takes over there
      const when = t.voice?.active ? t.voice.end() : 0;
      if (t.wasPlaying && startSource(pos, when)) playing = true;
      emit();
    },
    scrubBy(sec) {
      if (status !== 'ready' || !Number.isFinite(sec) || sec === 0) return;
      if (run) { moveTo(live() + sec); emit(); return; }
      const from = pos;
      pos = clamp(pos + sec, 0, Math.max(0, duration() - 0.001));
      playGrain(from, pos);
      emit();
    },

    // --- quantize / beat jump ---
    toggleQuantize() { prefs.quantize = !prefs.quantize; savePref(); emit(); },
    setBeatJumpSize(n) { if (BEAT_JUMPS.includes(n)) { prefs.beatJump = n; savePref(); emit(); } },
    beatJump(dir, beats = prefs.beatJump) {
      const g = grid();
      if (status !== 'ready' || !g) return false;
      const d = Math.sign(dir) * beats * g.spb;
      if (loop?.active) { // loop move
        const len = loop.out - loop.in;
        let a = loop.in + d;
        a = clamp(a, 0, duration() - len);
        const shift = a - loop.in;
        const p = live();
        loop = { in: a, out: a + len, active: true };
        if (run) startSource(p + shift); else pos = clamp(p + shift, 0, duration());
      } else {
        const p = live() + d;
        if (p >= duration()) return false;
        moveTo(Math.max(0, p));
      }
      emit();
      return true;
    },

    // --- loops ---
    // IN/CUE: the position (on the beat with QUANTIZE) becomes the loop in point and
    // the cue point (real-time cue); during a loop it moves the in point (IN ADJUST).
    loopIn() {
      if (status !== 'ready') return;
      const p = live();
      const a = prefs.quantize ? snap(p) : p;
      if (loop?.active) { if (loop.out - a >= MIN_LOOP) { loop = { ...loop, in: a }; applyLoop(); } emit(); return; }
      loop = { in: a, out: null, active: false };
      if (!run) { pos = a; setCue(a); } else setCue(a);
      emit();
    },
    // OUT: closes the loop at the position (whole beats from IN with QUANTIZE);
    // during a loop it moves the out point (OUT ADJUST).
    loopOut() {
      if (status !== 'ready' || loop?.in == null) return;
      const p = live();
      const g = grid();
      let b = p;
      if (prefs.quantize && g) b = loop.in + Math.max(1, Math.round((p - loop.in) / g.spb)) * g.spb;
      if (b - loop.in < MIN_LOOP) return;
      setLoop(loop.in, b, true);
      emit();
    },
    reloopExit() {
      if (status !== 'ready' || !loop || loop.out == null) return;
      if (loop.active) exitLoop();
      else { loop = { ...loop, active: true }; moveTo(loop.in); if (run) applyLoop(); }
      emit();
    },
    // Beat loop of n beats from the position (from the beat with QUANTIZE); the same
    // size again exits it.
    beatLoop(n) {
      const g = grid();
      if (status !== 'ready' || !g || !(n > 0)) return;
      if (loop?.active && Math.abs(loopBeats() - n) < 1e-3) { exitLoop(); emit(); return; }
      const p = live();
      const a = loop?.active ? loop.in : prefs.quantize ? beatFloor(p) : p;
      setLoop(a, a + n * g.spb, true);
      emit();
    },
    // 4 BEAT/1/2X and 8 BEAT/2X of the CDJ-3000: beat loop, or halve / double a running loop.
    beatLoopButton(n) {
      if (loop?.active) { if (n === 4) api.loopResize(0.5); else api.loopResize(2); return; }
      api.beatLoop(n);
    },
    loopResize(f) {
      if (!loop?.active) return;
      const len = (loop.out - loop.in) * f;
      const g = grid();
      if (len < Math.max(MIN_LOOP, g ? g.spb / 32 : 0) || loop.in + len > duration()) return;
      setLoop(loop.in, loop.in + len, true);
      emit();
    },

    // --- hot cues ---
    hotCueDown(label) {
      if (status !== 'ready' || !HOT_CUE_LABELS.includes(label)) return null;
      if (api.deleteArmed) { disarmDelete(); if (hot[label]) { delete hot[label]; hot = { ...hot }; persist(); } emit(); return 'deleted'; }
      const c = hot[label];
      if (!c) { // set
        const p = live();
        const t = prefs.quantize ? snap(p) : p;
        hot = { ...hot, [label]: loop?.active ? { time: loop.in, loop: { in: loop.in, out: loop.out } } : { time: t } };
        persist(); emit();
        return 'set';
      }
      const g = grid();
      if (c.loop) loop = { in: c.loop.in, out: c.loop.out, active: true };
      else if (loop?.active) loop = { ...loop, active: false };
      if (playing && run) { // jump: with quantize, from the beat before the cue (lands on the beat)
        let t = c.time;
        if (prefs.quantize && g && !c.loop) {
          const p = live();
          const k = Math.ceil((c.time - p) / g.spb - 1e-6);
          t = p + k * g.spb;
          if (t > c.time + 1e-4) t -= g.spb;
          if (t < 0) t += g.spb;
        }
        startSource(t);
        emit();
        return 'jump';
      }
      // paused: plays while held (hot cue sampler)
      if (!startSource(c.time)) return null;
      hold = { kind: 'hot', label, back: c.time };
      emit();
      return 'sampler';
    },
    hotCueUp(label) {
      if (hold?.kind !== 'hot' || hold.label !== label) return false;
      stopSource();
      pos = hold.back;
      hold = null;
      emit();
      return true;
    },
    // DELETE: paused on a memory cue = delete it; otherwise the next hot cue pad
    // pressed within DELETE_ARM_MS is deleted.
    deletePress() {
      if (status !== 'ready') return null;
      if (!playing) {
        const p = live();
        const i = memory.findIndex((m) => Math.abs(m.time - p) < 0.01);
        if (i >= 0) { memory = memory.filter((_, j) => j !== i); persist(); emit(); return 'memory'; }
      }
      if (api.deleteArmed) { disarmDelete(); emit(); return 'cancel'; }
      deleteUntil = performance.now() + DELETE_ARM_MS;
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => { deleteUntil = 0; emit(); }, DELETE_ARM_MS + 20);
      emit();
      return 'armed';
    },
    // CALL (hot cue call): the hot cues found on the audio (section changes, waveform
    // autoCues) fill the empty pads.
    callHotCues() {
      const cues = waveform?.autoCues ?? [];
      if (status !== 'ready' || !cues.length) return 0;
      const next = { ...hot };
      const free = HOT_CUE_LABELS.filter((l) => !next[l]);
      let n = 0;
      for (const c of cues) {
        if (!free.length) break;
        if (Object.values(next).some((h) => Math.abs(h.time - c.time) < 0.05)) continue;
        next[free.shift()] = { time: c.time };
        n++;
      }
      if (n) { hot = next; persist(); emit(); }
      return n;
    },

    // --- memory cues ---
    // MEMORY: stores the running loop, else the cue point.
    memoryStore() {
      if (status !== 'ready') return false;
      const m = loop?.active ? { time: loop.in, loop: { in: loop.in, out: loop.out } } : { time: cuePoint };
      if (memory.some((x) => Math.abs(x.time - m.time) < 0.01 && !!x.loop === !!m.loop)) return false;
      memory = [...memory, m].sort((a, b) => a.time - b.time).slice(0, 32);
      persist(); emit();
      return true;
    },
    // CUE/LOOP CALL < >: cues the previous / next memory point (paused on it; a memory
    // loop is set, RELOOP plays it).
    memoryCall(dir) {
      if (status !== 'ready' || !memory.length) return false;
      const p = live();
      const m = dir < 0 ? [...memory].reverse().find((x) => x.time < p - 0.01) : memory.find((x) => x.time > p + 0.01);
      if (!m) return false;
      stopSource(); playing = false; hold = null;
      loop = m.loop ? { in: m.loop.in, out: m.loop.out, active: false } : loop?.active ? { ...loop, active: false } : loop;
      pos = m.time;
      setCue(m.time);
      emit();
      return true;
    },

    // --- settings ---
    toggleAutoCue() {
      prefs.autoCue = !prefs.autoCue; savePref();
      const fs = waveform?.firstSound;
      if (prefs.autoCue && !storedCue && !run && pos === 0 && cuePoint === 0 && fs > 0.003) cuePoint = pos = fs;
      emit();
    },
    toggleVinyl() { prefs.vinyl = !prefs.vinyl; savePref(); if (!prefs.vinyl && touch) api.jogTouch(false); emit(); },
    setPlayHook(fn) { playHook = typeof fn === 'function' ? fn : null; },
    setVolume(v) { output(); if (gain) gain.gain.value = Math.max(0, Math.min(1.5, v)); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // tests / dev: the real playbackRate of the running source
    get _source() { return run?.src ?? null; },
    get _scratchVoice() { return voice; },
  };
  liveDecks.add(api);
  return api;
}

function sanitizePrefs(p) {
  const o = {};
  if (typeof p.quantize === 'boolean') o.quantize = p.quantize;
  if (TEMPO_RANGES.includes(p.range)) o.range = p.range;
  if (typeof p.mt === 'boolean') o.mt = p.mt;
  if (typeof p.autoCue === 'boolean') o.autoCue = p.autoCue;
  if (typeof p.vinyl === 'boolean') o.vinyl = p.vinyl;
  if (BEAT_JUMPS.includes(p.beatJump)) o.beatJump = p.beatJump;
  return o;
}
