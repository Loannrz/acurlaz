// Invisible click zones on the units.
//
// Picking works on the REAL geometry, not on floating planes: the pointer ray
// is cast against the unit bodies, and the zone is the one whose top-down
// footprint (src/config/hotspots.js, unit-local mm) contains the point that was
// hit. The buttons are painted on the model's texture as seen from above, so
// the hit point is exactly the spot of the texture the eye sees under the
// pointer, whatever the camera angle or zoom: no parallax (a flat zone floating
// above a knob or a fader slot slides off its button when seen from the side),
// no z-fighting, and the bodies hide exactly what is really hidden (a knob in
// front of a button, the other units).
//   - several footprints containing the point: the smallest wins;
//   - none: the nearest zone within a few pixels (converted to mm at the hit
//     distance and angle, capped) still counts, so tiny buttons stay clickable
//     at grazing angles without stealing clicks from a neighbour.
//
// Each zone also has a mesh (layer 1, shown with H in dev) that hugs the model
// surface over its footprint: it shows exactly the clickable area.
//
// A click = pointer down + up on the same zone, with less than tapSlop() px of
// movement (screen space, so independent of the zoom) and within TAP_MAX_MS.
// Mouse, pen and touch (pointer events); a second finger cancels the tap.
//   createHotspots({ units, camera, dom, onButton, onHover, onPress, onRelease, pickables, cursorFor })
// pickables: [{ mesh, unitKey }] extra meshes hit like the unit bodies (the 3D
// controls of src/controls/: a knob or a fader cap hides the panel behind it and
// resolves to its own zone, wherever it has moved within that zone).
// cursorFor(zoneId) -> CSS cursor on hover ('pointer' by default, 'grab' for a control).
// onPress(info) fires on pointer down on a zone (info.point: unit-local mm of the
// hit), onRelease(info) once when that
// press ends (release anywhere, cancel, or the press turning into a drag):
// for buttons that act while held (CUE). onButton stays the click.
// onPress may return { hold: true, slop }: the press belongs to the button. It
// then never starts a camera orbit (the event stops here), survives a slide of
// the pointer up to `slop` px (Infinity: never, e.g. the jog), and is released on
// pointer up / cancel / lost capture, and when the page loses focus or is hidden
// (window blur, visibilitychange): a held CUE never stays stuck. Each pointer has
// its own press, so a second finger can press PLAY while the first holds CUE.
import * as THREE from 'three';
import { HOTSPOTS } from '../config/hotspots.js';
import { TOUCH } from '../config.js';
import { tapSlop, TAP_MAX_MS } from '../input/pointer.js';

const ZONE_LAYER = 1;
const UNIT_NAMES = { cdjLeft: 'cdj_left', cdjRight: 'cdj_right', mixer: 'mixer' };
const HEIGHT_CELL = 1; // mm, resolution of the per-unit height map
const BELOW_TOL = 4; // mm: hits lower than the footprint's lowest surface minus this are ignored (chassis sides)
const EDGE_PX = 3; // edge tolerance in screen pixels...
const EDGE_MAX_MM = 2.5; // ...but never more than this on the model
// A fingertip (pointerType 'touch') gets a wider tolerance (TOUCH in config):
// a 10 mm key seen at ~2 px/mm grows to ~44 px of reach. The zone that contains
// the point still wins; the tolerance only picks the nearest zone around it.
const SKIN_LIFT = 1; // mm, debug mesh above the surface (clears the screen overlays, 0.8 mm)

