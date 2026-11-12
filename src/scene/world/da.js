// Constantes de direction artistique consommées par la scène et le défilement.
// Copie conforme de docs/DA.md, section 13.5 : ne rien régler ici, corriger la DA.
export const DA = {
  color: { noir: 0x0a0908, creme: 0xf7eee5, accent: 0xff4d1a },
  bpm: 124,
  dur: { cut: 0.06, tick: 0.121, half: 0.242, beat: 0.484, twoBeat: 0.968, bar: 1.935 },
  stagger: 0.06,
  ease: { out: '0.16,1,0.3,1', in: '0.7,0,0.84,0', inOut: '0.83,0,0.17,1', mech: '0.2,0,0,1' },
  jog: { rpm: 100 / 3, spinUp: 0.484, brake: 0.968 },
  float: { period: 7.74, y: 0.012, rotX: 1.2, rotZ: 1.5 }, // mètres et degrés
  pointer: { maxDeg: 2, lerp: 0.06 }, // suivi du pointeur, ordinateur seulement
  camera: { near: 0.05, far: 30, maxPhi: 84 },
};

// Requêtes média partagées avec tokens.css (mêmes seuils).
export const MEDIA = {
  mobile: '(max-width: 899px)',
  reduit: '(prefers-reduced-motion: reduce)',
  tactile: '(hover: none), (pointer: coarse)',
  survol: '(hover: hover) and (pointer: fine)',
};

export const rad = (deg) => (deg * Math.PI) / 180;
export const borne = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lisse = (a, b, v) => {
  const t = borne((v - a) / (b - a || 1e-9));
  return t * t * (3 - 2 * t);
};
