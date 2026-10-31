// Movable controls: the faders, crossfader, knobs, selectors, tempo sliders,
// jog wheels and browse rotaries of the set become real 3D parts.
//
// The GLB models these controls as crude low-poly relief (octagonal prisms,
// boxes) inside the unit meshes, with their picture baked in the texture.
// createControls():
//   1. finds that relief (connected components inside each control's click
//      zone, src/config/hotspots.js) and removes it from the unit geometry;
//   2. paints the baked picture out of the texture (src/controls/texturePatch.js);
//   3. builds a PBR part (src/controls/geometry.js) seated where the relief
//      was, parented to the unit group (follows the intro, fades with the unit,
//      casts and receives shadows);
//   4. binds each part to the store (src/controls/state.js): the part moves
//      when the value changes, from the mouse (src/input/controlDrag.js), a
//      reset, or any code calling store.set().
// Must run right after buildStage(), before the reflections, screens, cables
// and hotspots read the unit meshes.
//   const controls = createControls({ units })
//   controls.store                 // values (see the contract in state.js)
//   controls.byZone.get(zoneId)    // part of a click zone ('mixer_ch1_fader'...)
//   controls.pickables             // [{ mesh, unitKey }] for hotspots picking
//   controls.consumeShadowDirty()  // true once after a part moved (shadow map)
import * as THREE from 'three';
import { HOTSPOTS } from '../config/hotspots.js';
import { splitComponents, geometryFromComponents } from '../scene/split.js';
import { CONTROL_DEFS, KNOB_STYLES, KNOB_RANGE, UNIT_NAMES, storeKind } from './defs.js';
import { createControlState } from './state.js';
import { createTexturePatcher } from './texturePatch.js';
import {
  knobGeometry, browseGeometry, channelCapGeometry, crossCapGeometry, tempoCapGeometry,
  jogGeometry, jogCentreGeometry, JOG,
} from './geometry.js';

const DEG = Math.PI / 180;
const MM = 0.001;
const RELIEF_MIN = 4; // mm above the panel: below that a component is flat (buttons, plates)
const FIT_TOL = 3; // mm: a component must fit in its zone footprint + this
// Photo centre of the jog / slot centres measured on the baked texture, where
// the low-poly relief is a little off (mm).
const AT = { jog: [0, 80.5], tempo: [136.8, null], crossfader: [null, 173.3] };

// Remembered settings (localStorage) must never bring a visitor back to a
// silent site. Not saved at all (a saved value is ignored): the input
// selectors, trims, channel faders, MASTER LEVEL, the crossfader (with the
// default assign A / B, an end position mutes a deck) and the CDJ tempo sliders
// (a track would start off its tempo). EQ, COLOR, Beat FX knobs and the rest
// are kept, except a saved state that would still be silent (see audible()).
const TRANSIENT = /^mixer_(ch\d_(input|trim|fader)|master_level|crossfader)$|^cdj_(left|right)_tempo$/;
// values: Map id -> saved value (defaults for the others); returns ids to reset.
function audible(values) {
  const reset = [];
  for (const n of [1, 2, 3, 4]) {
    const eq = ['hi', 'mid', 'low'].map((b) => `mixer_ch${n}_eq_${b}`);
    if (eq.every((id) => values.has(id) && values.get(id) <= 0.02)) reset.push(...eq); // three bands killed
    const color = `mixer_ch${n}_color`;
    if (values.has(color) && values.get(color) < 0.1) reset.push(color); // low-pass under ~170 Hz
  }
  return reset;
}

// Controls drawn and modelled but with nothing behind them on this site.
const INERT = /^cdj_(left|right)_browse$/;
const isInert = (zoneId) => INERT.test(zoneId ?? '');