export function createHotspots({ units, camera, dom, onButton, onHover, onPress, onRelease, pickables = [], cursorFor = null }) {
  const zones = [];
  const byUnit = new Map(); // unit mesh -> { unit, zones }
  const heights = {}; // unitKey -> height map (dev tools / calibration)
  const raycaster = new THREE.Raycaster(); // layer 0 only: the bodies

  const debugMaterial = new THREE.MeshBasicMaterial({
    color: 0x4cc9ff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false,
  });
  const hoverMaterial = debugMaterial.clone();
  hoverMaterial.color.set(0xffd60a);
  hoverMaterial.opacity = 0.6;

  for (const [unitKey, list] of Object.entries(HOTSPOTS)) {
    const unit = units[unitKey];
    if (!unit) continue;
    // Heights are read from the model at load time, so they follow any change
    // of the geometry (nothing hard-coded).
    const hm = heightMap(unit.mesh.geometry, HEIGHT_CELL);
    heights[unitKey] = hm;
    const entry = { unit, zones: [] };
    byUnit.set(unit.mesh, entry);
    for (const def of list) {
      const fp = footprint(def);
      const [lo, hi] = hm.range(fp);
      const id = `${UNIT_NAMES[unitKey]}_${def.id}`;
      const mesh = new THREE.Mesh(skinGeometry(fp, hm), debugMaterial);
      mesh.name = `zone_${id}`;
      mesh.layers.set(ZONE_LAYER);
      mesh.renderOrder = 10;
      mesh.userData.center = new THREE.Vector3(fp.x / 1000, (hm.peak(fp.x, fp.z) + SKIN_LIFT) / 1000, fp.z / 1000);
      const zone = { id, unit: UNIT_NAMES[unitKey], unitKey, label: def.label, def, fp, baseY: lo, topY: hi, mesh };
      mesh.userData.zone = zone;
      unit.group.add(mesh);
      zones.push(zone);
      entry.zones.push(zone);
    }
  }
  for (const p of pickables) {
    const entry = [...byUnit.values()].find((en) => en.unit === units[p.unitKey]);
    if (entry) byUnit.set(p.mesh, entry);
  }
  const bodies = [...byUnit.keys()];

  // --- picking ---
  const ndc = new THREE.Vector2();
  const local = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const pick = (clientX, clientY, pointerType = 'mouse') => {
    const finger = pointerType === 'touch';
    const r = dom.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(bodies, false)[0];
    if (!hit) return { zone: null, hit: null };
    const entry = byUnit.get(hit.object);
    entry.unit.group.worldToLocal(local.copy(hit.point)).multiplyScalar(1000);
    // Edge tolerance: EDGE_PX pixels measured on the surface at the hit point
    // (larger when the surface is seen at a grazing angle), capped.
    const mmPerPx = (2000 * hit.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 35) / 2)) / Math.max(1, r.height);
    let cosI = 1;
    if (hit.face) cosI = Math.abs(normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).dot(raycaster.ray.direction));
    const edge = finger
      ? Math.min(TOUCH.edgeMaxMm, (TOUCH.edgePx * mmPerPx) / Math.max(cosI, 0.25))
      : Math.min(EDGE_MAX_MM, (EDGE_PX * mmPerPx) / Math.max(cosI, 0.25));
    return { zone: resolve(entry.zones, local, edge), hit, local: local.clone(), unit: entry.unit };
  };

  // --- pointer handling ---
  let enabled = true;
  let hovered = null;
  let pressed = null; // { id, zone, x, y, t, slop } click candidate (primary pointer)
  const presses = new Map(); // pointerId -> { info, hold, slop, x, y } (onPress sent, onRelease pending)
  const releaseOne = (id) => {
    const h = presses.get(id);
    if (!h) return;
    presses.delete(id);
    if (h.hold) { try { if (dom.hasPointerCapture?.(id)) dom.releasePointerCapture(id); } catch { /* released */ } }
    onRelease?.(h.info);
  };
  const releaseAll = () => { for (const id of [...presses.keys()]) releaseOne(id); };
  // the press of a pointer that is not held by its button (a second finger = pinch)
  const releaseLoose = () => { for (const [id, h] of [...presses]) if (!h.hold) releaseOne(id); };
  const pointer = { x: 0, y: 0, inside: false, type: 'mouse', dirty: false };
  const lastView = new THREE.Matrix4();
  const lastProj = new THREE.Matrix4();
  let lastW = 0, lastH = 0;

  const applyCursor = () => {
    // Never fight the orbit controller's "grabbing" cursor during a drag.
    if (pressed === null && dom.style.cursor !== 'grabbing') dom.style.cursor = hovered ? (cursorFor?.(hovered.id) ?? 'pointer') : '';
  };
  const setHover = (zone) => {
    if (zone !== hovered) {
      if (hovered) hovered.mesh.material = debugMaterial;
      hovered = zone;
      if (hovered) hovered.mesh.material = hoverMaterial;
      onHover?.(hovered ? publicInfo(hovered) : null);
    }
    applyCursor();
  };

  const onPointerMove = (e) => {
    if (e.pointerType !== 'touch') { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; pointer.dirty = true; }
    pointer.type = e.pointerType;
    // Moving too far turns the press into a drag (orbit): no click.
    if (pressed && e.pointerId === pressed.id && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > pressed.slop) pressed = null;
    const h = presses.get(e.pointerId);
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > h.slop) releaseOne(e.pointerId);
  };
  const onPointerDown = (e) => {
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    releaseOne(e.pointerId);
    const res = pick(e.clientX, e.clientY, e.pointerType);
    if (e.isPrimary) pressed = { id: e.pointerId, zone: res.zone, x: e.clientX, y: e.clientY, t: performance.now(), slop: tapSlop(e.pointerType) };
    else { pressed = null; releaseLoose(); } // a second finger (pinch, two-finger gesture) cancels the tap
    if (res.zone && !e.altKey && onPress) {
      // the press also carries the unit-local point hit (mm): the jog tells its top from its side ring
      const info = { ...publicInfo(res.zone), point: { x: res.local.x, y: res.local.y, z: res.local.z }, pointerType: e.pointerType };
      presses.set(e.pointerId, { info, hold: false, slop: tapSlop(e.pointerType), x: e.clientX, y: e.clientY });
      const r = onPress(info);
      const h = presses.get(e.pointerId);
      if (r?.hold && h?.info === info) {
        h.hold = true;
        h.slop = Number.isFinite(r.slop) ? Math.max(h.slop, r.slop) : Infinity;
        try { dom.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
        e.stopImmediatePropagation(); // no camera orbit, no screen touch from this press
      } else if (!e.isPrimary && h) releaseOne(e.pointerId);
    }
    // Dev helper: Alt+click prints the local coordinates under the cursor.
    if (e.altKey && res.hit && onAltClick) {
      const l = res.local;
      onAltClick({ unit: UNIT_NAMES[res.unit.key], x: +l.x.toFixed(1), y: +l.y.toFixed(1), z: +l.z.toFixed(1), zone: res.zone?.id ?? null });
    }
  };
  const onPointerUp = (e) => {
    releaseOne(e.pointerId);
    if (!pressed || e.pointerId !== pressed.id) return;
    const p = pressed;
    pressed = null;
    pointer.dirty = true; // refresh hover / cursor after the press
    if (!enabled || e.altKey || !p.zone) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > p.slop || performance.now() - p.t > TAP_MAX_MS) return;
    // Same zone under the pointer at release (the camera may have moved).
    if (pick(e.clientX, e.clientY, e.pointerType).zone === p.zone) onButton?.(publicInfo(p.zone));
  };
  const onCancel = (e) => { if (pressed && e.pointerId === pressed.id) pressed = null; releaseOne(e.pointerId); };
  const onLostCapture = (e) => { if (presses.get(e.pointerId)?.hold) releaseOne(e.pointerId); };
  // tab / window switch during a press: nothing stays held
  const onBlur = () => { pressed = null; releaseAll(); };
  const onVisibility = () => { if (document.hidden) onBlur(); };
  const onLeave = (e) => {
    if (e.pointerType === 'touch') return;
    pointer.inside = false;
    pointer.dirty = false;
    setHover(null);
  };

  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onCancel);
  dom.addEventListener('pointerleave', onLeave);
  dom.addEventListener('lostpointercapture', onLostCapture);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  // --- debug overlay (H) ---
  let showZones = false;
  let onAltClick = null;
  const setShowZones = (v) => {
    showZones = v;
    if (v) camera.layers.enable(ZONE_LAYER); else camera.layers.disable(ZONE_LAYER);
  };

  // Client-space box of a zone (CSS px), for overlays placed next to it (hover
  // hints, src/ui/tooltip.js): the 8 corners of its footprint, from its lowest
  // surface to its highest + `lift` mm (the 3D controls stand above the panel),
  // projected with the current camera. null if unknown or behind the camera.
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const corner = new THREE.Vector3();
  const screenRect = (id, { lift = 0 } = {}) => {
    const z = zoneById.get(id);
    const group = z && units[z.unitKey]?.group;
    if (!group) return null;
    const r = dom.getBoundingClientRect();
    camera.updateMatrixWorld();
    group.updateMatrixWorld();
    const { fp } = z;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const x of [fp.x - fp.hx, fp.x + fp.hx]) {
      for (const zz of [fp.z - fp.hz, fp.z + fp.hz]) {
        for (const y of [z.baseY, z.topY + lift]) {
          group.localToWorld(corner.set(x / 1000, y / 1000, zz / 1000)).project(camera);
          if (corner.z > 1 || corner.z < -1) continue; // behind the camera / clipped
          const sx = r.left + ((corner.x + 1) / 2) * r.width, sy = r.top + ((1 - corner.y) / 2) * r.height;
          left = Math.min(left, sx); right = Math.max(right, sx); top = Math.min(top, sy); bottom = Math.max(bottom, sy);
        }
      }
    }
    return Number.isFinite(left) ? { left, top, right, bottom } : null;
  };

  return {
    zones,
    heights,
    pick,
    screenRect,
    // Hover: one raycast per frame at most (called from the render loop), when
    // the mouse moved OR the camera moved (zoom, orbit, resize) under a still
    // pointer. Skipped during a press (drag) and for touch (no hover).
    update() {
      if (!enabled) return;
      camera.updateMatrixWorld();
      const r = dom.getBoundingClientRect();
      const camMoved = !lastView.equals(camera.matrixWorld) || !lastProj.equals(camera.projectionMatrix) || r.width !== lastW || r.height !== lastH;
      if (camMoved) { lastView.copy(camera.matrixWorld); lastProj.copy(camera.projectionMatrix); lastW = r.width; lastH = r.height; }
      if (!pointer.inside || pointer.type === 'touch' || pressed) return;
      if (!pointer.dirty && !camMoved) return;
      pointer.dirty = false;
      setHover(pick(pointer.x, pointer.y).zone);
    },
    setEnabled(v) { enabled = v; if (!v) { pressed = null; releaseAll(); setHover(null); } },
    setShowZones,
    get showZones() { return showZones; },
    setAltClickHandler(fn) { onAltClick = fn; },
    dispose() {
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onCancel);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('lostpointercapture', onLostCapture);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const z of zones) { z.mesh.removeFromParent(); z.mesh.geometry.dispose(); }
      debugMaterial.dispose(); hoverMaterial.dispose();
    },
  };
}

