// Shared Web Audio engine: one AudioContext for the whole page, a master gain,
// and the unlock on the first user gesture (browsers keep an AudioContext
// suspended until the visitor interacts; creating one earlier also logs a
// warning). Nothing is created before that gesture.
//   import { engine } from './engine.js';
//   engine.installUnlock();          // once, at start-up (main.js via createScreenUI)
//   engine.deferCreationWhile(fn)    // fn() -> true while creating the context would show (intro, flights)
//   engine.onIdleCreate(fn)          // fn(ctx) right after the idle creation (warm-up)
//   engine.context                   // AudioContext or null (before the first gesture)
//   engine.ensure()                  // AudioContext (created if needed; call from a gesture)
//   engine.master                    // master GainNode (-> destination)
//   engine.running                   // context state === 'running'
//   engine.onState(fn)               // fn(state) on 'running' / 'suspended' changes
//   engine.decode(arrayBuffer)       // Promise<AudioBuffer>, works before the unlock
// Decoding goes through an OfflineAudioContext: it needs no gesture and never
// warns, so a track can be decoded (and its waveform computed) before the
// first click; the AudioBuffer plays in the real context afterwards.

const DECODE_RATE = 44100;
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'];

let ctx = null;
let master = null;
let decoder = null;
let installed = false;
const listeners = new Set();

function emit() { for (const fn of listeners) fn(ctx?.state ?? 'none'); }

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  // iOS 16.4+: play through the ringer switch like a music app (Web Audio is
  // otherwise muted when the phone is on silent). No effect elsewhere.
  try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); } // old WebKit: no options
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  // 'interrupted' (iOS: call, other app, screen locked) or 'suspended' again
  // later: the next gesture resumes it (the unlock listeners come back).
  ctx.addEventListener('statechange', () => { if (ctx.state === 'running') removeUnlock(); else if (installed) addUnlock(); emit(); });
  return ctx;
}

// Creating the AudioContext (audio thread, output device) blocks the main
// thread for ~20-120 ms. A gesture that needs no sound right now (a click on a
// screen starting a camera flight, "Passer", Space during the intro, a key...)
// does not create it on the spot: it is created at the next idle moment, outside
// the intro and the camera moves (deferCreationWhile). Browsers with sticky user
// activation (Chrome, Edge, Firefox) start it then. WebKit-only browsers
// (Safari, every iOS browser) keep the old behaviour: created and resumed inside
// the first gesture, because WebKit may leave a context created outside a gesture
// suspended (a LOAD that autoplays once decoded would then stay silent). If a
// context ever stays suspended anyway, the unlock listeners stay installed and
// the next gesture resumes it INSIDE that gesture (onGesture runs in the capture
// phase, before any button handler). A deck that needs sound at once (PLAY,
// CUE...) calls ensure() from its own gesture: created and resumed right there.
const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const DEFER = !!(typeof navigator !== 'undefined' && navigator.userActivation) && !(/AppleWebKit/.test(UA) && !/Chrome\//.test(UA));
let deferWhile = null;
let idleQueued = false;
const warmups = [];
function createWhenIdle() {
  if (ctx || idleQueued) return;
  idleQueued = true;
  const run = () => {
    idleQueued = false;
    if (ctx) return;
    if (deferWhile?.()) { setTimeout(createWhenIdle, 400); return; }
    // a gesture that did not activate the page (Escape, a touch pointerdown):
    // wait for one that does (the next gesture queues this again)
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    for (const fn of warmups) { try { fn(c); } catch (e) { console.warn('[audio] warm-up', e); } }
  };
  if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 250);
}

function onGesture(e) {
  // Deferred creation: queued on the release (pointerup / click / key), never on
  // the press: an idle callback run between pointerdown and pointerup would block
  // the click itself (the creation can freeze the main thread past TAP_MAX_MS and
  // the first click on a screen was then dropped). After the release, the click
  // has started its camera flight and the creation waits for it (deferWhile).
  if (!ctx && DEFER) { if (e?.type !== 'pointerdown') createWhenIdle(); return; }
  if (!ensure()) return;
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
  if (ctx.state === 'running') removeUnlock();
}
function removeUnlock() {
  for (const t of GESTURES) window.removeEventListener(t, onGesture, true);
}
function addUnlock() {
  for (const t of GESTURES) window.addEventListener(t, onGesture, true); // same listener: never added twice
}

export const engine = {
  get context() { return ctx; },
  get master() { return master; },
  get running() { return ctx?.state === 'running'; },
  get currentTime() { return ctx ? ctx.currentTime : 0; },
  ensure,
  installUnlock() {
    if (installed) return;
    installed = true;
    addUnlock();
  },
  onState(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  deferCreationWhile(fn) { deferWhile = fn; },
  onIdleCreate(fn) { warmups.push(fn); },
  async decode(arrayBuffer) {
    if (!decoder) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      decoder = new OAC(2, 1, DECODE_RATE);
    }
    return decoder.decodeAudioData(arrayBuffer);
  },
  setMasterVolume(v) { if (master) master.gain.value = Math.max(0, Math.min(1.5, v)); },
};
