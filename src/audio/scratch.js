// Vinyl scratch voice (AudioWorklet). While the top of the jog is held in VINYL
// mode, the record follows the hand: the position of the platter IS the
// position in the track, so the audio plays at the speed and in the direction
// of the hand (backwards included), and stops when the hand holds still.
//
// Why a worklet: an AudioBufferSourceNode cannot play backwards reliably
// (negative playbackRate is not supported everywhere, Safari in particular),
// and chaining small grains (one source per pointer event) gives a choppy,
// clicky sound whose speed jumps at every event. Here one processor reads the
// track itself, sample by sample, at a fractional read head that glides
// smoothly towards the hand position:
//   - the main thread sends the hand position with its AudioContext time at
//     every jog event ({ t, p }, track seconds);
//   - the processor renders the position the hand had LATENCY s ago, linearly
//     interpolated between those points (so the irregular rate of pointer
//     events does not matter), then a ~3 ms smoothing of the read head;
//   - samples are read with a 4-point Hermite interpolation (any speed, either
//     direction), and a 10 Hz DC blocker turns a held (still) record into
//     silence instead of a frozen sample;
//   - the processor only gets a window of the track around the position
//     (WINDOW s each side, re-sent when the hand gets near its edges): no copy
//     of the whole track, nothing shared.
// Release: end() returns the context time at which the read head reaches the
// last hand position (last event + LATENCY); the deck starts its normal source
// exactly there at that position, while this voice fades out (6 ms): no jump
// in the audio, no jump of the play head.
//   ensureScratchModule(ctx)                -> Promise<boolean> (loads the worklet once per context)
//   const v = createScratchVoice(ctx, dest)  // null if the worklet is not loaded (yet)
//   v.begin(buffer, pos) / v.move(pos) / v.end() -> when / v.cancel() / v.active
//   v.debug(fn)  // tests: fn({ t, head, target }) about every 3 ms while active

export const LATENCY = 0.04; // s, the read head follows the hand this much later
const WINDOW = 12; // s of track each side of the position sent to the processor
const MARGIN = 2; // s: closer than this to a window edge -> a new window
const FADE = 0.006; // s, fade in / out of the voice
const HOLD_GAP = 0.03; // s between two jog events: longer = the hand had stopped
const EVENT_DT = 0.016; // s, typical interval of pointer events (60 Hz)

const PROCESSOR = `
const LAT = ${LATENCY};
class AcurlazScratch extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ch = null; this.start = 0; this.len = 0; this.rate = sampleRate; // window
    this.pts = []; this.head = 0; this.on = false; this.offAt = -1; this.dbg = false; this.dbgN = 0;
    this.k = 1 - Math.exp(-1 / (0.003 * sampleRate)); // read head smoothing (3 ms)
    this.R = 1 - (2 * Math.PI * 10) / sampleRate; // DC blocker pole (10 Hz)
    this.x1 = [0, 0]; this.y1 = [0, 0];
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'window') { this.ch = d.ch; this.start = d.start; this.len = d.ch[0].length; this.rate = d.rate; }
      else if (d.type === 'begin') { this.pts = [{ t: d.t, p: d.p }]; this.head = d.p; this.on = true; this.offAt = -1; this.x1 = [0, 0]; this.y1 = [0, 0]; }
      else if (d.type === 'pos') { const P = this.pts; if (P.length && d.t <= P[P.length - 1].t) P[P.length - 1].p = d.p; else P.push({ t: d.t, p: d.p }); if (P.length > 256) P.splice(0, P.length - 256); }
      else if (d.type === 'end') { this.offAt = d.at; }
      else if (d.type === 'cancel') { this.on = false; this.ch = null; this.pts = []; }
      else if (d.type === 'debug') { this.dbg = !!d.on; }
    };
  }
  target(t) {
    const P = this.pts;
    if (!P.length) return this.head;
    while (P.length > 1 && P[1].t <= t) P.shift(); // keep the last point at or before t
    if (P.length === 1 || t <= P[0].t) return P[0].p;
    const a = P[0], b = P[1];
    return a.p + ((b.p - a.p) * (t - a.t)) / (b.t - a.t);
  }
  sample(c, f) {
    const s = this.ch[c] || this.ch[0], n = this.len;
    const i = Math.floor(f), u = f - i;
    const at = (j) => (j < 0 || j >= n ? 0 : s[j]);
    const y0 = at(i - 1), y1 = at(i), y2 = at(i + 1), y3 = at(i + 2);
    const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * u + c2) * u + c1) * u + y1;
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.on || !this.ch) return true;
    if (this.offAt >= 0 && currentTime >= this.offAt) { this.on = false; this.ch = null; this.pts = []; return true; }
    const n = out[0].length, dt = 1 / sampleRate;
    const t0 = currentTime - LAT;
    const a = this.target(t0), b = this.target(t0 + n * dt);
    const k = this.k, R = this.R, rate = this.rate, start = this.start;
    for (let i = 0; i < n; i++) {
      const tg = a + ((b - a) * i) / n;
      this.head += (tg - this.head) * k;
      const f = this.head * rate - start;
      for (let c = 0; c < out.length; c++) {
        const x = this.sample(c, f);
        const y = x - this.x1[c] + R * this.y1[c];
        this.x1[c] = x; this.y1[c] = y;
        out[c][i] = y;
      }
    }
    if (this.dbg) this.port.postMessage({ t: currentTime, head: this.head, target: b });
    return true;
  }
}
registerProcessor('acurlaz-scratch', AcurlazScratch);
`;

