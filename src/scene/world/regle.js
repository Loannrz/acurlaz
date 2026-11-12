// Règle de dates (section dates, docs/DA.md 8) : une graduation par jour sur 60 jours, le long
// de l'axe Z sous le CDJ. Traits crème de 2 cm, dates de concert en traits vermillon de 6 cm.
// Elle glisse sous l'appareil avec le défilement.
//
// Hauteur : y = -0,12 m, la DA dit -0,2. Dans dates, le CDJ est cadré bas pour laisser lire
// le mot géant au-dessus de lui : à -0,2 la règle sortait de l'image (docs/CAMERA-FINAL.md 5).
//
// La règle défile dans une fenêtre fixe : un trait grandit en y entrant et se rétracte en
// sortant. Les formes glissent, rien ne fond (DA 7). Traits d'un pixel CSS, en segments
// épais (LineSegments2), couleur exacte (matière non tonemappée).
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { DA, borne, lisse } from './da.js';

const JOUR = 86400000;
const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Rangs (0 = aujourd'hui) des jours de concert dans la fenêtre de la règle.
export function rangsDeConcert(dates = [], jours = 60, maintenant = new Date()) {
  const depart = minuit(maintenant);
  const rangs = new Set();
  for (const d of dates) {
    const quand = d?.when instanceof Date ? d.when : new Date(`${d?.date}T12:00:00`);
    if (Number.isNaN(quand.getTime())) continue;
    const rang = Math.round((minuit(quand) - depart) / JOUR);
    if (rang >= 0 && rang < jours) rangs.add(rang);
  }
  return rangs;
}

export function createRegle({
  dates = [],
  jours = 60,
  y = -0.12,
  pas = 0.03, // mètres entre deux jours
  court = 0.02,
  long = 0.06,
  course = 36, // jours parcourus par le glissement sur toute sa piste
  maintenant = new Date(),
} = {}) {
  const concerts = rangsDeConcert(dates, jours, maintenant);
  const creme = new THREE.Color(DA.color.creme);
  const accent = new THREE.Color(DA.color.accent);

  const positions = new Float32Array(jours * 6);
  const couleurs = new Float32Array(jours * 6);
  const geometrie = new LineSegmentsGeometry();
  geometrie.setPositions(positions);
  geometrie.setColors(couleurs);
  geometrie.instanceCount = 0;

  const matiere = new LineMaterial({
    color: new THREE.Color(1, 1, 1),
    vertexColors: true,
    linewidth: 1, // pixels CSS : la résolution suit le viewport logique du renderer
    worldUnits: false,
    toneMapped: false,
  });

  const traits = new LineSegments2(geometrie, matiere);
  traits.name = 'regle';
  traits.frustumCulled = false;
  traits.visible = false;

  // Fenêtre où la règle est visible, le long de Z. Vue de profil droit (section dates),
  // +Z est à gauche de l'image : le temps se lit de gauche à droite, vers -Z.
  const fenetre = { zGauche: 0.62, longueur: 0.92, zDepart: 0.04, bord: 0.09 };
  let derniere = [-1, -1];

  function poser(ouverture, glisse) {
    if (ouverture === derniere[0] && glisse === derniere[1]) return;
    derniere = [ouverture, glisse];
    let n = 0;
    if (ouverture > 0) {
      const { zGauche, longueur, zDepart, bord } = fenetre;
      for (let i = 0; i < jours; i += 1) {
        const z = zDepart + (glisse * course - i) * pas;
        const u = zGauche - z; // distance à l'extrémité gauche de la fenêtre
        if (u <= 0 || u >= longueur) continue;
        const effile = lisse(0, bord, u) * lisse(0, bord, longueur - u);
        const pousse = lisse(0, 1, borne((ouverture - 0.6 * (u / longueur)) / 0.4));
        const hauteur = (concerts.has(i) ? long : court) * effile * pousse;
        if (hauteur < 0.0005) continue;
        const c = concerts.has(i) ? accent : creme;
        const o = n * 6;
        positions[o] = 0; positions[o + 1] = y; positions[o + 2] = z;
        positions[o + 3] = 0; positions[o + 4] = y - hauteur; positions[o + 5] = z;
        couleurs[o] = c.r; couleurs[o + 1] = c.g; couleurs[o + 2] = c.b;
        couleurs[o + 3] = c.r; couleurs[o + 4] = c.g; couleurs[o + 5] = c.b;
        n += 1;
      }
      geometrie.attributes.instanceStart.data.needsUpdate = true;
      geometrie.attributes.instanceColorStart.data.needsUpdate = true;
    }
    geometrie.instanceCount = n;
    traits.visible = n > 0;
  }

  return {
    objet: traits,
    concerts,
    poser,
    // Fenêtre recentrée sous l'appareil quand le cadrage est centré (mobile).
    cadrer(reglage) {
      Object.assign(fenetre, reglage);
      derniere = [-1, -1];
    },
    dispose() {
      geometrie.dispose();
      matiere.dispose();
    },
  };
}