// Zone under a unit-local point p (mm): smallest footprint containing it,
// else the nearest one within `edge` mm.
function resolve(list, p, edge) {
  let best = null;
  let near = null, nearD = edge;
  for (const z of list) {
    if (p.y < z.baseY - BELOW_TOL) continue;
    const d = sdf(z.fp, p.x, p.z);
    if (d <= 0) { if (!best || z.fp.area < best.fp.area) best = z; }
    else if (d <= nearD) { near = z; nearD = d; }
  }
  return best ?? near;
}

// Top-down footprint of a zone (mm). A tilted zone (`tilt`, rotation about x
// towards the DJ) has its `h` measured along the surface: its projection on
// the horizontal plane is h * cos(tilt).
function footprint(def) {
  if (def.shape === 'circle') return { circle: true, x: def.x, z: def.z, r: def.r, hx: def.r, hz: def.r, area: Math.PI * def.r * def.r };
  const hx = def.w / 2, hz = (def.h / 2) * Math.cos(def.tilt ?? 0);
  return { circle: false, x: def.x, z: def.z, hx, hz, area: 4 * hx * hz };
}

// Signed distance (mm) from (x, z) to the footprint edge (< 0 inside).
function sdf(fp, x, z) {
  const dx = x - fp.x, dz = z - fp.z;
  if (fp.circle) return Math.hypot(dx, dz) - fp.r;
  const qx = Math.abs(dx) - fp.hx, qz = Math.abs(dz) - fp.hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

// Top-down height map of a geometry (unit-local metres in, mm out): every
// upward-visible triangle is rasterised on a `cell` mm grid, keeping the
// highest point. A few thousand triangles: a few milliseconds.
function heightMap(geometry, cell) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const x0 = bb.min.x * 1000 - cell, z0 = bb.min.z * 1000 - cell;
  const nx = Math.ceil((bb.max.x - bb.min.x) * 1000 / cell) + 3;
  const nz = Math.ceil((bb.max.z - bb.min.z) * 1000 / cell) + 3;
  const data = new Float32Array(nx * nz).fill(-Infinity);
  const pos = geometry.attributes.position;
  const index = geometry.index?.array;
  const triCount = index ? index.length / 3 : pos.count / 3;
  const vx = [0, 0, 0], vy = [0, 0, 0], vz = [0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const i = index ? index[t * 3 + k] : t * 3 + k;
      vx[k] = pos.getX(i) * 1000; vy[k] = pos.getY(i) * 1000; vz[k] = pos.getZ(i) * 1000;
    }
    const det = (vz[1] - vz[2]) * (vx[0] - vx[2]) + (vx[2] - vx[1]) * (vz[0] - vz[2]);
    if (Math.abs(det) < 1e-6) continue; // vertical triangle: no footprint
    const i0 = Math.max(0, Math.floor((Math.min(vx[0], vx[1], vx[2]) - x0) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(vx[0], vx[1], vx[2]) - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(vz[0], vz[1], vz[2]) - z0) / cell));
    const j1 = Math.min(nz - 1, Math.ceil((Math.max(vz[0], vz[1], vz[2]) - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * cell;
        const a = ((vz[1] - vz[2]) * (x - vx[2]) + (vx[2] - vx[1]) * (z - vz[2])) / det;
        const b = ((vz[2] - vz[0]) * (x - vx[2]) + (vx[0] - vx[2]) * (z - vz[2])) / det;
        const c = 1 - a - b;
        if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue;
        const y = a * vy[0] + b * vy[1] + c * vy[2];
        const o = j * nx + i;
        if (y > data[o]) data[o] = y;
      }
    }
  }
  const cellAt = (x, z) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -Infinity : data[j * nx + i];
  };
  return {
    x0, z0, nx, nz, cell, data,
    // Surface height (mm) at (x, z), -Infinity outside the model.
    at: cellAt,
    // Highest surface within one cell of (x, z): wraps the walls of knobs and
    // caps instead of cutting through them.
    peak(x, z) {
      let m = -Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) m = Math.max(m, cellAt(x + di * cell, z + dj * cell));
      return Number.isFinite(m) ? m : 0;
    },
    // [lowest, highest] surface over a footprint.
    range(fp) {
      let lo = Infinity, hi = -Infinity;
      for (let z = fp.z - fp.hz; z <= fp.z + fp.hz; z += cell) {
        for (let x = fp.x - fp.hx; x <= fp.x + fp.hx; x += cell) {
          if (sdf(fp, x, z) > 0) continue;
          const y = cellAt(x, z);
          if (!Number.isFinite(y)) continue;
          lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
      }
      return Number.isFinite(lo) ? [lo, hi] : [0, 0];
    },
  };
}

