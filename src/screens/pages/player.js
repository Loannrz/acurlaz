// PLAYER page: playback screen ("Waveform screen") of the CDJ-3000, manual p21
// (docs/reference/cdj3000-manual-p21-playback.png, items 1-26), shown when a
// track is loaded into this CDJ. Layout measured on the manual picture (screen
// 790 x 445 px -> canvas 1024 x 597).
//   top bar: 4 device icon, 5 artwork / title / length / BPM / key, 6 "i",
//            7-9 BEAT LOOP / KEY SHIFT / BEAT JUMP (touch: opens a row of keys over
//            the bottom of the waveform: loop sizes / semitones / jump sizes, the
//            same actions as the physical buttons, src/audio/deck.js)
//   3 beat countdown (orange: sync master, blue: this deck), 10 phase meter
//     (touch: switch to the thin waveform of the sync master and back)
//   2 enlarged waveform scrolling under the fixed red playhead, beat grid (red
//     ticks = bars), cue point, memory cues, hot cues A-H (the deck's, saved per
//     track), loop zone, 4/8/16/32 beat marks, 1 loop beats, 11 ZOOM / GRID (touch: zoom level)
//     (touch the waveform: colour BLUE -> RGB -> 3BAND)
//   14 PLAYER, 13 QUANTIZE (on / off), 12 BEAT JUMP (size), 15 TRACK, 16 A.HOT CUE,
//   17 AUTO CUE (on / off), 18 REMAIN / elapsed mm:ss.mmm (touch or TIME MODE to
//   switch), 19 SINGLE, 20-21 TEMPO % / range of the deck, 22-23 BPM heard (track
//   BPM x tempo) / MASTER (only on the tempo master) / SYNC, 24 MT (on / off),
//   25 KEY (shifted by KEY SHIFT; green: compatible with the master's key),
//   26 overall waveform with cue / memory / hot cue markers, loop and playhead
//   (touch / drag = seek, at most 20 seeks per second while playing).
// Waveforms, BPM and beat grid come from the REAL decoded audio
// (src/audio/waveform.js); the manifest BPM is only a fallback. Positions are track
// seconds (the tempo changes how fast they move, not where things are).
//
// CONTRACT (keep the work inside this file + widgets/player-*.js):
//   - reads: api.deckInfo(), api.deck (position, play / pause / seek, loops, key
//     shift...), api.state.loaded; api.sync.masterUnit + api.deckInfoOf(unit) for
//     the tempo master (phase meter, master countdown, key match).
//   - writes ONLY its own nav: api.setNav({ zoom, elapsed, meter, color, info, strip })
//   - redraw rate: frameRate() = 60 while this deck moves (playing or CUE held),
//     30 while only the other deck moves (phase meter / master waveform), else 0.
//   - the position drawn is the one being HEARD (output latency removed,
//     widgets/player-wave.js heardPosition), read once per frame.
//   - touch zones: api.region(...) inside draw(); the overall waveform seeks on
//     press / drag (onPointer).
//   - shared helpers: ../design.js; page helpers: ../widgets/player-wave.js,
//     ../widgets/player-parts.js
import { registerPage } from '../registry.js';
import { C, FONT, SCREEN_W, SCREEN_H, rect, fill, text, glyph, formatTime, emptyMessage } from '../design.js';
import { drawEnlarged, drawOverview, heardPosition, WAVE_MODES } from '../widgets/player-wave.js';
import { frame, labelBox, keyButton, playPauseButton, playerArcs, hotCueFlag, cueTriangle, loopCount, keysCompatible } from '../widgets/player-parts.js';
import { deviceTile, artwork } from '../widgets/cdj.js';
import { DEVICE } from '../../utils/device.js';
import { HOT_CUE_LABELS, BEAT_LOOPS, BEAT_JUMPS, KEY_SHIFT_MAX } from '../../audio/deck.js';

// --- layout (canvas px) ---
const TOP_H = 78;
const COUNT = rect(124, 91, 88, 70);
const PHASE = rect(220, 91, 593, 70);
const WAVE = rect(0, 168, SCREEN_W, 200); // enlarged waveform zone (ticks included)
const TICK_TOP = 179, TICK_BOT = 350, TICK_H = 6;
const BODY = rect(0, 188, SCREEN_W, 160); // waveform body (mirrored around its centre)
const PLAYHEAD_X = 512;
const PLAY_BTN = rect(618, 0, 95, 76); // touch PLAY/PAUSE, left of BEAT LOOP (716)
const ZOOM_BOX = rect(912, 371, 104, 18);
const PANEL_Y = 398;
const OV = rect(103, 507, 815, 51); // overall waveform
const ZOOMS = [15, 30, 60, 120]; // px per second (30 = the manual picture)
const DEFAULT_ZOOM = 30;
const PHASE_BEAT_PX = 60;
const ORANGE_ARC = '#ff5a1e';

