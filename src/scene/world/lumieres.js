// Lumière de la scène (docs/DA.md 8) : un studio à trois sources crème, plus une source vermillon.
// Environnement : trois panneaux émissifs crème rendus par PMREMGenerator, aucun fichier HDR.
// Aucune source bleue ou froide. Aucune ombre portée.
import * as THREE from 'three';
import { DA } from './da.js';

// Intensités relatives par section (1 = réglage de base).
export const PREREGLAGES = {
  ouverture: { key: 0.8, rim: 1.6, accent: 0, ecran: 0.4 },
  sons: { key: 1.2, rim: 1.0, accent: 0, ecran: 1 },
  dates: { key: 0.3, rim: 1.8, accent: 0.5, ecran: 0.3 },
  avec: { key: 1.0, rim: 0.6, accent: 0, ecran: 0.4 },
  bio: { key: 0.5, rim: 0.8, accent: 0, ecran: 1.2 },
  contact: { key: 0.3, rim: 1.2, accent: 0.6, ecran: 0.2 },
};

// Réglage de base, fait à l'œil dans la scène réelle. Critère (DA 8) : hors reflets, le dessus
// du CDJ ne dépasse pas le gris clair de sa texture, pour que le vermillon garde 4:1 dessus.
// Mesuré dans sons, le préréglage le plus clair. Détail : docs/CAMERA-FINAL.md.
export const BASE = { key: 1.0, rim: 2.2, accent: 0.35, env: 0.75 };

const LECTURE_MIN = 0.8; // en lecture, la source vermillon monte à 0,8 au moins
const BATTEMENT = 0.15; // et bat de ±15 % sur chaque temps

function rendreEnvironnement(renderer) {
  const decor = new THREE.Scene();
  const creme = new THREE.Color(DA.color.creme);
  const panneau = (largeur, hauteur, position, intensite) => {
    const maille = new THREE.Mesh(
      new THREE.PlaneGeometry(largeur, hauteur),
      new THREE.MeshBasicMaterial({ color: creme.clone().multiplyScalar(intensite), side: THREE.DoubleSide }),
    );
    maille.position.set(...position);
    maille.lookAt(0, 0, 0);
    decor.add(maille);
  };
  // Panneaux longs et étroits : des reflets longs et nets sur le plastique et le jog.
  // Celui du dessus penche vers l'avant : c'est lui qui éclaire le CDJ quand il est incliné
  // vers la caméra (ouverture, contact). Celui de gauche, à hauteur d'appareil, trace le
  // liseré du dessus quand la caméra rase la tranche droite (dates).
  panneau(3.8, 0.5, [0, 2.4, 1.9], 11); // au-dessus, vers l'avant
  panneau(0.4, 3.0, [2.4, 1.2, -2.6], 12); // derrière à droite
  panneau(0.35, 2.8, [-3.0, 0.8, 0], 8); // à gauche

  const pmrem = new THREE.PMREMGenerator(renderer);
  const cible = pmrem.fromScene(decor, 0, 0.1, 20);
  pmrem.dispose();
  decor.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return cible;
}

export function createLumieres({ renderer, scene }) {
  const creme = new THREE.Color(DA.color.creme);

  const key = new THREE.DirectionalLight(creme, 0);
  key.name = 'key';
  key.position.set(-0.7, 1.3, 0.9);

  const rim = new THREE.DirectionalLight(creme, 0);
  rim.name = 'rim';
  rim.position.set(0.9, 0.5, -1.2);

  const accent = new THREE.PointLight(DA.color.accent, 0, 1.2, 2);
  accent.name = 'accent';
  accent.position.set(-0.35, 0.25, 0.45);

  scene.add(key, rim, accent);

  let environnement = null;
  // perdu : le contexte WebGL vient d'être restauré, l'ancienne cible n'existe plus côté carte.
  const regenerer = ({ perdu = false } = {}) => {
    if (!perdu) environnement?.dispose();
    environnement = rendreEnvironnement(renderer);
    scene.environment = environnement.texture;
  };
  regenerer();

  return {
    key,
    rim,
    accent,
    // niveaux : { key, rim, accent } relatifs, interpolés par la timeline.
    // lecture : un titre joue. phase : position dans le temps musical courant, 0 à 1.
    // allumage : { rim, key } de 0 à 1, pour l'arrivée (le liseré d'abord, le dessus ensuite).
    regler(niveaux, { lecture = false, phase = null, allumage = null } = {}) {
      const montee = allumage || { rim: 1, key: 1 };
      key.intensity = BASE.key * niveaux.key * montee.key;
      rim.intensity = BASE.rim * niveaux.rim * montee.rim;
      let a = lecture ? Math.max(niveaux.accent, LECTURE_MIN) : niveaux.accent;
      if (lecture && phase !== null) a *= 1 + BATTEMENT * Math.cos(phase * Math.PI * 2);
      accent.intensity = BASE.accent * a * montee.key;
      // Les reflets du studio suivent les deux sources : ils dessinent le noir sur le noir.
      scene.environmentIntensity = BASE.env * (0.6 * niveaux.key * montee.key + 0.4 * niveaux.rim * montee.rim);
    },
    regenerer,
    dispose() {
      scene.remove(key, rim, accent);
      environnement?.dispose();
      if (scene.environment === environnement?.texture) scene.environment = null;
    },
  };
}
