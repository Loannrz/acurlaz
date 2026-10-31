// Central configuration for the intro. Distances are in metres, times in seconds.
// Public files go through import.meta.env.BASE_URL (deploy under a sub-path:
// `base` in vite.config.js). The model is also preloaded by index.html.
// Phones and tablets (src/utils/device.js) get the MOBILE profile at the end of
// this file: its values replace the PC ones below before anything reads them.
import { DEVICE } from './utils/device.js';

export { DEVICE };
export const MODEL_URL = `${import.meta.env.BASE_URL}models/pioneer_cdj_3000.glb`;

// Real-world width used to normalise the model scale (CDJ-3000: 329 x 453 x 118 mm).
export const CDJ_WIDTH_M = 0.329;

// Gap between the units once docked.
export const UNIT_GAP_M = 0.006;

// Zoom (mouse wheel / pinch) after the intro. Distance from camera to the
// look-at point, in metres. The default (final) view is fitted so the three
// units are entirely visible whatever the window size (FIT_MARGIN in
// src/intro/camera.js); the limits are proportions of that fitted distance.
export const ZOOM = {
  minOverFit: 0.7, // closest = 0.7 x the default distance...
  minFloor: 0.85, // ...but never closer than this (wide screens, where the default is already close)...
  minCap: 1.3, // ...and always allowed this close (narrow / portrait screens, where the default is far)
  max: 3.2, // farthest
  maxOverFit: 1.6, // ...and always at least 1.6x the default distance (narrow windows)
  wheelSensitivity: 0.0011,
  smoothing: 7, // higher = snappier
};

// Press-and-drag orbit after the intro. Realistic standing point of view: the
// camera elevation (angle above the table plane, seen from the look-at point)
// stays between minElevation and maxElevation, never straight overhead; the
// azimuth (around the vertical axis, 0 = the default front view) stays within
// +-maxAzimuth, never behind the set. Both limits are soft stops.
const DEG = Math.PI / 180;
export const ORBIT = {
  defaultElevation: 55 * DEG, // end of the intro / default view (must lie within the limits below)
  maxElevation: 62 * DEG, // highest: plunging view over the decks, never top-down
  minElevation: 15 * DEG, // lowest: grazing but still above the table
  maxAzimuth: 65 * DEG, // +-65 degrees around the front view (130 degrees in total)
  give: 0.1, // soft stop: a drag past a limit stretches up to ~6 degrees, then springs back on release
  speed: 1, // a drag over the full window height turns the camera by speed x 180 degrees
  dragThreshold: 6, // px before a press becomes a drag (a shorter press stays a click)
  smoothing: 10,
};

// Cable stubs left behind the units after the intro: each tube is fully opaque
// for `solid` metres after its plug, then fades to transparent over `fade`
// metres, as if the cable ran very far away.
export const CABLE = {
  solid: 0.07,
  fade: 0.08,
};

export const RENDER = {
  maxPixelRatio: 1.75, // sharpest tier (capped by the screen's devicePixelRatio)
  anisotropy: 8,
  msaaSamples: 4,
  bloomStrength: 0.08,
  // Bloom computed at this fraction of its stock resolution (src/scene/renderer.js).
  // 0.5: same look (mean difference < 0.1 / 255), several ms cheaper per frame.
  bloomScale: 0.5,
  // The shadow map is redrawn only when a shadow caster moves or appears (the
  // units and cables during the intro, a movable control after it). false =
  // redrawn every frame (if something else ever moves a shadow caster).
  staticShadows: true,
  // Render on demand (src/main.js): after the intro, a frame is drawn only when
  // something changed (camera, screens, VU, controls, lights, input...), so a still
  // view costs no GPU time. false = a frame every display refresh, as before.
  renderOnDemand: true,
  // Resolution tiers (src/scene/renderer.js): maxPixelRatio, then 1.5, 1.25, 1,
  // never below minPixelRatio. Behind the loading screen the cost of an intro
  // frame (shadow map redrawn) is measured from the top tier down, and the first
  // tier within frameBudgetMs is kept for the whole intro (never changed during
  // the animation). At the end of the intro, sharper tiers are tried once (static
  // shadows are cheaper, the GPU is warm). Measured on a MacBook Air M2 (headless Chrome, 1440 x 900
  // CSS px, before / after this tuning): see README "Performances".
  frameBudgetMs: 13,
  // The intro starts at this pixel ratio at most (the camera moves: the softer
  // image does not show); the still view climbs back to maxPixelRatio at its end
  // if the measure allows it.
  introMaxPixelRatio: 1.5,
  // First 0.75 s of the intro (still under the fading loading screen on the
  // first visit): if the frames stay below this rate
  // (busy or slower machine than measured), the tier steps down at once.
  introMinFps: 50,
  // The measure behind the loading screen runs on a cold GPU (low clock, shader
  // pipelines still finishing): measured 1-2.5x the steady cost on the M2. The
  // loading screen accepts a tier up to frameBudgetMs x loadBudgetSlack; the warm
  // measure at the end of the intro then corrects it (up only).
  loadBudgetSlack: 1.8,
  // After the intro, if the frames drawn back to back stay below adaptiveMinFps
  // for 2 s, the tier steps down one notch (never back up by itself).
  // false = no measure and no change: maxPixelRatio, exactly as before.
  adaptiveResolution: true,
  minPixelRatio: 1,
  adaptiveMinFps: 55,
  // Resolution tiers below maxPixelRatio (filtered by minPixelRatio).
  tiers: [1.5, 1.25, 1],
  bloom: true, // false: no bloom pass at all (the output pass adds nothing)
  shadowMapSize: 2048, // key light shadow map (px)
  textureScale: 1, // décor photo textures and canvas atlases (0.5 = half size)
};

