// Geometry of the movable parts (knobs, fader caps, jog platter, browse
// rotary), built in millimetres and returned in metres, indexed, with
// position + normal + vertex colour only. Every part is split by material:
//   { plastic, metal, gloss }  (any of them may be null)
// The vertex colour carries the tone (black rubber, grey rubber, white paint,
// silver), so a unit needs only three materials for all its parts.
// Local frame of a part: +y = up (out of the panel), base at y = 0, centred on
// the axis of rotation / travel; 12 o'clock (indicator at rest) = -z.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const MM = 0.001;

// sRGB tones (vertex colours are linear: converted once here).
const srgb = (hex) => new THREE.Color(hex);
export const TONES = {
  black: srgb(0x19191b), // rubberised black (knobs, caps)
  grey: srgb(0x77797d), // trim / mic knobs
  white: srgb(0xe9e8e3), // indicator paint
  dark: srgb(0x111112), // dark line on a metal knob
  metal: srgb(0xc4c6c9), // brushed aluminium
  steel: srgb(0xe2e3e5), // polished ring
  rim: srgb(0x202124), // jog outer rim (dark anodised)
  gloss: srgb(0x050506), // jog platter top
};

// --- helpers ---------------------------------------------------------------

function finish(g, tone) {
  // indexed, position + normal + colour (vertices shared: less vertex work)
  let geo = g;
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.color) {
    const n = geo.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = tone.r; c[i * 3 + 1] = tone.g; c[i * 3 + 2] = tone.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!geo.index) geo = mergeVertices(geo, 1e-5);
  geo.clearGroups();
  return geo;
}

function merge(list) {
  const l = list.filter(Boolean);
  if (!l.length) return null;
  const g = l.length === 1 ? l[0] : mergeGeometries(l, false);
  g.scale(MM, MM, MM);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Surface of revolution around +y. profile: [[r, y], ...] traversed with the
// solid on the left (outside going up, top going inwards...), so faces point
// out. mod(theta, ringIndex, r, y) -> radial offset (knurl, dimples).
// theta: 0 = +z, increasing towards +x.
function revolve(profile, seg, mod = null, tones = null) {
  const pos = [];
  const col = [];
  const idx = [];
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    const tone = tones ? tones[i] : null;
    for (let s = 0; s < seg; s++) {
      const t = (s / seg) * TAU;
      const rr = r > 1e-6 ? Math.max(0, r + (mod ? mod(t, i, r, y) : 0)) : 0;
      pos.push(Math.sin(t) * rr, y, Math.cos(t) * rr);
      if (tone) col.push(tone.r, tone.g, tone.b);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s, b = i * seg + ((s + 1) % seg), c = (i + 1) * seg + ((s + 1) % seg), d = (i + 1) * seg + s;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (tones) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Flat strip (indicator line) on a top surface y(r): from radius a to b along
// -z, width w (mm), `lift` above the surface.
function lineStrip(a, b, w, yAt, lift = 0.06) {
  const n = 6;
  const pos = [];
  for (let i = 0; i <= n; i++) {
    const r = a + ((b - a) * i) / n;
    const y = yAt(r) + lift;
    pos.push(-w / 2, y, -r, w / 2, y, -r);
  }
  const idx = [];
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals(); // counter-clockwise seen from above: faces up
  return g;
}

// Box with bevelled edges, extruded from a 2D outline. shape: THREE.Shape in
// (a, y) mm, `depth` along the third axis, centred. axis 'x' | 'z' = extrusion axis.
function extrude(shape, depth, axis, bevel = 0.45) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelOffset: -bevel, bevelSegments: 3, curveSegments: 10,
  });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  // extruded along +z; shape a-axis -> x
  if (axis === 'x') g.rotateY(Math.PI / 2); // a -> -z (shapes are symmetric), depth -> x
  return g;
}

// --- knobs -----------------------------------------------------------------

