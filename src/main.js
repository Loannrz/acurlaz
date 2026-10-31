// Entry point: loading screen, renderer, stage, screens, VU covers, hotspots,
// cables, intro timeline, camera rig, zoom, keyboard, overlay and (dev only) the
// dev panel.
//
// Order: everything the intro and the free view draw is loaded, built, compiled
// and uploaded behind the loading screen (src/ui/loader.js, inline in
// index.html); the bar reaches 100 % only then, fades, and the intro starts at
// t = 0 with nothing left to compile or upload. "Passer", Escape, Space and R
// do nothing before that.
import * as THREE from 'three';
import gsap from 'gsap';
import { readParams } from './utils/params.js';
import { RENDER, MOBILE, DEVICE } from './config.js';
import { lowBattery, isPortrait } from './utils/device.js';
import { createLoader } from './ui/loader.js';
import { createOverlay } from './ui/overlay.js';
import { createTooltip } from './ui/tooltip.js';
import { createInvite } from './ui/invite.js';
import { hintFor, INVITE, FOCUS_TIP } from './data/hints.js';
import { createFocusTip } from './ui/focusTip.js';
import { createRenderer, isWebGLAvailable } from './scene/renderer.js';
import { buildStage } from './scene/stage.js';
import { createScreens } from './scene/screens.js';
import { createVuMeters } from './scene/vu.js';
import { createVuLive } from './audio/levels.js';
import { createHotspots } from './scene/hotspots.js';
import { createCables } from './scene/cables.js';
import { createBackdrop } from './scene/backdrop.js';
import { createContactShadows } from './scene/contactShadows.js';
import { createCameraRig } from './intro/camera.js';
import { buildTimeline } from './intro/timeline.js';
import { createZoom } from './input/zoom.js';
import { createKeys } from './input/keys.js';
import { createScreenFocus } from './input/screenFocus.js';
import { createScreenTouch } from './input/screenTouch.js';
import { createScreenDemo } from './scene/screenDemo.js';
import { createScreenUI } from './screens/index.js';
import { createLibrary } from './data/library.js';
import { createControls } from './controls/index.js';
import { createMixerLabel } from './scene/mixerLabel.js';
import { createHeaderPrints } from './screens/headerPrints.js';
import { createControlInput } from './input/controlDrag.js';
import { mixer } from './audio/mixer.js';
import { engine } from './audio/engine.js';
import { createMixerButtons } from './audio/mixerButtons.js';
import { createCdjButtons } from './audio/cdjButtons.js';

const params = readParams(); // dev only (?t, ?speed, ?cam): empty in a build
// Dev panel, console traces and window.__intro: `npm run dev` only (never in a build).
const DEV = import.meta.env.DEV;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
// Phone / tablet profile (src/utils/device.js, MOBILE in src/config.js): CSS hook.
document.documentElement.dataset.device = DEVICE.mobile ? 'mobile' : 'pc';
// iOS Safari ignores user-scalable=no: its own pinch gesture events are refused
// so a pinch on the page never zooms it (the canvas handles pinches itself).
if (DEVICE.touch) for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
const overlay = createOverlay();
const loader = createLoader({ reducedMotion });
// Weights of the real loading steps (progress bar). The model and the décor
// textures download in parallel (byte progress); the rest is CPU / GPU work.
// One word under the bar: Chargement (network), Préparation (build, screens,
// shaders), Presque prêt (uploads, resolution), Prêt.
loader.define({ code: 4, model: 36, textures: 12, build: 8, bake: 4, screens: 6, shaders: 20, warm: 6, tune: 4 });
loader.done('code');

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
// Lets the browser paint the loading bar between two heavy synchronous steps.
const breathe = () => new Promise((r) => setTimeout(r, 0));