// Decoded audio kept in memory (src/audio/buffers.js): ~50 MB per 2.5 min track.
export const AUDIO = {
  maxBuffers: 3, // the two decks + one previous track
};

// Touch pointers (any device): larger tolerance around click zones and screen
// keys, so a fingertip reaches ~44 CSS px targets (src/scene/hotspots.js,
// src/scene/screens.js), inertia of the screen lists, long press for the hints.
export const TOUCH = {
  edgePx: 14, // click zones: nearest zone within this many CSS px (mouse: 3)...
  edgeMaxMm: 8, // ...but never more than this on the model (mouse: 2.5)
  screenSlopPx: 14, // keys of a focused CDJ screen: nearest key within this many CSS px...
  screenSlopMax: 40, // ...at most this many canvas px (never steals from a far neighbour)
  inertia: { tau: 0.28, minSpeed: 40, maxSpeed: 4000 }, // list fling: decay time (s), stop / cap (canvas px / s)
  longPressMs: 650, // above most slow taps (a tap is up to 800 ms) // hint shown after this long a still press on a hinted zone
};

// Camera framing on phones / tablets (MOBILE profile only; null on PC, where
// src/intro/camera.js keeps its own values).
//   portraitHFov: in portrait the vertical FOV widens (up to maxFov) so the
//     horizontal one stays at least this wide (degrees): the camera comes closer
//     instead of backing off through the club;
//   fitMargin: margin of the fitted default view (PC: 1.1);
//   introScaleMax: the fixed intro keys (sweeps, rear pan) move away from the set
//     by up to this factor on a narrow window, so they frame what a PC sees.
export const MOBILE_CAMERA = {
  portraitHFov: 22,
  maxFov: 48,
  fitMargin: 1.04,
  introScaleMax: 1.6,
  panX: 0.42, // two-finger pan: the look-at point stays within +-panX m (x)...
  panZ: [-0.12, 0.18], // ...and this range in z (m)
  maxCameraY: 3.25, // camera never above this height (club ceiling at 3.45 m)
  maxCameraZ: 3.5, // ...nor this far behind the DJ (brick wall at z = 4 m)
};

// Infinite studio backdrop (src/scene/backdrop.js): no edge, no horizon line,
// the same look in every direction. Colours are sRGB hex; everything scales
// with the intro light level (black first frame) and is static afterwards.
export const BACKDROP = {
  // 'casita' = club décor (src/scene/club/, settings CLUB below); the studio
  // variants 'graphite' | 'warm' | 'cold' use the settings of this object.
  // Compare without recompiling: ?backdrop=graphite
  variant: 'casita',
  variants: {
    // neutral deep graphite, champagne pool of light (default)
    graphite: { horizon: 0x17181b, top: 0x060607, floor: 0x070708, pool: 0xfff0dc, band: 0.06, reflectionTint: 0x9a9a9a },
    // a touch warmer: smoked bronze black, warm pool
    warm: { horizon: 0x1b1713, top: 0x070605, floor: 0x090807, pool: 0xffe2bb, band: 0.07, reflectionTint: 0xa09a92 },
    // a touch colder: blue-steel black, white pool
    cold: { horizon: 0x13161b, top: 0x050608, floor: 0x06070a, pool: 0xeef3ff, band: 0.06, reflectionTint: 0x949aa2 },
  },
  fogDensity: 0.08, // exponential fog: the floor melts into the horizon colour
  floorRoughness: 0.42, // dark lacquer / polished stone (lower = sharper sheen)
  floorSheen: 0.3, // strength of the floor's specular sheen and environment reflection
  floorGrain: 0.06, // static micro-variation of the floor (avoids a flat tint)
  poolRadius: 0.9, // m, soft pool of light under the set
  poolStrength: 0.05, // its intensity (keep low: the set is the hero)
  reflection: 0.2, // opacity of the mirrored units on the floor
  reflectionDepth: 0.07, // m below the floor over which the reflection fades out
  vignette: 0.35, // darkening towards the frame corners (0 = none)
  grain: 0.012, // static film grain / dithering against banding (0 = none)
};

