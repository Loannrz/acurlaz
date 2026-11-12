// Pièces reconstruites du CDJ : jog, boutons Play et Cue, molette de navigation, voyants.
// Le glb ne modèle ces contrôles qu'en prismes grossiers peints (docs/CDJ-MODEL.md) :
// on les remplace par des pièces de révolution nettes.
//
// Conventions : géométries écrites en millimètres puis rendues en mètres,
// base posée sur le panneau (y = 0), axe de révolution = +y, midi = -z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const MM = 0.001;
const toMetres = (g) => { g.scale(MM, MM, MM); g.computeBoundingSphere(); return g; };

// Surface de révolution lisse. `profile` : [[rayon, y], ...] parcouru matière à gauche
// (flanc extérieur en montant, dessus en allant vers l'axe) pour que les faces regardent dehors.
// Une arête vive = deux appels : les normales ne bavent pas d'une surface à l'autre.
function lathe(profile, segments = 96) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  g.deleteAttribute('uv');
  return g;
}

// Révolution dont le profil est déplacé selon l'angle (empreintes de la couronne du jog).
// offset(angle, indice du profil) rend [décalage du rayon, décalage en hauteur].
function revolve(profile, segments, offset) {
  const rings = profile.length;
  const pos = new Float32Array(rings * segments * 3);
  for (let i = 0; i < rings; i++) {
    const [r, y] = profile[i];
    for (let s = 0; s < segments; s++) {
      const t = (s / segments) * TAU;
      const [dr, dy] = offset(t, i);
      const rr = Math.max(0, r + dr);
      const o = (i * segments + s) * 3;
      pos[o] = Math.sin(t) * rr;
      pos[o + 1] = y + dy;
      pos[o + 2] = Math.cos(t) * rr;
    }
  }
  const idx = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * segments + s, b = i * segments + ((s + 1) % segments);
      const c = (i + 1) * segments + ((s + 1) % segments), d = (i + 1) * segments + s;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Anneau plat regardant vers le haut, entre deux rayons, à la hauteur y.
function flatRing(r0, r1, y, segments = 128, start = 0, length = TAU) {
  const g = new THREE.RingGeometry(r0, r1, segments, 1, start, length);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  g.deleteAttribute('uv');
  return g;
}

const merge = (list) => toMetres(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false));

// --- jog -------------------------------------------------------------------
// Cotes du jog du CDJ-3000 reconstruit (mm). Le plateau tourne ; l'afficheur
// central et la collerette posée sur le panneau restent fixes.
export const JOG = {
  height: 16.6, // dessus du plateau
  rDisplay: 33.6, // afficheur central
  rPlatter: 78, // bord du plateau brillant
  rBevel: 80.7, // fin du chanfrein poli
  rOut: 103.7, // pied de la couronne
  dimples: 22,
  bezel: { r0: 100.5, r1: 112.2, height: 1.2 }, // collerette fixe : passe sous la couronne et recouvre l'anneau peint (r 104,5 à 111)
  arc: { r0: 106.5, r1: 109.9 }, // arc de progression, sur la collerette
  index: { r0: 60, r1: 75.5, width: 2.6 }, // index crème du plateau
};

export function jogGeometries() {
  const { height: H, rDisplay, rPlatter, rBevel, rOut, dimples, bezel, arc, index } = JOG;

  // Plateau : dessus plat et lèvre intérieure qui descend vers l'afficheur.
  const platter = merge([
    lathe([[rPlatter, H], [rDisplay, H]], 160),
    lathe([[rDisplay, H], [rDisplay, H - 1.1]], 160),
  ]);

  // Chanfrein poli entre le plateau et la couronne.
  const bevel = toMetres(lathe([[rBevel, H - 1.25], [rBevel - 0.7, H - 0.62], [rPlatter + 1.2, H - 0.18], [rPlatter, H]], 160));

  // Couronne en pente, creusée de 22 empreintes de doigt rondes, puis jupe jusqu'au panneau.
  const steps = 26;
  const yFoot = 2.2, yTop = H - 1.25;
  const run = rOut - rBevel, rise = yTop - yFoot;
  const length = Math.hypot(run, rise); // longueur de la pente
  const outward = [rise / length, run / length]; // normale de la pente, vers l'extérieur
  const slope = [[rOut, 0], [rOut, yFoot * 0.55]];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps; // 0 au pied, 1 au chanfrein
    slope.push([rOut - run * s, yFoot + rise * s]);
  }
  const dimple = { radius: 7.2, depth: 1.7, at: 0.5 }; // mm, centre à mi-pente
  const none = [0, 0];
  const crown = toMetres(revolve(slope, dimples * 24, (t, i) => {
    if (i < 2) return none;
    const s = (i - 2) / steps;
    const r = rOut - run * s;
    const k = Math.round((t / TAU) * dimples);
    const across = (t - (k * TAU) / dimples) * r;
    const along = (s - dimple.at) * length;
    const q = (across * across + along * along) / (dimple.radius * dimple.radius);
    if (q >= 1) return none;
    const sink = dimple.depth * (1 - q) ** 1.5; // bord tangent à la pente : pas de crénelage au maillage
    return [-outward[0] * sink, -outward[1] * sink];
  }));

  // Collerette fixe autour du jog.
  const collar = merge([
    lathe([[bezel.r1, 0], [bezel.r1, bezel.height - 0.25], [bezel.r1 - 0.25, bezel.height]], 160),
    lathe([[bezel.r1 - 0.25, bezel.height], [bezel.r0, bezel.height]], 160),
    lathe([[bezel.r0, bezel.height], [bezel.r0, 0]], 160),
  ]);

  // Afficheur central : disque dont les uv couvrent le carré de la texture.
  const display = new THREE.CircleGeometry(rDisplay - 0.2, 96);
  display.rotateX(-Math.PI / 2);
  display.translate(0, H - 0.7, 0);
  toMetres(display);

  // Arc de progression : 360 pas dans le sens horaire depuis midi (-z).
  // setDrawRange(0, n * 6) n'en montre que les n premiers degrés.
  const arcGeo = new THREE.BufferGeometry();
  {
    const n = 360;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU;
      const x = Math.sin(t), z = -Math.cos(t);
      pos.set([x * arc.r0, 0, z * arc.r0, x * arc.r1, 0, z * arc.r1], i * 6);
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    arcGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    arcGeo.setIndex(idx);
    arcGeo.translate(0, bezel.height + 0.3, 0);
    toMetres(arcGeo);
  }

  // Index crème : un trait radial sur le plateau, à midi.
  const mark = new THREE.PlaneGeometry(index.width, index.r1 - index.r0);
  mark.rotateX(-Math.PI / 2);
  mark.translate(0, H + 0.3, -(index.r0 + index.r1) / 2);
  mark.deleteAttribute('uv');
  toMetres(mark);

  return { platter, bevel, crown, collar, display, arc: arcGeo, arcSteps: 360, index: mark };
}

