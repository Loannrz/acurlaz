// Timeline maîtresse : une seule timeline GSAP en pause, de durée 1, dont la progression
// est p (docs/DA.md 13.7). Elle n'anime qu'un objet d'état ; la scène le lit à chaque image.
// Courbes : power2.inOut sur un transit, none sur un palier.
import gsap from 'gsap';
import { KEYS, PISTES, estPalier } from './keys.js';

// Valeurs numériques d'une clé. Les niveaux de lumière viennent du préréglage de la section.
export function etatDepuisCle(cle, prereglages = {}) {
  const lum = prereglages[cle.lumiere] || { key: 1, rim: 1, accent: 0, ecran: 1 };
  return {
    theta: cle.theta,
    phi: cle.phi,
    d: cle.d,
    dm: cle.dm,
    tx: cle.cible[0],
    ty: cle.cible[1],
    tz: cle.cible[2],
    focale: cle.focale,
    cx: cle.cadrage[0],
    cy: cle.cadrage[1],
    cxh: cle.ch || 0,
    cyl: cle.cl || 0,
    cxm: cle.cm ? cle.cm[0] : 0,
    cym: cle.cm ? cle.cm[1] : 0,
    rx: cle.rig[0],
    ry: cle.rig[1],
    rz: cle.rig[2],
    flot: cle.flot,
    key: lum.key,
    rim: lum.rim,
    accent: lum.accent,
    ecran: lum.ecran,
  };
}

export function creerTimeline({ prereglages = {}, cles = KEYS, pistes = PISTES } = {}) {
  const etat = etatDepuisCle(cles[0], prereglages);
  for (const [nom, points] of Object.entries(pistes)) etat[nom] = points[0][1];

  const tl = gsap.timeline({ paused: true });

  // Caméra, rig, lumière : un tween par segment, bornes explicites pour que le résultat
  // ne dépende jamais de l'ordre dans lequel le défilement traverse les segments.
  for (let i = 1; i < cles.length; i += 1) {
    const a = cles[i - 1];
    const b = cles[i];
    tl.fromTo(
      etat,
      etatDepuisCle(a, prereglages),
      {
        ...etatDepuisCle(b, prereglages),
        duration: b.p - a.p,
        ease: estPalier(a, b) ? 'none' : 'power2.inOut',
        immediateRender: false,
      },
      a.p,
    );
  }

  // Éléments du monde.
  for (const [nom, points] of Object.entries(pistes)) {
    for (let i = 1; i < points.length; i += 1) {
      const [p0, v0] = points[i - 1];
      const [p1, v1, ease = 'none'] = points[i];
      tl.fromTo(etat, { [nom]: v0 }, { [nom]: v1, duration: p1 - p0, ease, immediateRender: false }, p0);
    }
  }

  // La durée doit valoir exactement 1 : p = temps.
  const fin = cles[cles.length - 1].p;
  if (tl.duration() < fin) tl.set({}, {}, fin);

  return {
    tl,
    etat,
    poser(p) {
      tl.progress(Math.min(1, Math.max(0, p)));
      return etat;
    },
  };
}