// Club décor "casita" (src/scene/club/): DJ booth of a tropical latino bar
// facing an empty dance floor. Everything is fixed (no moving, pulsing or
// audio-driven light); it only fades in with the intro light. Colours: sRGB hex.
// Light positions / colours: src/scene/club/lights.js; floor plan: layout.js.
export const CLUB = {
  lightGain: 1.3, // all club lights (décor only, not the gear)
  voxel: 0.22, // m, resolution of the baked club lighting (irradiance volume, src/scene/club/bake.js)
  ambientSky: 0x0d2218, // ambient from above (deep green)...
  ambientGround: 0x170e08, // ...and from below (warm)
  fogColor: 0x040806, // haze colour (distance fade)
  fogDensity: 0.05,
  fadeCurve: 1.5, // décor level = intro light level ^ fadeCurve (> 1: comes up after the gear)
  floorTint: 0xe6dcd4, // lacquered terracotta tiles of the dance floor...
  floorSaturation: 0.5, // ...partly desaturated (aged tiles: green and amber pools both read)
  floorGloss: 0.3, // faint sheen of the floor (no mirrored glows on it)
  brickTint: 0xb8a8a0,
  plasterGreen: 0x2f5a46, // far wall
  plasterWarm: 0x8a6a50, // inside the niches
  leafTint: 0x8c9c84, // foliage (multiplies the leaf atlas)
  boothWash: 0.35, // green LED wash down the booth front
  counterTint: 0x4e4a4e, // counter top (satin dark wood under the gear; cool tint tames the red grain)
  counterSheen: 1.0, // its reflection of the club (warm bulbs, green glow)
  counterReflection: 0.1, // mirrored units in the counter top
  counterGlow: 0.3, // mirrored bulbs / lamps of the room in the counter top
  counterReflectionTint: 0x8a8a8a,
  emissiveGain: 1, // bulbs, LED strips, lenses, lamps
  haloGain: 1, // glow around them
  beamGain: 0.2, // light cones under the PAR cans
  neonGain: 1.6, // neon sign on the far wall (no text)
  vignette: 0.38,
  grain: 0.012,
  // gear lights (src/scene/renderer.js): colours only, the intensities stay
  gearLights: { key: 0xfff4e8, rim: 0xd8ffe8, fill: 0xffe2c4 },
};

// Screen focus (src/input/screenFocus.js): clicking a CDJ screen flies the
// camera in front of it; the MENU key at the top right of that screen (or
// Escape) flies back to the exact previous pose. The camera is locked meanwhile.
export const SCREEN_FOCUS = {
  // screen position, size and tilt: SCREEN_SPECS in src/scene/screens.js
  offAxis: (12 * Math.PI) / 180, // camera tilted this much further towards the DJ than the screen normal
  above: 0.016, // m of frame kept above the top edge (row of keys SOURCE ... MENU)
  below: 0.03, // m of frame kept below the bottom edge (top of the jog area)
  margin: 1.08, // extra room around that frame
  fov: 35, // same as the default view: no FOV jump
  duration: 1.1, // s, enter and exit flights
  lift: 0.12, // the flight arcs up by this fraction of its length (never through the set)
};

// Focus on the CRÉDITS screen of the mixer (its Beat FX display, 38 x 30 mm;
// src/input/screenFocus.js): a much closer framing, so the small screen fills
// the view like a big one. The flight is a zoom (distance interpolated on a log
// scale, the look-at point gliding at a constant pace on screen): a 20-30x
// change of distance stays smooth, no arc.
export const MIXER_FOCUS = {
  offAxis: (22 * Math.PI) / 180, // the display lies flat: seen from the DJ side, like a CDJ screen (9.8 + 12 degrees)
  above: 0.0125, // m of frame kept above the top edge (the 3D ÉCHAP key)
  below: 0.002, // m below the bottom edge
  margin: 1.03, // the image then takes ~62 % of the view height, as a CDJ screen in its focus
  fov: 35, // same as the default view: no FOV jump
  duration: 1.3, // s, enter and exit zooms (longer way than a CDJ focus, faster zoom rate)
  flight: 'zoom',
  // phones: portrait = the image fills the width; landscape = screen + key, tight
  portraitMargin: 0.955,
  landscape: { above: 0.0125, below: 0.002, margin: 1.02 },
  // two-finger magnifier (touch): never closer than this fraction of the
  // framing distance (the camera's near plane is 5 cm away), pan extent (m)
  mag: { min: 0.7, top: -0.027, bottomExtra: 0.004, side: 0.004 },
};