// style: KNOB_STYLES entry (src/controls/defs.js).
export function knobGeometry(style) {
  const { r, h } = style;
  const c = Math.min(1.0, r * 0.14); // top edge rounding
  const skirt = style.skirt;
  const y0 = skirt ? skirt.h : 0;
  const rb = r + 0.25; // slight taper of the body
  const cone = style.cone ?? 0; // conical top (COLOR knobs)
  const dome = cone ? 0 : 0.35;
  const topR = r - c;
  const topY = (rho) => h + (cone ? cone * (1 - rho / topR) : dome * (1 - (rho / topR) ** 2));
  const bodyTone = TONES[style.tone] ?? TONES.black;

  // body: from the skirt (or the panel) up the side, round over, across the top
  const prof = [];
  prof.push([rb, y0]);
  const k0 = y0 + (h - y0) * 0.12, k1 = h - c - 0.3;
  for (let i = 0; i <= 2; i++) prof.push([rb + (r - rb) * ((k0 - y0 + ((k1 - k0) * i) / 2) / (h - c - y0)), k0 + ((k1 - k0) * i) / 2]);
  prof.push([r, h - c]);
  for (let i = 1; i <= 3; i++) { const a = (i / 3) * (Math.PI / 2); prof.push([r - c + Math.cos(a) * c, h - c + Math.sin(a) * c]); }
  for (const f of cone ? [0] : [0.55, 0]) prof.push([topR * f, topY(topR * f)]);
  const knurlN = style.knurl ?? 0;
  const depth = style.knurlDepth ?? 0.24;
  const kFirst = 1, kLast = 3; // rings carrying the ridges
  const seg = Math.max(48, knurlN * 3);
  const mod = knurlN ? (t, i) => (i >= kFirst && i <= kLast ? -depth * (0.5 - 0.5 * Math.cos(knurlN * t)) ** 1.5 * (i === kFirst || i === kLast ? 0.5 : 1) : 0) : null;
  const body = finish(revolve(prof, seg, mod), bodyTone);

  // skirt flange
  let skirtGeo = null;
  if (skirt) {
    const sp = [[skirt.r, 0], [skirt.r, skirt.h * 0.55], [skirt.r - 0.25, skirt.h], [rb + 0.02, skirt.h]];
    skirtGeo = finish(revolve(sp, 48), TONES[skirt.tone ?? style.tone] ?? bodyTone);
  }

  // indicator line on the top (white paint, or dark on a metal knob)
  let line = null;
  if (style.line) {
    const tone = style.line === 'dark' ? TONES.dark : TONES.white;
    line = finish(lineStrip(topR * 0.18, topR * 0.98, Math.max(0.8, r * 0.13), topY), tone);
  }

  // pointer fin (selectors): a bar across the top, longer on the pointer side
  let fin = null, finLine = null;
  if (style.fin) {
    const f = style.fin;
    const s = new THREE.Shape();
    s.moveTo(-f.w / 2, 0); s.lineTo(f.w / 2, 0); s.lineTo(f.w * 0.32, f.h); s.lineTo(-f.w * 0.32, f.h); s.closePath();
    const g = extrude(s, f.len + f.back, 'z', 0.35);
    g.translate(0, h - 0.3, -(f.len - f.back) / 2);
    fin = finish(g, bodyTone);
    finLine = finish(lineStrip(f.len * 0.25, f.len * 0.92, f.w * 0.3, () => h - 0.3 + f.h, 0.05), TONES.white);
  }

  const metal = style.tone === 'metal';
  const plasticParts = [], metalParts = [];
  (metal ? metalParts : plasticParts).push(body);
  if (skirtGeo) ((skirt.tone ?? style.tone) === 'metal' ? metalParts : plasticParts).push(skirtGeo);
  if (line) plasticParts.push(line); // paint: dielectric, also on a metal knob
  if (fin) plasticParts.push(fin, finLine);
  return { plastic: merge(plasticParts), metal: merge(metalParts), gloss: null, height: h * MM };
}

// CDJ browse rotary: rubber knurled knob on a polished ring, top slightly dished.
export function browseGeometry() {
  const ring = [[12.9, 0], [12.9, 1.5], [12.6, 2.1], [11.9, 2.4], [11.25, 2.4]];
  const metal = finish(revolve(ring, 96), TONES.steel);
  const r = 11.1, h = 11.2;
  const prof = [[r, 2.4], [r, 4], [r, 9.6], [r - 0.3, 10.4], [r - 0.9, 10.95], [r - 1.6, 11.2], [5.5, 10.85], [0, 10.7]];
  const mod = (t, i) => (i >= 1 && i <= 2 ? -0.35 * (0.5 - 0.5 * Math.cos(40 * t)) ** 1.5 : 0);
  const body = finish(revolve(prof, 120, mod), TONES.black);
  return { plastic: merge([body]), metal: merge([metal]), gloss: null, height: h * MM };
}

// --- caps ------------------------------------------------------------------

// Mixer channel fader cap: 20.5 x 9.6 mm at the base, 17.5 mm high, front and
// back faces slightly sloped, shallow grip dip on top with a white line across.
export function channelCapGeometry() {
  const W = 20.5, hb = 4.8, ht = 3.8, H = 17.5, dip = 0.5;
  const s = new THREE.Shape();
  s.moveTo(-hb, 0); s.lineTo(hb, 0); s.lineTo(ht, H); s.quadraticCurveTo(0, H - 2 * dip, -ht, H); s.closePath();
  const body = finish(extrude(s, W, 'x', 0.5), TONES.black);
  const lw = 1.5, len = W - 1.6, y = H - dip + 0.04;
  const line = finish(boxGeo(len, 0.16, lw, 0, y, 0), TONES.white);
  return { plastic: merge([body, line]), metal: null, gloss: null, height: H * MM };
}

