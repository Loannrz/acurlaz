// Banc d'essai du CDJ seul : caméra orbitale, éclairage de la DA (section 8),
// bouton Play cliquable dans la scène, vrai lecteur audio.
// Hors build : seul bench.html le charge, et index.html ne le référence pas.
// Ouvrir /src/scene/cdj/bench.html sur le serveur Vite.
//
// Paramètres d'URL (contrôles visuels automatisés) :
//   view=K0|K1a|K1b|K2a|K3a|K4a|K5a|play|jog|ecran|rasant|dessus|arriere   pose de caméra
//   cam=theta,phi,d,x,y,z,fov   pose libre (degrés, mètres), cible x,y,z
//   light=ouverture|sons|dates|avec|bio|contact                            préréglage de lumière
//   ui=0            masque le panneau
//   sim=pause|play  état simulé sans audio (titre chargé, à l'arrêt ou en lecture)
//   t=secondes      position simulée ; jog=degrés fige l'angle du jog
//   rm=1            force le mouvement réduit
//   dpr=nombre      ratio de pixels
//   tex=échelle,accentuation   réglage de la texture du châssis (par défaut : 2,1 sur ordinateur)
//   mono=0          garde les couleurs d'origine de la texture (comparaison)
//   analyser=1      branche le niveau sonore du lecteur
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/martian-mono/wdth.css';
import '../../styles/base.css';
import './bench.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCdj } from './index.js';
import { DA } from './da.js';
import { player } from '../../audio/player.js';
import { on } from '../../core/bus.js';
import { tracks } from '../../data/content.js';

const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;

// --- rendu (DA 8) ---
const canvas = document.querySelector('canvas.scene');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.setClearColor(0x000000, 0);
const pixelRatio = Number(params.get('dpr')) || Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);

// --- lumière : trois panneaux crème en environnement, key, rim, accent ---
function buildEnvironment() {
  const env = new THREE.Scene();
  const panel = (w, h, position, gain) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(DA.color.creme).multiplyScalar(gain), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  panel(2.6, 1.4, [0.2, 3, 0.6], 5); // au-dessus
  panel(1.6, 3, [3, 1.3, -3], 4); // derrière à droite
  panel(1.2, 3, [-3.6, 1, 0.6], 2.2); // à gauche
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.015);
  pmrem.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return target.texture;
}
scene.environment = buildEnvironment();

// Éclairage de test, plus clair que celui de la scène pour juger les matières ; la source
// vermillon reprend le réglage de base de la scène (src/scene/world/lumieres.js).
const BASE = { key: 2.4, rim: 3.2, accent: 0.35, env: 1 };
const key = new THREE.DirectionalLight(DA.color.creme, BASE.key);
key.position.set(-0.7, 1.3, 0.9);
const rim = new THREE.DirectionalLight(DA.color.creme, BASE.rim);
rim.position.set(0.9, 0.5, -1.2);
const accent = new THREE.PointLight(DA.color.accent, 0, 1.2, 2);
accent.position.set(-0.35, 0.25, 0.45);
scene.add(key, rim, accent);

const LIGHTS = {
  ouverture: { key: 0.8, rim: 1.6, accent: 0, screen: 0.4 },
  sons: { key: 1.2, rim: 1.0, accent: 0, screen: 1 },
  dates: { key: 0.3, rim: 1.8, accent: 0.5, screen: 0.3 },
  avec: { key: 1.0, rim: 0.6, accent: 0, screen: 0.4 },
  bio: { key: 0.5, rim: 0.8, accent: 0, screen: 1.2 },
  contact: { key: 0.3, rim: 1.2, accent: 0.6, screen: 0.2 },
};
let light = LIGHTS.sons;

// --- graphe de scène (DA 13.6) ---
const rig = new THREE.Group();
const float = new THREE.Group();
scene.add(rig);
rig.add(float);