const STRIP = rect(0, 300, SCREEN_W, 64); // BEAT LOOP / KEY SHIFT / BEAT JUMP keys
const LOOP_FILL = 'rgba(255,138,24,0.24)', LOOP_IDLE = 'rgba(170,170,170,0.13)', LOOP_EDGE = '#ff8a18';
const MEMORY_RED = '#ff3030';

// Beat count as printed by the CDJ (1/2, 1/4, 4...).
export function formatBeats(n) {
  if (!(n > 0)) return '--';
  if (Math.abs(n - Math.round(n)) < 1e-3) return String(Math.round(n));
  for (const d of [2, 4, 8, 16, 32]) if (Math.abs(n * d - Math.round(n * d)) < 1e-3) return `${Math.round(n * d)}/${d}`;
  return n.toFixed(1);
}
// Camelot key moved by n semitones (7 steps of the wheel per semitone).
function shiftKey(key, n) {
  const m = /^(\d{1,2})([AB])$/i.exec(String(key ?? '').trim());
  if (!m || !n) return key;
  const k = ((((+m[1] - 1 + 7 * n) % 12) + 12) % 12) + 1;
  return `${k}${m[2].toUpperCase()}`;
}

// Beat grid: detected on the audio, else the manifest BPM from 0 s.
function gridOf(info) {
  const wf = info.waveform;
  if (wf?.bpm) return { bpm: wf.bpm, first: wf.firstBeat, bar: wf.barOffset, detected: true };
  if (info.bpm) return { bpm: info.bpm, first: 0, bar: 0, detected: false };
  return null;
}
// Hot cues of the deck, sorted: [{ label, time, loop? }]
const hotList = (info) => HOT_CUE_LABELS.filter((l) => info.hotCues?.[l]).map((l) => ({ label: l, ...info.hotCues[l] }));
const isBar = (g, k) => (((k - g.bar) % 4) + 4) % 4 === 0;

// Bars.beats from pos to the next saved cue (cue point, memory cue or hot cue), or null.
function countdown(g, pos, info) {
  if (!g || !info.loaded) return null;
  const times = [...hotList(info).map((c) => c.time), ...(info.memory ?? []).map((m) => m.time)];
  if (info.cuePoint > 0) times.push(info.cuePoint);
  let next = Infinity;
  for (const t of times) if (t > pos + 1e-3 && t < next) next = t;
  if (!Number.isFinite(next)) return null;
  const beats = Math.ceil((next - pos) / (60 / g.bpm) - 1e-6);
  const bars = Math.floor(beats / 4);
  if (bars > 99) return null;
  return { text: `${String(bars).padStart(2, '0')}.${beats % 4}`, time: next };
}

const wrap = (v, m) => ((v % m) + m) % m;
const pad2 = (n) => String(n).padStart(2, '0');

