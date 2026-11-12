// Banc d'essai de la scène et du défilement (voir bench-stage.html pour les paramètres).
// Il monte six sections factices, lance initScene comme le fera main.js, puis relève à chaque
// image p, la section, et le cadrage réel du CDJ (projection de sa boîte de 329 × 453 × 118 mm)
// pour le comparer aux cotes de docs/DA.md 13.7.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/martian-mono/wdth.css';
import '../styles/base.css';
import * as THREE from 'three';
import { on } from '../core/bus.js';
import * as contenu from '../data/content.js';
import { initScene } from './stage.js';
import { KEYS } from '../scroll/keys.js';

const params = new URLSearchParams(window.location.search);
const racine = document.documentElement;
if (params.get('hud') === '0') racine.classList.add('sans-releve');
if (params.get('gabarits') === '0') racine.classList.add('sans-gabarits');

// ?ui=1 : la vraie interface remplace les sections factices (contrôle d'intégration).
if (params.get('ui') === '1') {
  const modules = import.meta.glob('../ui/index.js');
  const charger = modules['../ui/index.js'];
  if (charger) {
    // L'écran de chargement vit dans index.html : on le reprend tel quel, pour rejouer
    // l'arrivée complète (chargement, puis montée de la lumière).
    try {
      const page = new DOMParser().parseFromString(await (await fetch('/index.html')).text(), 'text/html');
      const chargement = page.getElementById('loader');
      if (chargement) document.getElementById('app').before(document.importNode(chargement, true));
    } catch {
      /* sans écran de chargement, l'interface s'en passe */
    }
    const { initUI } = await charger();
    initUI({ content: contenu });
    racine.classList.add('sans-gabarits');
  }
}

// Sans l'interface, le banc tient le rôle de nav.js : mot courant = section courante.
const mots = [...document.querySelectorAll('.banc-fond [data-section]')];
on('scroll:progress', ({ section }) => {
  mots.forEach((m) => m.classList.toggle('is-current', m.dataset.section === section));
  document.body.dataset.section = section;
});

const scene = await initScene({
  canvas: document.querySelector('canvas.scene'),
  tracks: contenu.tracks,
  doublure: params.get('doublure') === '1',
});

// ------------------------------------------------------------------ mesures de cadrage
const v = new THREE.Vector3();
const BOITE = [];
for (const x of [-0.1645, 0.1645]) for (const y of [-0.059, 0.059]) for (const z of [-0.2265, 0.2265]) BOITE.push([x, y, z]);
// Surface affichable de l'écran (docs/CDJ-MODEL.md), ramenée au repère centré de la racine.
const ECRAN = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const demi = (0.1172 / 2) * sz;
    ECRAN.push([-0.0001 + 0.1004 * sx, 0.1178 - 0.059 - Math.sin(0.1717) * demi, -0.1383 + Math.cos(0.1717) * demi]);
  }
}
const PLAY = [[-0.1375 - 0.0175, 0.0945 - 0.059, 0.199], [-0.1375 + 0.0175, 0.0945 - 0.059, 0.199]];
const ANNEAU = [];
for (let a = 0; a < 360; a += 5) ANNEAU.push([0.47 * Math.cos((a * Math.PI) / 180), -0.45, 0.47 * Math.sin((a * Math.PI) / 180)]);

function emprise(points, matrice) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const p of points) {
    v.set(p[0], p[1], p[2]);
    if (matrice) v.applyMatrix4(matrice);
    v.project(scene.camera);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  const pc = (n) => Math.round(n * 1000) / 10;
  return { largeur: pc((x1 - x0) / 2), hauteur: pc((y1 - y0) / 2), centreX: pc((x0 + x1) / 4 + 0.5), centreY: pc(0.5 - (y0 + y1) / 4) };
}

function mesures() {
  if (!scene.webgl) return null;
  scene.scene.updateMatrixWorld(true);
  const monde = scene.cdj.root.matrixWorld;
  const toile = scene.renderer.domElement;
  const play = emprise(PLAY, monde);
  return {
    p: scene.defilement.p,
    section: scene.defilement.section,
    fenetre: [toile.clientWidth, toile.clientHeight],
    ratioPixels: scene.renderer.getPixelRatio(),
    cdj: emprise(BOITE, monde),
    ecran: emprise(ECRAN, monde),
    anneau: emprise(ANNEAU, null),
    playPx: Math.round((play.largeur / 100) * toile.clientWidth),
    camera: scene.camera.position.toArray().map((n) => Math.round(n * 1000) / 1000),
    doublure: Boolean(scene.cdj.doublure),
  };
}

// ------------------------------------------------------------------ déplacements
function allerAP(p) {
  const y = Math.ceil(scene.defilement.scrollPourP(p));
  const lenis = scene.defilement.lenis;
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}
const aller = (cible) => {
  const cle = KEYS.find((k) => k.id === cible);
  allerAP(cle ? cle.p : Number(cible) || 0);
};

// ------------------------------------------------------------------ relevé
const elEtat = document.getElementById('releve-etat');
const elMesures = document.getElementById('releve-mesures');
const elCles = document.getElementById('releve-cles');
const boutons = KEYS.map((cle) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = cle.id;
  b.addEventListener('click', () => aller(cle.id));
  elCles.append(b);
  return { cle, b };
});

function relever() {
  const m = mesures();
  if (m) {
    const proche = KEYS.reduce((a, k) => (Math.abs(k.p - m.p) < Math.abs(a.p - m.p) ? k : a));
    const exact = Math.abs(proche.p - m.p) < 0.0015;
    elEtat.innerHTML = `p <strong>${m.p.toFixed(4)}</strong> · <strong>${m.section}</strong> · ${exact ? `<span class="actif">${proche.id}</span>` : `près de ${proche.id}`} · ${m.fenetre[0]}×${m.fenetre[1]} @${m.ratioPixels}${m.doublure ? ' · doublure' : ''}`;
    elMesures.textContent = `CDJ ${m.cdj.largeur}% L × ${m.cdj.hauteur}% H, centre ${m.cdj.centreX}% / ${m.cdj.centreY}% · écran ${m.ecran.largeur}% L, centre ${m.ecran.centreX}% · anneau ${m.anneau.largeur}% L · Play ${m.playPx}px`;
    boutons.forEach(({ cle, b }) => b.setAttribute('aria-pressed', String(exact && cle === proche)));
  }
  requestAnimationFrame(relever);
}
requestAnimationFrame(relever);

// ------------------------------------------------------------------ accès pour les captures
if (params.has('k')) aller(params.get('k'));
else if (params.has('p')) aller(params.get('p'));

window.__banc = { scene, aller, mesures, cles: KEYS };
requestAnimationFrame(() => requestAnimationFrame(() => { racine.dataset.banc = 'pret'; }));
