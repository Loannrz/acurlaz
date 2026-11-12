// Prépare la texture peinte du modèle (une seule image de 1024 px, vue de dessus
// photographique des appareils) pour le CDJ du site :
//   1. encres : la photo porte les voyants d'un appareil allumé (vert, orange,
//      bleu, pastilles de couleur). Le site n'a que trois encres et réserve le
//      vermillon à l'état actif : la texture passe en gris chauds, luminance
//      conservée ;
//   2. retouches : sous une pièce reconstruite, l'image du bouton d'origine est
//      repeinte en panneau nu (teinte relevée autour, grain compris), pour
//      qu'aucun double ne dépasse sous la pièce, quel que soit l'angle.
// Travail fait une fois au chargement, sur un canvas ; le résultat remplace la
// texture d'origine avec les mêmes réglages.
import * as THREE from 'three';
import { DA } from './da.js';

// Teinte des gris : celle du crème de la DA, à demi-force, pour que le noir du
// châssis reste dans la famille du fond de page.
const WARM = [1, 0.982, 0.963];

export function prepareTexture(source, { uvTop = null, patches = [], mono = true, anisotropy = 1, scale = 1, sharpen = 0 } = {}) {
  const image = source.image;
  const W = image.width, H = image.height;
  let canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  let pixels = ctx.getImageData(0, 0, W, H);
  let d = pixels.data;

  if (uvTop) {
    const toPx = pixelMapping(uvTop, W, H, source.flipY);
    for (const p of patches) paintDisc(d, W, H, toPx, p);
  }

  if (mono) {
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      d[i] = l * WARM[0];
      d[i + 1] = l * WARM[1];
      d[i + 2] = l * WARM[2];
    }
  }
  ctx.putImageData(pixels, 0, 0);

  // Agrandissement soigné puis accentuation : la photo d'origine ne fait que 1,26 px
  // par millimètre, les inscriptions y gagnent des bords plus francs en vue rapprochée.
  if (scale > 1) {
    const big = document.createElement('canvas');
    big.width = W * scale;
    big.height = H * scale;
    const bctx = big.getContext('2d', { willReadFrequently: true });
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(canvas, 0, 0, big.width, big.height);
    canvas = big;
    ctx = bctx;
    if (sharpen > 0) {
      pixels = ctx.getImageData(0, 0, big.width, big.height);
      unsharp(pixels.data, big.width, big.height, scale, sharpen, mono);
      ctx.putImageData(pixels, 0, 0);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = source.flipY;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.channel = source.channel;
  texture.name = 'cdj_panneau';
  return texture;
}

// Masque flou : image + force x (image - image floutée).
// Flou en boîte séparable, deux passes (proche d'une gaussienne), rayon en pixels.
// En gris, un seul canal est calculé puis reteinté.
function unsharp(d, W, H, radius, amount, mono) {
  const n = W * H;
  const src = new Float32Array(n), tmp = new Float32Array(n), blur = new Float32Array(n);
  const r = Math.max(1, Math.round(radius));
  const boxH = (from, to) => {
    for (let y = 0; y < H; y++) {
      let sum = 0;
      const row = y * W;
      for (let x = -r; x <= r; x++) sum += from[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        to[row + x] = sum / (2 * r + 1);
        sum += from[row + Math.min(W - 1, x + r + 1)] - from[row + Math.max(0, x - r)];
      }
    }
  };
  const boxV = (from, to) => {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += from[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        to[y * W + x] = sum / (2 * r + 1);
        sum += from[Math.min(H - 1, y + r + 1) * W + x] - from[Math.max(0, y - r) * W + x];
      }
    }
  };
  for (let ch = 0; ch < (mono ? 1 : 3); ch++) {
    for (let i = 0; i < n; i++) src[i] = d[i * 4 + ch];
    boxH(src, tmp); boxV(tmp, blur);
    boxH(blur, tmp); boxV(tmp, blur);
    for (let i = 0; i < n; i++) {
      const v = src[i] + amount * (src[i] - blur[i]);
      const c = v < 0 ? 0 : v > 255 ? 255 : v;
      if (mono) {
        d[i * 4] = c;
        d[i * 4 + 1] = (c * WARM[1]) / WARM[0];
        d[i * 4 + 2] = (c * WARM[2]) / WARM[0];
      } else {
        d[i * 4 + ch] = c;
      }
    }
  }
}

