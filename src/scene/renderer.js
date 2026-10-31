// Renderer, post-processing (MSAA + very light bloom), environment and lights.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RENDER } from '../config.js';

export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(36, container.clientWidth / container.clientHeight, 0.05, 20);

  // Post: MSAA render target, light bloom, output (tone mapping + sRGB).
  const dpr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(container.clientWidth * dpr, container.clientHeight * dpr, {
    type: THREE.HalfFloatType,
    samples: RENDER.msaaSamples,
  });
  const composer = new EffectComposer(renderer, target);
  // EffectComposer takes its size from the target (device pixels) and multiplies
  // it AGAIN by the pixel ratio for its passes and setPixelRatio(): on a Retina
  // screen the bloom ran on dpr² times the pixels (4410 px wide instead of 2520
  // for a 1440 px window at 1.75). Give it the CSS size, like the resize handler.
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), RENDER.bloomStrength, 0.35, 0.92);
  // Bloom at a fraction of its stock resolution (RENDER.bloomScale): its 13
  // passes cost several ms per frame on a Retina screen; at 0.5 the image differs
  // by < 0.1 / 255 on average (the glow is faint and soft anyway).
  const bloomScale = RENDER.bloomScale ?? 1;
  if (bloomScale !== 1) {
    const setBloomSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => setBloomSize(Math.max(2, Math.round(w * bloomScale)), Math.max(2, Math.round(h * bloomScale)));
  }
  // MOBILE profile (RENDER.bloom false): no bloom pass at all (no targets allocated)
  if (RENDER.bloom !== false) composer.addPass(bloom);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
  if (RENDER.bloom !== false) mergeBloomIntoOutput(bloom, outputPass);

  const lights = addLights(scene);

  // Same renderer and targets for the whole visit: a resize (or a phone turned
  // between portrait and landscape) only resizes them, never recreates anything.
  let lastW = 0, lastH = 0;
  const resizeListeners = new Set(); // fn(w, h) after the renderer and targets are resized
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    // also resizes every pass at the device pixel ratio (bloom included, same
    // resolution as at start-up: no bloom.setSize(w, h) in CSS px after it)
    composer.setSize(w, h);
    for (const fn of resizeListeners) fn(w, h);
  };
  lastW = container.clientWidth; lastH = container.clientHeight;
  window.addEventListener('resize', resize);
  // iOS / Android: on a rotation the new layout size may only be known a frame
  // or two after the event (the address bar also resizes the visual viewport).
  const resizeLater = () => requestAnimationFrame(() => { resize(); requestAnimationFrame(resize); });
  window.addEventListener('orientationchange', resizeLater);
  window.visualViewport?.addEventListener('resize', resizeLater);

  // Cost of one frame (ms, CPU + GPU: frames drawn back to back, then waited
  // for). The loading screen picks the resolution with it. shadow: the shadow map
  // is redrawn in every frame (worst intro frame: a unit or a cable moves).
  const px = new Uint8Array(4);
  const sync = () => { const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  // Best of `runs` (the GPU clock may still be ramping up: the best run is the
  // closest to the steady state).
  const measure = ({ frames = 4, shadow = true, runs = 3 } = {}) => {
    let best = Infinity;
    for (let r = 0; r < runs; r++) {
      if (shadow) renderer.shadowMap.needsUpdate = true;
      composer.render(); sync(); // the first frame after a resize is not representative
      const t = performance.now();
      for (let k = 0; k < frames; k++) { if (shadow) renderer.shadowMap.needsUpdate = true; composer.render(); }
      sync();
      best = Math.min(best, (performance.now() - t) / frames);
    }
    return best;
  };
  // An idle GPU runs at a low clock and needs some work to ramp up; during
  // loading the browser may also still be finishing shader pipelines in the
  // background. A few frames are drawn first (maxMs), and the tiers are then
  // judged with RENDER.loadBudgetSlack (see quality.pick).
  measure.rampUp = (maxMs = 300) => {
    const t0 = performance.now();
    const seq = [];
    while (performance.now() - t0 < maxMs) seq.push(Math.round(measure({ frames: 4, runs: 1 }) * 10) / 10);
    measure.lastRamp = seq;
  };

  const quality = createAdaptiveResolution(renderer, composer, measure);

  return {
    renderer, scene, camera, composer, lights, outputPass, quality, bloom, measure,
    // fn(w, h) once the canvas has its new size (camera aspect updated): framing
    // updates (zoom fit, screen focus, intro path) hang here
    onResize(fn) { resizeListeners.add(fn); return () => resizeListeners.delete(fn); },
    render: () => { quality.frame(performance.now()); composer.render(); },
    dispose: () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resizeLater);
      window.visualViewport?.removeEventListener('resize', resizeLater);
      renderer.dispose();
    },
  };
}