// --- poses de caméra (DA 13.7) et vues de contrôle rapprochées ---
const VIEWS = {
  K0: { theta: 0, phi: 8, d: 2.1, target: [0, 0, 0], fov: 30, frame: [0, 0.08], rig: [62, -24, -12], light: 'ouverture' },
  K1a: { theta: -14, phi: 56, d: 1.35, target: [-0.02, 0.03, 0.04], fov: 28, frame: [0.17, 0], rig: [0, 0, 0], light: 'sons' },
  K1b: { theta: -6, phi: 54, d: 1.32, target: [-0.02, 0.03, 0.04], fov: 28, frame: [0.17, 0], rig: [0, 0, 0], light: 'sons' },
  K2a: { theta: 82, phi: 7, d: 2.3, target: [0, 0, 0], fov: 22, frame: [-0.2, -0.08], rig: [0, 0, 0], light: 'dates' },
  K3a: { theta: 150, phi: 84, d: 2.2, target: [0, 0, 0], fov: 30, frame: [0.16, 0], rig: [0, 0, 0], light: 'avec' },
  K4a: { theta: 346, phi: 58, d: 1.05, target: [0, 0.06, -0.14], fov: 22, frame: [-0.25, 0], rig: [0, 0, 0], light: 'bio' },
  K5a: { theta: 360, phi: 6, d: 4.2, target: [0, 0, 0], fov: 30, frame: [0, 0.18], rig: [62, 24, 12], light: 'contact' },
  play: { theta: -18, phi: 48, d: 0.3, target: [-0.1375, 0.04, 0.199], fov: 28, light: 'sons' },
  jog: { theta: -8, phi: 50, d: 0.62, target: [0, 0.045, 0.081], fov: 28, light: 'sons' },
  ecran: { theta: 0, phi: 64, d: 0.5, target: [0, 0.06, -0.138], fov: 28, light: 'sons' },
  rasant: { theta: 38, phi: 11, d: 0.95, target: [0, 0.03, 0.06], fov: 28, light: 'sons' },
  dessus: { theta: 0, phi: 89.9, d: 4, target: [0, 0, 0.0], fov: 7.2, light: 'avec' },
  arriere: { theta: 200, phi: 24, d: 1.5, target: [0, 0, 0], fov: 28, light: 'sons' },
  face: { theta: 0, phi: 30, d: 1.25, target: [0, 0.01, 0.02], fov: 28, light: 'sons' },
};
let frame = [0, 0];

function setView(name) {
  const v = VIEWS[name];
  if (!v) return;
  const [tx, ty, tz] = v.target;
  const th = v.theta * DEG, ph = v.phi * DEG;
  camera.position.set(tx + v.d * Math.sin(th) * Math.cos(ph), ty + v.d * Math.sin(ph), tz + v.d * Math.cos(th) * Math.cos(ph));
  camera.fov = v.fov;
  controls.target.set(tx, ty, tz);
  frame = v.frame ?? [0, 0];
  const r = v.rig ?? [0, 0, 0];
  rig.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ');
  if (v.light) setLight(v.light);
  resize();
  controls.update();
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === name));
}