registerPage('player', {
  initialNav: () => ({ zoom: DEFAULT_ZOOM, elapsed: false, meter: 'phase', color: 'blue', info: false, strip: null }),
  frameRate(state, api) {
    if (api.deck.moving) return 60;
    if (api.deck.status !== 'ready') return 0;
    for (const [u, d] of Object.entries(api.decks ?? {})) if (u !== api.unit && d.moving) return 30;
    return 0;
  },

  draw(ctx, state, api) {
    const info = api.deckInfo();
    const t = info.track;
    const nav = api.nav;
    const g = gridOf(info);
    const pos = info.loaded ? heardPosition(api.deck) : 0; // read ONCE per frame
    const pps = ZOOMS.includes(nav.zoom) ? nav.zoom : DEFAULT_ZOOM;
    const mode = WAVE_MODES.includes(nav.color) ? nav.color : 'blue';
    const mUnit = api.sync?.masterUnit ?? null;
    const isMaster = info.isMaster;
    const m = mUnit && mUnit !== api.unit && api.decks?.[mUnit]?.status === 'ready' ? masterOf(api, mUnit) : null;
    const cd = countdown(g, pos, info);
    api._playerDebug = { pos, pps, at: performance.now(), deckPos: api.deck.position, bpm: g?.bpm ?? null, firstBeat: g?.first ?? 0 };
    const v = { api, info, t, nav, g, pos, pps, mode, isMaster, m, cd };

    drawTop(ctx, v);
    if (!t) {
      emptyMessage(ctx, rect(0, TOP_H, SCREEN_W, PANEL_Y - TOP_H), 'Aucun morceau chargé', DEVICE.touchFirst ? 'SOURCES : touchez un morceau, puis LOAD' : 'SOURCES : sélectionnez un morceau, puis LOAD');
      drawPanel(ctx, v);
      return;
    }
    drawMeter(ctx, v);
    drawWave(ctx, v);
    drawPanel(ctx, v);
    if (info.deleteArmed) drawDeleteBanner(ctx);
    if (nav.info) drawInfo(ctx, v);

    // touch zones (the last added wins on overlaps)
    api.region({ id: 'wave', x: 0, y: WAVE.y, w: SCREEN_W, h: WAVE.h, onTap: (e, a) => a.setNav({ color: WAVE_MODES[(WAVE_MODES.indexOf(mode) + 1) % WAVE_MODES.length] }) });
    api.region({ id: 'meter', x: PHASE.x, y: PHASE.y, w: PHASE.w, h: PHASE.h, onTap: (e, a) => a.setNav({ meter: a.nav.meter === 'wave' ? 'phase' : 'wave' }) });
    api.region({ id: 'zoom', x: ZOOM_BOX.x - 6, y: ZOOM_BOX.y - 4, w: ZOOM_BOX.w + 8, h: ZOOM_BOX.h + 8, onTap: (e, a) => a.setNav({ zoom: ZOOMS[(ZOOMS.indexOf(pps) + 1) % ZOOMS.length] }) });
    api.region({ id: 'time', x: 344, y: PANEL_Y + 2, w: 250, h: 80, onTap: (e, a) => a.setNav({ elapsed: !a.nav.elapsed }) });
    api.region({ id: 'info', x: 404, y: 44, w: 34, h: 32, onTap: (e, a) => a.setNav({ info: !a.nav.info }) });
    if (info.loaded) api.region({ id: 'playpause', x: PLAY_BTN.x, y: PLAY_BTN.y, w: PLAY_BTN.w, h: PLAY_BTN.h, onTap: (e, a) => a.deck.toggle() });
    if (info.loaded) api.region({ id: 'overview', x: OV.x - 4, y: 484, w: OV.w + 8, h: 96 });
    // BEAT LOOP / KEY SHIFT / BEAT JUMP: open / close their row of keys
    ['loop', 'key', 'jump'].forEach((k, i) => api.region({ id: `top-${k}`, x: 716 + i * 98, y: 0, w: 95, h: 76, onTap: (e, a) => a.setNav({ strip: a.nav.strip === k ? null : k }) }));
    if (info.loaded && nav.strip) drawStrip(ctx, v);
    if (nav.info) api.region({ id: 'infoPanel', x: 60, y: 92, w: 904, h: 296, onTap: (e, a) => a.setNav({ info: false }) });
  },

  // Overall waveform: press / drag to move the playback point (needle search).
  // While the deck plays every seek restarts its audio source: at most one per
  // NEEDLE_MS during the drag, the last position is applied on release.
  onPointer(e, api) {
    if (e.type === 'pointerdown' && e.region === 'overview') { api._needle = true; api._needleT = 0; api._needleTo = null; }
    if (e.type === 'pointerup' || e.type === 'pointercancel') {
      if (api._needle && api._needleTo != null) api.deck.seek(api._needleTo);
      api._needle = false; api._needleTo = null;
      return;
    }
    if (!api._needle || (e.type !== 'pointerdown' && e.type !== 'pointermove')) return;
    const d = api.deck.duration;
    if (!(d > 0)) return;
    const t = Math.max(0, Math.min(1, (e.x - OV.x) / OV.w)) * d;
    const now = performance.now();
    if (!api.deck.moving || now - (api._needleT ?? 0) >= NEEDLE_MS) { api._needleT = now; api._needleTo = null; api.deck.seek(t); }
    else { api._needleTo = t; api.invalidate(); }
  },
  onHide(api) { api._needle = false; api._needleTo = null; },
});

const NEEDLE_MS = 50;

function masterOf(api, unit) {
  const info = api.deckInfoOf(unit);
  const g = gridOf(info);
  const pos = heardPosition(api.decks[unit]);
  return { info, g, pos, cd: countdown(g, pos, info) };
}

// --- top bar (items 4-9) ---
function drawTop(ctx, { api, info, t, g }) {
  fill(ctx, rect(0, 0, SCREEN_W, TOP_H), C.titleBar);
  const srcIndex = Math.max(0, api.library.sources.findIndex((s) => s.id === t?.sourceId));
  deviceTile(ctx, 3, 3, 73, 72, { kind: 'usb', color: C.device[srcIndex % C.device.length], player: t ? srcIndex + 1 : null });
  artwork(ctx, t, 87, 13, 52); // the generated cover of the track (same as the lists), else an empty tile
  if (t) {
    glyph(ctx, 'note', 161, 27, 17, C.text);
    text(ctx, t.title, 178, 28, { size: 21, color: C.text, maxWidth: PLAY_BTN.x - 178 - 10 });
    const y2 = 61;
    text(ctx, formatTime(info.duration || t.duration), 180, y2, { size: 19, color: C.text, family: FONT.numeric });
    text(ctx, g ? g.bpm.toFixed(1) : '--.-', 262, y2, { size: 19, color: C.text, family: FONT.numeric });
    text(ctx, t.key || '--', 342, y2, { size: 19, color: C.text });
    glyph(ctx, 'info', 421, 60, 20, C.text);
  }
  if (info.loaded) playPauseButton(ctx, PLAY_BTN, api.deck.playing);
  const strip = api.nav.strip;
  [['BEAT', 'LOOP', 'loop'], ['KEY', 'SHIFT', 'key'], ['BEAT', 'JUMP', 'jump']].forEach(([a, b, k], i) => keyButton(ctx, rect(716 + i * 98, 0, 95, 76), [a, b], { active: strip === k }));
}