// Resolution (pixel ratio) tiers: RENDER.maxPixelRatio (capped by the screen),
// then 1.5, 1.25, 1, never below RENDER.minPixelRatio. The frame cost grows with
// the pixel count (MSAA target, décor shading, bloom, output).
//   quality.pick({ shadow, budget }) warms the GPU up, then measures the frame
//     cost (behind the loading screen) from the top tier down and keeps the first tier within the budget
//     (RENDER.frameBudgetMs): the intro then runs at that resolution, unchanged.
//   quality.pause(true) during the intro: no change of tier mid-animation (each
//     change reallocates the render targets: a 100-250 ms hitch).
//   Afterwards (RENDER.adaptiveResolution), if the frames drawn back to back stay
//     slower than RENDER.adaptiveMinFps for two windows of one second, the tier
//     steps down one notch; a step that does not help is undone (frame rate capped
//     by the browser, e.g. Chrome's energy saver), then tried again 15 s later at
//     most once. Gaps (nothing to draw: the loop renders only on change), hidden
//     tabs and isolated stalls are ignored. It never steps up by itself.
function createAdaptiveResolution(renderer, composer, measure) {
  const top = renderer.getPixelRatio();
  const floor = Math.min(top, RENDER.minPixelRatio ?? top);
  const steps = [...new Set([top, ...(RENDER.tiers ?? [1.5, 1.25, 1])].filter((p) => p <= top && p >= floor))];
  const slow = 1000 / (RENDER.adaptiveMinFps ?? 50);
  let level = 0, locked = !RENDER.adaptiveResolution || steps.length < 2, paused = false;
  let ceiling = 0; // index of the sharpest allowed tier (economy mode: cap())
  let last = 0, sum = 0, n = 0, bad = 0, undone = 0, waitUntil = 0;
  let check = null; // { before: mean frame time before the last step, windows }
  let probe = null; // start of the intro: { until, sum, n, last }
  let introLevel = 0; // tier of the intro (pick, lowered by the probe)
  const costs = []; // measured cost per tier (ms), dev / report
  const apply = (i) => {
    if (i === level && renderer.getPixelRatio() === steps[i]) return;
    level = i;
    renderer.setPixelRatio(steps[i]);
    composer.setPixelRatio(steps[i]); // also resizes the targets and passes
  };
  const window1s = (mean, now) => {
    if (check) {
      // after a step: did it help? (second window: the first one includes the reallocation)
      if (++check.windows < 2) return;
      if (mean > check.before * 0.97) {
        apply(level - 1);
        if (++undone >= 2) locked = true;
        waitUntil = now + 15000;
      }
      check = null;
      return;
    }
    if (now < waitUntil) return;
    bad = mean > slow ? bad + 1 : 0;
    if (bad < 2) return;
    bad = 0;
    if (level + 1 >= steps.length) { locked = true; return; }
    check = { before: mean, windows: 0 };
    apply(level + 1);
  };
  return {
    get pixelRatio() { return renderer.getPixelRatio(); },
    get level() { return level; },
    get steps() { return steps; },
    get locked() { return locked; },
    get costs() { return costs.slice(); },
    // Picks the tier (behind the loading screen; or once at the end of the
    // intro with up = true: climbs back while it fits the budget).
    pick({ shadow = true, budget = RENDER.frameBudgetMs ?? 13, up = false } = {}) {
      if (!RENDER.adaptiveResolution || steps.length < 2) { apply(ceiling); return steps[ceiling]; }
      if (up) {
        // climbs while the next tier up fits
        while (level > ceiling) {
          const from = level;
          apply(level - 1);
          const ms = measure({ shadow });
          costs[level] = Math.round(ms * 10) / 10;
          if (ms > budget) { apply(from); break; }
        }
        return steps[level];
      }
      measure.rampUp?.();
      // measured on a cold GPU: up to ~2x the steady cost (checked against the
      // warm measure at the end of the intro)
      const coldBudget = budget * (RENDER.loadBudgetSlack ?? 1);
      // the intro starts at most at introMaxPixelRatio (motion hides the
      // difference; the still view climbs back at its end)
      const first = Math.max(ceiling, steps.findIndex((p) => p <= (RENDER.introMaxPixelRatio ?? Infinity) + 1e-6));
      let chosen = steps.length - 1;
      for (let i = first; i < steps.length; i++) {
        apply(i);
        const ms = measure({ shadow });
        costs[i] = Math.round(ms * 10) / 10;
        if (ms <= coldBudget) { chosen = i; break; }
      }
      apply(chosen);
      introLevel = chosen;
      return steps[chosen];
    },
    // Back to the intro tier (replay: the still view may have climbed since).
    introTier() { apply(Math.max(introLevel, ceiling)); },
    // Caps the sharpness at `ratio` (economy mode on a phone: low battery,
    // reduced motion). Never raises it.
    cap(ratio) {
      const i = steps.findIndex((p) => p <= ratio + 1e-6);
      ceiling = i < 0 ? steps.length - 1 : i;
      if (level < ceiling) apply(ceiling);
    },
    // on: the intro runs. probeMs: during its first ms (under the fading loading
    // screen on the first visit), a steady frame rate below RENDER.introMinFps
    // steps the tier down at once; then nothing changes.
    pause(on, { probeMs = 0 } = {}) {
      paused = !!on; last = 0; sum = 0; n = 0; bad = 0; check = null;
      probe = on && probeMs > 0 && RENDER.adaptiveResolution && steps.length > 1 ? { until: performance.now() + probeMs, sum: 0, n: 0, last: 0, skip: 4 } : null;
    },
    frame(now) {
      if (probe) {
        if (now > probe.until) probe = null;
        else {
          const d = probe.last ? now - probe.last : 0;
          probe.last = now;
          if (d > 0 && d < 250 && --probe.skip < 0) { probe.sum += d; probe.n++; } // the first frames after a pause are not representative
          if (probe.n >= 8 && probe.sum / probe.n > 1000 / (RENDER.introMinFps ?? 50) && level + 1 < steps.length) {
            apply(level + 1);
            introLevel = level; // replays start there
            probe.sum = 0; probe.n = 0; probe.last = 0;
          }
        }
      }
      if (locked || paused) return;
      const dt = last ? now - last : 0;
      last = now;
      // > 50 ms: a gap (nothing to draw) or a stall, not a steady slow frame rate
      if (!dt || dt > 50 || document.hidden) { if (dt > 250 || document.hidden) { sum = 0; n = 0; } return; }
      sum += dt; n++;
      if (sum < 1000) return;
      const mean = sum / n;
      sum = 0; n = 0;
      window1s(mean, now);
    },
  };
}

