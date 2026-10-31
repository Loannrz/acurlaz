// Décor textures: a few CC0 photo-scanned maps (Poly Haven, see CREDITS.md,
// all 1k or less, in public/textures/club/) and procedural canvas textures
// (cement tiles of the booth front, leaf atlas, neon sign). load() resolves
// once every image is decoded, so the shader warm-up of src/main.js uploads
// them before the first frame (no texture upload in the middle of the intro).
import * as THREE from 'three';
import { RENDER } from '../../config.js';
import { fetchProgress } from '../../ui/loader.js';

const BASE = `${import.meta.env.BASE_URL}textures/club/`;
export const FILES = {
  brick: 'brick_diff.jpg',
  brickNormal: 'brick_nor.jpg',
  plaster: 'plaster_diff.jpg',
  wood: 'wood_diff.jpg',
  planks: 'planks_diff.jpg',
  tiles: 'tiles_diff.jpg',
  tilesNormal: 'tiles_nor.jpg',
  tilesRough: 'tiles_rough.jpg',
};
const COLOR = new Set(['brick', 'plaster', 'wood', 'planks', 'tiles']);

const setup = (t, color) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = RENDER.anisotropy ?? 8;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
};

// onProgress(fraction 0..1): bytes received over all files (loading screen).
// Images are decoded off the main thread (createImageBitmap, flipped like a
// regular upload) so neither the decode nor the upload stalls a frame.
export function loadTextures({ onProgress } = {}) {
  const out = {};
  const entries = Object.entries(FILES);
  const got = new Map(), size = new Map();
  const report = () => {
    if (!onProgress) return;
    let a = 0, b = 0, known = true;
    for (const [k] of entries) { const t = size.get(k); if (!t) known = false; a += got.get(k) ?? 0; b += t ?? 0; }
    onProgress(known && b ? a / b : [...got.keys()].filter((k) => got.get(k) && got.get(k) === size.get(k)).length / entries.length);
  };
  const jobs = entries.map(([k, file]) => fetchProgress(BASE + file, (l, t) => { got.set(k, l); if (t) size.set(k, t); report(); })
    .then((blob) => { got.set(k, blob.size); size.set(k, blob.size); report(); return decodeImage(blob); })
    .then(({ image, flipped }) => {
      const t = new THREE.Texture(image);
      t.flipY = !flipped;
      t.needsUpdate = true;
      out[k] = setup(t, COLOR.has(k));
    }));
  return Promise.all(jobs).then(() => out);
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const opts = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
      const full = await createImageBitmap(blob, { imageOrientation: 'flipY', ...opts });
      return { image: await downscale(full, opts), flipped: true };
    } catch { /* options not supported: decoded image element below */ }
  }
  const img = new Image();
  const url = URL.createObjectURL(blob);
  try {
    img.src = url;
    await img.decode();
  } finally { URL.revokeObjectURL(url); }
  return { image: img, flipped: false };
}

// MOBILE profile (RENDER.textureScale < 1): a smaller copy, off the main thread
// (the full-size bitmap is released). Kept as is if resizing is not supported.
async function downscale(bitmap, opts) {
  const k = RENDER.textureScale ?? 1;
  if (k >= 1) return bitmap;
  try {
    const small = await createImageBitmap(bitmap, { ...opts, resizeWidth: Math.max(64, Math.round(bitmap.width * k)), resizeHeight: Math.max(64, Math.round(bitmap.height * k)), resizeQuality: 'high' });
    bitmap.close?.();
    return small;
  } catch { return bitmap; }
}

// Placeholder 1x1 texture (used until load() resolves; never visible: the
// warm-up waits for the real ones).
export function blank(color = 0x808080) {
  const c = new THREE.Color(color);
  const t = new THREE.DataTexture(new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255]), 1, 1);
  t.needsUpdate = true;
  return setup(t, true);
}

// --- procedural ---------------------------------------------------------

