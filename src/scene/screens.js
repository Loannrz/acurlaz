// Drawable screens: a plane with a CanvasTexture placed just above each baked
// display (CDJ colour screens; the mixer's Beat FX display, which is the CRÉDITS
// screen). Their content is drawn by the page router (src/screens/router.js). Usage:
//   screens.cdjLeft.draw((ctx, w, h) => { ... });   // custom drawing (content)
//   screens.cdjLeft.setContent({ title, bpm, time, waveform });  // built-in layout
//   screens.cdjLeft.setVideo(videoElement);           // VideoTexture instead
// Touch surface (while focused; events come from src/input/screenTouch.js):
//   screens.cdjLeft.onPointer((e) => {});  // e: { type, unit, x, y, nx, ny, ... }
//   screens.cdjLeft.addHitRegion({ id, x, y, w, h, onTap, onHover });  // canvas px
//   screens.cdjLeft.addLayer(id, (ctx, w, h, now) => {});  // overlay above the content
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SCREEN_TOUCH } from '../config.js';

// Screen geometry in unit-local millimetres, measured on the baked texture
// (orthographic top view, 8 px/mm): x, z = centre of the display area inside
// its bezel, w, h = that area (h along the tilted surface), y = surface height
// at the centre. `tilt` is the rotation about X (radians) of the surface normal
// from +y towards +z: the CDJ screen leans towards the DJ by 9.8 degrees.
// A black backing covers the whole display area (hides the baked picture);
// the image itself is `inset` smaller with rounded corners (`radius`, mm), so
// a thin natural black border remains, as on a real display. `res`: canvas px
// (same aspect as the image). The mixer screen is small but seen from very close
// in its focus (it then fills the view): 1024 px wide, like the CDJ screens.
export const SCREEN_SPECS = {
  cdjLeft: { x: -0.1, z: -138.3, y: 117.8, w: 200.8, h: 117.2, tilt: 0.1717, inset: 0.95, radius: 2.5, res: [1024, 597] },
  cdjRight: { x: -0.1, z: -138.3, y: 117.8, w: 200.8, h: 117.2, tilt: 0.1717, inset: 0.95, radius: 2.5, res: [1024, 597] },
  mixer: { x: 132.9, z: -92.8, y: 92.1, w: 38.3, h: 30.5, tilt: 0, inset: 0.94, radius: 1.2, res: [1024, 816] },
};
const LIFT = 0.0006; // metres above the baked surface (backing)
const IMAGE_LIFT = 0.0003; // image above the backing
const UNIT_NAMES = { cdjLeft: 'cdj_left', cdjRight: 'cdj_right', mixer: 'mixer' };