// Resolves once the screens' library has its audio manifest (or failed) and the
// photo of the first page ("À propos") is loaded (or missing), at most `ms`.
// (the library's own requests: each file is fetched once)
function libraryReady(lib, ms) {
  return new Promise((resolve) => {
    const url = lib?.about?.photoUrl;
    const check = () => {
      const manifest = lib.loaded || lib.error != null;
      const photo = !url || lib.imageState(url) === 'ok' || lib.imageState(url) === 'failed';
      if (manifest && photo) { off?.(); resolve(); }
    };
    const off = lib?.onChange?.(check);
    if (url) lib.image(url); // starts its load (already started at boot)
    check();
    setTimeout(() => { off?.(); resolve(); }, ms);
  });
}

async function boot() {
  const container = document.getElementById('app');
  if (!isWebGLAvailable()) {
    loader.remove();
    overlay.showFallback('Votre navigateur ne prend pas en charge WebGL 2 : l’introduction ne peut pas être affichée.');
    return;
  }
  const { renderer, scene, camera, composer, render, lights, outputPass, quality, measure, onResize } = createRenderer(container);
  // Nothing on the canvas until the intro starts (the loader covers it anyway).
  renderer.domElement.style.visibility = 'hidden';
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Deux platines CDJ-3000 et une table de mixage en 3D, dans un club : sons, dates et réseaux d’Acurlaz sur leurs écrans');

  // --- network, in parallel: model (also preloaded by index.html), décor
  // textures + light bake (club), and the screens' library (audio manifest,
  // first-page photo): created now, handed to the screens below (one request each) ---
  const library = createLibrary();
  library.image(library.about.photoUrl);
  // Infinite studio backdrop / club décor, floor, fog (BACKDROP in config). Its
  // geometry is built now; textures and light bake complete in `ready`.
  const backdrop = createBackdrop({ scene, camera, lights, outputPass, renderer, onProgress: (step, f) => loader.set(step, f) });

  let stage = null;
  loader.label('Chargement');
  for (;;) {
    try {
      stage = await buildStage(scene, renderer, {
        // download fraction (src/scene/units.js), capped below 100 %: parsing follows
        onProgress: (f) => loader.set('model', Math.min(0.98, f)),
      });
      break;
    } catch (err) {
      console.error(err);
      await loader.fail('Le modèle 3D n’a pas pu être chargé. Vérifiez la connexion, puis réessayez.');
      loader.label('Chargement');
    }
  }
  loader.done('model', 'Préparation');
  await breathe();
  const { units } = stage;
  // Movable controls (faders, knobs, jogs, tempo, browse: src/controls/). First:
  // they replace the low-poly relief in the unit meshes and repaint the texture,
  // which the reflections, screens, cables and hotspots below read.
  const controls = createControls({ units });
  loader.set('build', 0.4);
  await breathe();
  // Mixer print "BEAT FX" (section title above its display, now the CRÉDITS
  // screen) painted out: the screen's 3D ÉCHAP key lies there (src/scene/screens.js).
  const mixerLabel = createMixerLabel({ units, texture: controls.texture });
  createHeaderPrints({ units, texture: controls.texture }); // CDJ prints above the keys: "ACURLAZ" / "MUSIQUE"
  // Mixer audio: knobs / faders (store) and buttons drive the real routing; saved values first.
  mixer.bind({ store: controls.store });
  const mixerButtons = createMixerButtons({ mixer });
  backdrop.attachReflections(stage.list);
  // soft contact shadow under each unit (static)
  createContactShadows(stage);

  // Drawable surfaces and covers.
  const screens = createScreens(units, { reducedMotion });
  const vu = createVuMeters(units.mixer);
  loader.set('build', 0.7);
  await breathe();

  let devPanel = null; // mounted below, in dev only
  let screenUI = null; // CDJ screen pages + decks (created with the screen focus below)
  let cdj = null; // CDJ buttons, tempo, jog -> decks (src/audio/cdjButtons.js)
  let tooltip = null; // hover hints (src/ui/tooltip.js), created with the hotspots below
  let ready = false; // loading done: the intro and the keys run

  // Clicks on the zones (src/scene/hotspots.js), routed in turn to: the screen
  // focus (screens and their ÉCHAP keys; it swallows clicks during a flight),
  // the CDJ pages, the CDJ settings, the mixer buttons, the dev panel.
  // (held buttons act on the press: onPress / onRelease below)
  let screenFocus = null;
  let screenTouch = null;
  const onButton = (info) => {
    // a long press of a finger showed the hint of this zone: its release is not a click
    if (tooltip?.takeLongPress(info.id)) return;
    // Keys of the row above a CDJ screen (and the mixer's ÉCHAP key) carry a
    // printed text (TOP_ROW_LABELS / MIXER_TOP_KEYS in src/scene/screens.js): it
    // becomes the label ('Sources', 'Link'...), the baked one stays in `bakedLabel`.
    const printed = screens.topLabelFor(info.id);
    if (printed) info = { ...info, label: printed, bakedLabel: info.label };
    if (screenFocus?.handleButton(info) === 'blocked') return;
    // CDJ screen pages (top keys, focused or not), BACK (src/screens/index.js).
    // (the screens themselves and their ÉCHAP keys, the mixer CRÉDITS screen
    // included, are handled by the screen focus above)
    screenUI?.handleButton(info);
    cdj?.handleButton(info); // CDJ setting toggles (QUANTIZE, SYNC, MASTER, MT...)
    mixerButtons.handleButton(info); // mixer buttons with a state (assign, curves, CUE, FX ON...)
    devPanel?.click(info);
    if (DEV) console.debug('[button]', info);
  };
  const hotspots = createHotspots({
    units, camera, dom: renderer.domElement, onButton,
    onHover: (info) => { devPanel?.hover(info); screenTouch?.setZoneHover(info); tooltip?.hover(info); },
    // Held buttons (CUE): press / release, not blocked by the focus except during a flight.
    // Held CDJ buttons (PLAY, CUE, hot cues, loops, jog touch...) act on the press; the
    // returned { hold } keeps the press on the button (no orbit, no release on a slide).
    onPress: (info) => {
      const r = screenFocus?.busy ? null : cdj?.handlePress(info) ?? null;
      if (!r?.hold) tooltip?.press(info); // a held button (jog, CUE...) never shows its hint mid-gesture
      return r;
    },
    onRelease: (info) => { tooltip?.release(); cdj?.handleRelease(info); },
    // the 3D controls are picked like the bodies; their zones show a grab cursor
    // (frozen in screen focus: plain pointer there)
    pickables: controls.pickables, cursorFor: (id) => (screenFocus?.current ? 'pointer' : controls.cursorFor(id)),
  });
  hotspots.setEnabled(false);

  // Invitation line (after the intro) and hover hints (texts: src/data/hints.js).
  // Hints: never in the intro or during a flight; in screen focus only on the keys
  // above the screen (the screen is the interface there); placed next to the zone,
  // avoiding both CDJ screens.
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
  const invite = createInvite({ text: finePointer ? INVITE.mouse : INVITE.touch });
  let finished = false; // intro over (set by finish() below)
  const SCREEN_ZONES = ['cdj_left_screen', 'cdj_right_screen'];
  tooltip = createTooltip({
    dom: renderer.domElement, camera, reducedMotion,
    hintFor: (id, opts) => hintFor(id, screens.topLabelFor(id), opts),
    // 3D controls (knobs, caps) stand above the panel: their height counts. A CDJ
    // screen counts with its keys (Sources ... Échap; the mixer's Échap): the hint never hides them.
    rectFor: (id) => {
      const r = hotspots.screenRect(id, { lift: (controls.byZone.get(id)?.height ?? 0) * 1000 + 2 });
      const m = /^(cdj_left|cdj_right|mixer)_screen$/.exec(id);
      if (!r || !m) return r;
      for (const k of ['source', 'menu']) {
        const q = hotspots.screenRect(`${m[1]}_${k}`, { lift: 3 });
        if (q) { r.left = Math.min(r.left, q.left); r.top = Math.min(r.top, q.top); r.right = Math.max(r.right, q.right); r.bottom = Math.max(r.bottom, q.bottom); }
      }
      return r;
    },
    // a key above a screen: its neighbours in the row are avoided too (never hidden by the hint)
    obstacles: (id) => {
      const list = SCREEN_ZONES.filter((z) => z !== id).map((z) => hotspots.screenRect(z));
      const unit = screens.topLabelFor(id) ? /^(cdj_left|cdj_right)_/.exec(id)?.[1] : null;
      if (unit) for (const k of Object.values(screens.topKeys)) if (k.unit === unit && `${unit}_${k.def.zone}` !== id) { const q = hotspots.screenRect(`${unit}_${k.def.zone}`); if (q) list.push({ ...q, weight: 4 }); }
      return list;
    },
    // in screen focus, only the printed keys above the screens (Sources ... Échap) keep their hint
    blocked: (id) => !finished || !!screenFocus?.busy || (!!screenFocus?.current && !screens.topLabelFor(id)),
  });
  tooltip.onShow(() => invite.interacted());
  renderer.domElement.addEventListener('pointerdown', () => invite.interacted());
  renderer.domElement.addEventListener('wheel', () => invite.interacted(), { passive: true });

  const cables = createCables(units);
  const rig = createCameraRig(camera, { fitBox: stage.box });
  const zoom = createZoom(rig, renderer.domElement, { reducedMotion, camera });
  screenFocus = createScreenFocus({ rig, zoom, units, camera, reducedMotion, dom: renderer.domElement });
  screenFocus.onChange((e) => {
    if (e.type === 'enter') { tooltip.hide(); invite.dismiss(); } // first screen view: the invitation has done its job
    if (e.type === 'enter' || e.type === 'exit') devPanel?.click({ id: `focus: ${e.zone} → ${e.type.toUpperCase()}`, unit: e.unit, label: e.type === 'enter' ? 'ENTER' : 'EXIT' });
    // The dev panel would hide keys of the focused screen: hidden meanwhile, put back as it was after.
    devPanel?.setFocus(e.type === 'enter');
    if (DEV) console.debug('[focus]', e);
  });
  // Phone held upright: a tip in the screen view (pinch to magnify, or turn the phone).
  const focusTip = DEVICE.mobile ? createFocusTip({ focus: screenFocus, text: FOCUS_TIP, when: () => isPortrait() && DEVICE.phone }) : null;
  // While focused, the CDJ screen is a touch surface (canvas px events, hit regions).
  screenTouch = createScreenTouch({
    dom: renderer.domElement, camera, screens, focus: screenFocus,
    onEvent: (e) => { devPanel?.touch(e); if (DEV && e.type !== 'pointermove') console.debug('[touch]', e); },
  });
  // Drag / turn the movable controls (no orbit meanwhile; idle in the intro and in screen focus).
  const controlInput = createControlInput({ dom: renderer.domElement, camera, controls, hotspots, zoom, focus: screenFocus });
  loader.set('build', 1);

  // Pages of the screens (CDJ: About, Sources, Link, Dates, Feat, player; mixer:
  // CRÉDITS at rest, end credits in its focus) and
  // the two Web Audio decks. The first page of each screen is drawn with the
  // audio manifest and its photo already there (no redraw / upload during the intro).
  screenUI = createScreenUI({ screens, focus: screenFocus, library });
  mixer.bind({ decks: screenUI.decks }); // Beat FX time follows the track BPM
  // The AudioContext (a 20-120 ms freeze to create) waits for a quiet moment after
  // the first gesture: never during the intro or a camera move (src/audio/engine.js).
  // The mixer graph is built right after it, off the first PLAY.
  engine.deferCreationWhile(() => !finished || screenFocus.busy || zoom.moving || document.hidden);
  engine.onIdleCreate(() => { mixer.input('cdjLeft'); mixer.input('cdjRight'); });
  const vuLive = createVuLive({ vu, decks: screenUI.decks }); // VU follow the real audio (idle when nothing plays)
  cdj = createCdjButtons({ ui: screenUI, controlStore: controls.store });
  createScreenDemo({ screens, focus: screenFocus }); // demo keys (off by default), SCREEN_TOUCH.demo in config
  loader.set('screens', 0.3);
  await libraryReady(screenUI.library, 12000);
  screenUI.update(performance.now());
  loader.done('screens');

  // Render on demand (see the loop below): anything may ask for frames.
  let dirtyUntil = 0;
  // (at least the next frame: with ms = 0, `now < dirtyUntil` was already false at
  // the next frame and nothing was drawn; after the end-of-intro retune, which
  // resizes, hence clears, the canvas, the view stayed black until the 1 s safety frame)
  const markDirty = (ms = 0) => { dirtyUntil = Math.max(dirtyUntil, performance.now() + Math.max(ms, 50)); };
  let introCamera = null; // set with the timeline below
  screenFocus.onMagnify(() => markDirty(100));

  // --- intro ---
  let scheduleRetune = () => {}; // set with the render loop below
  const finish = () => {
    if (finished) return;
    finished = true;
    if (!params.cam) rig.set('final');
    hotspots.setEnabled(true);
    zoom.setActive(true);
    mixer.resumeFx(); // a live Beat FX (closed by R) is heard again
    overlay.showSkip(false);
    invite.show(); // fades in shortly after, unless already seen (localStorage)
    quality.pause(false);
    scheduleRetune();
    markDirty();
  };
  const built = buildTimeline({ rig, cables, onComplete: finish });
  const { tl, tick } = built;
  introCamera = built.camera;
  // A resize (window, phone turned) re-frames everything for the new aspect,
  // without recreating anything: the intro path (fitted keys), the free view
  // (zoom fit) and a focused screen.
  onResize(() => {
    if (!finished && !params.cam) introCamera.rebuild();
    zoom.handleResize();
    screenFocus.refit();
    focusTip?.refresh();
    markDirty(400);
  });
  if (params.speed) tl.timeScale(params.speed);

  // R: replay. The decks stop first (no music running under the intro), the
  // echo / reverb tails are cut, the screen focus and the hints are reset;
  // nothing is created again (no leak). Reduced motion: straight to the end,
  // as on the first visit.
  const replay = () => {
    if (!ready) return;
    // decks stopped first (also cancels a pending autoplay of a track still
    // decoding, and a vinyl jog touch will not resume on release), then held
    // buttons released (CUE / hot cue sampler, SEARCH scan, jog touch), then
    // stopped again in case a release restarted anything: silence under the intro
    const decks = Object.values(screenUI.decks);
    for (const d of decks) d.pause();
    hotspots.setEnabled(false);
    cdj.releaseAll();
    for (const d of decks) d.pause();
    mixer.cutTails(); // Beat FX returns closed: no echo / reverb ringing under the intro
    screenFocus.reset(); // the mixer CRÉDITS screen returns to its rest page too (src/screens/index.js)
    finished = false;
    clearTimeout(retuneTimer);
    zoom.setActive(false);
    tooltip.hide();
    invite.hide();
    overlay.showSkip(true);
    quality.introTier(); // the intro's resolution tier (set before its first frame)
    retuned = false; // the still view may climb again at the end
    if (reducedMotion) { tl.pause(0); skip(); return; }
    quality.pause(true, { probeMs: 750 });
    tl.pause(0).play();
    markDirty();
  };
  const skip = () => { if (!ready) return; tl.pause(); tl.progress(1); finish(); };
  overlay.onSkip(skip);

  // Dev panel (development server only).
  if (DEV) {
    const { createDevPanel } = await import('./ui/devPanel.js');
    devPanel = createDevPanel();
    devPanel.el.style.display = 'none'; // display disabled on purpose; the panel keeps logging in the background
    hotspots.setAltClickHandler((c) => { devPanel.coords(c); console.info('[local mm]', c); });
    window.__intro = { tooltip, invite, tl, stage, screens, vu, hotspots, cables, rig, zoom, camera, introCamera, backdrop, screenFocus, screenTouch, screenUI, cdj, vuLive, controls, controlInput, mixer, mixerButtons, mixerLabel, scene, renderer, composer, units, params, quality, loader, ready: false };
  }

  // --- warm up shaders and textures before the first frame ---
  // Everything the intro and the free view will draw is compiled and uploaded
  // here, behind the loading screen, so no shader compile or texture upload lands
  // in the middle of an animation (they cost 50-470 ms each with ANGLE / Metal).
  //   - programs depend on the render target: the composer draws into its own
  //     target (no tone mapping, linear output), not the canvas, so compile
  //     with that target bound (compiling for the canvas built unused variants);
  //   - the units and everything on them are opaque from now on (they never
  //     fade): only that variant is compiled;
  //   - every texture is uploaded, even on objects outside the first frames;
  //   - real frames, without frustum culling: ANGLE / Metal finishes a program
  //     on its first draw, and they also build the post-processing and shadow passes.
  await backdrop.ready; // club décor: textures decoded, lights baked
  loader.done('textures'); loader.done('bake');
  for (const u of stage.list) u.setOpaque(true);
  for (const c of cables) { c.state.approach = 1; c.state.opacity = 1; c.update(); } // cables visible with their materials
  rig.apply(0);
  const previousTarget = renderer.getRenderTarget();
  // compiled in parts (progress), each with the lights / fog of the whole scene
  const parts = [stage.root, backdrop.group, scene].filter(Boolean);
  let compiled = 0;
  for (const part of parts) {
    renderer.setRenderTarget(composer.renderTarget1);
    await renderer.compileAsync(part, camera, scene);
    loader.set('shaders', ++compiled / parts.length);
  }
  renderer.setRenderTarget(previousTarget);
  loader.done('shaders');
  await breathe();
  scene.traverse((o) => {
    for (const m of o.isMesh ? [].concat(o.material) : []) {
      for (const v of Object.values(m)) if (v?.isTexture) renderer.initTexture(v);
    }
  });
  loader.set('warm', 0.4);
  await breathe();
  backdrop.update();
  const culled = [];
  scene.traverse((o) => { if (o.isMesh && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
  renderer.shadowMap.needsUpdate = true;
  render();
  await breathe();
  for (const o of culled) o.frustumCulled = true;
  loader.done('warm', 'Presque prêt');
  await breathe();
  // Economy (phones only): low battery, or reduced motion asked: sharpness capped.
  if (MOBILE.active) {
    const low = reducedMotion || await Promise.race([lowBattery(), new Promise((r) => setTimeout(() => r(false), 300))]);
    if (low) quality.cap(MOBILE.economyPixelRatio);
  }
  // Resolution for the intro: the sharpest tier whose frame (shadow map redrawn:
  // the worst intro frame) fits RENDER.frameBudgetMs on this machine.
  quality.pick({ shadow: true });
  if (DEV) console.info('[quality] pixel ratio', quality.pixelRatio, 'cost per tier (ms)', JSON.stringify(quality.costs), 'ramp', JSON.stringify(measure.lastRamp));
  quality.pause(true);
  for (const c of cables) { c.state.approach = 0; c.state.opacity = 0; }
  tl.progress(0);
  tick();
  loader.done('tune');

  // --- initial state from the URL ---
  if (params.cam) {
    rig.set(params.cam);
    // Dev preset: keep the cinematic rig from overriding the camera.
    tl.getTweensOf(rig.state).forEach((t) => t.kill());
    introCamera.follow = false;
  }

  // --- render loop ---
  // Shadows: only the cables (intro) and the movable controls move shadow
  // casters (the units never move); the shadow pass (every caster into a
  // 2048 px map) is redrawn only when one of them moved or appeared, not for
  // camera moves. RENDER.staticShadows = false in src/config.js redraws it every frame.
  renderer.shadowMap.autoUpdate = !RENDER.staticShadows;
  const casterState = new Float64Array(cables.length * 2);
  const castersMoved = () => {
    let i = 0, moved = false;
    const put = (v) => { if (casterState[i] !== v) { casterState[i] = v; moved = true; } i++; };
    for (const c of cables) { put(c.state.approach); put(c.state.opacity > 0 ? 1 : 0); }
    return moved;
  };
  castersMoved();
  renderer.shadowMap.needsUpdate = true;

  // Render on demand (RENDER.renderOnDemand): every frame while the intro plays;
  // otherwise a frame only when something visible changed: camera (zoom, orbit,
  // focus flights), a material or one of its textures (screens, VU, key prints:
  // their version), a deck / sync / control state (parts), any input or resize
  // (for 0.4 s), the shadow map (the lights never change). A still view costs no
  // GPU time; one frame per second is drawn anyway as a safety net.
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'keydown', 'keyup', 'resize', 'focus', 'blur']) window.addEventListener(t, () => markDirty(400), { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => markDirty(400));
  for (const d of Object.values(screenUI.decks)) d.onChange(() => markDirty(100));
  screenUI.sync?.onChange?.(() => markDirty(100));
  controls.store.onChange(() => markDirty(100));
  screenFocus.onChange(() => markDirty(100));
  let watched = []; // materials whose version (and texture versions) are watched
  const collectWatched = () => {
    const set = new Set();
    scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) set.add(m); });
    watched = [...set];
  };
  collectWatched();
  let watchSum = -1, watchFrames = 0;
  const watchedChanged = () => {
    if (++watchFrames >= 120) { watchFrames = 0; collectWatched(); } // new meshes (top keys, video...)
    let s = 0;
    for (const m of watched) {
      s += m.version;
      if (m.map) s += m.map.version * 3;
      if (m.emissiveMap) s += m.emissiveMap.version * 5;
      if (m.alphaMap) s += m.alphaMap.version * 7;
    }
    if (s === watchSum) return false;
    watchSum = s;
    return true;
  };
  const camState = new Float64Array(16 + 7);
  const cameraChanged = () => {
    let changed = false, i = 0;
    const put = (v) => { if (camState[i] !== v) { camState[i] = v; changed = true; } i++; };
    for (const v of camera.projectionMatrix.elements) put(v);
    put(camera.position.x); put(camera.position.y); put(camera.position.z);
    put(camera.quaternion.x); put(camera.quaternion.y); put(camera.quaternion.z); put(camera.quaternion.w);
    return changed;
  };
  let lastRender = 0, lastInput = 0;
  for (const t of ['pointermove', 'pointerdown', 'wheel']) window.addEventListener(t, () => { lastInput = performance.now(); }, { passive: true, capture: true });

  // End of the intro: the shadow map is static from now on and the GPU is warm,
  // so a sharper tier may fit the budget (only if the loading screen chose a
  // lower one). Measured once, when the view is still and nobody touches it
  // (a ~100 ms stall, invisible on a still image).
  let retuneTimer = 0, retuned = false;
  scheduleRetune = (delay = 1200) => {
    if (retuned || quality.level === 0 || !RENDER.adaptiveResolution) return;
    clearTimeout(retuneTimer);
    retuneTimer = setTimeout(() => {
      if (!finished) return;
      const busy = performance.now() - lastInput < 800 || screenFocus.busy || zoom.moving || document.hidden;
      if (busy) { scheduleRetune(1500); return; }
      retuned = true;
      quality.pick({ shadow: false, up: true });
      if (DEV) console.info('[quality] after the intro: pixel ratio', quality.pixelRatio, JSON.stringify(quality.costs));
      markDirty();
    }, delay);
  };

  const clock = new THREE.Clock();
  let frames = 0, fpsT = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(clock.getDelta(), 0.1);
    tick();
    zoom.update(dt);
    rig.apply(dt);
    hotspots.update();
    screenTouch.update(); // after hotspots: cursor over the focused screen
    tooltip.update(); // after hotspots: hides the hint while the camera moves (no-op when no hint)
    vuLive.update(dt); // returns at once when no deck plays
    screenUI.update(); // CDJ screens: redrawn only when dirty (or the player page while playing)
    backdrop.update();
    if (RENDER.staticShadows) {
      if (castersMoved()) renderer.shadowMap.needsUpdate = true;
      // a control moved (drag, reset, store.set): its shadow on the panel follows
      if (controls.consumeShadowDirty()) renderer.shadowMap.needsUpdate = true;
    }
    // (every check runs: each one also records the current state)
    const a = cameraChanged(), b = watchedChanged();
    // (until the intro is over, every frame: keeps the GPU clock up from the loader's fade on)
    const due = !RENDER.renderOnDemand || !finished || tl.isActive() || a || b || renderer.shadowMap.needsUpdate
      || now < dirtyUntil || now - lastRender > 1000;
    if (DEV && due) { // why frames are drawn (window.__intro.renderReasons)
      const r = window.__intro.renderReasons ??= {};
      const k = !RENDER.renderOnDemand ? 'always' : (!finished || tl.isActive()) ? 'intro' : a ? 'camera' : b ? 'material' : renderer.shadowMap.needsUpdate ? 'shadow' : now < dirtyUntil ? 'dirty' : 'safety';
      r[k] = (r[k] || 0) + 1;
    }
    if (due) {
      render();
      lastRender = now;
      frames++;
    }
    if (devPanel) {
      fpsT += dt;
      if (fpsT >= 0.5) { devPanel.status(`${Math.round(frames / fpsT)} fps · t ${tl.time().toFixed(2)}`); frames = 0; fpsT = 0; }
    }
  };
  // Two frames at t = 0 behind the loader, so the first visible frame is ready.
  renderer.domElement.style.visibility = '';
  renderer.setAnimationLoop(loop);
  await nextFrame();
  await nextFrame();

  // --- go: the loading screen fades out, the intro starts at t = 0 ---
  ready = true;
  if (DEV) window.__intro.ready = true;
  createKeys({
    replay,
    // Escape leaves the screen focus first (accessibility), otherwise skips the intro.
    skip: () => (screenFocus.current ? screenFocus.exit() : skip()),
    // Space: pause / resume the intro; once it is over, play / pause of the CDJ
    // (focused one, else the last active: src/screens/index.js togglePlay)
    togglePause: () => { if (finished) { screenUI?.togglePlay(); markDirty(400); return true; } (tl.paused() ? tl.play() : tl.pause()); markDirty(); return true; },
    toggleZones: () => { if (DEV) { hotspots.setShowZones(!hotspots.showZones); markDirty(); } },
    togglePanel: () => devPanel?.toggle(), // dev only: the panel exists only in dev
  });
  await loader.complete();
  if (reducedMotion) {
    skip();
  } else if (params.t != null) {
    tl.pause(Math.min(params.t, tl.duration()));
    if (params.t >= tl.duration()) finish();
    markDirty();
  } else {
    overlay.showSkip(true);
    quality.pause(true, { probeMs: 750 });
    tl.play();
  }
}

boot().catch((err) => {
  console.error(err);
  // Unexpected failure after the model loaded: clear message, reload to retry.
  if (loader.closed) { overlay.showFallback('L’introduction a rencontré une erreur. Rechargez la page.'); return; }
  loader.fail('L’introduction n’a pas pu être chargée. Réessayez dans un instant.').then(() => location.reload());
});

// Keep GSAP's ticker in sync with rAF only (no lag smoothing surprises on seek).
gsap.ticker.lagSmoothing(0);