// --- row of keys of BEAT LOOP / KEY SHIFT / BEAT JUMP (over the bottom of the waveform) ---
function stripKey(ctx, api, id, r, label, { active = false, size = 18, onTap }) {
  fill(ctx, r, active ? C.highlightDeep : 'rgba(40,40,40,0.96)');
  frame(ctx, r, active ? C.highlight : '#5a5a5a', 1);
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size, weight: 500, align: 'center', color: active ? C.text : C.textSoft });
  api.region({ id: `strip-${id}`, x: r.x, y: r.y, w: r.w, h: r.h, onTap });
}
function drawStrip(ctx, { api, info, nav }) {
  fill(ctx, STRIP, 'rgba(0,0,0,0.82)');
  const y = STRIP.y + 8, h = STRIP.h - 16;
  const d = api.deck;
  if (nav.strip === 'loop') {
    text(ctx, 'BEAT LOOP', 16, y + h / 2, { size: 13, color: C.textDim });
    const beats = info.loop?.active ? info.loop.beats : null;
    BEAT_LOOPS.forEach((n, i) => stripKey(ctx, api, `loop-${n}`, rect(130 + i * 104, y, 96, h), formatBeats(n), { active: beats != null && Math.abs(beats - n) < 1e-3, onTap: () => d.beatLoop(n) }));
    stripKey(ctx, api, 'loop-exit', rect(130 + BEAT_LOOPS.length * 104 + 18, y, 120, h), info.loop?.active ? 'EXIT' : 'RELOOP', { size: 15, active: !!info.loop?.active, onTap: () => d.reloopExit() });
  } else if (nav.strip === 'jump') {
    text(ctx, 'BEAT JUMP', 16, y + h / 2, { size: 13, color: C.textDim });
    stripKey(ctx, api, 'jump-back', rect(118, y, 70, h), '◀', { onTap: () => d.beatJump(-1) });
    BEAT_JUMPS.forEach((n, i) => stripKey(ctx, api, `jump-${n}`, rect(196 + i * 92, y, 86, h), formatBeats(n), { active: info.beatJump === n, onTap: () => d.setBeatJumpSize(n) }));
    stripKey(ctx, api, 'jump-fwd', rect(196 + BEAT_JUMPS.length * 92 + 2, y, 70, h), '▶', { onTap: () => d.beatJump(1) });
  } else if (nav.strip === 'key') {
    text(ctx, 'KEY SHIFT', 16, y + h / 2, { size: 13, color: C.textDim });
    const k = info.keyShift;
    stripKey(ctx, api, 'key-down', rect(130, y, 96, h), '−', { size: 26, onTap: () => d.setKeyShift(k - 1) });
    fill(ctx, rect(234, y, 150, h), 'rgba(20,20,20,0.96)');
    text(ctx, `${k > 0 ? '+' : k < 0 ? '−' : '±'}${Math.abs(k)}`, 309, y + h / 2 + 1, { size: 26, align: 'center', color: k ? C.orange : C.text, family: FONT.numeric });
    stripKey(ctx, api, 'key-up', rect(392, y, 96, h), '+', { size: 26, onTap: () => d.setKeyShift(k + 1) });
    stripKey(ctx, api, 'key-reset', rect(510, y, 120, h), 'RESET', { size: 15, onTap: () => d.setKeyShift(0) });
    text(ctx, `${shiftKey(info.key, k) || '--'}  (±${KEY_SHIFT_MAX} demi-tons, tempo inchangé)`, 650, y + h / 2, { size: 14, color: C.textDim });
  }
}

function drawDeleteBanner(ctx) {
  const r = rect(PHASE.x, PHASE.y, PHASE.w, PHASE.h);
  fill(ctx, r, 'rgba(60,0,0,0.92)');
  frame(ctx, r, C.red, 1.5);
  text(ctx, 'DELETE : appuyez sur le HOT CUE à effacer', r.x + r.w / 2, r.y + r.h / 2, { size: 18, weight: 500, align: 'center', color: C.text });
}