// Touch surface of a CDJ screen while it is focused (src/input/screenTouch.js):
// taps and drags are converted to canvas pixels of that screen. Tap / drag
// thresholds are the shared ones of src/input/pointer.js.
export const SCREEN_TOUCH = {
  // Placeholder keys "DÉMO A/B/C" drawn on the focused screen to try the touch
  // surface (src/scene/screenDemo.js). Off: the screens show the real pages
  // (src/screens/). true draws the demo keys above them again.
  demo: false,
  ripple: {
    ms: 300, // duration of the tap halo
    radius: 0.075, // final radius, fraction of the canvas height
    alpha: 0.22, // peak opacity (white)
  },
};

// Mixer VU meters driven by the real audio (src/audio/levels.js).
// Each VU column of the mixer (src/scene/vu.js: ch1..ch4, masterL, masterR) gets
// a source: a deck unit ('cdjLeft' / 'cdjRight', measured after its gain, where
// a future channel fader will act), 'masterL' / 'masterR' (left / right of the
// summed output, after the master gain), or null (always off).
export const VU_MAP = {
  ch1: 'cdjLeft', // left CDJ -> channel 1
  ch2: 'cdjRight', // right CDJ -> channel 2
  ch3: null,
  ch4: null,
  masterL: 'masterL', // sum of both decks, left
  masterR: 'masterR', // sum of both decks, right
  // Scale of the DJM-900NXS2: dB of each segment from the bottom (15 segments:
  // yellow-green, then 4 orange, then red at the top; the master has 2 reds).
  channelDb: [-30, -27, -24, -21, -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12],
  masterDb: [-27, -24, -21, -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15],
  offsetDb: 6, // dB added to the digital level (dBFS) before the scale: 0 dBFS = +6 on the VU
  crestWeight: 5, // the level is max(RMS + 3, peak - crestWeight) dBFS
  fallDbPerSec: 28, // fall of the needle (rises instantly)
};

// --- MOBILE profile ---------------------------------------------------------
// Phones and tablets (DEVICE.mobile, src/utils/device.js; ?mobile=1 / 0 to force).
// Applied here, at load, onto the objects above: every module reads the final
// values. The PC (DEVICE.mobile false) keeps exactly the values above.
export const MOBILE = {
  active: DEVICE.mobile,
  render: {
    maxPixelRatio: 1.25, // a 3x phone screen: 1.25 CSS px per pixel (4x MSAA keeps edges clean)
    introMaxPixelRatio: 1.25,
    tiers: [1, 0.85],
    minPixelRatio: 0.85,
    frameBudgetMs: 16, // a high-end phone keeps 1.25 at 60 / s...
    adaptiveMinFps: 40, // ...a slower one steps down until ~40 / s (30 / s at the floor)
    introMinFps: 30,
    bloom: false, // the bloom is barely visible (0.08) and costs 13 passes
    anisotropy: 4,
    shadowMapSize: 1024,
    textureScale: 0.5, // décor textures at half size (1k -> 512 px): ~4x less GPU memory
  },
  // Low battery (Battery Status API) or prefers-reduced-motion: sharpness capped.
  economyPixelRatio: 1,
  audio: { maxBuffers: 2 },
  zoom: { minCap: 0.8, max: 2.4, maxOverFit: 1.25 },
  focus: {
    // portrait: the image of the screen fills the width of the phone (its thin
    // black border is cropped: 200.8 mm display area, 190.8 mm image); the keys
    // above stay in view
    portraitMargin: 0.965,
    // landscape: screen + row of keys, tight (the jog area below is left out)
    landscape: { above: 0.016, below: 0.004, margin: 1.02 },
  },
};
if (MOBILE.active) {
  Object.assign(RENDER, MOBILE.render);
  // tablets (larger screen, usually a stronger GPU): up to 1.5, the adaptive
  // resolution steps down from there if the frames are slow
  if (!DEVICE.phone) Object.assign(RENDER, { maxPixelRatio: 1.5, introMaxPixelRatio: 1.5, tiers: [1.25, 1, 0.85] });
  Object.assign(AUDIO, MOBILE.audio);
  Object.assign(ZOOM, MOBILE.zoom);
}
export const CAMERA_PROFILE = MOBILE.active ? MOBILE_CAMERA : null;
