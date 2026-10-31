// Dev-only calibration page (not part of the intro). Renders one unit with an
// orthographic camera from a chosen side plus a millimetre grid in the unit's
// local frame, so screen / port / button positions can be read off a capture.
//
//   /inspect.html?unit=cdjLeft&view=top&px=3&step=20
//   /inspect.html?unit=mixer&view=top&rect=70,-140,100,-30&px=8&zones=1
//   unit:  cdjLeft | cdjRight | mixer
//   view:  top | back | front | left | right | iso | raw | parts | probe
//   rect:  aMin,bMin,aMax,bMax (mm, in the view's horizontal/vertical axes)
//   zones=1 draws the click zones, overlays=0 hides screens and VU covers,
//   controls=0 shows the model's own low-poly controls (no 3D parts, texture as baked)
//   label=0 keeps the baked mixer print "BEAT FX" (otherwise painted out: the ÉCHAP key of the CRÉDITS screen lies there)
//   probe: &down=x,z;x,z (heights from above) &back=x,y;x,y (depths from behind)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildStage } from '../scene/stage.js';
import { createScreens } from '../scene/screens.js';
import { createVuMeters } from '../scene/vu.js';
import { createHotspots } from '../scene/hotspots.js';
import { createControls } from '../controls/index.js';
import { createMixerLabel } from '../scene/mixerLabel.js';
import { loadUnits } from '../scene/units.js';
import { MODEL_URL } from '../config.js';

const q = new URLSearchParams(location.search);
const unitName = q.get('unit') || 'cdjLeft';
const view = q.get('view') || 'top';
const step = Math.max(5, Number(q.get('step')) || 20);
const pxPerMm = Math.max(0.5, Number(q.get('px')) || 2);
const info = document.getElementById('info');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x303030);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture;
scene.environmentIntensity = 1.2;
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1, 3, 2);
scene.add(sun);