function setLight(name) {
  if (!LIGHTS[name]) return;
  light = LIGHTS[name];
  for (const b of document.querySelectorAll('[data-light]')) b.setAttribute('aria-pressed', String(b.dataset.light === name));
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 0.2;
controls.maxDistance = 6;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (frame[0] || frame[1]) camera.setViewOffset(w, h, -frame[0] * w, frame[1] * h, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// --- CDJ ---
const reducedMotion = params.get('rm') === '1' ? true : undefined;
const texture = {};
if (params.has('tex')) { const [scale, sharpen] = params.get('tex').split(',').map(Number); Object.assign(texture, { scale, sharpen: sharpen || 0 }); }
if (params.get('mono') === '0') texture.mono = false;
const t0 = performance.now();
const cdj = await createCdj({ renderer, reducedMotion, texture });
console.info(`[banc] createCdj : ${Math.round(performance.now() - t0)} ms`);
float.add(cdj.root);

// --- lecteur : le même branchement que la scène du site ---
player.init(tracks, { analyser: params.get('analyser') === '1' });
const sim = params.get('sim');
let state = player.state;
const showState = (s) => {
  state = s;
  cdj.setPlaying(s.playing);
  const tr = s.track;
  cdj.setScreen(tr ? { title: tr.title, artist: tr.artist, time: s.time, duration: s.duration, bpm: tr.bpm, key: tr.key } : null);
  renderPanel();
};
// --- clic dans la scène : rayon sur cdj.pickables ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
const pick = (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(cdj.pickables, false)[0] ?? null;
};
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => { canvas.style.cursor = pick(e) ? 'pointer' : ''; });
canvas.addEventListener('pointerup', (e) => {
  const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 0;
  down = null;
  if (moved > 6) return;
  const hit = pick(e);
  if (hit?.object.userData.action === 'play') cdj.pressPlay();
});

// --- panneau ---
const panel = document.querySelector('.bench');
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function buildPanel() {
  const ul = panel.querySelector('.bench__tracks');
  tracks.forEach((tr, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bench__track';
    b.dataset.track = tr.id;
    const idx = document.createElement('span');
    idx.className = 'bench__track-index';
    idx.textContent = String(i + 1).padStart(2, '0');
    const title = document.createElement('span');
    title.textContent = tr.title;
    const data = document.createElement('span');
    data.className = 'bench__track-data';
    data.textContent = `${tr.bpm} · ${tr.key}`;
    b.append(idx, title, data);
    b.addEventListener('click', () => { player.select(tr.id); });
    b.addEventListener('dblclick', () => { player.select(tr.id); player.play(); });
    li.append(b);
    ul.append(li);
  });
  const addButtons = (host, names, attr, fn) => {
    for (const name of names) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bench__btn';
      b.dataset[attr] = name;
      b.textContent = name;
      b.addEventListener('click', () => fn(name));
      host.append(b);
    }
  };
  addButtons(panel.querySelector('.bench__views'), Object.keys(VIEWS), 'view', setView);
  addButtons(panel.querySelector('.bench__lights'), Object.keys(LIGHTS), 'light', setLight);
  panel.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) player[action]();
  });
  panel.hidden = params.get('ui') === '0';
}
function renderPanel() {
  for (const b of panel.querySelectorAll('.bench__track')) {
    const selected = b.dataset.track === state.trackId;
    b.classList.toggle('is-selected', selected);
    b.classList.toggle('is-playing', selected && state.playing);
    b.querySelector('.bench__track-index').textContent = selected && state.playing ? 'LECT' : String(tracks.findIndex((t) => t.id === b.dataset.track) + 1).padStart(2, '0');
  }
  panel.querySelector('[data-action="toggle"]').textContent = state.playing ? 'Mettre en pause' : 'Lire';
  const rows = [
    ['État', state.error ? 'erreur' : state.blocked ? 'en attente d’un geste' : state.playing ? 'lecture' : state.trackId ? 'pause' : 'aucun titre'],
    ['Titre', state.track ? `${state.track.title} · ${state.track.artist}` : 'aucun'],
    ['Temps', `${fmt(state.time)} / ${fmt(state.duration)}`],
    ['Tampon', state.loading ? 'chargement' : 'prêt'],
  ];
  if (state.error) rows.push(['Erreur', state.error]);
  if (state.level !== undefined) rows.push(['Niveau', state.level.toFixed(2)]);
  const dl = panel.querySelector('.bench__state');
  dl.textContent = '';
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    if (k === 'Erreur') dd.className = 'is-error';
    dl.append(dt, dd);
  }
}
buildPanel();
renderPanel();
if (sim) {
  const tr = tracks.find((x) => x.id === params.get('track')) ?? tracks[0];
  const time = Number(params.get('t') ?? 47.3);
  showState({ playing: sim === 'play', trackId: tr.id, track: tr, time, duration: tr.duration, loading: false, blocked: false, error: null });
} else {
  on('player:state', showState);
  cdj.onPlayPress(() => player.toggle());
}
if (params.has('jog')) cdj.jog.rotation.y = -Number(params.get('jog')) * DEG;

if (params.has('cam')) {
  const [theta, phi, d, x, y, z, fov] = params.get('cam').split(',').map(Number);
  VIEWS.libre = { theta, phi, d, target: [x, y, z], fov: fov || 28, light: 'sons' };
}
setView(params.has('cam') ? 'libre' : params.get('view') ?? 'K1a');
if (params.get('light')) setLight(params.get('light'));

// --- boucle ---
const clock = new THREE.Clock();
let beat = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update();
  cdj.update(dt);
  // Lumières : préréglage de section, source vermillon qui bat au tempo en lecture (DA 8).
  key.intensity = BASE.key * light.key;
  rim.intensity = BASE.rim * light.rim;
  let a = light.accent;
  if (state.playing) {
    const bpm = state.track?.bpm ?? DA.bpm;
    beat += dt * ((bpm > 150 ? bpm / 2 : bpm) / 60);
    a = Math.max(a, 0.8) * (1 + 0.15 * Math.cos(beat * Math.PI * 2));
  }
  accent.intensity = BASE.accent * a;
  cdj.setScreenLevel?.(light.screen);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
resize();
await document.fonts.ready;
tick();

// Prises pour les contrôles automatisés.
const project = (x, y, z) => {
  const v = cdj.root.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
};
window.__bench = { cdj, player, on, camera, scene, renderer, controls, setView, setLight, project, THREE, ready: true };
