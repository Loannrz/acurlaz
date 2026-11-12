// Anneaux de noms (section avec, docs/DA.md 8) : les artistes en cercle sur l'étiquette du
// disque, rayons 0,39 et 0,47 m, crème, CanvasTexture 2048 px. Rotation pilotée par le
// défilement, les deux anneaux en sens contraires.
//
// Anneau intérieur à 0,39 m, la DA dit 0,36 : vu à 84° d'élévation, le CDJ paraît décalé de
// 5 cm par rapport à l'étiquette, 45 cm plus bas. À 0,36 m un de ses coins coupait toujours
// un nom (docs/CAMERA-FINAL.md 5).
//
// Aplat crème non tonemappé : le hex sort exact. Chaque lettre porte un liseré noir, comme
// une réserve en sérigraphie : invisible sur le fond noir, il garde les noms lisibles quand
// ils passent devant le mot géant crème. Les anneaux apparaissent par balayage d'arc
// (une découpe, pas un fondu : DA 7).
import * as THREE from 'three';
import { DA, borne } from './da.js';

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

const FAMILLE = '"Bricolage Grotesque Variable", sans-serif';
const GRAISSE = 800;
const SEGMENTS = 180;

const SONDE = `${GRAISSE} 96px ${FAMILLE}`;
const policePrete = () => Boolean(document.fonts?.check?.(SONDE, 'acurlz'));

async function attendrePolice() {
  if (!document.fonts?.load) return;
  const delai = new Promise((r) => setTimeout(r, 3000));
  try {
    await Promise.race([document.fonts.load(SONDE, 'acurlz'), delai]);
  } catch {
    /* la police de repli fera l'affaire */
  }
}

// Répartit les noms sur les deux anneaux au prorata des circonférences.
// Rend [rangs de l'anneau intérieur, rangs de l'anneau extérieur].
function repartir(largeurs, [rInt, rExt]) {
  const total = largeurs.reduce((s, w) => s + w, 0);
  const part = rExt / (rInt + rExt);
  const lots = [[], []];
  let cumul = 0;
  largeurs.forEach((w, i) => {
    (cumul + w / 2 < part * total ? lots[1] : lots[0]).push(i);
    cumul += w;
  });
  return lots;
}

function dessiner({ noms, rayons, etendue, taille, corpsMax, lisere }) {
  const toile = document.createElement('canvas');
  toile.width = taille;
  toile.height = taille;
  const ctx = toile.getContext('2d');
  ctx.clearRect(0, 0, taille, taille);
  if (!noms.length) return toile;

  const echelle = taille / etendue; // pixels par mètre
  const REF = 100;
  const police = (corps) => `${GRAISSE} ${corps}px ${FAMILLE}`;
  ctx.font = police(REF);
  const largeursRef = noms.map((nom) => ctx.measureText(nom).width);
  const lots = repartir(largeursRef, rayons);

  // Même corps sur les deux anneaux : le plus grand qui tient partout, séparateurs compris.
  const BLANC_MIN = 0.9; // en corps
  let corps = corpsMax * echelle;
  rayons.forEach((rayon, a) => {
    if (!lots[a].length) return;
    const largeur = lots[a].reduce((s, i) => s + largeursRef[i], 0) / REF; // en corps
    const tour = 2 * Math.PI * rayon * echelle;
    corps = Math.min(corps, tour / (largeur + lots[a].length * BLANC_MIN));
  });

  ctx.font = police(corps);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const centre = taille / 2;

  // Plan de pose : chaque signe avec son angle et son rayon de ligne de base.
  const signes = [];
  const points = [];
  rayons.forEach((rayon, a) => {
    const lot = lots[a];
    if (!lot.length) return;
    // La bande des minuscules est centrée sur le rayon nominal.
    const R = rayon * echelle - corps * 0.27;
    const largeurs = lot.map((i) => ctx.measureText(noms[i]).width);
    const tour = 2 * Math.PI * R;
    const blanc = (tour - largeurs.reduce((s, w) => s + w, 0)) / lot.length;
    let curseur = 0; // longueur d'arc parcourue, en pixels
    lot.forEach((i, n) => {
      const nom = noms[i];
      // Avance cumulée mesurée sur le préfixe : le crénage de la police est conservé.
      for (let c = 0; c < nom.length; c += 1) {
        const avant = ctx.measureText(nom.slice(0, c)).width;
        const apres = ctx.measureText(nom.slice(0, c + 1)).width;
        signes.push({ signe: nom[c], angle: (curseur + (avant + apres) / 2) / R, R });
      }
      // Séparateur : un point médian carré, à mi-hauteur des minuscules.
      points.push({ angle: (curseur + largeurs[n] + blanc / 2) / R, R: R + corps * 0.27 });
      curseur += largeurs[n] + blanc;
    });
  });

  const poser = (angle, dessin) => {
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(angle);
    dessin();
    ctx.restore();
  };
  const cote = corps * 0.15;

  // Première passe : la réserve noire de tous les signes. Seconde passe : l'encre crème.
  ctx.strokeStyle = css(DA.color.noir);
  ctx.lineWidth = 2 * lisere * echelle;
  ctx.lineJoin = 'round';
  for (const { signe, angle, R } of signes) poser(angle, () => ctx.strokeText(signe, 0, -R));
  for (const { angle, R } of points) poser(angle, () => ctx.strokeRect(-cote / 2, -R - cote / 2, cote, cote));
  ctx.fillStyle = css(DA.color.creme);
  for (const { signe, angle, R } of signes) poser(angle, () => ctx.fillText(signe, 0, -R));
  for (const { angle, R } of points) poser(angle, () => ctx.fillRect(-cote / 2, -R - cote / 2, cote, cote));
  return toile;
}