const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export class Screen {
  constructor(unit, spec, { reducedMotion = false } = {}) {
    this.unit = unit;
    this.spec = spec;
    this.name = UNIT_NAMES[unit.key] ?? unit.key; // 'cdj_left' | 'cdj_right' | 'mixer'
    this.reducedMotion = reducedMotion;
    // Two canvases: `base` holds the content (draw / setContent, `ctx`), and
    // `canvas` (the texture) is composed from it + overlay layers + tap halos.
    this.base = makeCanvas(spec.res[0], spec.res[1]);
    this.ctx = this.base.getContext('2d');
    this.canvas = makeCanvas(spec.res[0], spec.res[1]);
    this.out = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;

    // Unlit: a display emits its own light; keep its colours out of tone mapping.
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false });
    const inset = spec.inset ?? 1;
    const iw = (spec.w * inset) / 1000, ih = (spec.h * inset) / 1000;
    this.imageSize = [iw, ih]; // metres, size of `mesh` (UV 0..1 = the whole canvas)
    this.material.alphaMap = roundedMask(iw, ih, (spec.radius ?? 0) / 1000);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), this.material);
    this.mesh.name = `${unit.key}_screen`;
    const normal = new THREE.Vector3(0, Math.cos(spec.tilt), Math.sin(spec.tilt));
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const centre = new THREE.Vector3(spec.x / 1000, spec.y / 1000, spec.z / 1000);
    // black backing over the whole display area, then the image just above it
    this.backingMaterial = new THREE.MeshBasicMaterial({ color: 0x050506, transparent: true, toneMapped: false });
    this.backing = new THREE.Mesh(new THREE.PlaneGeometry(spec.w / 1000, spec.h / 1000), this.backingMaterial);
    this.backing.name = `${unit.key}_screen_backing`;
    this.backing.quaternion.copy(quat);
    this.backing.position.copy(centre).addScaledVector(normal, LIFT);
    this.mesh.quaternion.copy(quat);
    this.mesh.position.copy(centre).addScaledVector(normal, LIFT + IMAGE_LIFT);
    unit.group.add(this.backing, this.mesh);
    unit.fadeMaterials.push(this.backingMaterial, this.material);
    this.content = null;

    this.layers = new Map(); // id -> fn(ctx, w, h, now), drawn above the content
    this.regions = []; // hit regions, canvas px (last added = on top)
    this.listeners = new Set(); // onPointer handlers
    this.ripples = []; // running tap halos
    this.hover = null; // hovered region
    this.pressed = null; // region under the current press
    this.timer = 0;
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  // Custom drawing of the content: fn(ctx, width, height). The texture is re-uploaded.
  draw(fn) {
    const { ctx, base } = this;
    ctx.save();
    fn(ctx, base.width, base.height);
    ctx.restore();
    this.compose();
    if (this.material.map !== this.texture) { this.material.map = this.texture; this.material.needsUpdate = true; }
  }

  // Redraws the texture: content, then layers, then tap halos.
  compose(now = performance.now()) {
    const { out, canvas } = this;
    const w = canvas.width, h = canvas.height;
    out.clearRect(0, 0, w, h);
    out.drawImage(this.base, 0, 0);
    for (const fn of this.layers.values()) { out.save(); fn(out, w, h, now); out.restore(); }
    this.ripples = this.ripples.filter((r) => now - r.t < r.ms);
    for (const r of this.ripples) drawRipple(out, r, now, h, this.reducedMotion);
    this.texture.needsUpdate = true;
    if (this.ripples.length) this.schedule(now);
  }

  // Next redraw while a halo runs: every frame, or once at its end (reduced motion).
  schedule(now) {
    if (this.timer) return;
    if (this.reducedMotion) {
      const end = Math.max(...this.ripples.map((r) => r.t + r.ms));
      this.timer = setTimeout(() => { this.timer = 0; this.compose(); }, Math.max(0, end - now) + 5);
    } else {
      this.timer = requestAnimationFrame(() => { this.timer = 0; this.compose(); });
    }
  }

  // Overlay layers, drawn above the content (and kept when the content changes).
  addLayer(id, fn) { this.layers.set(id, fn); this.compose(); return () => this.removeLayer(id); }
  removeLayer(id) { if (this.layers.delete(id)) this.compose(); }
  invalidate() { this.compose(); }

  // Soft white halo at a canvas point (tap feedback).
  ripple(x, y) {
    const R = SCREEN_TOUCH.ripple;
    this.ripples.push({ x, y, t: performance.now(), ms: R.ms });
    this.compose();
  }

  // --- touch surface ---
  // Rectangular regions in canvas px: { id, x, y, w, h, onTap(e), onHover(over, e), onPress(e) }.
  // Same id replaces. Returns a remove function.
  addHitRegion(region) {
    const { id, x, y, w, h } = region;
    if (id == null || ![x, y, w, h].every(Number.isFinite)) throw new Error('addHitRegion: id, x, y, w, h required');
    this.removeHitRegion(id);
    const r = { ...region };
    this.regions.push(r);
    return () => this.removeHitRegion(id);
  }
  removeHitRegion(id) {
    const i = this.regions.findIndex((r) => r.id === id);
    if (i < 0) return false;
    const [r] = this.regions.splice(i, 1);
    if (this.hover === r) { this.hover = null; r.onHover?.(false, null); }
    if (this.pressed === r) this.pressed = null;
    return true;
  }
  // slop (canvas px, touch only): when no region contains the point, the
  // nearest one within slop counts (a fingertip on a small key of the screen).
  regionAt(x, y, slop = 0) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    }
    if (!(slop > 0)) return null;
    let best = null, bestD = slop;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best;
  }
  get hitRegions() { return this.regions.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })); }

  // Pointer handlers: fn(e), e = { type: 'pointerdown' | 'pointermove' | 'pointerup' |
  // 'pointercancel' | 'tap' | 'scroll' (wheel / keys: scrollY canvas px, + = content moves up;
  // lines +-1 and page +-1 for the keys; source 'wheel' | 'key'), unit, x, y (canvas px), nx, ny (0..1), inside (on the
  // image), dragging, dx, dy (canvas px since the previous move), pointerType, region }.
  onPointer(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // Called by the touch controller (src/input/screenTouch.js) with canvas
  // coordinates. Types 'hover' / 'leave' only update the hovered region and
  // return whether one is hovered; the others are dispatched and returned.
  handlePointer(p) {
    const region = p.inside ? this.regionAt(p.x, p.y, p.slop ?? 0) : null;
    if (p.type === 'hover' || p.type === 'leave') {
      this.setHover(p.type === 'hover' ? region : null, p);
      return this.hover != null;
    }
    const e = {
      type: p.type, unit: this.name, x: p.x, y: p.y, nx: p.x / this.width, ny: p.y / this.height,
      inside: !!p.inside, dragging: !!p.dragging, dx: p.dx ?? 0, dy: p.dy ?? 0,
      pointerType: p.pointerType ?? 'mouse', region: region?.id ?? null,
    };
    if (p.type === 'scroll') { e.scrollY = p.scrollY ?? 0; e.lines = p.lines ?? 0; e.page = p.page ?? 0; e.source = p.source ?? 'wheel'; }
    if (p.type === 'pointerdown') {
      this.pressed = region;
      region?.onPress?.(e);
    } else if (p.type === 'tap') {
      // a region's tap needs the same region at press and release
      const hit = region && region === this.pressed ? region : null;
      e.region = hit?.id ?? null;
      this.pressed = null;
      this.ripple(p.x, p.y);
      hit?.onTap?.(e);
    } else if (p.type === 'pointercancel') {
      this.pressed = null;
    }
    for (const fn of this.listeners) fn(e);
    return e;
  }
  setHover(region, p = null) {
    if (region === this.hover) return;
    const prev = this.hover;
    this.hover = region;
    prev?.onHover?.(false, p);
    region?.onHover?.(true, p);
  }

  // Built-in sober layout. Any field may be omitted.
  setContent(content) {
    this.content = { ...(this.content || {}), ...content };
    const c = this.content;
    this.draw((ctx, w, h) => {
      ctx.fillStyle = '#07080a';
      ctx.fillRect(0, 0, w, h);
      const pad = w * 0.035;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, h * 0.165, w, 1);
      ctx.fillStyle = '#e6e6e6';
      ctx.font = `500 ${Math.round(h * 0.085)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(c.title ?? '', pad, h * 0.085);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9a9a9a';
      ctx.font = `400 ${Math.round(h * 0.075)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(c.right ?? '', w - pad, h * 0.085);
      ctx.textAlign = 'left';
      if (c.waveform) drawWaveform(ctx, c.waveform, pad, h * 0.26, w - 2 * pad, h * 0.42, c.position ?? 0.37);
      if (c.footer) {
        ctx.fillStyle = '#9a9a9a';
        ctx.font = `400 ${Math.round(h * 0.075)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillText(c.footer, pad, h * 0.86);
      }
    });
  }

  // Swap the canvas for a <video>. Call setContent/draw to go back.
  setVideo(video) {
    const vt = new THREE.VideoTexture(video);
    vt.colorSpace = THREE.SRGBColorSpace;
    this.material.map = vt;
    this.material.needsUpdate = true;
  }
}

// Tap halo: a very soft white disc that widens and fades (static with reduced motion).
function drawRipple(ctx, r, now, h, reduced) {
  const R = SCREEN_TOUCH.ripple;
  let radius, alpha;
  if (reduced) {
    radius = h * R.radius * 0.8;
    alpha = R.alpha * 0.7;
  } else {
    const k = Math.min(1, Math.max(0, (now - r.t) / r.ms));
    radius = h * R.radius * (0.3 + 0.7 * (1 - (1 - k) ** 3));
    alpha = R.alpha * (1 - k) ** 1.5;
  }
  if (alpha <= 0.002) return;
  const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
  g.addColorStop(0, `rgba(255,255,255,${alpha * 0.55})`);
  g.addColorStop(0.75, `rgba(255,255,255,${alpha * 0.25})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.6})`;
  ctx.lineWidth = Math.max(1, h * 0.003);
  ctx.beginPath(); ctx.arc(r.x, r.y, radius * 0.92, 0, Math.PI * 2); ctx.stroke();
}

function drawWaveform(ctx, samples, x, y, w, h, playhead) {
  const n = samples.length;
  const mid = y + h / 2;
  for (let i = 0; i < n; i++) {
    const a = samples[i] * (h / 2);
    const px = x + (i / n) * w;
    ctx.fillStyle = i / n < playhead ? '#bfc3c8' : '#4a4e55';
    ctx.fillRect(px, mid - a, Math.max(1, w / n - 1), a * 2);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + playhead * w - 1, y - 6, 2, h + 12);
}

// Deterministic placeholder waveform (no music is playing).
export function placeholderWaveform(n = 240, seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const env = 0.35 + 0.45 * Math.abs(Math.sin(i / 23)) * (0.6 + 0.4 * Math.sin(i / 7.3));
    out[i] = Math.min(1, env * (0.55 + 0.45 * rnd()));
  }
  return out;
}

// Alpha mask: rounded rectangle with a soft 1 px edge (aspect of the plane).
function roundedMask(w, h, r) {
  const W = 512, H = Math.max(8, Math.round((512 * h) / w));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.filter = 'blur(0.6px)';
  g.beginPath(); g.roundRect(1, 1, W - 2, H - 2, (r / w) * W); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Row of keys above each CDJ screen (SOURCE ... MENU, left to right). A key
// with a `text` gets a real 3D keycap laid over its baked picture: a raised,
// rounded, tapered cap in satin black plastic, seated on the panel (same tilt,
// read from the model), with a soft contact shadow. Its text is not painted on
// top: the letters are a translucent window sunk into the cap face, lit from
// below like the backlit keys of the hardware:
//   - relief: a normal map built from the letter shapes (0.22 mm deep, bevelled
//     walls) so the light of the room catches the edges of the letters;
//   - the window: frosted, non-metallic plastic (lighter albedo, metalness 0);
//   - the backlight: a dim warm emission inside the letters only, fading at the
//     walls, plus a very faint scatter around them (light diffusing through the
//     plastic). Static, well under the bloom threshold: no glow, no neon.
//   x, z: centre of the key (unit-local mm, measured on the texture: the cap
//   covers the baked key and its highlights; pitch ~36.3 mm); w: width; h:
//   depth along the tilted panel. zone: its click zone (cdj_*_<zone>, ids
//   unchanged); text: printed in capitals, and passed as `label` to onButton
//   (screens.topLabelFor(zoneId)). All the texts of a row share one size, fitted
//   to the longest. Change a text later:
//   screens.setTopLabel('cdj_left', 2, 'Dates'); null removes the cap (baked key
//   again). The caps are not raycast: clicks go through to the zones on the model.
export const TOP_ROW_LABELS = {
  keys: [
    { x: -91.1, z: -208.0, w: 30.4, h: 10.2, zone: 'source', text: 'Sources' }, // baked SOURCE
    { x: -54.8, z: -208.0, w: 30.4, h: 10.2, zone: 'browse_btn', text: 'Link' }, // baked BROWSE (was "Playlist")
    { x: -18.45, z: -208.0, w: 30.4, h: 10.2, zone: 'tag_list', text: 'Dates' }, // baked TAG LIST
    { x: 17.9, z: -208.0, w: 30.4, h: 10.2, zone: 'playlist', text: 'Feat' }, // baked PLAY LIST
    { x: 54.1, z: -208.0, w: 30.4, h: 10.2, zone: 'search', text: 'À propos' }, // baked SEARCH
    { x: 90.7, z: -208.0, w: 30.4, h: 10.2, zone: 'menu', text: 'Échap' }, // baked MENU: leaves the screen focus
  ],
  cap: {
    height: 2.1, // mm above the panel
    radius: 0.85, // mm, rounded edges
    taper: 0.45, // mm, the top face is this much smaller on each side (sloped sides)
    sink: 0.25, // mm below the panel surface (seats the rounded bottom edge)
    // Same finish as the baked keys around it: the model's metalness (null =
    // read from the unit material, ~0.74) and a satin roughness.
    metalness: null,
    roughness: 0.6,
    clearcoat: 0.08,
    clearcoatRoughness: 0.45,
    shadow: 0.45, // contact shadow opacity
  },
  font: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  weight: 600,
  capHeight: 2.1, // mm, height of the capitals
  letterSpacing: 0.06, // em
  pxPerMm: 22, // texels per mm of the cap face (sharp in screen focus)
  // the letter window
  depth: 0.22, // mm, how deep the letters are sunk
  bevel: 0.12, // mm, width of their sloped walls
  window: [64, 62, 59], // sRGB albedo of the frosted window (lit plastic seen through)
  light: [255, 238, 214], // sRGB colour of the backlight (warm white LED behind a diffuser)
  glow: 0.3, // emissive intensity of the letters (rendered ~ light grey, far below bloom)
  scatter: 0.05, // faint light around the letters, fraction of `glow`
  scatterRadius: 0.35, // mm
};

// The mixer's CRÉDITS screen has one key of the same kind above it, "ÉCHAP",
// laid where the section title "BEAT FX" was printed (painted out of the
// texture by src/scene/mixerLabel.js), on the band of the display bezel. Same
// cap, letters and light as the CDJ keys (TOP_ROW_LABELS), smaller to fit the band.
export const MIXER_TOP_KEYS = {
  keys: [{ x: 132.8, z: -117.3, w: 22, h: 5.8, zone: 'menu', text: 'Échap' }],
  capHeight: 1.75, // mm (CDJ: 2.1)
};

function createTopKeys(units) {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const keys = {}; // 'cdj_left:5' -> { group, maps, def, ... }
  // rows of keys per unit name: the CDJ rows above their screens, the mixer's ÉCHAP key
  const rows = {
    cdj_left: { unit: units.cdjLeft, defs: TOP_ROW_LABELS.keys, capHeight: TOP_ROW_LABELS.capHeight },
    cdj_right: { unit: units.cdjRight, defs: TOP_ROW_LABELS.keys, capHeight: TOP_ROW_LABELS.capHeight },
    mixer: { unit: units.mixer, defs: MIXER_TOP_KEYS.keys, capHeight: MIXER_TOP_KEYS.capHeight },
  };
  const unitOf = Object.fromEntries(Object.entries(rows).map(([n, r]) => [n, r.unit]));
  const pixels = new Map(); // unit -> { data, W, H } of its baked texture
  const C = TOP_ROW_LABELS.cap;
  const L = TOP_ROW_LABELS;
  const hitAt = (unit, x, z) => {
    unit.group.updateMatrixWorld(true);
    ray.set(unit.group.localToWorld(new THREE.Vector3(x / 1000, 1, z / 1000)), down);
    return ray.intersectObject(unit.mesh, false)[0];
  };
  const texel = (unit, x, z) => {
    let px = pixels.get(unit);
    if (px === undefined) {
      const img = unit.material.map?.image;
      px = null;
      if (img?.width) {
        const c = makeCanvas(img.width, img.height);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        px = { data: g.getImageData(0, 0, img.width, img.height).data, W: img.width, H: img.height, flipY: unit.material.map.flipY };
      }
      pixels.set(unit, px);
    }
    const h = px && hitAt(unit, x, z);
    if (!h?.uv) return null;
    const u = Math.min(px.W - 1, Math.floor(h.uv.x * px.W));
    const v = Math.min(px.H - 1, Math.floor((px.flipY ? 1 - h.uv.y : h.uv.y) * px.H));
    const k = (v * px.W + u) * 4;
    return [px.data[k], px.data[k + 1], px.data[k + 2]];
  };
  // Colour of the keys of a unit: median of texels on the faces of the whole
  // row, away from the prints. One colour for the row: the keys are the same
  // plastic, and the baked light gradient on the left key (silver area) must
  // not turn its cap grey.
  const rowColour = new Map();
  const keyColour = (unit, defs) => {
    if (rowColour.has(unit)) return rowColour.get(unit);
    const s = [];
    for (const def of defs) {
      for (const dx of [-(def.w / 2 - 2.5), -(def.w / 2 - 4.5), def.w / 2 - 4.5, def.w / 2 - 2.5]) {
        for (const dz of [-0.6, 0, 0.6]) { const t = texel(unit, def.x + dx, def.z + dz); if (t) s.push(t); }
      }
    }
    const med = (i) => s.map((t) => t[i]).sort((a, b) => a - b)[s.length >> 1];
    const c = s.length ? new THREE.Color().setRGB(med(0) / 255, med(1) / 255, med(2) / 255, THREE.SRGBColorSpace) : new THREE.Color(0x18181a);
    rowColour.set(unit, c);
    return c;
  };

  const canvasTexture = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };

  const make = (name, index) => {
    const unit = unitOf[name], def = rows[name]?.defs[index];
    const hit = unit && def && hitAt(unit, def.x, def.z);
    if (!hit) return null;
    const mm = 0.001;
    const group = new THREE.Group();
    group.name = `${name}_top_key_${index}`;
    // seated on the panel, local y = panel normal (unit-local: units are not rotated)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.face.normal.clone().normalize());
    group.position.copy(unit.group.worldToLocal(hit.point.clone()));

    const colour = keyColour(unit, rows[name].defs);
    const metal = C.metalness ?? unit.material.metalness ?? 0;
    // keycap body
    const capMat = new THREE.MeshPhysicalMaterial({
      color: colour.clone(), roughness: C.roughness, metalness: metal,
      clearcoat: C.clearcoat, clearcoatRoughness: C.clearcoatRoughness, transparent: true,
    });
    const cap = new THREE.Mesh(capGeometry(def.w * mm, C.height * mm + C.sink * mm, def.h * mm, C.radius * mm, C.taper * mm), capMat);
    cap.name = `${group.name}_cap`;
    cap.position.y = -C.sink * mm;
    cap.castShadow = false; cap.receiveShadow = true;

    // cap face (flat part, inside the rounded edges): same plastic, with the
    // letter window (albedo, emission, relief, metal / roughness maps)
    const fw = def.w - 2 * (C.taper + C.radius), fh = def.h - 2 * (C.taper + C.radius);
    const W = Math.round(fw * L.pxPerMm), H = Math.round(fh * L.pxPerMm);
    const maps = {
      albedo: canvasTexture(makeCanvas(W, H), true),
      glow: canvasTexture(makeCanvas(W, H), true),
      normal: canvasTexture(makeCanvas(W, H), false),
      orm: canvasTexture(makeCanvas(W, H), false), // G = roughness, B = metalness (factors)
    };
    const faceMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: maps.albedo,
      roughness: C.roughness, roughnessMap: maps.orm, metalness: metal, metalnessMap: maps.orm,
      normalMap: maps.normal, normalScale: new THREE.Vector2(1, 1),
      emissive: 0xffffff, emissiveMap: maps.glow, emissiveIntensity: L.glow,
      clearcoat: C.clearcoat, clearcoatRoughness: C.clearcoatRoughness, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(fw * mm, fh * mm), faceMat);
    face.name = `${group.name}_face`;
    face.rotation.x = -Math.PI / 2; // facing up, top of the text away from the DJ
    face.position.y = (C.height + 0.004) * mm;
    face.receiveShadow = true;

    // soft contact shadow on the panel around the base
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, alphaMap: softRect(def.w, def.h, 1.1), transparent: true, opacity: C.shadow,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry((def.w + 2.4) * mm, (def.h + 2.4) * mm), shadowMat);
    shadow.name = `${group.name}_shadow`;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04 * mm;

    group.add(shadow, cap, face);
    // Visual only: never in the way of a raycast (click zones, tools).
    group.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
    unit.group.add(group);
    // Intro fade: the cap and its face fade and turn opaque with the unit; the
    // shadow only fades (it must stay transparent).
    unit.fadeMaterials.push(capMat, faceMat, fader([[shadowMat, C.shadow]]));
    const k = { group, maps, W, H, colour, def, unit: name, index, capHeight: rows[name].capHeight };
    keys[`${name}:${index}`] = k;
    return k;
  };

  const fontAt = (g, size) => { g.font = `${L.weight} ${size}px ${L.font}`; g.letterSpacing = `${L.letterSpacing * size}px`; };
  const measure = makeCanvas(8, 8).getContext('2d');
  // Largest font size (px) at which `text` fits 86 % of the face width, capped by capHeight.
  const fitSize = (k, text) => {
    let size = (k.capHeight / 0.72) * L.pxPerMm;
    fontAt(measure, size);
    while (measure.measureText(text).width > k.W * 0.86 && size > 8) { size *= 0.97; fontAt(measure, size); }
    return size;
  };
  // All the maps of a key face for its text at `size` px.
  const draw = (k, size) => {
    const { W, H } = k;
    // 1. letter coverage (0..1)
    const mc = makeCanvas(W, H), g = mc.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    fontAt(g, size);
    const capH = g.measureText('H').actualBoundingBoxAscent || size * 0.72;
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(k.print, W / 2 + (L.letterSpacing * size) / 2, H / 2 + capH / 2);
    const src = g.getImageData(0, 0, W, H).data;
    const n = W * H;
    const M = new Float32Array(n);
    for (let i = 0; i < n; i++) M[i] = src[i * 4] / 255;
    // 2. relief: height = -depth inside the letters, walls `bevel` wide
    const bevelPx = Math.max(1, (L.bevel * L.pxPerMm) / 2);
    const Hm = boxBlur(M, W, H, bevelPx, 2); // smoothed coverage
    const slope = L.depth * L.pxPerMm; // d(height mm)/d(px) for a full coverage step per px
    // 3. backlight: brightest in the middle of the strokes, dim at the walls;
    //    faint scatter around the letters
    const inner = boxBlur(M, W, H, Math.max(1, bevelPx * 0.8), 2);
    const halo = boxBlur(M, W, H, Math.max(1, (L.scatterRadius * L.pxPerMm) / 2), 3);
    const base = [k.colour.r, k.colour.g, k.colour.b].map((v) => THREE.MathUtils.clamp(Math.round(linToSrgb(v) * 255), 0, 255));
    const ctxOf = (t) => t.image.getContext('2d');
    const imgs = { albedo: ctxOf(k.maps.albedo).createImageData(W, H), glow: ctxOf(k.maps.glow).createImageData(W, H), normal: ctxOf(k.maps.normal).createImageData(W, H), orm: ctxOf(k.maps.orm).createImageData(W, H) };
    const A = imgs.albedo.data, G = imgs.glow.data, N = imgs.normal.data, O = imgs.orm.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const m = M[i];
        for (let c = 0; c < 3; c++) A[o + c] = Math.round(base[c] * (1 - m) + L.window[c] * m);
        // light: inside the strokes (m * inner keeps the walls dimmer) + scatter
        const e = Math.min(1, m * (0.35 + 0.65 * inner[i]) + L.scatter * halo[i] * (1 - m));
        for (let c = 0; c < 3; c++) G[o + c] = Math.round(L.light[c] * e);
        // normal (tangent space, OpenGL: +y = up on the texture = -y on the canvas):
        // h = -depth * Hm  ->  n = (-dh/dx, +dh/dyCanvas, 1)
        const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
        const dx = (Hm[y * W + xr] - Hm[y * W + xl]) / (xr - xl || 1);
        const dy = (Hm[yd * W + x] - Hm[yu * W + x]) / (yd - yu || 1);
        let nx = dx * slope, ny = -dy * slope, nz = 1;
        const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
        N[o] = Math.round((nx * 0.5 + 0.5) * 255); N[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); N[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        // roughness factor 1 (x C.roughness) everywhere; metalness factor 1 on the cap, 0 in the window
        O[o] = 255; O[o + 1] = 255; O[o + 2] = Math.round(255 * (1 - m));
        A[o + 3] = G[o + 3] = N[o + 3] = O[o + 3] = 255;
      }
    }
    for (const key of Object.keys(imgs)) { ctxOf(k.maps[key]).putImageData(imgs[key], 0, 0); k.maps[key].needsUpdate = true; }
  };
  // One size for the whole row of a unit (the longest text sets it): even look.
  const printRow = (name) => {
    const row = Object.values(keys).filter((k) => k.unit === name);
    if (!row.length) return null;
    const size = Math.min(...row.map((k) => fitSize(k, k.print)));
    for (const k of row) if (k.drawn !== `${k.print}@${size}`) { draw(k, size); k.drawn = `${k.print}@${size}`; }
    return size;
  };
  const setText = (k, text) => { k.text = text; k.print = text.toLocaleUpperCase('fr-FR'); };
  const remove = (key) => {
    const k = keys[key];
    if (!k) return;
    k.group.removeFromParent();
    k.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.alphaMap?.dispose(); o.material.dispose(); } });
    for (const t of Object.values(k.maps)) t.dispose();
    delete keys[key];
  };

  const sizes = {};
  for (const name of Object.keys(rows)) {
    if (!rows[name].unit) continue;
    rows[name].defs.forEach((def, i) => { if (def.text) { const k = make(name, i); if (k) setText(k, def.text); } });
    sizes[name] = printRow(name);
  }
  const setTopLabel = (name, index, text) => {
    const key = `${name}:${index}`;
    if (!text) remove(key);
    else { const k = keys[key] ?? make(name, index); if (k) setText(k, text); }
    if (unitOf[name]) sizes[name] = printRow(name);
  };
  // Printed text of the key of a click zone ('cdj_left_source' -> 'Sources',
  // 'mixer_menu' -> 'Échap'), or null.
  const topLabelFor = (zoneId) => {
    const m = /^(cdj_left|cdj_right|mixer)_(.+)$/.exec(zoneId ?? '');
    const i = m ? rows[m[1]].defs.findIndex((d) => d.zone === m[2]) : -1;
    return i < 0 ? null : keys[`${m[1]}:${i}`]?.text ?? null;
  };
  // capital height actually printed (mm), per unit (dev / checks)
  const printedCapHeight = (name) => (sizes[name] ? (sizes[name] * 0.72) / L.pxPerMm : null);
  return { setTopLabel, topLabelFor, printedCapHeight, keys };
}

const linToSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

// Separable box blur of a W x H field, radius r px (fractional radius rounded), `passes` times (~ gaussian).
function boxBlur(src, W, H, r, passes = 2) {
  const R = Math.max(1, Math.round(r));
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  const norm = 1 / (2 * R + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) { // horizontal
      const row = y * W;
      let acc = 0;
      for (let k = -R; k <= R; k++) acc += a[row + Math.min(W - 1, Math.max(0, k))];
      for (let x = 0; x < W; x++) {
        b[row + x] = acc * norm;
        acc += a[row + Math.min(W - 1, x + R + 1)] - a[row + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < W; x++) { // vertical
      let acc = 0;
      for (let k = -R; k <= R; k++) acc += b[Math.min(H - 1, Math.max(0, k)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc * norm;
        acc += b[Math.min(H - 1, y + R + 1) * W + x] - b[Math.max(0, y - R) * W + x];
      }
    }
  }
  return a;
}

// Rounded box with slightly sloped sides (the top is `taper` smaller on each
// side), base at y = 0. Sizes in metres; the original smooth normals are kept.
function capGeometry(w, height, d, r, taper) {
  const g = new RoundedBoxGeometry(w, height, d, 4, r);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height + 0.5; // 0 at the base, 1 on top
    pos.setX(i, pos.getX(i) * (1 - (2 * taper * t) / w));
    pos.setZ(i, pos.getZ(i) * (1 - (2 * taper * t) / d));
  }
  g.translate(0, height / 2, 0);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Alpha map of a soft rounded rectangle: a key of w x h mm on a plane of
// (w + 2.4) x (h + 2.4) mm, blurred by `blur` mm.
function softRect(w, h, blur) {
  const ppm = 12, pad = 1.2;
  const c = makeCanvas(Math.round((w + 2 * pad) * ppm), Math.round((h + 2 * pad) * ppm));
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.filter = `blur(${blur * ppm * 0.5}px)`;
  g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(pad * ppm * 0.6, pad * ppm * 0.6, c.width - pad * ppm * 1.2, c.height - pad * ppm * 1.2, 1.2 * ppm); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Stand-in for unit.fadeMaterials: scales the opacity of materials that must
// stay transparent, and ignores the switch to the opaque path.
function fader(list) {
  return {
    transparent: true,
    needsUpdate: false,
    set opacity(v) { for (const [m, base] of list) m.opacity = v * base; },
    get opacity() { return list[0][0].opacity / list[0][1]; },
  };
}

export function createScreens(units, { reducedMotion = false } = {}) {
  const screens = {};
  for (const [key, spec] of Object.entries(SCREEN_SPECS)) {
    if (!units[key]) continue;
    screens[key] = new Screen(units[key], spec, { reducedMotion });
  }
  // screens.setTopLabel('cdj_left' | 'cdj_right' | 'mixer', keyIndex, text), screens.topLabelFor(zoneId)
  // and screens.topKeys (debug): not enumerable, so iterating over the screens is unaffected.
  const top = createTopKeys(units);
  Object.defineProperty(screens, 'setTopLabel', { value: top.setTopLabel, enumerable: false });
  Object.defineProperty(screens, 'topLabelFor', { value: top.topLabelFor, enumerable: false });
  Object.defineProperty(screens, 'printedCapHeight', { value: top.printedCapHeight, enumerable: false });
  Object.defineProperty(screens, 'topKeys', { value: top.keys, enumerable: false });
  // Black until the page router draws them (src/screens/router.js, created right
  // after in main.js). setContent / placeholderWaveform stay available for experiments.
  for (const s of Object.values(screens)) s.draw((ctx, w, h) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); });
  return screens;
}