// Debug mesh hugging the model surface over a footprint (unit-local metres).
function skinGeometry(fp, hm) {
  const verts = [];
  const idx = [];
  const push = (x, z) => { verts.push(x / 1000, (hm.peak(x, z) + SKIN_LIFT) / 1000, z / 1000); return verts.length / 3 - 1; };
  const step = 2; // mm
  if (fp.circle) {
    const rings = Math.max(2, Math.min(40, Math.ceil(fp.r / step)));
    const seg = Math.max(20, Math.min(96, Math.ceil((2 * Math.PI * fp.r) / (step * 1.5))));
    const c = push(fp.x, fp.z);
    for (let k = 1; k <= rings; k++) {
      const rr = (fp.r * k) / rings;
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        push(fp.x + rr * Math.cos(a), fp.z + rr * Math.sin(a));
      }
    }
    const v = (k, s) => (k === 0 ? c : 1 + (k - 1) * seg + (s % seg));
    for (let s = 0; s < seg; s++) idx.push(c, v(1, s + 1), v(1, s));
    for (let k = 1; k < rings; k++) {
      for (let s = 0; s < seg; s++) idx.push(v(k, s), v(k, s + 1), v(k + 1, s + 1), v(k, s), v(k + 1, s + 1), v(k + 1, s));
    }
  } else {
    const nu = Math.max(1, Math.min(120, Math.ceil((2 * fp.hx) / step)));
    const nv = Math.max(1, Math.min(120, Math.ceil((2 * fp.hz) / step)));
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) push(fp.x - fp.hx + (2 * fp.hx * i) / nu, fp.z - fp.hz + (2 * fp.hz * j) / nv);
    }
    const v = (i, j) => j * (nu + 1) + i;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) idx.push(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i + 1, j));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function publicInfo(zone) {
  return { id: zone.id, unit: zone.unit, label: zone.label };
}
