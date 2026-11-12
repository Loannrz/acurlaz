// Doublure du CDJ : une boîte aux cotes réelles (329 × 453 × 118 mm) avec la même API que
// src/scene/cdj/index.js. Elle sert tant que le vrai CDJ manque ou échoue au chargement, et
// porte les repères utiles au cadrage : jog, écran incliné, bouton Play.
// Repère local (docs/CDJ-MODEL.md) : origine au bas du châssis, +Z côté DJ. Le groupe racine
// est centré sur le volume, comme le demande DA 13.6.
import * as THREE from 'three';
import { DA } from './da.js';

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
const melange = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);

const ECRAN = { centre: [-0.0001, 0.1178, -0.1383], largeur: 0.2008, hauteur: 0.1172, inclinaison: 0.1717 };
const JOG = { centre: [0, 0.1, 0.081], rayon: 0.1037, plateau: 0.078, hauteur: 0.0166 };
const PLAY = { x: -0.1375, z: 0.199, rayon: 0.0175, zone: 0.026 };
const DESSUS = 0.0945; // surface plane du dessus, en mètres

const duree = (s) => {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export async function createCdj() {
  const root = new THREE.Group();
  root.name = 'cdj-doublure';
  const cdj = new THREE.Group();
  cdj.name = 'cdj';
  cdj.position.set(0, -0.059, 0);
  root.add(cdj);

  const plastique = new THREE.MeshStandardMaterial({ color: melange(DA.color.noir, DA.color.creme, 0.07), metalness: 0.1, roughness: 0.55 });
  const brillant = new THREE.MeshStandardMaterial({ color: melange(DA.color.noir, DA.color.creme, 0.02), metalness: 0, roughness: 0.18 });
  const metal = new THREE.MeshStandardMaterial({ color: melange(DA.color.noir, DA.color.creme, 0.45), metalness: 1, roughness: 0.35 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.329, DESSUS, 0.453), plastique);
  chassis.position.y = DESSUS / 2;
  cdj.add(chassis);

  // Pupitre de l'écran : il porte la hauteur totale à 118 mm.
  const pupitre = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, 0.145), plastique);
  pupitre.position.set(ECRAN.centre[0], ECRAN.centre[1] - 0.016, ECRAN.centre[2]);
  pupitre.rotation.x = ECRAN.inclinaison;
  cdj.add(pupitre);

  // ---- écran : plan non éclairé, dessiné avec les trois encres
  const toile = document.createElement('canvas');
  toile.width = 512;
  toile.height = 299;
  const ctx = toile.getContext('2d');
  const texture = new THREE.CanvasTexture(toile);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ecran = new THREE.Mesh(
    new THREE.PlaneGeometry(ECRAN.largeur, ECRAN.hauteur),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  ecran.name = 'ecran';
  ecran.position.set(...ECRAN.centre);
  ecran.rotation.x = -Math.PI / 2 + ECRAN.inclinaison;
  cdj.add(ecran);

  let affiche = '';
  const dessinerEcran = (info = {}) => {
    const { title = '', artist = '', time = 0, duration = 0, bpm = '', key = '' } = info;
    const signature = [title, artist, Math.floor(time), Math.floor(duration), bpm, key].join('|');
    if (signature === affiche) return;
    affiche = signature;
    const { width: w, height: h } = toile;
    ctx.fillStyle = css(DA.color.noir);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css(DA.color.creme);
    ctx.textBaseline = 'alphabetic';
    // Un visiteur peut voir cette doublure si le modèle ne se charge pas : libellés de la DA 12.
    ctx.font = '600 20px "Martian Mono Variable", monospace';
    ctx.fillText(title ? 'CHARGÉ' : 'EN ATTENTE', 28, 44);
    ctx.font = '800 46px "Bricolage Grotesque Variable", sans-serif';
    ctx.fillText(title || 'Choisir un titre, puis Play.', 28, 124, w - 56);
    ctx.font = '400 22px "Martian Mono Variable", monospace';
    ctx.fillText(artist, 28, 166, w - 56);
    ctx.fillText(`${duree(time)} / ${duree(duration)}`, 28, 262);
    if (bpm) ctx.fillText(`${bpm} BPM  ${key}`, w - 220, 262);
    // tête de lecture
    ctx.fillRect(28, 208, w - 56, 2);
    ctx.fillStyle = css(DA.color.accent);
    const k = duration > 0 ? Math.min(1, time / duration) : 0;
    ctx.fillRect(28 + k * (w - 56) - 2, 196, 4, 26);
    texture.needsUpdate = true;
  };
  dessinerEcran();

  // ---- jog : pièce tournante, index crème pour lire la rotation
  const jog = new THREE.Group();
  jog.name = 'jog';
  jog.position.set(JOG.centre[0], DESSUS, JOG.centre[2]);
  const couronne = new THREE.Mesh(new THREE.CylinderGeometry(JOG.rayon, JOG.rayon, JOG.hauteur, 64), metal);
  couronne.position.y = JOG.hauteur / 2;
  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(JOG.plateau, JOG.plateau, 0.002, 64), brillant);
  plateau.position.y = JOG.hauteur + 0.001;
  const index = new THREE.Mesh(
    new THREE.PlaneGeometry(0.004, 0.03),
    new THREE.MeshBasicMaterial({ color: DA.color.creme, toneMapped: false }),
  );
  index.rotation.x = -Math.PI / 2;
  index.position.set(0, JOG.hauteur + 0.0024, -0.055);
  jog.add(couronne, plateau, index);
  cdj.add(jog);

  // ---- bouton Play : voyant plat, zone de clic élargie à 26 mm (DA 11)
  const voyant = new THREE.Mesh(
    new THREE.RingGeometry(PLAY.rayon - 0.003, PLAY.rayon, 48),
    new THREE.MeshBasicMaterial({ color: DA.color.accent, toneMapped: false }),
  );
  voyant.name = 'voyant-play';
  voyant.rotation.x = -Math.PI / 2;
  voyant.position.set(PLAY.x, DESSUS + 0.0003, PLAY.z);
  cdj.add(voyant);

  const zone = new THREE.Mesh(new THREE.CircleGeometry(PLAY.zone, 24), new THREE.MeshBasicMaterial({ visible: false }));
  zone.name = 'zone-play';
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(PLAY.x, DESSUS + 0.001, PLAY.z);
  zone.userData.action = 'play';
  cdj.add(zone);

  // ---- lecture : montée et frein du jog (DA 7)
  const rappels = new Set();
  let lecture = false;
  let allure = 0; // 0 à l'arrêt, 1 à pleine vitesse
  const pleineVitesse = (DA.jog.rpm / 60) * Math.PI * 2; // radians par seconde

  // Même protocole que le vrai CDJ : la scène appelle pressPlay, qui prévient les abonnés.
  const pressPlay = () => rappels.forEach((rappel) => rappel());
  zone.userData.press = pressPlay;

  return {
    root,
    jog,
    doublure: true,
    pressPlay,
    pickables: [zone],
    setPlaying(etat) {
      lecture = Boolean(etat);
    },
    setScreen: dessinerEcran,
    onPlayPress(rappel) {
      if (typeof rappel !== 'function') return () => {};
      rappels.add(rappel);
      return () => rappels.delete(rappel);
    },
    update(dt) {
      const cible = lecture ? 1 : 0;
      if (allure !== cible) {
        const pas = dt / (lecture ? DA.jog.spinUp : DA.jog.brake);
        allure = lecture ? Math.min(1, allure + pas) : Math.max(0, allure - pas);
      }
      if (allure > 0) jog.rotation.y -= pleineVitesse * allure * dt;
      return allure > 0;
    },
    dispose() {
      root.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    },
  };
}