// --- beat countdown + phase meter / master waveform (items 3, 10) ---
function drawMeter(ctx, { nav, g, pos, pps, mode, m, cd, info }) {
  frame(ctx, COUNT, '#2c2c2c', 1);
  // orange: countdown of the sync master (when it is the other deck)
  text(ctx, m?.cd?.text ?? '--.-', COUNT.x + 6, COUNT.y + 17, { size: 15, color: C.orange, family: FONT.numeric, letterSpacing: m?.cd ? 0 : 2 });
  text(ctx, 'Bars', COUNT.x + COUNT.w - 4, COUNT.y + 18, { size: 10, align: 'right', color: C.orange });
  // blue: this deck, to its next saved cue
  text(ctx, cd?.text ?? '--.-', COUNT.x + 5, COUNT.y + 47, { size: 23, color: C.phaseBlue, family: FONT.numeric });
  text(ctx, 'Bars', COUNT.x + COUNT.w - 4, COUNT.y + 51, { size: 10, align: 'right', color: C.phaseBlue });

  frame(ctx, PHASE, '#2c2c2c', 1);
  const cx = PHASE.x + PHASE.w / 2;
  if (nav.meter === 'wave') {
    // thin enlarged waveform of the sync master (this deck when it is the master)
    const src = m ?? { info, pos };
    const r = rect(PHASE.x + 2, PHASE.y + 4, PHASE.w - 4, PHASE.h - 8);
    if (src.info.waveform) drawEnlarged(ctx, src.info.waveform, { x: r.x, y: r.y, w: r.w, h: r.h, playheadX: cx, pos: src.pos, pps, mode });
    fill(ctx, rect(cx - 1, PHASE.y + 3, 2, PHASE.h - 6), m ? C.orange : C.text);
    return;
  }
  const x0 = PHASE.x + 6, x1 = PHASE.x + PHASE.w - 6;
  fill(ctx, rect(x0, PHASE.y + 17, x1 - x0, 3), C.phaseOrange);
  fill(ctx, rect(x0, PHASE.y + 44, x1 - x0, 3), C.phaseBlue);
  // offset of this deck's bar phase against the master's, in beats (-2..2)
  let off = 0;
  if (g && m?.g && info.loaded) {
    const mine = wrap((pos - g.first) / (60 / g.bpm) - g.bar, 4);
    const theirs = wrap((m.pos - m.g.first) / (60 / m.g.bpm) - m.g.bar, 4);
    off = wrap(mine - theirs + 2, 4) - 2;
  }
  for (let k = -6; k <= 6; k++) {
    const x = Math.round(cx + (k - off) * PHASE_BEAT_PX);
    if (x < x0 || x > x1) continue;
    if (k % 4 === 0) fill(ctx, rect(x - 1, PHASE.y + 34, 2, 22), C.red);
    else fill(ctx, rect(x - 1, PHASE.y + 33, 2, 11), '#e6e6e6');
  }
  fill(ctx, rect(cx - 1.5, PHASE.y + 5, 3, PHASE.h - 10), '#d4d4d4');
}

// --- enlarged waveform (items 1, 2, 11) ---
function drawWave(ctx, { info, g, pos, pps, mode, cd }) {
  const wf = info.waveform;
  const t0 = pos - PLAYHEAD_X / pps, t1 = pos + (SCREEN_W - PLAYHEAD_X) / pps;
  const xOf = (time) => PLAYHEAD_X + (time - pos) * pps;
  if (!wf) {
    const msg = info.status === 'error' ? `Lecture impossible : ${info.error ?? ''}` : info.status === 'loading' ? 'LOADING…' : 'ANALYSE…';
    text(ctx, msg, SCREEN_W / 2, BODY.y + BODY.h / 2, { size: 18, align: 'center', color: C.textDim });
  } else {
    drawEnlarged(ctx, wf, { x: 0, y: BODY.y, w: SCREEN_W, h: BODY.h, playheadX: PLAYHEAD_X, pos, pps, mode });
  }
  // beat grid: red = bar, white = beats up to the next cue (countdown), grey otherwise
  if (g && info.loaded) {
    const spb = 60 / g.bpm;
    const nextCue = cd?.time ?? -1;
    const kEnd = Math.floor((Math.min(t1, info.duration) - g.first) / spb);
    for (let k = Math.max(0, Math.ceil((t0 - g.first) / spb)); k <= kEnd; k++) {
      const tb = g.first + k * spb;
      const x = Math.round(xOf(tb)) - 1;
      const color = isBar(g, k) ? '#e8141e' : tb > pos && tb <= nextCue ? '#ededed' : '#8a8a8a';
      fill(ctx, rect(x, TICK_TOP, 2, TICK_H), color);
      fill(ctx, rect(x, TICK_BOT, 2, TICK_H), color);
    }
    // 4 / 8 / 16 / 32 beats ahead (from the current beat)
    const k0 = Math.floor((pos - g.first) / spb + 1e-6);
    for (const n of [4, 8, 16, 32]) {
      const tb = g.first + (k0 + n) * spb;
      if (tb > info.duration) break;
      const x = xOf(tb);
      if (x > ZOOM_BOX.x - 8 && n > 4) continue; // keep the ZOOM box readable
      if (x < SCREEN_W - 8) text(ctx, String(n), x, 364, { size: 14, align: 'center', color: C.text, family: FONT.numeric });
    }
  }
  // loop zone (orange while it runs, grey when stored), then cue point, memory cues, hot cues
  const lp = info.loaded ? info.loop : null;
  if (lp) {
    const xa = xOf(lp.in);
    if (lp.out != null) {
      const xb = xOf(lp.out);
      if (xb > 0 && xa < SCREEN_W) {
        fill(ctx, rect(xa, BODY.y, xb - xa, BODY.h), lp.active ? LOOP_FILL : LOOP_IDLE);
        const edge = lp.active ? LOOP_EDGE : '#8a8a8a';
        fill(ctx, rect(Math.round(xa) - 1, BODY.y, 2, BODY.h), edge);
        fill(ctx, rect(Math.round(xb) - 1, BODY.y, 2, BODY.h), edge);
      }
    } else if (xa > -2 && xa < SCREEN_W + 2) fill(ctx, rect(Math.round(xa) - 1, BODY.y, 2, BODY.h), LOOP_EDGE); // IN set, OUT pending
  }
  if (info.loaded) {
    for (const mc of info.memory ?? []) {
      const x = xOf(mc.time);
      if (x > -10 && x < SCREEN_W + 10) cueTriangle(ctx, x, 184, 10, MEMORY_RED);
    }
    for (const c of hotList(info)) {
      const x = xOf(c.time);
      if (c.loop) { const xb = xOf(c.loop.out); if (xb > 0 && x < SCREEN_W) fill(ctx, rect(x, 186, xb - x, 2), C.hotCue[c.label] ?? C.red); }
      if (x > -10 && x < SCREEN_W + 10) hotCueFlag(ctx, x, 171, c.label, C.hotCue[c.label] ?? C.red);
    }
    const cx = xOf(info.cuePoint);
    if (cx > -10 && cx < SCREEN_W + 10) cueTriangle(ctx, cx, 184, 13);
  }
  // playhead
  fill(ctx, rect(PLAYHEAD_X - 1, WAVE.y + 1, 2, WAVE.h - 3), C.red);
  // loop length (item 1): beats of the loop (orange while it runs)
  const lb = lp?.beats;
  loopCount(ctx, 504, 381, lb ? formatBeats(lb) : '--', lp?.active ? LOOP_EDGE : '#8f8f8f');
  // ZOOM / GRID (item 11)
  frame(ctx, ZOOM_BOX, '#5e5e5e', 1);
  const zb = rect(ZOOM_BOX.x + 2, ZOOM_BOX.y + 2, 50, ZOOM_BOX.h - 4);
  frame(ctx, zb, C.highlight, 1);
  text(ctx, 'ZOOM', zb.x + zb.w / 2, zb.y + zb.h / 2 + 1, { size: 11, align: 'center', color: C.highlight });
  text(ctx, '– GRID', ZOOM_BOX.x + ZOOM_BOX.w - 6, ZOOM_BOX.y + ZOOM_BOX.h / 2 + 1, { size: 11, align: 'right', color: C.textDim });
}

