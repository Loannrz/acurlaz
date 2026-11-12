// Clés de caméra du voyage (docs/DA.md 13.7), réglées à l'œil dans la scène réelle.
// Valeurs finales et écarts avec la DA : docs/CAMERA-FINAL.md.
//
// Règle de réglage : le mot géant de chaque section reste lisible. Le CDJ passe devant lui
// sans couvrir une lettre entière. Dates : le CDJ sous le mot, sur le pied des lettres.
// Avec : le groupe au-dessus du mot. Bio : le CDJ entier, logé au-dessus du « o ».
// Contact : le CDJ au bout du mot. Bandeau mobile : le CDJ sous le mot, centré comme lui.
//
// Position caméra = cible + d · (sin θ · cos φ, sin φ, cos θ · cos φ), angles en degrés, mètres.
// On interpole θ, φ, d, la cible, la focale, le cadrage et le rig, jamais la position
// cartésienne. θ n'est pas ramené entre 0 et 360 : il croît de -14 à 360 sur le voyage.

export const SECTIONS = ['ouverture', 'sons', 'dates', 'avec', 'bio', 'contact'];

// id, p, section, θ, φ, d, d mobile, cible, focale (champ vertical), cadrage, rig, flottement,
// compléments.
// Flottement : part de l'amplitude DA.float. 0,3 dans sons (DA 9, le bouton Play reste stable),
// 0,5 dans bio (dans le bandeau mobile le plan est serré : l'écran ne doit pas monter sur le mot).
// Compléments, tous facultatifs :
//   cm  cadrage dans le bandeau mobile [x, y], en fraction du bandeau. [0, 0] par défaut.
//   ch  décalage horizontal supplémentaire, en fraction de la HAUTEUR de la fenêtre
//       (ordinateur). Sert quand le CDJ se cale sur un mot dont la taille suit la hauteur
//       (« contact », 30 svh) : la composition tient alors à tous les ratios.
//   cl  décalage vertical supplémentaire, en fraction de la LARGEUR de la fenêtre
//       (ordinateur). Même idée pour un mot dont la taille suit la largeur (« dates », 16 vw) :
//       sa ligne de base descend quand la fenêtre s'élargit, le CDJ la suit.
const K = (id, p, section, theta, phi, d, dm, cible, focale, cadrage, rig, flot = 1, { cm = [0, 0], ch = 0, cl = 0 } = {}) => ({
  id, p, section, theta, phi, d, dm, cible, focale, cadrage, rig, flot, cm, ch, cl, lumiere: section,
});

export const KEYS = [
  K('K0', 0.0, 'ouverture', 0, 8, 2.1, 1.35, [0, 0, 0], 30, [0, 0.08], [62, -24, -12]),
  K('K1a', 0.1, 'sons', -14, 56, 1.35, 2.2, [-0.02, 0.03, 0.04], 28, [0.17, 0], [0, 0, 0], 0.3, { cm: [0, -0.27] }),
  K('K1b', 0.26, 'sons', -6, 54, 1.32, 2.15, [-0.02, 0.03, 0.04], 28, [0.17, 0], [0, 0, 0], 0.3, { cm: [0, -0.27] }),
  K('K2a', 0.36, 'dates', 82, 7, 2.3, 1.55, [0, 0, 0], 22, [-0.2, -0.062], [0, 0, 0], 1, { cl: -0.099, cm: [0, -0.13] }),
  K('K2b', 0.46, 'dates', 98, 5, 2.3, 1.55, [0, 0, 0], 22, [-0.2, -0.062], [0, 0, 0], 1, { cl: -0.099, cm: [0, -0.13] }),
  K('K3a', 0.56, 'avec', 150, 84, 3.3, 4.7, [0, 0, 0], 22.2, [0.17, 0.105], [0, 0, 0], 1, { cm: [0, -0.25] }),
  K('K3b', 0.66, 'avec', 240, 84, 3.3, 4.7, [0, 0, 0], 22.2, [0.17, 0.105], [0, 0, 0], 1, { cm: [0, -0.25] }),
  K('K4a', 0.76, 'bio', 346, 58, 2.93, 0.95, [0, 0, 0], 22, [-0.145, 0.128], [0, 0, 0], 0.5, { cm: [0, -0.68] }),
  K('K4b', 0.86, 'bio', 352, 55, 2.85, 0.92, [0, 0, 0], 22, [-0.135, 0.128], [0, 0, 0], 0.5, { cm: [0, -0.68] }),
  K('K5a', 0.96, 'contact', 360, 6, 4.2, 2.45, [0, 0, 0], 30, [0, 0.275], [62, 24, 12], 1, { ch: 0.6, cm: [0, -0.244] }),
  K('K5b', 1.0, 'contact', 360, 6, 4.4, 2.55, [0, 0, 0], 30, [0, 0.275], [62, 24, 12], 1, { ch: 0.6, cm: [0, -0.276] }),
];

// Un palier va de Ka à Kb dans la même section. Tout le reste est un transit.
export const estPalier = (a, b) => a.section === b.section;

// Première et dernière clé d'une section (K0 joue les deux rôles pour l'ouverture).
// Boucle à rebours plutôt que Array.prototype.findLast : absent d'iOS 15.0 à 15.3, et ce
// module s'évalue au chargement (une erreur ici couperait toute la scène).
export const cleA = (section) => KEYS.find((k) => k.section === section);
export const cleB = (section) => {
  for (let i = KEYS.length - 1; i >= 0; i -= 1) if (KEYS[i].section === section) return KEYS[i];
  return undefined;
};

// La section i devient courante quand son transit passe la moitié (DA 13.8).
export const SEUILS = SECTIONS.slice(1).map((section, n) => ({
  section,
  p: (cleB(SECTIONS[n]).p + cleA(section).p) / 2,
}));

export function sectionDepuisP(p) {
  let courante = SECTIONS[0];
  for (const seuil of SEUILS) if (p >= seuil.p) courante = seuil.section;
  return courante;
}

// Apparitions des éléments du monde, liées à p : [p, valeur, courbe pour y arriver].
// Les formes glissent et se découpent, aucune ne fond (DA 7).
export const PISTES = {
  regle: [[0.29, 0], [0.36, 1, 'power2.out'], [0.46, 1, 'none'], [0.53, 0, 'power2.in']],
  glisse: [[0.26, 0], [0.56, 1, 'none']],
  anneaux: [[0.49, 0], [0.56, 1, 'power2.out'], [0.66, 1, 'none'], [0.73, 0, 'power2.in']],
  tour: [[0.46, 0], [0.76, 1, 'none']],
};