export function createControls({ units }) {
  // --- definitions and store ---
  const entries = []; // { unitKey, def, zone, id }
  for (const [unitKey, list] of Object.entries(CONTROL_DEFS)) {
    if (!units[unitKey]) continue;
    for (const def of list) {
      const zone = HOTSPOTS[unitKey].find((z) => z.id === def.zone);
      if (!zone) { console.warn(`[controls] zone ${def.zone} missing`); continue; }
      entries.push({ unitKey, def, zone, id: `${UNIT_NAMES[unitKey]}_${def.zone}` });
    }
  }
  const store = createControlState(entries.map(({ id, def, zone }) => ({
    id, kind: storeKind(def), default: def.default, label: zone.label,
    ...(def.kind === 'selector' ? { steps: def.labels.length, labels: def.labels } : {}),
  })), { transient: (id) => TRANSIENT.test(id), sanitise: audible });

  // --- 1. find and remove the relief of each control ---
  const found = new Map(); // id -> { comps, box (mm) }
  for (const unitKey of Object.keys(CONTROL_DEFS)) {
    const unit = units[unitKey];
    if (!unit) continue;
    const geo = unit.mesh.geometry;
    const comps = splitComponents(geo);
    const panelY = unit.surfaceY * 1000;
    const mine = entries.filter((e) => e.unitKey === unitKey);
    const removed = new Set();
    for (const e of mine) {
      const hits = [];
      for (const c of comps) {
        if (removed.has(c)) continue;
        const b = mmBox(c.box);
        if (b.max.y < panelY + RELIEF_MIN) continue;
        if (!fits(e.zone, b)) continue;
        hits.push({ c, b });
      }
      if (!hits.length) { console.warn(`[controls] no relief found for ${e.id}`); continue; }
      const main = hits.reduce((p, q) => (area(q.b) > area(p.b) ? q : p));
      // plus the pieces standing on it (indicator fins) even if the zone is a bit off
      for (const c of comps) {
        if (removed.has(c) || hits.some((h) => h.c === c)) continue;
        const b = mmBox(c.box);
        const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
        const mx = (main.b.min.x + main.b.max.x) / 2, mz = (main.b.min.z + main.b.max.z) / 2;
        const inner = Math.min(main.b.max.x - main.b.min.x, main.b.max.z - main.b.min.z) / 2;
        if (b.max.y >= panelY + RELIEF_MIN && Math.hypot(cx - mx, cz - mz) <= inner + 1
          && b.max.x - b.min.x <= main.b.max.x - main.b.min.x + 2 && b.max.z - b.min.z <= main.b.max.z - main.b.min.z + 2) hits.push({ c, b });
      }
      for (const h of hits) removed.add(h.c);
      found.set(e.id, { comps: hits.map((h) => h.c), box: main.b });
    }
    if (removed.size) {
      const keep = comps.filter((c) => !removed.has(c));
      const next = geometryFromComponents(geo, keep);
      unit.mesh.geometry = next;
      geo.dispose();
    }
  }

  // --- helpers on the remaining geometry ---
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const surface = (unit, x, z) => {
    unit.mesh.updateMatrixWorld(true);
    // unit mesh is not transformed inside its group; ray in group space
    const origin = unit.group.localToWorld(new THREE.Vector3(x * MM, 1, z * MM));
    ray.set(origin, down);
    const hit = ray.intersectObject(unit.mesh, false)[0];
    if (!hit) return null;
    const g = unit.mesh.geometry;
    const pos = g.attributes.position, uv = g.attributes.uv;
    const f = hit.face;
    const P = [f.a, f.b, f.c].map((i) => [pos.getX(i) * 1000, pos.getZ(i) * 1000, uv.getX(i), uv.getY(i)]);
    return {
      point: unit.group.worldToLocal(hit.point.clone()), // metres, unit-local
      normal: f.normal.clone(),
      aff: affine(P),
    };
  };

  // --- 2. paint the baked pictures out ---
  // The three units share one texture (and both CDJs the same UVs): paint the
  // mixer and ONE CDJ.
  const map = units.mixer?.material.map ?? units.cdjLeft?.material.map;
  let patched = null;
  if (map?.image) {
    const patcher = createTexturePatcher(map);
    const paintedCdj = new Set();
    for (const e of entries) {
      const ops = e.def.paint ?? [];
      const style = KNOB_STYLES[e.def.style];
      const isCdj = e.unitKey !== 'mixer';
      if (isCdj && paintedCdj.has(e.def.zone)) continue;
      if (isCdj) paintedCdj.add(e.def.zone);
      const unit = units[e.unitKey];
      const c = centreOf(e, found.get(e.id));
      const s = surface(unit, c[0], c[1]);
      if (!s) continue;
      if (style?.paint && (e.def.kind === 'knob' || e.def.kind === 'selector' || e.def.kind === 'encoder')) {
        patcher.disc(s.aff, c[0], c[1], style.paint);
      }
      for (const op of ops) {
        if (op.type === 'capsule') {
          const a = op.angle * DEG; // clockwise from 12 o'clock (-z)
          const ux = Math.sin(a), uz = -Math.cos(a);
          const r0 = style?.paint ?? 6;
          patcher.capsule(s.aff, c[0] + ux * op.from, c[1] + uz * op.from, c[0] + ux * op.to, c[1] + uz * op.to, op.w, c[0], c[1], [r0 + 0.3, r0 + 1.4]);
        } else if (op.type === 'clone') {
          const [x0, z0, x1, z1] = op.rect;
          const rect = op.rel ? [c[0] + x0, z0, c[0] + x1, z1] : [x0, z0, x1, z1];
          const at = surface(unit, (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
          if (at) patcher.clone(at.aff, rect, op.from);
        }
      }
    }
    patched = patcher.texture();
    for (const u of Object.values(units)) {
      if (u.material.map === map) { u.material.map = patched; u.material.needsUpdate = true; }
    }
    map.dispose();
    map.image?.close?.();
  }

  // --- 3. materials (per unit: the units fade at different times) ---
  const mats = new Map(); // unitKey -> { plastic, metal, gloss }
  const materialsOf = (unit) => {
    if (mats.has(unit.key)) return mats.get(unit.key);
    const common = { vertexColors: true, transparent: true, opacity: unit.material.opacity };
    const m = {
      // satin rubberised plastic (knobs, caps), white paint lines share it
      plastic: new THREE.MeshStandardMaterial({ ...common, color: 0xffffff, roughness: 0.58, metalness: 0.05, name: `${unit.key}_ctl_plastic` }),
      // brushed / polished aluminium (COLOR knobs, rings, jog rim)
      metal: new THREE.MeshStandardMaterial({ ...common, color: 0xffffff, roughness: 0.34, metalness: 1, name: `${unit.key}_ctl_metal` }),
      // black gloss (jog platter)
      gloss: new THREE.MeshStandardMaterial({ ...common, color: 0xffffff, roughness: 0.14, metalness: 0.3, name: `${unit.key}_ctl_gloss` }),
    };
    unit.fadeMaterials?.push(m.plastic, m.metal, m.gloss);
    mats.set(unit.key, m);
    return m;
  };
  const geoCache = new Map();
  const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
  const meshesFor = (parts, m, name) => {
    const out = [];
    for (const k of ['plastic', 'metal', 'gloss']) {
      if (!parts[k]) continue;
      const mesh = new THREE.Mesh(parts[k], m[k]);
      mesh.name = `${name}_${k}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  };

  // --- 4. build the parts ---
  // Knobs, selectors, encoders and channel fader caps of the same shape on the
  // same unit share one InstancedMesh per material (a dozen draw calls for the
  // whole mixer instead of ~60); the jog, browse rotary, tempo and crossfader
  // are single meshes. Each control keeps an empty `mount` (seat on the panel)
  // and `moving` (rotor / slider) node: the value moves `moving`, and the
  // instance matrix is mount x moving (unit-local, so it follows the intro).
  const list = [];
  const byZone = new Map();
  const pickables = [];
  const batches = new Map(); // `${unitKey}|${shape}` -> { unit, parts, ctls }
  let shadowDirty = false;
  for (const e of entries) {
    const unit = units[e.unitKey];
    const c = centreOf(e, found.get(e.id));
    const s = surface(unit, c[0], c[1]);
    if (!s) { console.warn(`[controls] no surface under ${e.id}`); continue; }
    const m = materialsOf(unit);
    const mount = new THREE.Group();
    mount.name = `ctl_${e.id}`;
    mount.position.copy(s.point);
    // seated on the surface (the browse rotary sits on a tilted pod)
    if (s.normal.y < 0.999) mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.normal.clone().normalize());
    const moving = new THREE.Group(); // rotor (knobs, jog) or slider (faders)
    mount.add(moving);
    const ctl = { id: e.id, unitKey: e.unitKey, unit: UNIT_NAMES[e.unitKey], zone: e.def.zone, def: e.def, kind: e.def.kind, mount, moving, centre: c, store };
    let apply;
    let shape = null; // instanced shape key, or null for own meshes
    let parts;
    const d = e.def;
    if (d.kind === 'knob' || d.kind === 'selector' || (d.kind === 'encoder' && d.style !== 'browse')) {
      parts = cached(`knob:${d.style}`, () => knobGeometry(KNOB_STYLES[d.style]));
      shape = `knob:${d.style}`;
      if (d.kind === 'knob') apply = (v) => { moving.rotation.y = -((v - 0.5) * 2 * KNOB_RANGE) * DEG; };
      else if (d.kind === 'selector') {
        const n = d.labels.length;
        apply = (v) => { moving.rotation.y = -(-d.spread / 2 + (v * d.spread) / (n - 1)) * DEG; };
      } else apply = (v) => { moving.rotation.y = -v; };
    } else if (d.kind === 'encoder') { // browse rotary
      parts = cached('browse', browseGeometry);
      apply = (v) => { moving.rotation.y = -v; };
      ctl.setPressed = (p) => { moving.position.y = p ? -1.1 * MM : 0; shadowDirty = true; };
    } else if (d.kind === 'fader') {
      parts = cached(`cap:${d.cap}`, { channel: channelCapGeometry, cross: crossCapGeometry, tempo: tempoCapGeometry }[d.cap]);
      if (d.cap === 'channel') shape = 'cap:channel';
      const mid = c[d.axis === 'x' ? 0 : 1];
      ctl.axis = d.axis;
      ctl.offsetAt = (v) => (d.travel[0] + v * (d.travel[1] - d.travel[0]) - mid) * MM; // metres along the axis
      apply = (v) => { moving.position[d.axis] = ctl.offsetAt(v); };
      // world position of the cap top at value v (drag mapping)
      ctl.worldAt = (v) => {
        const t = new THREE.Vector3(0, ctl.height * 0.8, 0);
        t[d.axis] = ctl.offsetAt(v);
        mount.updateMatrixWorld(true);
        return mount.localToWorld(t);
      };
    } else if (d.kind === 'jog') {
      parts = cached('jog', jogGeometry);
      // fixed centre: the baked jog display, mapped with the panel's own uv
      // (the photo of the display is centred on the jog)
      const centreGeo = jogCentreGeometry((x, z) => uvAt(s.aff, c[0] + x, c[1] + z));
      const centre = new THREE.Mesh(centreGeo, unit.material);
      centre.name = `${mount.name}_centre`;
      centre.receiveShadow = true;
      mount.add(centre);
      ctl.fixed = centre;
      ctl.radius = JOG.rOut * MM;
      apply = (v) => { moving.rotation.y = -v; };
    }
    ctl.height = parts.height;
    unit.group.add(mount);
    if (shape) {
      const key = `${e.unitKey}|${shape}`;
      if (!batches.has(key)) batches.set(key, { unit, parts, m, shape, ctls: [] });
      batches.get(key).ctls.push(ctl);
      ctl.sync = null; // set when the batch is built
    } else {
      for (const mesh of meshesFor(parts, m, mount.name)) moving.add(mesh);
    }
    mount.traverse((o) => { if (o.isMesh) pickables.push({ mesh: o, unitKey: e.unitKey, control: ctl }); });
    ctl.apply = (v) => { apply(v); ctl.sync?.(); };
    list.push(ctl);
    byZone.set(e.id, ctl);
  }

  // instanced batches
  const M = new THREE.Matrix4();
  for (const b of batches.values()) {
    const ims = [];
    for (const k of ['plastic', 'metal', 'gloss']) {
      if (!b.parts[k]) continue;
      const im = new THREE.InstancedMesh(b.parts[k], b.m[k], b.ctls.length);
      im.name = `${b.unit.key}_ctl_${b.shape}_${k}`;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false; // instances move; the units are on screen anyway
      b.unit.group.add(im);
      ims.push(im);
      pickables.push({ mesh: im, unitKey: b.unit.key, control: null });
    }
    b.ctls.forEach((ctl, i) => {
      ctl.instances = ims;
      ctl.sync = () => {
        ctl.mount.updateMatrix();
        ctl.moving.updateMatrix();
        M.multiplyMatrices(ctl.mount.matrix, ctl.moving.matrix);
        // (bounding sphere: recomputed on the next raycast, the instance moved)
        for (const im of ims) { im.setMatrixAt(i, M); im.instanceMatrix.needsUpdate = true; im.boundingSphere = null; }
      };
    });
  }

  for (const ctl of list) {
    ctl.apply(store.get(ctl.id));
    store.onChange(ctl.id, (ev) => { ctl.apply(ev.value); shadowDirty = true; });
  }

  return {
    store,
    list,
    byZone,
    pickables,
    texture: patched,
    // hotspots cursor: draggable zones show a grab hand; the CDJ BROWSE rotary
    // has no function here (inert: neither grab hand nor drag)
    cursorFor: (zoneId) => (!byZone.has(zoneId) ? 'pointer' : isInert(zoneId) ? '' : 'grab'),
    isInert,
    consumeShadowDirty() { const d = shadowDirty; shadowDirty = false; return d; },
  };
}

// --- geometry helpers ---

function mmBox(b) {
  return { min: { x: b.min.x * 1000, y: b.min.y * 1000, z: b.min.z * 1000 }, max: { x: b.max.x * 1000, y: b.max.y * 1000, z: b.max.z * 1000 } };
}
const area = (b) => (b.max.x - b.min.x) * (b.max.z - b.min.z);

// Component box (mm) inside a zone footprint: centre inside, extents within the footprint + FIT_TOL.
function fits(zone, b) {
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2;
  if (zone.shape === 'circle') {
    return Math.hypot(cx - zone.x, cz - zone.z) <= zone.r && Math.max(hx, hz) <= zone.r + FIT_TOL;
  }
  const zh = (zone.h / 2) * Math.cos(zone.tilt ?? 0);
  return Math.abs(cx - zone.x) <= zone.w / 2 && Math.abs(cz - zone.z) <= zh && hx <= zone.w / 2 + FIT_TOL && hz <= zh + FIT_TOL;
}

// Centre of a control (mm): measured photo centre when known, else the centre
// of the relief it replaces, else its zone.
function centreOf(e, f) {
  const box = f?.box;
  let x = box ? (box.min.x + box.max.x) / 2 : e.zone.x;
  let z = box ? (box.min.z + box.max.z) / 2 : e.zone.z;
  const at = AT[e.def.zone];
  if (at) { if (at[0] != null) x = at[0]; if (at[1] != null) z = at[1]; }
  return [x, z];
}

// Affine (x, z) mm -> (u, v) of a triangle [[x, z, u, v] x3] (also used by
// src/scene/mixerLabel.js).
export function affine(P) {
  const [[x0, z0, u0, v0], [x1, z1, u1, v1], [x2, z2, u2, v2]] = P;
  const det = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
  if (Math.abs(det) < 1e-9) return { a: 0, b: 0, c: u0, d: 0, e: 0, f: v0 };
  const a = ((u1 - u0) * (z2 - z0) - (u2 - u0) * (z1 - z0)) / det;
  const b = ((x1 - x0) * (u2 - u0) - (x2 - x0) * (u1 - u0)) / det;
  const d = ((v1 - v0) * (z2 - z0) - (v2 - v0) * (z1 - z0)) / det;
  const e = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
  return { a, b, c: u0 - a * x0 - b * z0, d, e, f: v0 - d * x0 - e * z0 };
}
const uvAt = (aff, x, z) => [aff.a * x + aff.b * z + aff.c, aff.d * x + aff.e * z + aff.f];