// Cement tiles ("carreaux de ciment") for the booth front: 2 x 2 tiles of a
// four-petal motif, cream / bottle green / terracotta, slightly worn.
export function cementTiles(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const t = size / 2;
  const cream = '#d9cdb4', green = '#1f4a3a', terra = '#9a4a2c', dark = '#16302a';
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      g.save();
      g.translate(i * t, j * t);
      g.fillStyle = cream; g.fillRect(0, 0, t, t);
      // corner quarter circles (form circles across tiles)
      g.fillStyle = green;
      for (const [x, y] of [[0, 0], [t, 0], [0, t], [t, t]]) { g.beginPath(); g.arc(x, y, t * 0.3, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = cream;
      for (const [x, y] of [[0, 0], [t, 0], [0, t], [t, t]]) { g.beginPath(); g.arc(x, y, t * 0.17, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = terra;
      for (const [x, y] of [[0, 0], [t, 0], [0, t], [t, t]]) { g.beginPath(); g.arc(x, y, t * 0.09, 0, Math.PI * 2); g.fill(); }
      // four petals around the centre
      g.translate(t / 2, t / 2);
      for (let k = 0; k < 4; k++) {
        g.rotate(Math.PI / 2);
        g.fillStyle = green;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(t * 0.2, -t * 0.12, 0, -t * 0.4);
        g.quadraticCurveTo(-t * 0.2, -t * 0.12, 0, 0);
        g.fill();
      }
      g.rotate(Math.PI / 4);
      for (let k = 0; k < 4; k++) {
        g.rotate(Math.PI / 2);
        g.fillStyle = terra;
        g.beginPath();
        g.ellipse(0, -t * 0.2, t * 0.035, t * 0.07, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = dark;
      g.beginPath(); g.arc(0, 0, t * 0.05, 0, Math.PI * 2); g.fill();
      g.restore();
      // grout
      g.strokeStyle = 'rgba(40,30,20,0.55)';
      g.lineWidth = 3;
      g.strokeRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
    }
  }
  // wear: faint mottling
  const img = g.getImageData(0, 0, size, size);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let p = 0; p < img.data.length; p += 4) {
    const n = 0.9 + rnd() * 0.12;
    img.data[p] *= n; img.data[p + 1] *= n; img.data[p + 2] *= n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  return setup(tex, true);
}

// Leaf atlas, 2 x 2 cells (cell index: x + 2 y, v up):
//   0 monstera (split leaf with holes), 1 palm frond (pinnate, long),
//   2 heart leaf (pothos / philodendron, for the vines), 3 banana / strelitzia
// Each cell: the leaf base (petiole attachment) at the bottom centre, tip at the top.
export function leafAtlas(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // canvas y grows downwards; cell (cx, cy) with v up -> canvas row 1 - cy
  const cell = (cx, cy, draw) => {
    g.save();
    g.translate(cx * h, (1 - cy) * h);
    g.beginPath(); g.rect(0, 0, h, h); g.clip();
    draw(h);
    g.restore();
  };
  const leafFill = (x0, y0, x1, y1, a, b) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    return gr;
  };

  // 0: monstera
  cell(0, 0, (s) => {
    const cx = s / 2, base = s * 0.97, top = s * 0.05, w = s * 0.46;
    g.fillStyle = leafFill(0, base, 0, top, '#2f6a2c', '#4f9a3c');
    g.beginPath();
    g.moveTo(cx, base - s * 0.08);
    g.bezierCurveTo(cx - w * 1.1, base - s * 0.02, cx - w * 1.05, top + s * 0.1, cx, top);
    g.bezierCurveTo(cx + w * 1.05, top + s * 0.1, cx + w * 1.1, base - s * 0.02, cx, base - s * 0.08);
    g.fill();
    // splits from the edge towards the midrib, and holes (cut out)
    g.globalCompositeOperation = 'destination-out';
    const splits = 7;
    for (const side of [-1, 1]) {
      for (let k = 0; k < splits; k++) {
        const t = 0.14 + (k / (splits - 1)) * 0.74;
        const y = base - s * 0.08 - t * (base - s * 0.08 - top);
        const reach = w * (0.95 - Math.abs(t - 0.5) * 0.6);
        g.lineWidth = s * (0.018 + rnd() * 0.01);
        g.beginPath();
        g.moveTo(cx + side * reach * 0.36, y + s * 0.02);
        g.quadraticCurveTo(cx + side * reach * 0.8, y - s * 0.01, cx + side * reach * 1.25, y - s * 0.07);
        g.stroke();
        if (k > 0 && k < splits - 1 && rnd() > 0.3) {
          g.beginPath();
          g.ellipse(cx + side * reach * 0.22, y - s * 0.035, s * 0.016, s * 0.03, side * 0.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    // midrib and veins
    g.strokeStyle = 'rgba(190,230,150,0.55)';
    g.lineWidth = s * 0.012;
    g.beginPath(); g.moveTo(cx, base); g.quadraticCurveTo(cx + s * 0.01, s * 0.5, cx, top + s * 0.03); g.stroke();
    g.lineWidth = s * 0.004;
    g.strokeStyle = 'rgba(170,220,140,0.35)';
    for (const side of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const y = base - s * 0.12 - k * s * 0.1;
        g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + side * w * 0.5, y - s * 0.02, cx + side * w * 0.95, y - s * 0.09); g.stroke();
      }
    }
  });

  // 1: palm frond (pinnate): rachis + many narrow leaflets
  cell(1, 0, (s) => {
    const cx = s / 2;
    g.strokeStyle = '#5c7a35';
    g.lineWidth = s * 0.012;
    g.beginPath(); g.moveTo(cx, s); g.lineTo(cx, s * 0.02); g.stroke();
    const n = 26;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const y = s * (0.96 - t * 0.92);
      const len = s * 0.47 * Math.sin(Math.PI * (0.12 + t * 0.8)) * (0.85 + rnd() * 0.15);
      for (const side of [-1, 1]) {
        const ang = side * (0.95 - t * 0.35);
        const ex = cx + Math.sin(ang) * len, ey = y - Math.cos(ang) * len * 0.55;
        g.fillStyle = leafFill(cx, y, ex, ey, '#2c5e26', k % 3 ? '#4d8f38' : '#5a9a40');
        g.beginPath();
        g.moveTo(cx, y);
        const mx = (cx + ex) / 2, my = (y + ey) / 2;
        const wv = s * 0.012;
        g.quadraticCurveTo(mx - wv * Math.cos(ang), my - wv, ex, ey);
        g.quadraticCurveTo(mx + wv * Math.cos(ang), my + wv * 2, cx, y + s * 0.012);
        g.fill();
      }
    }
  });

  // 2: heart leaf
  cell(0, 1, (s) => {
    const cx = s / 2;
    g.fillStyle = leafFill(0, s, s, 0, '#2a6a2a', '#5aa23e');
    g.beginPath();
    g.moveTo(cx, s * 0.8);
    g.bezierCurveTo(cx - s * 0.1, s * 0.98, cx - s * 0.48, s * 0.8, cx - s * 0.36, s * 0.45);
    g.bezierCurveTo(cx - s * 0.26, s * 0.2, cx - s * 0.05, s * 0.12, cx, s * 0.04);
    g.bezierCurveTo(cx + s * 0.05, s * 0.12, cx + s * 0.26, s * 0.2, cx + s * 0.36, s * 0.45);
    g.bezierCurveTo(cx + s * 0.48, s * 0.8, cx + s * 0.1, s * 0.98, cx, s * 0.8);
    g.fill();
    g.strokeStyle = 'rgba(200,235,160,0.45)';
    g.lineWidth = s * 0.012;
    g.beginPath(); g.moveTo(cx, s * 0.98); g.lineTo(cx, s * 0.8); g.quadraticCurveTo(cx + s * 0.02, s * 0.4, cx, s * 0.07); g.stroke();
    // petiole down to the base
    g.strokeStyle = '#3f6b2a';
    g.lineWidth = s * 0.02;
    g.beginPath(); g.moveTo(cx, s); g.lineTo(cx, s * 0.82); g.stroke();
  });

  // 3: banana / strelitzia paddle, slightly torn edges
  cell(1, 1, (s) => {
    const cx = s / 2;
    g.fillStyle = leafFill(0, s, 0, 0, '#2b5f2a', '#4c9440');
    g.beginPath();
    g.moveTo(cx, s);
    g.bezierCurveTo(cx - s * 0.2, s * 0.85, cx - s * 0.24, s * 0.25, cx, s * 0.02);
    g.bezierCurveTo(cx + s * 0.24, s * 0.25, cx + s * 0.2, s * 0.85, cx, s);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = s * 0.006;
    for (let k = 0; k < 9; k++) {
      const y = s * (0.25 + rnd() * 0.6), side = rnd() > 0.5 ? 1 : -1;
      g.beginPath(); g.moveTo(cx + side * s * 0.06, y); g.lineTo(cx + side * s * 0.3, y - s * 0.08); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(210,235,170,0.55)';
    g.lineWidth = s * 0.014;
    g.beginPath(); g.moveTo(cx, s); g.lineTo(cx, s * 0.04); g.stroke();
    g.lineWidth = s * 0.003;
    g.strokeStyle = 'rgba(180,220,150,0.3)';
    for (let k = 0; k < 30; k++) {
      const y = s * (0.92 - k * 0.028);
      g.beginPath(); g.moveTo(cx, y); g.lineTo(cx - s * 0.2, y - s * 0.07); g.moveTo(cx, y); g.lineTo(cx + s * 0.2, y - s * 0.07); g.stroke();
    }
  });

  const tex = new THREE.CanvasTexture(c);
  setup(tex, true);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Neon sign, no text: a thin amber ring (setting sun) around a green palm
// leaf, drawn with a soft glow. Used on an additive plane (black = nothing).
export function neonSign(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2, R = size * 0.36;
  const tube = (stroke, width, glow, path) => {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, a, blur] of [[width * 5, 0.10, glow * 2.2], [width * 2.6, 0.22, glow], [width, 1, glow * 0.4]]) {
      g.strokeStyle = stroke.replace('A', a);
      g.lineWidth = w;
      g.shadowColor = stroke.replace('A', Math.min(1, a * 2));
      g.shadowBlur = blur;
      g.beginPath(); path(); g.stroke();
    }
    // white-hot core
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,248,235,0.85)';
    g.lineWidth = width * 0.35;
    g.beginPath(); path(); g.stroke();
    g.restore();
  };
  // ring, open at the bottom (sun on the horizon)
  tube('rgba(255,150,60,A)', size * 0.012, size * 0.03, () => g.arc(cx, cy, R, Math.PI * 0.62, Math.PI * 2.38));
  // horizon line
  tube('rgba(255,150,60,A)', size * 0.01, size * 0.025, () => { g.moveTo(cx - R * 0.95, cy + R * 0.78); g.lineTo(cx + R * 0.95, cy + R * 0.78); });
  // palm leaf: curved midrib + leaflets
  const leaf = () => {
    const x0 = cx - R * 0.05, y0 = cy + R * 0.7, x1 = cx + R * 0.1, y1 = cy - R * 0.62;
    g.moveTo(x0, y0); g.quadraticCurveTo(cx + R * 0.32, cy, x1, y1);
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * (cx + R * 0.32) + t * t * x1;
      const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      const L = R * (0.55 - Math.abs(t - 0.45) * 0.6);
      g.moveTo(px, py); g.quadraticCurveTo(px - L * 0.5, py - L * 0.05, px - L, py + L * 0.35);
      g.moveTo(px, py); g.quadraticCurveTo(px + L * 0.5, py - L * 0.25, px + L * 0.9, py - L * 0.05);
    }
  };
  tube('rgba(70,235,140,A)', size * 0.009, size * 0.025, leaf);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Equirectangular environment of the club for the glossy counter top only
// (the gear keeps the neutral studio environment of src/scene/renderer.js):
// dark room, rows of warm bulbs, green glow low on the walls, amber spots.
// three.js turns it into a PMREM on first use (during the shader warm-up).
// u = 0.25 looks towards -z (the dance floor), v = 1 straight up.
export function clubEnvironment(w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b0806'); sky.addColorStop(0.45, '#120c08'); sky.addColorStop(0.55, '#08100b'); sky.addColorStop(1, '#050706');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const blob = (u, v, r, color, a) => {
    const x = u * w, y = (1 - v) * h;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', a)); gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  // green glow along the walls, just above the horizon, all around
  for (let u = 0; u <= 1; u += 0.04) blob(u, 0.53, h * 0.09, 'rgba(40,190,110,A)', 0.35);
  // rows of warm bulbs over the dance floor (towards -z), a few above the stage
  for (const [v, n] of [[0.6, 26], [0.66, 20], [0.73, 14]]) {
    for (let i = 0; i < n; i++) blob(0.25 + (i / (n - 1) - 0.5) * 0.42, v + Math.sin(i * 1.7) * 0.01, h * 0.018, 'rgba(255,190,120,A)', 0.9);
  }
  // amber and green spots (PAR cans) over the floor
  for (const [u, col] of [[0.18, 'rgba(60,220,120,A)'], [0.25, 'rgba(255,150,60,A)'], [0.32, 'rgba(60,220,120,A)']]) blob(u, 0.8, h * 0.05, col, 0.8);
  // warm wash behind the DJ (+z)
  blob(0.75, 0.6, h * 0.25, 'rgba(255,150,70,A)', 0.18);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