// --- bottom panel (items 12-26) ---
function drawPanel(ctx, v) {
  const { info, t, nav, g, pos, isMaster, m } = v;
  const y0 = PANEL_Y;
  fill(ctx, rect(0, y0, SCREEN_W, SCREEN_H - y0), C.bg);
  const on = info.loaded;
  // PLAYER (14), QUANTIZE (13), BEAT JUMP (12)
  const pb = rect(17, y0 + 7, 61, 66);
  frame(ctx, pb, '#9a9a9a');
  text(ctx, 'PLAYER', pb.x + pb.w / 2, pb.y + 12, { size: 11, weight: 500, align: 'center', color: C.textSoft });
  text(ctx, String(info.player), pb.x + pb.w / 2, pb.y + 44, { size: 34, align: 'center', color: C.text, family: FONT.numeric });
  playerArcs(ctx, pb.x + pb.w / 2, pb.y + 43, ORANGE_ARC);
  const q = info.quantize;
  labelBox(ctx, rect(17, y0 + 89, 61, 41), [{ text: 'QUANTIZE', size: 9, dy: -8 }, { text: q ? '1' : 'OFF', size: 15, dy: 8 }], q ? '#e01b1b' : '#5e5e5e', { border: q ? '#a31212' : '#3e3e3e' });
  labelBox(ctx, rect(17, y0 + 139, 61, 41), [{ text: 'BEAT JUMP', size: 9, dy: -8 }, { text: formatBeats(info.beatJump), size: 17, dy: 8 }], C.text, { border: '#d8d8d8' });
  // TRACK (15)
  text(ctx, 'TRACK', 157, y0 + 18, { size: 11, align: 'center', color: C.textSoft });
  text(ctx, t ? pad2(t.number ?? 1) : '--', 157, y0 + 53, { size: 36, align: 'center', color: C.text, family: FONT.numeric });
  // A.HOT CUE (16): hot cues are not loaded automatically (CALL does it); AUTO CUE (17)
  labelBox(ctx, rect(226, y0 + 17, 83, 22), [{ text: 'A.HOT CUE', size: 11 }], '#7a1a1a', { border: '#5a0a0a' });
  labelBox(ctx, rect(226, y0 + 48, 83, 22), [{ text: 'AUTO CUE', size: 11 }], info.autoCue ? C.text : '#5e5e5e', { border: info.autoCue ? '#d8d8d8' : '#3e3e3e' });
  // time (18): REMAIN or elapsed, mm:ss + .mmm
  const elapsed = !!nav.elapsed;
  const tv = on ? (elapsed ? pos : Math.max(0, info.duration - pos)) : NaN;
  const [mmss, ms] = formatTime(tv, true).split('.');
  if (!elapsed) text(ctx, 'REMAIN', 353, y0 + 13, { size: 11, color: C.textSoft });
  text(ctx, 'SINGLE', 536, y0 + 13, { size: 11, color: C.textSoft });
  const tc = on ? C.text : C.textMute;
  const w = text(ctx, mmss, 350, y0 + 76, { size: 62, weight: 300, color: tc, family: FONT.numeric, baseline: 'alphabetic', letterSpacing: -1 });
  text(ctx, `.${ms}`, 352 + w, y0 + 76, { size: 32, weight: 300, color: tc, family: FONT.numeric, baseline: 'alphabetic' });
  // TEMPO (20) / range (21): tempo of the deck (slider, TEMPO RESET or BEAT SYNC)
  text(ctx, info.tempoReset ? 'TEMPO RESET' : 'TEMPO', 675, y0 + 13, { size: 11, color: info.tempoReset ? C.playing : C.textSoft });
  const tb = rect(756, y0 + 5, 66, 22);
  fill(ctx, tb, C.orangeRed);
  text(ctx, info.range >= 100 ? 'WIDE' : `±${info.range}`, tb.x + tb.w / 2, tb.y + tb.h / 2 + 1, { size: 16, align: 'center', color: C.text });
  const tempo = Math.round((info.tempo ?? 0) * 100) / 100;
  const tw = text(ctx, Math.abs(tempo).toFixed(2), 801, y0 + 76, { size: 44, weight: 300, align: 'right', color: C.text, family: FONT.numeric, baseline: 'alphabetic' });
  text(ctx, tempo < 0 ? '−' : '+', 801 - tw - 4, y0 + 66, { size: 26, weight: 300, align: 'right', color: C.text });
  text(ctx, '%', 806, y0 + 76, { size: 14, color: C.text, baseline: 'alphabetic' });
  // BPM (22) + MASTER (23)
  const bb = rect(861, y0 + 6, 155, 70);
  frame(ctx, bb, C.orange);
  text(ctx, 'BPM', bb.x + 9, bb.y + 11, { size: 11, color: C.text });
  if (isMaster) {
    const mb = rect(bb.x + bb.w - 58, bb.y + 1, 57, 17);
    fill(ctx, mb, C.orange);
    text(ctx, 'MASTER', mb.x + mb.w / 2, mb.y + mb.h / 2 + 1, { size: 12, weight: 500, align: 'center', color: '#2a1206' });
  } else if (info.synced) {
    const sb = rect(bb.x + bb.w - 46, bb.y + 1, 45, 17);
    fill(ctx, sb, C.phaseBlue);
    text(ctx, 'SYNC', sb.x + sb.w / 2, sb.y + sb.h / 2 + 1, { size: 12, weight: 500, align: 'center', color: C.text });
  }
  const bpm = g ? g.bpm * (1 + (info.tempo ?? 0) / 100) : NaN;
  const [bi, bd] = Number.isFinite(bpm) ? bpm.toFixed(1).split('.') : ['--', '-'];
  const bw = text(ctx, bd, bb.x + bb.w - 12, bb.y + 64, { size: 30, weight: 300, align: 'right', color: C.orange, family: FONT.numeric, baseline: 'alphabetic' });
  text(ctx, '.', bb.x + bb.w - 12 - bw, bb.y + 64, { size: 30, weight: 300, align: 'right', color: C.orange, family: FONT.numeric, baseline: 'alphabetic' });
  text(ctx, bi, bb.x + bb.w - 20 - bw, bb.y + 64, { size: 58, weight: 300, align: 'right', color: C.orange, family: FONT.numeric, baseline: 'alphabetic', letterSpacing: -1 });
  // overall waveform (26)
  drawOverall(ctx, v);
  // MT (24): Master Tempo on / off ; KEY (25), shifted by KEY SHIFT
  const mt = info.masterTempo;
  labelBox(ctx, rect(937, y0 + 95, 70, 23), [{ text: 'MT', size: 14, weight: mt ? 700 : 400 }], mt ? C.text : '#7a2a14', { border: mt ? C.orangeRed : '#5a1a0a', fillColor: mt ? C.orangeRed : null });
  const ks = info.keyShift;
  text(ctx, ks ? `KEY ${ks > 0 ? '+' : '−'}${Math.abs(ks)}` : 'KEY', 972, y0 + 138, { size: 10, align: 'center', color: ks ? C.orange : C.textSoft });
  const key = shiftKey(t?.key, ks);
  const match = !isMaster && m && keysCompatible(key, shiftKey(m.info.track?.key, m.info.keyShift));
  text(ctx, key || '--', 972, y0 + 165, { size: 22, align: 'center', color: match ? C.playing : C.text });
}

