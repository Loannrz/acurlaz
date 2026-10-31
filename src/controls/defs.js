// Movable controls of the set: which baked controls become 3D parts, their
// look (KNOB_STYLES), travel, default value, and how their baked picture is
// removed from the texture (`paint`). Positions are NOT set here: each part is
// placed on the low-poly relief it replaces (found in the model by its click
// zone, src/config/hotspots.js), so a part always sits where the model had it.
//
// Units: millimetres, unit-local frame (x right, z towards the DJ, y up).
// Angles: degrees clockwise seen from above, 0 = 12 o'clock (away from the DJ).
//
// paint (texture under the part, applied once at load, src/controls/texturePatch.js):
//   { type: 'disc', r }                       flat panel colour (sampled around)
//   { type: 'capsule', angle, from, to, w }   same, along a baked pointer
//   { type: 'clone', rect: [x0, z0, x1, z1], from: [dx, dz] }
//        copies the texture `from` mm away (same track, clean area) over rect
//        (absolute coordinates); used where the baked cap hid a fader track.

export const KNOB_RANGE = 135; // +-degrees of a continuous knob (270 degrees in all)

// Knob shapes (mm). r: radius at the top edge, h: height above the panel,
// tone: body colour ('black' rubber, 'grey' rubber, 'metal' brushed aluminium),
// knurl: number of grip ridges (0 = smooth), line: white indicator on top,
// skirt: base flange { r, h }, fin: pointer fin across the top (selectors).
export const KNOB_STYLES = {
  eq: { r: 8.3, h: 17, tone: 'black', knurl: 36, line: true, skirt: { r: 8.9, h: 1.6 }, paint: 9.9 },
  trim: { r: 6.2, h: 15, tone: 'grey', knurl: 28, line: true, skirt: { r: 6.8, h: 1.4 }, paint: 7.6 },
  color: { r: 9.2, h: 18, tone: 'metal', knurl: 44, line: true, skirt: { r: 9.9, h: 2.2, tone: 'black' }, cone: 1.6, paint: 10.4 },
  level: { r: 6.7, h: 15, tone: 'black', knurl: 30, line: true, skirt: { r: 7.3, h: 1.4 }, paint: 8.0 },
  mic: { r: 5.6, h: 13, tone: 'grey', knurl: 26, line: true, skirt: { r: 6.1, h: 1.2 }, paint: 6.8 },
  small: { r: 4.3, h: 11, tone: 'black', knurl: 20, line: true, skirt: null, paint: 5.2 },
  select: { r: 6.4, h: 14, tone: 'black', knurl: 0, line: false, fin: { len: 7.6, back: 5.6, w: 2.8, h: 2.4 }, skirt: { r: 7.0, h: 1.4 }, paint: 7.6 },
  fxsel: { r: 8.0, h: 14, tone: 'black', knurl: 0, line: false, fin: { len: 9.6, back: 7.2, w: 3.2, h: 2.6 }, skirt: { r: 8.6, h: 1.6 }, paint: 9.4 },
  encoder: { r: 9.0, h: 13, tone: 'black', knurl: 24, knurlDepth: 0.45, line: false, skirt: null, paint: 10.0 },
  cdjSmall: { r: 4.6, h: 10, tone: 'metal', knurl: 24, line: 'dark', skirt: null, paint: 6.2 },
  // CDJ browse rotary (geometry: browseGeometry); paint covers the baked ring on its pod
  browse: { paint: 14.3 },
};

const INPUT_LABELS = ['USB A', 'USB B', 'DIGITAL', 'LINE', 'PHONO', 'RETURN AUX'];
const FX_LABELS = ['DELAY', 'ECHO', 'PING PONG', 'SPIRAL', 'REVERB', 'TRANS', 'FILTER', 'FLANGER', 'PHASER', 'PITCH', 'SLIP ROLL', 'ROLL', 'VINYL BRAKE', 'HELIX'];
const FX_CH_LABELS = ['CROSS FADER B', 'CROSS FADER A', 'MIC', '1', '2', '3', '4', 'MASTER'];

// Channel strips (x of each channel in src/config/hotspots.js).
const CHANNELS = [1, 2, 3, 4];

