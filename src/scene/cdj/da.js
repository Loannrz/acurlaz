// Constantes de direction artistique consommées par le CDJ.
// `color`, `bpm`, `dur` et `jog` sont la copie conforme de docs/DA.md, section 13.5 : ne rien
// régler ici, corriger la DA.
export const DA = {
  color: { noir: 0x0a0908, creme: 0xf7eee5, accent: 0xff4d1a },
  bpm: 124,
  dur: { cut: 0.06, tick: 0.121, half: 0.242, beat: 0.484, twoBeat: 0.968, bar: 1.935 },
  jog: { rpm: 100 / 3, spinUp: 0.484, brake: 0.968 },

  // Gris de matière des pièces reconstruites du CDJ. Seule exception à la règle « aucun hex
  // hors de tokens.css et de DA.color » (docs/DA.md 13.9), et le seul endroit où ces valeurs
  // s'écrivent. Ce ne sont pas des encres : ce sont des albédos de matériaux éclairés
  // (MeshStandardMaterial). La lumière crème et le tone mapping les transforment, aucun ne
  // sort tel quel à l'écran. Les aplats, eux, restent sur DA.color.
  materiaux: {
    rubber: 0x0b0b0b, // pieds en caoutchouc
    platter: 0x060606, // plateau du jog, noir brillant (DA 8)
    crown: 0x45454a, // couronne du jog, métal (DA 8)
    steel: 0xd6d6d6, // chanfrein du jog et bague de la molette, acier poli
    collar: 0x101010, // collerette fixe autour du jog
    tower: 0x1b1b1d, // tourelle de la molette de navigation
    cap: 0xcfcdc7, // capuchons métalliques des boutons Play et Cue, bouton de la molette
    ringOff: 0x5c5a56, // anneau des boutons, voyant éteint
    // Neutre de modulation : multiplie une texture non éclairée (écran, afficheur du jog)
    // sans la teinter. Le niveau de l'écran (DA 8) vient ensuite assombrir ce blanc.
    neutral: 0xffffff,
    // Plastique nu du panneau, en composantes 0-255 : repli pour repeindre l'emplacement d'un
    // bouton quand la texture d'origine n'offre aucun pixel sombre à relever autour.
    panelFallback: [24, 24, 26],
  },
};

// Les trois encres en notation CSS, pour le dessin 2D de l'écran. Dérivées de DA.color :
// une seule source.
const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
export const INK = {
  noir: css(DA.color.noir),
  creme: css(DA.color.creme),
  accent: css(DA.color.accent),
};
