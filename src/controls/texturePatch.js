// Removes the baked pictures of the movable controls from the model texture.
// The GLB has ONE 1024 px baked texture (photo-like top views of the three
// units). Once a control becomes a 3D part, what the texture shows under it
// must look like bare panel, from every angle and when the part moves away:
//   disc / capsule : filled with the panel colour sampled just around (12
//                    angular sectors, interpolated, so the baked light gradient
//                    is kept), plus the panel's own grain;
//   clone          : a clean stretch of the same track copied over the baked
//                    cap (fader slots, crossfader, tempo: ticks and slot line
//                    continue under the moving cap).
// Works in unit-local millimetres: `aff` maps (x, z) mm to texture uv on the
// surface hit there ({ a, b, c, d, e, f }: u = a x + b z + c, v = d x + e z + f).
// Runs once at load (a few ms); the result is a CanvasTexture that replaces the
// original map (same settings).
//   inPlace: map.image is already a canvas (the patched texture): paint on it
//   directly (no copy, same texture object; set map.needsUpdate after).
import * as THREE from 'three';

export function createTexturePatcher(map, { inPlace = false } = {}) {
  const img = map.image;
  const W = img.width, H = img.height;
  const own = !(inPlace && img instanceof HTMLCanvasElement);
  const canvas = own ? document.createElement('canvas') : img;
  if (own) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (own) ctx.drawImage(img, 0, 0);
  const flip = map.flipY;

  // mm -> px affine and its inverse
  const toPx = (aff) => {
    const sy = flip ? -H : H;
    const m = { A: aff.a * W, B: aff.b * W, C: aff.c * W, D: aff.d * sy, E: aff.e * sy, F: flip ? H - aff.f * H : aff.f * H };
    const det = m.A * m.E - m.B * m.D;
    m.inv = (px, py) => {
      const dx = px - m.C, dy = py - m.F;
      return [(m.E * dx - m.B * dy) / det, (-m.D * dx + m.A * dy) / det];
    };
    m.map = (x, z) => [m.A * x + m.B * z + m.C, m.D * x + m.E * z + m.F];
    return m;
  };
  const boxPx = (m, x0, z0, x1, z1) => {
    const pts = [m.map(x0, z0), m.map(x1, z0), m.map(x0, z1), m.map(x1, z1)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const i0 = Math.max(0, Math.floor(Math.min(...xs)) - 1), i1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 1);
    const j0 = Math.max(0, Math.floor(Math.min(...ys)) - 1), j1 = Math.min(H - 1, Math.ceil(Math.max(...ys)) + 1);
    return { i0, i1, j0, j1, w: i1 - i0 + 1, h: j1 - j0 + 1 };
  };

  // Gaussian noise (deterministic: the same texture on every load).
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => { const u = Math.max(1e-6, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const quantile = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const median = (a) => quantile(a, 0.5);

  // Fill pixels where `inside(x, z)` (mm) returns coverage 0..1 with a colour
  // field colourAt(x, z) -> [r, g, b] plus grain of std `noise`.
  const fill = (m, bb, inside, colourAt, noise) => {
    const im = ctx.getImageData(bb.i0, bb.j0, bb.w, bb.h);
    const d = im.data;
    for (let j = 0; j < bb.h; j++) {
      for (let i = 0; i < bb.w; i++) {
        const [x, z] = m.inv(bb.i0 + i + 0.5, bb.j0 + j + 0.5);
        const k = inside(x, z);
        if (k <= 0) continue;
        const c = colourAt(x, z);
        const n = gauss() * noise;
        const o = (j * bb.w + i) * 4;
        for (let ch = 0; ch < 3; ch++) d[o + ch] = Math.round(d[o + ch] * (1 - k) + Math.min(255, Math.max(0, c[ch] + n)) * k);
      }
    }
    ctx.putImageData(im, bb.i0, bb.j0);
  };

  // Panel colour around (cx, cz) between radii r0 and r1, in `sectors` angular
  // sectors. Each sector takes a low quantile of its pixels (by luminance): the
  // panel is dark, the printed dots / labels / scale arcs are light, so they are
  // ignored; the sectors are then smoothed so no single one makes a wedge.
  const sampleRing = (m, cx, cz, r0, r1, sectors = 12, q = 0.3) => {
    const bb = boxPx(m, cx - r1, cz - r1, cx + r1, cz + r1);
    const d = ctx.getImageData(bb.i0, bb.j0, bb.w, bb.h).data;
    const bins = Array.from({ length: sectors }, () => [[], [], []]);
    const lum = [];
    for (let j = 0; j < bb.h; j++) {
      for (let i = 0; i < bb.w; i++) {
        const [x, z] = m.inv(bb.i0 + i + 0.5, bb.j0 + j + 0.5);
        const dist = Math.hypot(x - cx, z - cz);
        if (dist < r0 || dist > r1) continue;
        const s = Math.floor(((Math.atan2(x - cx, z - cz) / (2 * Math.PI) + 1) % 1) * sectors);
        const o = (j * bb.w + i) * 4;
        for (let ch = 0; ch < 3; ch++) bins[s][ch].push(d[o + ch]);
        lum.push(0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]);
      }
    }
    // colour of the pixel at the q-quantile of luminance, per sector
    const pick = (b) => {
      const n = b[0].length;
      const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => (b[0][i] * 0.3 + b[1][i] * 0.59 + b[2][i] * 0.11) - (b[0][j] * 0.3 + b[1][j] * 0.59 + b[2][j] * 0.11));
      const lo = Math.floor(n * Math.max(0, q - 0.12)), hi = Math.max(lo + 1, Math.floor(n * Math.min(1, q + 0.12)));
      const out = [0, 0, 0];
      for (let k = lo; k < hi; k++) for (let ch = 0; ch < 3; ch++) out[ch] += b[ch][order[k]] / (hi - lo);
      return out;
    };
    const all = [[], [], []];
    for (const b of bins) for (let ch = 0; ch < 3; ch++) all[ch].push(...b[ch]);
    const global = pick(all);
    const raw = bins.map((b) => (b[0].length >= 4 ? pick(b) : global));
    // circular smoothing over neighbouring sectors (1-2-1)
    const cols = raw.map((c, i) => {
      const a = raw[(i + sectors - 1) % sectors], b = raw[(i + 1) % sectors];
      return [0, 1, 2].map((ch) => (a[ch] + 2 * c[ch] + b[ch]) / 4);
    });
    // grain: median absolute deviation of the luminance (ignores dots / labels)
    const ml = median(lum);
    const noise = Math.min(4, 1.4826 * median(lum.map((v) => Math.abs(v - ml))));
    const at = (x, z) => {
      const t = ((Math.atan2(x - cx, z - cz) / (2 * Math.PI) + 1) % 1) * sectors - 0.5;
      const a = Math.floor(t), f = t - a;
      const c0 = cols[(a + sectors) % sectors], c1 = cols[(a + 1) % sectors];
      return [0, 1, 2].map((ch) => c0[ch] * (1 - f) + c1[ch] * f);
    };
    return { at, noise, global };
  };

  const soft = (dist, r, feather = 0.35) => Math.min(1, Math.max(0, (r - dist) / feather + 0.5));

  return {
    canvas,
    // Bare panel over a disc of radius r (mm) centred on (cx, cz).
    disc(aff, cx, cz, r, ring = [r + 0.25, r + 2.2]) {
      const m = toPx(aff);
      const s = sampleRing(m, cx, cz, ring[0], ring[1]);
      fill(m, boxPx(m, cx - r - 1, cz - r - 1, cx + r + 1, cz + r + 1), (x, z) => soft(Math.hypot(x - cx, z - cz), r), s.at, s.noise);
    },
    // Bare panel along a segment (x0, z0) -> (x1, z1), width w; colour sampled
    // around (cx, cz) between ring radii.
    capsule(aff, x0, z0, x1, z1, w, cx, cz, ring) {
      const m = toPx(aff);
      const s = sampleRing(m, cx, cz, ring[0], ring[1]);
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
      const segDist = (x, z) => { const t = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / L2)); return Math.hypot(x - x0 - t * dx, z - z0 - t * dz); };
      const pad = w / 2 + 1;
      fill(m, boxPx(m, Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad), (x, z) => soft(segDist(x, z), w / 2), s.at, s.noise);
    },
    // Copy the texture at rect + (dx, dz) over rect (mm), with a 0.5 mm soft edge.
    clone(aff, [x0, z0, x1, z1], [dx, dz]) {
      const m = toPx(aff);
      const bb = boxPx(m, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
      const src = ctx.getImageData(0, 0, W, H).data; // full copy: sampling may fall anywhere
      const im = ctx.getImageData(bb.i0, bb.j0, bb.w, bb.h);
      const d = im.data;
      const [ox, oy] = (() => { const a = m.map(dx, dz), b = m.map(0, 0); return [a[0] - b[0], a[1] - b[1]]; })();
      for (let j = 0; j < bb.h; j++) {
        for (let i = 0; i < bb.w; i++) {
          const px = bb.i0 + i + 0.5, py = bb.j0 + j + 0.5;
          const [x, z] = m.inv(px, py);
          const k = Math.min(1, Math.max(0, (x - x0) / 0.5 + 0.5)) * Math.min(1, Math.max(0, (x1 - x) / 0.5 + 0.5)) *
            Math.min(1, Math.max(0, (z - z0) / 0.5 + 0.5)) * Math.min(1, Math.max(0, (z1 - z) / 0.5 + 0.5));
          if (k <= 0) continue;
          // bilinear sample of the source at (px + ox, py + oy)
          const sx = px + ox - 0.5, sy = py + oy - 0.5;
          const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
          const o = (j * bb.w + i) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const at = (u, v) => src[(Math.min(H - 1, Math.max(0, v)) * W + Math.min(W - 1, Math.max(0, u))) * 4 + ch];
            const v = at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
            d[o + ch] = Math.round(d[o + ch] * (1 - k) + v * k);
          }
        }
      }
      ctx.putImageData(im, bb.i0, bb.j0);
    },
    // Bare panel over a printed label lying on a horizontal band (rect x0, z0,
    // x1, z1 in mm): every texel row takes the median colour of the same row
    // just left [x0 - margin, x0 - gap] and right [x1 + gap, x1 + margin] of
    // the label, interpolated across, plus the band's own grain. Keeps the
    // vertical light gradient of the band and any slope along it; 0.4 mm soft
    // edges on the left / right ends (top and bottom match by construction).
    band(aff, [x0, z0, x1, z1], { margin = 4, gap = 0.3, feather = 0.4, samples = 14 } = {}) {
      const m = toPx(aff);
      const src = ctx.getImageData(0, 0, W, H).data;
      const at = (x, z) => { // bilinear texel colour at (x, z) mm
        const [px, py] = m.map(x, z);
        const sx = px - 0.5, sy = py - 0.5;
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
        const t = (u, v, ch) => src[(Math.min(H - 1, Math.max(0, v)) * W + Math.min(W - 1, Math.max(0, u))) * 4 + ch];
        return [0, 1, 2].map((ch) => t(ix, iy, ch) * (1 - fx) * (1 - fy) + t(ix + 1, iy, ch) * fx * (1 - fy) + t(ix, iy + 1, ch) * (1 - fx) * fy + t(ix + 1, iy + 1, ch) * fx * fy);
      };
      const rows = new Map(); // z (0.02 mm) -> { left, right, dev }
      const row = (z) => {
        const key = Math.round(z / 0.02);
        let r = rows.get(key);
        if (r) return r;
        const side = (a, b) => {
          const s = Array.from({ length: samples }, (_, i) => at(a + ((b - a) * (i + 0.5)) / samples, z));
          return { c: [0, 1, 2].map((ch) => median(s.map((p) => p[ch]))), lum: s.map((p) => 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]) };
        };
        const L = side(x0 - margin, x0 - gap), R = side(x1 + gap, x1 + margin);
        const lum = [...L.lum, ...R.lum], ml = median(lum);
        r = { left: L.c, right: R.c, dev: Math.min(3, 1.4826 * median(lum.map((v) => Math.abs(v - ml)))) };
        rows.set(key, r);
        return r;
      };
      const bb = boxPx(m, x0 - feather, z0, x1 + feather, z1);
      const im = ctx.getImageData(bb.i0, bb.j0, bb.w, bb.h);
      const d = im.data;
      for (let j = 0; j < bb.h; j++) {
        for (let i = 0; i < bb.w; i++) {
          const [x, z] = m.inv(bb.i0 + i + 0.5, bb.j0 + j + 0.5);
          if (z < z0 || z > z1) continue;
          const k = Math.min(1, Math.max(0, (x - x0) / feather + 0.5)) * Math.min(1, Math.max(0, (x1 - x) / feather + 0.5));
          if (k <= 0) continue;
          const r = row(z);
          const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
          const n = gauss() * r.dev;
          const o = (j * bb.w + i) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const c = r.left[ch] * (1 - t) + r.right[ch] * t + n;
            d[o + ch] = Math.round(d[o + ch] * (1 - k) + Math.min(255, Math.max(0, c)) * k);
          }
        }
      }
      ctx.putImageData(im, bb.i0, bb.j0);
    },
    // Colour of the printed ink inside a rect (mm): texel at the q-quantile of
    // luminance (light print on a dark panel). Read before painting it out.
    inkColour(aff, [x0, z0, x1, z1], q = 0.97) {
      const m = toPx(aff);
      const bb = boxPx(m, x0, z0, x1, z1);
      const d = ctx.getImageData(bb.i0, bb.j0, bb.w, bb.h).data;
      const px = [];
      for (let j = 0; j < bb.h; j++) {
        for (let i = 0; i < bb.w; i++) {
          const [x, z] = m.inv(bb.i0 + i + 0.5, bb.j0 + j + 0.5);
          if (x < x0 || x > x1 || z < z0 || z > z1) continue;
          const o = (j * bb.w + i) * 4;
          px.push([d[o], d[o + 1], d[o + 2]]);
        }
      }
      if (!px.length) return null;
      px.sort((a, b) => (0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2]) - (0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2]));
      return px[Math.min(px.length - 1, Math.floor(q * px.length))];
    },
    // CanvasTexture with the settings of the original map.
    texture() {
      const t = new THREE.CanvasTexture(canvas);
      t.flipY = map.flipY;
      t.colorSpace = map.colorSpace;
      t.anisotropy = map.anisotropy;
      t.wrapS = map.wrapS; t.wrapT = map.wrapT;
      t.magFilter = map.magFilter; t.minFilter = map.minFilter;
      t.generateMipmaps = map.generateMipmaps;
      t.channel = map.channel;
      t.name = `${map.name || 'baked'}_controls`;
      return t;
    },
  };
}