function drawOverall(ctx, { info, pos, mode }) {
  const r = OV;
  const wf = info.waveform;
  const d = info.duration;
  const progress = d > 0 ? Math.max(0, Math.min(1, pos / d)) : 0;
  if (wf) drawOverview(ctx, wf, r, mode);
  else fill(ctx, rect(r.x, r.y + r.h - 1, r.w, 1), '#2a3a48');
  // progress bar: played (red) / to play (white)
  const px = Math.round(r.x + progress * r.w);
  fill(ctx, rect(r.x, r.y + r.h + 1, px - r.x, 3), C.red);
  fill(ctx, rect(px, r.y + r.h + 1, r.x + r.w - px, 3), '#f2f2f2');
  if (!(d > 0) || !info.loaded) return;
  // minute ticks counted from the end (-m:00), half minutes in between
  const ty = r.y + r.h + 7;
  for (let k = 1; d - k * 30 > 0; k++) {
    const x = Math.round(r.x + ((d - k * 30) / d) * r.w);
    const major = k % 2 === 0;
    fill(ctx, rect(x, ty, major ? 2 : 1, major ? 11 : 8), major ? '#e8e8e8' : '#7a7a7a');
    if (major && x > r.x + 4) text(ctx, `-${k / 2}:00`, x + 4, ty + 6, { size: 8, color: '#8c8c8c' });
  }
  fill(ctx, rect(r.x + r.w - 2, ty, 2, 11), '#e8e8e8');
  // loop, memory cues, hot cues + cue point (above the waveform)
  const lp = info.loop;
  if (lp?.out != null) {
    const xa = r.x + (lp.in / d) * r.w;
    fill(ctx, rect(xa, r.y, Math.max(2, ((lp.out - lp.in) / d) * r.w), r.h), lp.active ? LOOP_FILL : LOOP_IDLE);
    fill(ctx, rect(xa, r.y - 3, Math.max(2, ((lp.out - lp.in) / d) * r.w), 3), lp.active ? LOOP_EDGE : '#8a8a8a');
  }
  for (const mc of info.memory ?? []) cueTriangle(ctx, r.x + (mc.time / d) * r.w, r.y - 7, 9, MEMORY_RED);
  for (const c of hotList(info)) hotCueFlag(ctx, r.x + (c.time / d) * r.w, r.y - 21, c.label, C.hotCue[c.label] ?? C.red, 14);
  cueTriangle(ctx, r.x + (info.cuePoint / d) * r.w, r.y - 7, 13);
  // playhead
  fill(ctx, rect(px - 1, r.y - 4, 2, r.h + 8), C.red);
}