const modules = new WeakMap(); // ctx -> Promise<boolean>
const loaded = new WeakSet(); // ctx whose module is ready

export function ensureScratchModule(ctx) {
  if (!ctx?.audioWorklet) return Promise.resolve(false);
  let p = modules.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }));
    p = ctx.audioWorklet.addModule(url)
      .then(() => { loaded.add(ctx); return true; })
      .catch((e) => { console.warn('[scratch] worklet unavailable, grain fallback', e); return false; })
      .finally(() => URL.revokeObjectURL(url));
    modules.set(ctx, p);
  }
  return p;
}

export function createScratchVoice(ctx, destination) {
  if (!ctx || !loaded.has(ctx)) return null;
  let node;
  try {
    node = new AudioWorkletNode(ctx, 'acurlaz-scratch', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  } catch (e) { console.warn('[scratch] node not created', e); return null; }
  const env = ctx.createGain();
  env.gain.value = 0;
  node.connect(env); env.connect(destination);
  let buffer = null, win = null; // { a, b } track seconds covered by the window
  let active = false, lastT = 0, lastP = 0, endAt = 0;
  let debugFn = null;
  node.port.onmessage = (e) => debugFn?.(e.data);

  const sendWindow = (pos) => {
    const sr = buffer.sampleRate;
    const a = Math.max(0, Math.floor((pos - WINDOW) * sr)), b = Math.min(buffer.length, Math.ceil((pos + WINDOW) * sr));
    const ch = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) ch.push(buffer.getChannelData(c).slice(a, b));
    node.port.postMessage({ type: 'window', ch, start: a, rate: sr }, ch.map((x) => x.buffer));
    win = { a: a / sr, b: b / sr, dur: buffer.duration };
  };
  const needWindow = (pos) => !win || (pos < win.a + MARGIN && win.a > 0) || (pos > win.b - MARGIN && win.b < win.dur);
  const now = () => ctx.currentTime;

  return {
    get active() { return active; },
    get latency() { return LATENCY; },
    begin(buf, pos) {
      buffer = buf; win = null;
      sendWindow(pos);
      const t = now();
      lastT = t; lastP = pos;
      node.port.postMessage({ type: 'begin', t, p: pos });
      const g = env.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(1, t + FADE);
      active = true;
    },
    move(pos) {
      if (!active) return;
      if (needWindow(pos)) sendWindow(pos);
      const t = Math.max(lastT, now());
      // after a pause of the hand: it stayed at lastP until just before this event
      // (otherwise the interpolation would spread this move over the whole pause)
      if (t - lastT > HOLD_GAP) node.port.postMessage({ type: 'pos', t: t - EVENT_DT, p: lastP });
      lastT = t; lastP = pos;
      node.port.postMessage({ type: 'pos', t, p: pos });
    },
    // Release: the context time at which the deck should take over (the read
    // head is then exactly on the last hand position); the voice fades out there.
    end() {
      if (!active) return now();
      active = false;
      const when = Math.max(now() + 0.003, lastT + LATENCY);
      const g = env.gain;
      g.cancelScheduledValues(now());
      g.setValueAtTime(1, when);
      g.linearRampToValueAtTime(0, when + FADE);
      node.port.postMessage({ type: 'end', at: when + FADE + 0.01 });
      endAt = when;
      return when;
    },
    cancel() {
      if (!active && now() > endAt + FADE) return;
      active = false;
      const t = now(), g = env.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + FADE);
      node.port.postMessage({ type: 'end', at: t + FADE + 0.01 });
    },
    debug(fn) { debugFn = fn; node.port.postMessage({ type: 'debug', on: !!fn }); },
  };
}
