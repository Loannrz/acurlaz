// Texts of the hover hints (src/ui/tooltip.js) and of the invitation line shown
// after the intro (src/ui/invite.js). Edit freely: nothing else to change.
//
// A hint is either a string (one line) or { t, s }: t = main line, s = smaller
// second line (optional). Keep them short: they are typed at ~26 ms per character.
// Only the zones listed here get a hint (zone ids: src/config/hotspots.js).
// On a touch screen a hint appears on a long press (no hover); an entry may
// carry a `touch` variant ({ t, s }) used there instead (e.g. "Touchez…").
//   - CDJ: one entry per zone, shared by both CDJs (zone id without the
//     'cdj_left_' / 'cdj_right_' prefix).
//   - Keys of the row above the CDJ screen: keyed by their PRINTED label
//     (TOP_ROW_LABELS in src/scene/screens.js, case and accents ignored), so a
//     renamed key keeps its hint as long as the label below matches.
//   - Mixer: full zone id without the 'mixer_' prefix.

export const INVITE = {
  mouse: 'Cliquez sur un écran pour entrer',
  touch: 'Touchez un écran pour entrer', // devices without a mouse (no hover)
};

// Screen view on a phone held upright (src/ui/focusTip.js): how to see the screen bigger.
export const FOCUS_TIP = 'Pincez pour agrandir, ou tournez le téléphone';

export const TOP_KEY_HINTS = {
  'sources': 'Mes sons, sur clé USB',
  'link': { t: 'Mes réseaux', s: 'Instagram, SoundCloud...' },
  'dates': 'Prochaines dates',
  'feat': 'Avec qui j’ai joué',
  'a propos': 'Qui je suis',
  // 'Échap' only works inside the screen view (CDJ screens, mixer CRÉDITS screen): said so.
  'echap': { t: 'Revenir à la scène', s: 'Depuis la vue écran' },
};

const HOT_CUE = { t: 'Hot cue', s: 'Pose un repère, puis y revient' };

export const CDJ_HINTS = {
  screen: { t: 'Cliquez pour entrer dans l’écran', s: 'Mes sons, mes dates, mes réseaux', touch: { t: 'Touchez pour entrer dans l’écran', s: 'Mes sons, mes dates, mes réseaux' } },
  play: 'Lecture / pause',
  cue: { t: 'Point de repère', s: 'Maintenez pour pré-écouter' },
  hot_cue_a: HOT_CUE, hot_cue_b: HOT_CUE, hot_cue_c: HOT_CUE, hot_cue_d: HOT_CUE,
  hot_cue_e: HOT_CUE, hot_cue_f: HOT_CUE, hot_cue_g: HOT_CUE, hot_cue_h: HOT_CUE,
  beat_loop_4: 'Boucle de 4 temps',
  beat_loop_8: 'Boucle de 8 temps',
  reloop_exit: 'Quitter ou relancer la boucle',
  beat_sync: { t: 'Sync', s: 'Cale le tempo sur l’autre platine' },
  tempo: { t: 'Vitesse', s: 'Glissez pour accélérer ou ralentir' },
  jog: { t: 'Plateau', s: 'Tournez pour caler ou scratcher' },
};

export const MIXER_HINTS = {
  screen: { t: 'Crédits', s: 'Qui a fait ce site' },
  crossfader: { t: 'Crossfader', s: 'Glissez d’une platine à l’autre' },
  master_level: 'Volume général',
  ch1_fader: { t: 'Volume', s: 'Platine de gauche' },
  ch2_fader: { t: 'Volume', s: 'Platine de droite' },
  ch1_eq_hi: { t: 'Aigus', s: 'Platine de gauche' },
  ch1_eq_mid: { t: 'Médiums', s: 'Platine de gauche' },
  ch1_eq_low: { t: 'Basses', s: 'Platine de gauche' },
  ch2_eq_hi: { t: 'Aigus', s: 'Platine de droite' },
  ch2_eq_mid: { t: 'Médiums', s: 'Platine de droite' },
  ch2_eq_low: { t: 'Basses', s: 'Platine de droite' },
  ch1_color: { t: 'Filtre', s: 'Gauche : aigus coupés. Droite : basses coupées' },
  ch2_color: { t: 'Filtre', s: 'Gauche : aigus coupés. Droite : basses coupées' },
  fx_on_off: { t: 'Effet', s: 'Active ou coupe l’effet' },
  fx_select: 'Choix de l’effet',
  fx_level_depth: 'Dosage de l’effet',
};

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const shapeOf = (h) => (h == null ? null : typeof h === 'string' ? { t: h, s: '' } : { t: h.t ?? '', s: h.s ?? '' });
const pick = (h, touch) => shapeOf(touch && h?.touch ? h.touch : h);

// Hint of a zone: { t, s } or null. printedLabel: screens.topLabelFor(zoneId);
// touch: the text for a finger (long press) when the entry has one.
export function hintFor(zoneId, printedLabel = null, { touch = false } = {}) {
  if (!zoneId) return null;
  if (printedLabel) return pick(TOP_KEY_HINTS[norm(printedLabel)], touch);
  const cdj = /^cdj_(?:left|right)_(.+)$/.exec(zoneId);
  if (cdj) return pick(CDJ_HINTS[cdj[1]], touch);
  const mix = /^mixer_(.+)$/.exec(zoneId);
  if (mix) return pick(MIXER_HINTS[mix[1]], touch);
  return null;
}