// Detailed track information (item 6, "i").
function drawInfo(ctx, { info, t, g }) {
  const hots = hotList(info);
  const r = rect(60, 92, 904, 296);
  fill(ctx, r, 'rgba(16,16,16,0.97)');
  frame(ctx, r, '#4a4a4a');
  fill(ctx, rect(r.x + 1, r.y + 1, r.w - 2, 34), C.header);
  glyph(ctx, 'info', r.x + 22, r.y + 18, 18, C.text);
  text(ctx, 'INFORMATIONS DU MORCEAU', r.x + 42, r.y + 19, { size: 14, weight: 500, color: C.text, letterSpacing: 0.5 });
  text(ctx, 'Toucher pour fermer', r.x + r.w - 14, r.y + 19, { size: 12, align: 'right', color: C.textDim });
  const manifest = Number.isFinite(t.bpm) ? ` (manifeste : ${t.bpm})` : '';
  const rows = [
    ['TITRE', t.title],
    ['ARTISTE', t.artist || '—'],
    ['DURÉE', formatTime(info.duration || t.duration)],
    ['BPM', g ? `${g.bpm.toFixed(1)}${g.detected ? ` — analysé sur l’audio${manifest}` : ' (manifeste)'}` : '—'],
    ['KEY', t.key || '—'],
    ['TEMPO', `${(info.tempo ?? 0) >= 0 ? '+' : '−'}${Math.abs(info.tempo ?? 0).toFixed(2)} % — ${info.effectiveBpm ? info.effectiveBpm.toFixed(1) : '--.-'} BPM${info.masterTempo ? ' (MT : tonalité conservée)' : ''}`],
    ['HOT CUES', hots.length ? `${hots.map((c) => c.label).join(' ')}${info.memory?.length ? ` · ${info.memory.length} memory cue${info.memory.length > 1 ? 's' : ''}` : ''} — enregistrés dans ce navigateur` : info.memory?.length ? `${info.memory.length} memory cue(s)` : '— (CALL : hot cues trouvés sur l’audio)'],
    ['LICENCE', t.license || '—'],
    ['SOURCE', `${t.sourceName ?? ''} · ${t.file ?? ''}`],
  ];
  rows.forEach(([k, val], i) => {
    const y = r.y + 56 + i * 27;
    text(ctx, k, r.x + 24, y, { size: 12, color: C.textDim });
    text(ctx, val, r.x + 150, y, { size: 16, color: C.text, maxWidth: r.w - 174 });
  });
}