// (x, z) en mm sur le dessus du châssis vers les pixels de l'image, et l'inverse.
function pixelMapping(aff, W, H, flipY) {
  const sy = flipY ? -H : H;
  const A = aff.a * W, B = aff.b * W, C = aff.c * W;
  const D = aff.d * sy, E = aff.e * sy, F = flipY ? H - aff.f * H : aff.f * H;
  const det = A * E - B * D;
  return {
    map: (x, z) => [A * x + B * z + C, D * x + E * z + F],
    inv: (px, py) => [(E * (px - C) - B * (py - F)) / det, (-D * (px - C) + A * (py - F)) / det],
  };
}

// Repeint un disque en panneau nu : la couleur vient d'une couronne relevée juste
// autour, par secteurs (le dégradé de lumière cuit dans la photo est conservé).
// Dans chaque secteur on garde les pixels sombres : le panneau est noir, les
// inscriptions et les halos sont clairs.
function paintDisc(d, W, H, m, { x, z, r, sample = 3, sectors = 12 }) {
  const corners = [m.map(x - r - sample - 1, z - r - sample - 1), m.map(x + r + sample + 1, z + r + sample + 1)];
  const i0 = Math.max(0, Math.floor(Math.min(corners[0][0], corners[1][0]))), i1 = Math.min(W - 1, Math.ceil(Math.max(corners[0][0], corners[1][0])));
  const j0 = Math.max(0, Math.floor(Math.min(corners[0][1], corners[1][1]))), j1 = Math.min(H - 1, Math.ceil(Math.max(corners[0][1], corners[1][1])));
  const sectorOf = (px, pz) => Math.floor(((Math.atan2(px - x, pz - z) / (2 * Math.PI) + 1) % 1) * sectors) % sectors;

  const bins = Array.from({ length: sectors }, () => []);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const [px, pz] = m.inv(i + 0.5, j + 0.5);
      const dist = Math.hypot(px - x, pz - z);
      if (dist < r + 0.4 || dist > r + sample) continue;
      const o = (j * W + i) * 4;
      bins[sectorOf(px, pz)].push([d[o], d[o + 1], d[o + 2]]);
    }
  }
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const dark = (list) => {
    if (!list.length) return null;
    const sorted = list.slice().sort((p, q) => lum(p) - lum(q));
    const from = Math.floor(sorted.length * 0.15), to = Math.max(from + 1, Math.floor(sorted.length * 0.45));
    const out = [0, 0, 0];
    for (let k = from; k < to; k++) for (let ch = 0; ch < 3; ch++) out[ch] += sorted[k][ch] / (to - from);
    return out;
  };
  const overall = dark(bins.flat()) ?? DA.materiaux.panelFallback;
  const raw = bins.map((b) => (b.length >= 4 ? dark(b) : overall));
  const colours = raw.map((c, i) => {
    const prev = raw[(i + sectors - 1) % sectors], next = raw[(i + 1) % sectors];
    return [0, 1, 2].map((ch) => (prev[ch] + 2 * c[ch] + next[ch]) / 4);
  });

  // Grain déterministe : la même texture à chaque chargement.
  let seed = 20261110;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const [px, pz] = m.inv(i + 0.5, j + 0.5);
      const cover = Math.min(1, Math.max(0, (r - Math.hypot(px - x, pz - z)) / 0.4 + 0.5));
      if (cover <= 0) continue;
      const t = ((Math.atan2(px - x, pz - z) / (2 * Math.PI) + 1) % 1) * sectors - 0.5;
      const a = Math.floor(t), f = t - a;
      const c0 = colours[(a + sectors) % sectors], c1 = colours[(a + 1) % sectors];
      const grain = (rnd() - 0.5) * 3;
      const o = (j * W + i) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = c0[ch] * (1 - f) + c1[ch] * f + grain;
        d[o + ch] = d[o + ch] * (1 - cover) + Math.min(255, Math.max(0, v)) * cover;
      }
    }
  }
}