// Mixer: zone (without the 'mixer_' prefix) -> control.
//   kind 'knob' (0..1, +-KNOB_RANGE) | 'selector' (steps over `spread` degrees) |
//   'encoder' (endless, angle) | 'fader' (axis 'x' | 'z', travel [a, b] = centre
//   positions in mm at value 0 and 1).
const MIXER = [];
for (const n of CHANNELS) {
  MIXER.push(
    // input selector: baked needle points to DIGITAL (index 2)
    { zone: `ch${n}_input`, kind: 'selector', style: 'select', labels: INPUT_LABELS, spread: 225, default: 2,
      paint: [{ type: 'capsule', angle: -24, from: 0, to: 11.6, w: 2.6 }] },
    { zone: `ch${n}_trim`, kind: 'knob', style: 'trim', default: 0.5 },
    { zone: `ch${n}_eq_hi`, kind: 'knob', style: 'eq', default: 0.5 },
    { zone: `ch${n}_eq_mid`, kind: 'knob', style: 'eq', default: 0.5 },
    { zone: `ch${n}_eq_low`, kind: 'knob', style: 'eq', default: 0.5 },
    { zone: `ch${n}_color`, kind: 'knob', style: 'color', default: 0.5 },
    // channel fader: 0 = bottom (towards the DJ, scale "0", z 107.5), 1 = top ("10", z 63.5)
    { zone: `ch${n}_fader`, kind: 'fader', cap: 'channel', axis: 'z', travel: [107.5, 63.5], default: 0.5,
      paint: [{ type: 'clone', rel: true, rect: [-11.6, 79.0, 11.6, 91.6], from: [0, 12.9] }] },
  );
}
MIXER.push(
  // crossfader: 0 = A (left), 1 = B (right); baked cap at the centre of the slot
  { zone: 'crossfader', kind: 'fader', cap: 'cross', axis: 'x', travel: [-42.4, 3.6], default: 0.5,
    paint: [{ type: 'clone', rect: [-25.4, 161.5, -14.6, 185.5], from: [-9, 0] }] },
  { zone: 'master_level', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'balance', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'booth_monitor', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'headphones_mixing', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'headphones_level', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'fx_parameter', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'mic1_level', kind: 'knob', style: 'mic', default: 0.5 },
  { zone: 'mic2_level', kind: 'knob', style: 'mic', default: 0.5 },
  { zone: 'mic_eq_hi', kind: 'knob', style: 'small', default: 0.5 },
  { zone: 'mic_eq_low', kind: 'knob', style: 'small', default: 0.5 },
  { zone: 'send_return_level', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'fx_level_depth', kind: 'knob', style: 'level', default: 0.5 },
  { zone: 'fx_time', kind: 'encoder', style: 'encoder', default: 0 },
  // beat FX select: baked pointer on PING PONG (index 2)
  { zone: 'fx_select', kind: 'selector', style: 'fxsel', labels: FX_LABELS, spread: 250, default: 2,
    paint: [{ type: 'capsule', angle: -112, from: -8, to: 13, w: 6.4 }] },
  { zone: 'fx_channel', kind: 'selector', style: 'select', labels: FX_CH_LABELS, spread: 240, default: 3,
    paint: [{ type: 'capsule', angle: 145, from: -8, to: 10, w: 5.2 }] },
);

// CDJ-3000 (both players share the list).
const CDJ = [
  // tempo: 0 = away from the DJ (-), 0.5 = 0 %, 1 = towards the DJ (+)
  { zone: 'tempo', kind: 'fader', cap: 'tempo', axis: 'z', travel: [93.5, 197.5], default: 0.5,
    paint: [{ type: 'clone', rel: true, rect: [-11.4, 131.2, 11.4, 157.0], from: [0, 30] }] },
  { zone: 'jog', kind: 'jog', default: 0 },
  { zone: 'browse', kind: 'encoder', style: 'browse', default: 0 },
  { zone: 'jog_adjust', kind: 'knob', style: 'cdjSmall', default: 0.5 },
  { zone: 'vinyl_speed_adjust', kind: 'knob', style: 'cdjSmall', default: 0.5 },
];

export const CONTROL_DEFS = { mixer: MIXER, cdjLeft: CDJ, cdjRight: CDJ };
export const UNIT_NAMES = { cdjLeft: 'cdj_left', cdjRight: 'cdj_right', mixer: 'mixer' };

// Store kind of a control (src/controls/state.js).
export function storeKind(def) {
  if (def.kind === 'jog' || def.kind === 'encoder') return 'angle';
  return def.kind; // 'knob' | 'fader' | 'selector'
}
