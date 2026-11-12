// Mots géants et logo du plan arrière (docs/DA.md 13.4 et 13.8), pilotés par p.
// Le mot entre du côté du CDJ sur la seconde moitié du transit (12 vw et découpe),
// dérive de 4 vw pendant le palier, puis sort sur la première moitié du transit suivant
// (moitié du trajet, DA 7). Le logo de l'ouverture sort par le bas.
// L'interface pose les mots en CSS et coupe leur opacité (.is-current) ; ici on n'écrit
// que transform et clip-path en ligne. En mouvement réduit, on n'écrit rien.
import { SECTIONS, cleA, cleB } from './keys.js';

const ENTREE = 12; // vw
const DERIVE = 4; // vw
const SORTIE = 6; // vw
const MARGE = 30; // % : la découpe déborde de la boîte, l'encre dépasse l'interligne de 0,8

// Fenêtres en p de chaque mot, et côté d'entrée : celui où la clé cadre le CDJ.
const PLANS = SECTIONS.slice(1).map((section, n) => {
  const avant = cleB(SECTIONS[n]);
  const a = cleA(section);
  const b = cleB(section);
  const suivante = SECTIONS[n + 2] ? cleA(SECTIONS[n + 2]) : null;
  const cx = a.cadrage[0];
  return {
    section,
    cote: cx > 0.01 ? 1 : cx < -0.01 ? -1 : 0,
    entree: (avant.p + a.p) / 2,
    a: a.p,
    b: b.p,
    sortie: suivante ? (b.p + suivante.p) / 2 : null,
  };
});

const FIN_LOGO = PLANS[0].entree; // le logo a quitté l'image à la moitié du premier transit

const decoupe = (haut, droite, bas, gauche) => `inset(${haut}% ${droite}% ${bas}% ${gauche}%)`;

function poseMot(plan, p) {
  const { cote, entree, a, b, sortie } = plan;
  if (p <= entree || (sortie !== null && p >= sortie)) return null; // hors champ : l'opacité CSS le masque
  let decalage;
  let ouvert = 1; // part visible, 0 à 1
  let ferme = 0; // part refermée à la sortie, 0 à 1
  if (p < a) {
    const u = (p - entree) / (a - entree);
    ouvert = 1 - (1 - u) * (1 - u); // power2.out : la seconde moitié du transit de caméra
    decalage = DERIVE / 2 + ENTREE * (1 - ouvert);
  } else if (p <= b || sortie === null) {
    const v = b > a ? Math.min(1, (p - a) / (b - a)) : 0;
    decalage = DERIVE / 2 - DERIVE * v;
  } else {
    const w = (p - b) / (sortie - b);
    ferme = w * w; // power2.in
    decalage = -DERIVE / 2 - SORTIE * ferme;
  }
  const cache = (1 - ouvert) * 100;
  const clos = ferme * 100;
  if (cote === 0) {
    // Mot centré (contact) : il descend depuis le haut. Le CDJ l'attend au bout de sa ligne.
    return {
      transform: `translate3d(0, ${(-decalage).toFixed(3)}vw, 0)`,
      clip: ouvert < 1 ? decoupe(-MARGE, -MARGE, cache, -MARGE) : 'none',
    };
  }
  let clip = 'none';
  if (ouvert < 1) clip = cote > 0 ? decoupe(-MARGE, -MARGE, -MARGE, cache) : decoupe(-MARGE, cache, -MARGE, -MARGE);
  else if (ferme > 0) clip = cote > 0 ? decoupe(-MARGE, clos, -MARGE, -MARGE) : decoupe(-MARGE, -MARGE, -MARGE, clos);
  return { transform: `translate3d(${(cote * decalage).toFixed(3)}vw, 0, 0)`, clip };
}

export function creerMots() {
  let mots = null;
  let logo = null;
  const ecrit = new WeakMap();

  const chercher = () => {
    const fond = document.querySelector('.backdrop');
    if (!fond) return false;
    mots = PLANS.map((plan) => ({ plan, el: fond.querySelector(`.backdrop__word[data-section="${plan.section}"]`) })).filter((m) => m.el);
    logo = fond.querySelector('.backdrop__logo');
    return true;
  };

  const ecrire = (el, transform, clip) => {
    const cle = `${transform}|${clip}`;
    if (ecrit.get(el) === cle) return;
    ecrit.set(el, cle);
    el.style.transform = transform;
    el.style.clipPath = clip;
  };

  return {
    poser(p) {
      if (!mots?.length || !mots[0].el.isConnected) {
        if (!chercher()) return;
      }
      for (const { plan, el } of mots) {
        const pose = poseMot(plan, p);
        if (pose) ecrire(el, pose.transform, pose.clip);
        else ecrire(el, '', 'inset(0% 100% 0% 0%)');
      }
      if (logo) {
        const w = Math.min(1, Math.max(0, p / FIN_LOGO));
        const e = w * w; // power2.in : la première moitié du transit de caméra
        ecrire(logo, e > 0 ? `translate3d(0, calc(${e.toFixed(4)} * (100% + 5rem)), 0)` : '', 'none');
      }
    },
    // Mouvement réduit : mots immobiles, à leur place finale (DA 10).
    liberer() {
      if (!mots && !chercher()) return;
      for (const el of [...(mots || []).map((m) => m.el), logo]) {
        if (!el) continue;
        el.style.transform = '';
        el.style.clipPath = '';
        ecrit.delete(el);
      }
    },
  };
}