export function createAnneaux({
  noms = [],
  rayons = [0.39, 0.47],
  y = -0.449,
  taille = 2048,
  corpsMax = 0.052, // mètres
  lisere = 0.006, // mètres
  anisotropie = 1,
  surPeinture = null, // appelé quand la texture vient d'être (re)dessinée : il faut une image
} = {}) {
  const groupe = new THREE.Group();
  groupe.name = 'anneaux';
  groupe.position.y = y;
  groupe.rotation.x = -Math.PI / 2; // à plat, face vers le haut
  groupe.visible = false;

  const [rInt, rExt] = rayons;
  const milieu = (rInt + rExt) / 2;
  const marge = 0.065;
  const etendue = 2 * (rExt + marge);
  const libelles = noms.map((n) => String(n).toLocaleLowerCase('fr'));

  const matiere = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  const anneau = (r0, r1) => {
    const geo = new THREE.RingGeometry(r0, r1, SEGMENTS, 1);
    // UV planes : les deux anneaux lisent la même texture carrée.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / etendue + 0.5, pos.getY(i) / etendue + 0.5);
    geo.setDrawRange(0, 0);
    const maille = new THREE.Mesh(geo, matiere);
    maille.renderOrder = -1;
    groupe.add(maille);
    return maille;
  };
  const interieur = anneau(rInt - marge, milieu);
  const exterieur = anneau(milieu, rExt + marge);

  let texture = null;
  let jete = false;
  let derniere = [-1, -1];

  const peindre = () => {
    if (jete) return;
    const toile = dessiner({ noms: libelles, rayons, etendue, taille, corpsMax, lisere });
    texture?.dispose();
    texture = new THREE.CanvasTexture(toile);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropie;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    matiere.map = texture;
    matiere.needsUpdate = true;
    derniere = [-1, -1]; // la prochaine pose rend les anneaux visibles
    // Le rendu se fait à la demande : sans ce signal, une police arrivée tard laisserait
    // les anneaux invisibles jusqu'au prochain geste.
    surPeinture?.();
  };

  // Un échec de dessin laisse seulement les anneaux invisibles : la scène démarre quand même.
  const pret = attendrePolice()
    .then(() => {
      const juste = policePrete();
      peindre();
      // Police arrivée après le délai : on redessine une fois, avec la bonne.
      if (!juste) document.fonts?.ready?.then(() => policePrete() && peindre()).catch(() => {});
    })
    .catch((erreur) => console.warn('[scene] anneaux de noms indisponibles.', erreur));

  return {
    objet: groupe,
    pret,
    rayons,
    // ouverture : 0 à 1, balayage d'arc. tour : 0 à 1, rotation pilotée par le défilement.
    poser(ouverture, tour) {
      if (ouverture === derniere[0] && tour === derniere[1]) return;
      derniere = [ouverture, tour];
      const k = borne(ouverture);
      groupe.visible = k > 0 && Boolean(texture);
      // L'anneau extérieur ouvre le balayage, l'intérieur le suit.
      exterieur.geometry.setDrawRange(0, Math.round(borne(k / 0.8) * SEGMENTS) * 6);
      interieur.geometry.setDrawRange(0, Math.round(borne((k - 0.2) / 0.8) * SEGMENTS) * 6);
      exterieur.rotation.z = -tour * 1.1;
      interieur.rotation.z = 0.6 + tour * 1.5;
    },
    dispose() {
      jete = true;
      interieur.geometry.dispose();
      exterieur.geometry.dispose();
      matiere.dispose();
      texture?.dispose();
    },
  };
}
