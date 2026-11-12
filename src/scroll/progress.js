// De la position de défilement à p, par morceaux (docs/DA.md 13.8).
//
//   transit i : défilement de (top[i] - vh) à (top[i] - arrêt)   →  p de K(i-1)b à K(i)a
//   palier  i : défilement de (top[i] - arrêt) à (bas[i] - vh)   →  p de K(i)a à K(i)b
//
// « arrêt » vaut 0 sur ordinateur. Sur mobile, le bord haut d'une section s'arrête sous
// le bandeau de la scène : arrêt = hauteur du bandeau.
import { SECTIONS, cleA, cleB } from './keys.js';

// Un palier ne tombe jamais sous cette part de la fenêtre. Quand le contenu est trop court
// pour en offrir un (téléphone en paysage, liste filtrée), le palier mord sur la fin du
// transit : la caméra atteint sa clé « a » un peu plus tôt, puis dérive, sans coupe.
const PALIER_MIN = 0.25;

// Mesure les sections réelles. Rend null tant qu'une section manque dans le DOM.
export function mesurerSegments({ vh, arret = 0, scrollY = 0 } = {}) {
  const segments = [];
  let fin = 0; // fin du segment précédent : garantit une suite croissante
  for (let i = 1; i < SECTIONS.length; i += 1) {
    const el = document.getElementById(SECTIONS[i]);
    if (!el) return null;
    const boite = el.getBoundingClientRect();
    const top = boite.top + scrollY;
    const bas = top + boite.height;
    const depart = Math.max(fin, top - vh);
    const pose = Math.max(depart, top - arret); // le bord haut de la section s'arrête ici
    const sortie = Math.max(pose, bas - vh);
    const manque = Math.max(0, PALIER_MIN * vh - (sortie - pose));
    const palier = pose - Math.min(manque, (pose - depart) / 2);
    const avant = cleB(SECTIONS[i - 1]);
    const a = cleA(SECTIONS[i]);
    const b = cleB(SECTIONS[i]);
    segments.push({ type: 'transit', section: SECTIONS[i], s0: depart, s1: palier, p0: avant.p, p1: a.p, pose });
    segments.push({ type: 'palier', section: SECTIONS[i], s0: palier, s1: sortie, p0: a.p, p1: b.p, pose });
    fin = sortie;
  }
  return segments;
}

export function pDepuisScroll(segments, s) {
  if (!segments?.length) return 0;
  if (s <= segments[0].s0) return segments[0].p0;
  for (const seg of segments) {
    if (s < seg.s1) {
      if (s <= seg.s0) return seg.p0; // trou entre deux segments
      return seg.p0 + ((s - seg.s0) / (seg.s1 - seg.s0)) * (seg.p1 - seg.p0);
    }
  }
  return segments[segments.length - 1].p1;
}

// Inverse : la position de défilement où la timeline vaut p.
export function scrollDepuisP(segments, p) {
  if (!segments?.length) return 0;
  if (p <= segments[0].p0) return segments[0].s0;
  for (const seg of segments) {
    if (p <= seg.p1) {
      const k = seg.p1 === seg.p0 ? 1 : (p - seg.p0) / (seg.p1 - seg.p0);
      return seg.s0 + k * (seg.s1 - seg.s0);
    }
  }
  return segments[segments.length - 1].s1;
}