// --- boutons Play et Cue -----------------------------------------------------
// Bouton rond du CDJ-3000 : capuchon d'aluminium brossé dans un anneau lumineux.
export const BUTTON = {
  rRing: 18.4, // bord extérieur de l'anneau
  rCap: 15.0, // bord du capuchon
  ringTop: 3.0,
  capTop: 3.7,
  travel: 1.0, // course à l'appui
  rHit: 26, // zone de clic élargie (DA 11)
};

export function buttonGeometries() {
  const { rRing, rCap, ringTop, capTop } = BUTTON;
  const round = 0.5;

  // Anneau : flanc, arrondi, dessus plat, paroi intérieure.
  const ringProfile = [[rRing, 0], [rRing, ringTop - round]];
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    ringProfile.push([rRing - round + Math.cos(a) * round, ringTop - round + Math.sin(a) * round]);
  }
  const ring = merge([
    lathe(ringProfile, 96),
    lathe([[rRing - round, ringTop], [rCap + 0.35, ringTop]], 96),
    lathe([[rCap + 0.35, ringTop], [rCap + 0.35, 0.6]], 96),
  ]);

  // Capuchon : flanc, arrondi, dessus à peine bombé.
  const capProfile = [[rCap, 0.6], [rCap, capTop - round]];
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    capProfile.push([rCap - round + Math.cos(a) * round, capTop - round + Math.sin(a) * round]);
  }
  const cap = merge([
    lathe(capProfile, 96),
    lathe([[rCap - round, capTop], [rCap * 0.5, capTop + 0.12], [0, capTop + 0.16]], 96),
  ]);

  // Voyant réduit à son contour (pause, mouvement réduit) : filet sur le bord de l'anneau.
  const outline = toMetres(flatRing(rRing - round - 1.0, rRing - round, ringTop + 0.05, 96));

  // Marquage imprimé sur le capuchon : carré porteur d'une texture.
  const label = new THREE.PlaneGeometry(rCap * 1.5, rCap * 1.5);
  label.rotateX(-Math.PI / 2);
  label.translate(0, capTop + 0.2, 0);
  toMetres(label);

  // Zone de clic : disque invisible au-dessus du bouton.
  const hit = new THREE.CircleGeometry(BUTTON.rHit, 32);
  hit.rotateX(-Math.PI / 2);
  hit.translate(0, capTop + 0.3, 0);
  toMetres(hit);

  return { ring, cap, outline, label, hit };
}

// --- molette de navigation ---------------------------------------------------------
// À droite de l'écran : une tourelle inclinée, coiffée d'un bouton moleté.
// Origine au centre du dessus de la tourelle, axe = +y (orienté ensuite sur la pente).
// towerRadius et knobRadius : rayons des prismes d'origine, mesurés à leurs sommets.
export function browseGeometries({ towerRadius = 24, knobRadius = 12.7, knobHeight = 8.3 } = {}) {
  const R = towerRadius - 0.5;
  const tower = merge([
    lathe([[R, -46], [R, -1.1]], 96),
    lathe([[R, -1.1], [R - 0.35, -0.4], [R - 1.1, 0]], 96),
    lathe([[R - 1.1, 0], [knobRadius + 0.9, 0]], 96),
  ]);

  // Bouton : flanc moleté, chanfrein, dessus creusé d'une cuvette légère.
  const r = knobRadius - 0.4;
  const h = knobHeight;
  const ridges = 40;
  const side = [[r, -0.6], [r, 0.5], [r, h - 1.3], [r - 0.25, h - 0.9]];
  const none = [0, 0];
  const grip = revolve(side, ridges * 6, (t, i) => (i === 1 || i === 2 ? [-0.32 * (0.5 - 0.5 * Math.cos(ridges * t)) ** 1.5, 0] : none));
  grip.deleteAttribute('uv');
  const knob = merge([
    grip,
    lathe([[r - 0.25, h - 0.9], [r - 0.6, h - 0.3], [r - 1.3, h]], 96),
    lathe([[r - 1.3, h], [r - 2.2, h - 0.05], [r * 0.5, h - 0.45], [0, h - 0.55]], 96),
  ]);
  // Bague polie au pied du bouton.
  const k = knobRadius;
  const ring = merge([
    lathe([[k + 2.7, 0], [k + 2.7, 0.45], [k + 2.3, 0.85]], 96),
    lathe([[k + 2.3, 0.85], [k + 0.3, 0.85]], 96),
  ]);
  return { tower, knob, ring };
}