// Crossfader cap: narrow (7 mm), long (19 mm), 18 mm high, white line along it.
export function crossCapGeometry() {
  const D = 18.9, hb = 3.5, ht = 2.8, H = 18;
  const s = new THREE.Shape();
  s.moveTo(-hb, 0); s.lineTo(hb, 0); s.lineTo(ht, H - 0.6); s.quadraticCurveTo(ht, H, ht - 0.6, H); s.lineTo(-ht + 0.6, H); s.quadraticCurveTo(-ht, H, -ht, H - 0.6); s.closePath();
  const body = finish(extrude(s, D, 'z', 0.45), TONES.black);
  const line = finish(boxGeo(1.2, 0.16, D - 2.4, 0, H + 0.02, 0), TONES.white);
  return { plastic: merge([body, line]), metal: null, gloss: null, height: H * MM };
}

// CDJ tempo slider cap: wide wedge (18 mm), ridge on top with a white line.
export function tempoCapGeometry() {
  const W = 18.1;
  const s = new THREE.Shape();
  s.moveTo(-8.6, 0); s.lineTo(8.6, 0); s.lineTo(5.5, 2.3); s.lineTo(3.1, 11.2); s.quadraticCurveTo(2.9, 13.8, 2.2, 13.8);
  s.lineTo(-2.2, 13.8); s.quadraticCurveTo(-2.9, 13.8, -3.1, 11.2); s.lineTo(-5.5, 2.3); s.closePath();
  const body = finish(extrude(s, W, 'x', 0.45), TONES.black);
  const line = finish(boxGeo(W - 1.8, 0.14, 1.3, 0, 13.82, 0), TONES.white);
  return { plastic: merge([body, line]), metal: null, gloss: null, height: 13.8 * MM };
}

function boxGeo(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// --- jog -------------------------------------------------------------------

// CDJ-3000 jog wheel, base on the panel (y = 0), top 16.6 mm higher:
//   rotor  : black gloss platter (r 33.6..78), polished bevel, dark sloping rim
//            with 22 finger dimples (r 80.7..103.7), short skirt;
//   centre : the fixed jog display (r < 33.6), see index.js (baked picture).
export const JOG = { rTop: 78, rIn: 33.6, rOut: 103.7, height: 16.6, dimples: 22 };
export function jogGeometry() {
  const { rTop, rIn, rOut, height: H, dimples } = JOG;
  // platter top + inner lip (down to the display, which sits slightly lower)
  const top = finish(revolve([[rTop, H], [rIn, H], [rIn, H - 0.7]], 160), TONES.gloss);
  // polished bevel
  const bev = finish(revolve([[80.7, H - 1.25], [80.0, H - 0.62], [79.2, H - 0.18], [rTop, H]], 160), TONES.steel);
  // sloping rim with dimples, then the skirt down to the panel
  const N = 10, rimProf = [];
  for (let i = 0; i <= N; i++) { const s = i / N; rimProf.push([80.7 + (rOut - 80.7) * s, H - 1.25 - (H - 1.25 - 2.0) * s]); }
  rimProf.reverse(); // bottom -> top
  rimProf.unshift([rOut, 0]);
  const seg = dimples * 12;
  const aw = (0.40 * TAU) / dimples;
  const mod = (t, i) => {
    if (i < 1) return 0;
    const s = 1 - (i - 1) / N; // 0 at the top edge, 1 at the bottom of the slope
    const k = Math.round((t / TAU) * dimples);
    const dt = t - (k * TAU) / dimples;
    const d = 1 - (dt / aw) ** 2 - ((s - 0.52) / 0.36) ** 2;
    if (d <= 0) return 0;
    const sm = d < 1 ? d * d * (3 - 2 * d) : 1;
    return -2.1 * sm;
  };
  const rim = finish(revolve(rimProf, seg, mod), TONES.rim);
  return { gloss: merge([top]), metal: merge([bev, rim]), plastic: null, height: H * MM };
}

// Fixed centre of the jog: a disc of radius JOG.rIn - 0.15 (metres in, uv(x, z) mm).
export function jogCentreGeometry(uvAt) {
  const g = new THREE.CircleGeometry(JOG.rIn - 0.15, 72);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = uvAt(pos.getX(i), pos.getZ(i));
    uv.setXY(i, u, v);
  }
  g.translate(0, JOG.height - 0.45, 0);
  g.scale(MM, MM, MM);
  g.computeBoundingSphere();
  return g;
}