if (view === 'raw' || view === 'parts') {
  const { raw, debug } = await loadUnits(MODEL_URL, renderer);
  window.__debug = debug;
  if (view === 'parts') {
    info.textContent = JSON.stringify(debug, null, 1);
  } else {
    scene.add(raw, new THREE.AxesHelper(1));
    const box = new THREE.Box3().setFromObject(raw);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) * 1.6;
    const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
    cam.position.copy(center).add(new THREE.Vector3(d * 0.6, d * 0.7, d * 0.6));
    cam.lookAt(center);
    renderer.setSize(innerWidth, innerHeight);
    renderer.render(scene, cam);
    info.textContent = `raw bounds min ${fmt(box.min)} max ${fmt(box.max)} size ${fmt(size)}`;
  }
} else {
  const stage = await buildStage(scene, renderer);
  const unit = stage.units[unitName];
  if (!unit) throw new Error(`unknown unit ${unitName}`);
  // movable controls (3D parts, relief removed, texture repainted); controls=0 shows the raw model
  const controls = q.get('controls') !== '0' ? createControls({ units: stage.units }) : null;
  // mixer print "BEAT FX" painted out (with the controls, as in the intro; label=0 shows the baked print)
  if (controls && q.get('label') !== '0') createMixerLabel({ units: stage.units, texture: controls.texture });
  if (q.get('overlays') !== '0') {
    createScreens(stage.units);
    createVuMeters(stage.units.mixer);
  }
  const cam0 = new THREE.PerspectiveCamera();
  const hotspots = createHotspots({ units: stage.units, camera: cam0, dom: renderer.domElement, pickables: controls?.pickables ?? [] });

  if (view === 'probe') {
    const ray = new THREE.Raycaster();
    const parse = (k) => (q.get(k) || '').split(';').filter(Boolean).map((p) => p.split(',').map(Number));
    const out = {
      down: parse('down').map(([x, z]) => {
        ray.set(new THREE.Vector3(x / 1000, 1, z / 1000).add(unit.home), new THREE.Vector3(0, -1, 0));
        const h = ray.intersectObject(unit.mesh, false)[0];
        return { x, z, y: h ? Math.round((h.point.y - unit.home.y) * 10000) / 10 : null, n: h ? h.face.normal.toArray().map((v) => +v.toFixed(2)) : null };
      }),
      back: parse('back').map(([x, y]) => {
        ray.set(new THREE.Vector3(x / 1000, y / 1000, -1).add(unit.home), new THREE.Vector3(0, 0, 1));
        const h = ray.intersectObject(unit.mesh, false)[0];
        return { x, y, z: h ? Math.round((h.point.z - unit.home.z) * 10000) / 10 : null, n: h ? h.face.normal.toArray().map((v) => +v.toFixed(2)) : null };
      }),
    };
    window.__probe = out;
    info.textContent = JSON.stringify(out);
  } else {
    const b = unit.bounds; // local bounds (m)
    const home = unit.home;
    // Axes of the image: a = horizontal, bAxis = vertical (local axis names).
    const axes = {
      top: { a: 'x', b: 'z', flipA: false, flipB: false },
      back: { a: 'x', b: 'y', flipA: true, flipB: true },
      front: { a: 'x', b: 'y', flipA: false, flipB: true },
      left: { a: 'z', b: 'y', flipA: true, flipB: true },
      right: { a: 'z', b: 'y', flipA: false, flipB: true },
      iso: { a: 'x', b: 'z', flipA: false, flipB: false },
    }[view];
    const margin = 10; // mm
    let aMin = b.min[axes.a] * 1000 - margin, aMax = b.max[axes.a] * 1000 + margin;
    let bMin = b.min[axes.b] * 1000 - margin, bMax = b.max[axes.b] * 1000 + margin;
    if (q.get('rect')) [aMin, bMin, aMax, bMax] = q.get('rect').split(',').map(Number);
    const W = Math.round((aMax - aMin) * pxPerMm), H = Math.round((bMax - bMin) * pxPerMm);
    renderer.setSize(W, H);

    const c = new THREE.Vector3((aMin + aMax) / 2000, 0, (bMin + bMax) / 2000); // placeholder, fixed below
    const cam = view === 'iso'
      ? new THREE.PerspectiveCamera(35, W / H, 0.01, 10)
      : new THREE.OrthographicCamera(-(aMax - aMin) / 2000, (aMax - aMin) / 2000, (bMax - bMin) / 2000, -(bMax - bMin) / 2000, 0.01, 5);
    const local = new THREE.Vector3();
    switch (view) {
      case 'top': local.set((aMin + aMax) / 2000, b.max.y + 1, (bMin + bMax) / 2000); cam.up.set(0, 0, -1); break;
      case 'back': local.set((aMin + aMax) / 2000, (bMin + bMax) / 2000, b.min.z - 1); cam.up.set(0, 1, 0); break;
      case 'front': local.set((aMin + aMax) / 2000, (bMin + bMax) / 2000, b.max.z + 1); cam.up.set(0, 1, 0); break;
      case 'left': local.set(b.min.x - 1, (bMin + bMax) / 2000, (aMin + aMax) / 2000); cam.up.set(0, 1, 0); break;
      case 'right': local.set(b.max.x + 1, (bMin + bMax) / 2000, (aMin + aMax) / 2000); cam.up.set(0, 1, 0); break;
      default: local.set(0.5, 0.6, 0.5); cam.up.set(0, 1, 0);
    }
    const target = view === 'iso' ? new THREE.Vector3(0, 0.05, 0) : local.clone();
    if (view === 'top') target.y = 0; else if (view === 'back' || view === 'front') target.z = 0; else target.x = 0;
    cam.position.copy(local).add(home);
    cam.lookAt(target.add(home));
    if (q.get('zones') === '1') { hotspots.setShowZones(true); cam.layers.enable(1); }
    renderer.render(scene, cam);

    // 2D grid overlay labelled in local millimetres.
    if (view !== 'iso') {
      const ov = document.createElement('canvas');
      ov.width = W; ov.height = H;
      ov.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
      document.body.appendChild(ov);
      const ctx = ov.getContext('2d');
      ctx.font = '11px monospace';
      const toPx = (v, vmin, vmax, px, flip) => { const t = (v - vmin) / (vmax - vmin); return (flip ? 1 - t : t) * px; };
      const style = (v) => (v === 0 ? 'rgba(255,80,80,.9)' : v % (step * 5) === 0 ? 'rgba(255,255,0,.55)' : 'rgba(255,255,255,.22)');
      for (let v = Math.ceil(aMin / step) * step; v <= aMax; v += step) {
        const x = toPx(v, aMin, aMax, W, axes.flipA);
        ctx.strokeStyle = style(v); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.fillStyle = '#ff0'; ctx.fillText(String(v), x + 2, 11);
      }
      for (let v = Math.ceil(bMin / step) * step; v <= bMax; v += step) {
        const y = toPx(v, bMin, bMax, H, axes.flipB);
        ctx.strokeStyle = style(v); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.fillStyle = '#ff0'; ctx.fillText(String(v), 2, y - 2);
      }
      ctx.fillStyle = '#fff';
      ctx.fillText(`${unitName} ${view}  h=${axes.a} v=${axes.b}  step=${step}mm  rect=${[aMin, bMin, aMax, bMax].join(',')}`, 4, H - 6);
    }
    info.textContent = `${unitName} bounds(mm) min ${fmt(b.min)} max ${fmt(b.max)}`;
  }
}
window.__inspectReady = true;

function fmt(v) {
  return `[${[v.x, v.y, v.z].map((n) => Math.round(n * 1000)).join(', ')}]`;
}
