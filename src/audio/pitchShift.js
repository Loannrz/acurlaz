// Pitch shifter made of native Web Audio nodes only (no AudioWorklet): two
// delay lines whose delay time follows a sawtooth, each faded by a Hann window
// offset by half a period (the classic "delay-line" / granular shifter). A
// delay growing at a constant slope s reads the input at speed 1 - s, so the
// pitch moves by that factor while the tempo stays the same.
//   const ps = createPitchShifter(ctx);  input -> ps.input ; ps.output -> next
//   ps.setRatio(r, ramp)   pitch factor (0.5..2; 1 = unchanged, transparent)
//   ps.start() / ps.stop() modulation sources run only while started (a deck
//                          starts it with its playback and stops it on pause)
// Used by the decks for MASTER TEMPO (ratio = 1 / tempo rate: the key stays
// when the tempo moves) and KEY SHIFT (ratio = 2^(semitones / 12)).
// Limits: grain of GRAIN s, so a light "chorus" colour on sustained sounds and
// transients smeared over ~GRAIN; extra latency = T * |r - 1| (8 ms at +-8 %).

const GRAIN = 0.1; // s, period of the sawtooth (grain length)
const START_LEAD = 0.006; // s: the four modulation sources start together, sample-aligned

export function createPitchShifter(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const sr = ctx.sampleRate;
  const N = Math.max(256, Math.round(GRAIN * sr));
  const T = N / sr;
  const saw = ctx.createBuffer(1, N, sr);
  const win = ctx.createBuffer(1, N, sr);
  const s = saw.getChannelData(0), w = win.getChannelData(0);
  for (let i = 0; i < N; i++) { s[i] = i / N; const x = Math.sin((Math.PI * i) / N); w[i] = x * x; }

  const taps = [0, 1].map(() => {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0;
    const amp = ctx.createGain(); // sawtooth 0..1 -> delay modulation (s)
    amp.gain.value = 0;
    amp.connect(delay.delayTime);
    const vca = ctx.createGain(); // Hann window -> tap level (sum of both taps = 1)
    vca.gain.value = 0;
    input.connect(delay);
    delay.connect(vca);
    vca.connect(output);
    return { delay, amp, vca, srcs: null };
  });

  let ratio = 1;
  // ratio < 1: delay rising 0 -> A (pitch down); ratio > 1: falling A -> 0 (pitch up)
  const params = (r) => {
    const A = Math.min(0.9 * T, T * Math.abs(r - 1));
    return r >= 1 ? { base: A, amp: -A } : { base: 0, amp: A };
  };
  const apply = (ramp) => {
    const { base, amp } = params(ratio);
    const now = ctx.currentTime;
    for (const t of taps) {
      if (ramp > 0) {
        t.delay.delayTime.setTargetAtTime(base, now, ramp / 3);
        t.amp.gain.setTargetAtTime(amp, now, ramp / 3);
      } else {
        t.delay.delayTime.cancelScheduledValues(now); t.delay.delayTime.setValueAtTime(base, now);
        t.amp.gain.cancelScheduledValues(now); t.amp.gain.setValueAtTime(amp, now);
      }
    }
  };

  return {
    input, output,
    get ratio() { return ratio; },
    get running() { return !!taps[0].srcs; },
    setRatio(r, ramp = 0.05) {
      const next = Math.max(0.5, Math.min(2, Number.isFinite(r) ? r : 1));
      if (Math.abs(next - ratio) < 1e-6) return;
      ratio = next;
      apply(ramp);
    },
    start() {
      if (taps[0].srcs) return;
      apply(0);
      const when = ctx.currentTime + START_LEAD;
      taps.forEach((t, k) => {
        const a = ctx.createBufferSource(); a.buffer = saw; a.loop = true; a.connect(t.amp);
        const b = ctx.createBufferSource(); b.buffer = win; b.loop = true; b.connect(t.vca.gain);
        const off = (k * T) / 2;
        a.start(when, off); b.start(when, off);
        t.srcs = [a, b];
      });
    },
    stop() {
      for (const t of taps) {
        if (!t.srcs) continue;
        for (const x of t.srcs) { try { x.stop(); } catch { /* not started */ } x.disconnect(); }
        t.srcs = null;
      }
    },
  };
}