// UnrealBloomPass ends by drawing its result additively over the scene buffer:
// a full-screen draw into the 4x MSAA half-float target, then a second MSAA
// resolve: ~250 MB of memory traffic per frame on a Retina screen. Same maths,
// without the round trip: that last draw is skipped and the output pass adds the bloom
// texture itself, before tone mapping. The stock blend is SRC_ALPHA, ONE
// (rgb = scene + bloom.rgb * bloom.a), and adding a constant to every MSAA
// sample of a pixel equals adding it after the resolve: identical image.
// If a three.js update changes these internals, the stock path is kept.
function mergeBloomIntoOutput(bloom, outputPass) {
  const quad = bloom._fsQuad, blend = bloom.blendMaterial, bloomTarget = bloom.renderTargetsHorizontal?.[0];
  const m = outputPass.material;
  const anchor = 'gl_FragColor = texture2D( tDiffuse, vUv );';
  if (!quad?.render || !blend || !bloomTarget || !m?.fragmentShader?.includes(anchor)) return false;
  const draw = quad.render.bind(quad);
  quad.render = (renderer) => { if (quad.material !== blend) draw(renderer); };
  Object.assign(outputPass.uniforms, { tBloom: { value: bloomTarget.texture }, uBloomOn: { value: 1 } });
  m.uniforms = outputPass.uniforms;
  m.fragmentShader = m.fragmentShader
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D tBloom;\nuniform float uBloomOn;')
    .replace(anchor, `${anchor}\n{ vec4 b = texture2D( tBloom, vUv ); gl_FragColor.rgb += b.rgb * ( b.a * uBloomOn ); }`);
  m.needsUpdate = true;
  // bloom.enabled = false must still remove the bloom
  const render = outputPass.render.bind(outputPass);
  outputPass.render = (...args) => { outputPass.uniforms.uBloomOn.value = bloom.enabled ? 1 : 0; return render(...args); };
  return true;
}

function addLights(scene) {
  // Neutral studio light: a soft key from the front-left-top, a white rim from
  // behind, and the room environment for the rest. No coloured accents.
  const key = new THREE.SpotLight(0xffffff, 26, 6, Math.PI / 5, 0.7, 1.6);
  key.position.set(-0.9, 2.1, 1.3);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(RENDER.shadowMapSize ?? 2048);
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.004;
  key.shadow.radius = 4;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 5;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(0.6, 1.4, -1.6);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffffff, 0.2);
  fill.position.set(1.2, 0.8, 0.6);
  scene.add(fill);

  // The floor, backdrop and fog live in src/scene/backdrop.js.
  // Full intensities, restored by the timeline as the units arrive (the
  // intro opens on a black frame: the lights come up with the gear).
  return { key, rim, fill, scene, full: { key: key.intensity, rim: rim.intensity, fill: fill.intensity, env: scene.environmentIntensity } };
}
