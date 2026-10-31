// Rear ports of each unit, in unit-local millimetres (x, y), on the rear face
// (z is found at runtime by raycasting from behind, so the plug sits exactly on
// the panel). `type` selects the connector model; `plugs` lists the connectors
// of a single cable (an RCA pair plugs together). Order = plugging order.
//
// x, y are the centres of the sockets in the baked texture, measured on an
// orthographic back view of the unit (inspect.html?view=back, 10-12 px/mm,
// ring / pin centroids). Seen from behind, +x is on the LEFT of the image:
// read positions from the grid lines, not from the labels next to them.
const CDJ = {
  iec: { x: 57.8, y: 23.5 }, // AC IN (recessed panel, z ≈ -171)
  rcaR: { x: 94.6, y: 63.3 }, // AUDIO OUT R
  rcaL: { x: 80.5, y: 63.3 }, // AUDIO OUT L
  link: { x: 2.3, y: 63.7 }, // LINK (RJ45)
};
const MIXER = {
  iec: { x: 137.3, y: 17.0 }, // AC IN
  ch3L: { x: -4.0, y: 68.8 }, // CH3 LINE L
  ch3R: { x: -4.0, y: 53.5 }, // CH3 LINE R
  ch2L: { x: -43.9, y: 68.7 }, // CH2 LINE L
  ch2R: { x: -43.9, y: 53.5 }, // CH2 LINE R
  masterR: { x: 54.0, y: 23.8 }, // MASTER 1 R (XLR)
  masterL: { x: 28.2, y: 23.8 }, // MASTER 1 L (XLR)
  link: { x: -82.4, y: 17.7 }, // LINK (RJ45)
};
const RED = 0xd62828, WHITE = 0xf2f2f2;

export const CABLES = [
  // Right CDJ (the camera starts behind it)
  { id: 'cdjRight_power', unit: 'cdjRight', type: 'iec', plugs: [{ ...CDJ.iec }], color: 0x111111, drift: 0.06 },
  { id: 'cdjRight_audio', unit: 'cdjRight', type: 'rca', plugs: [{ ...CDJ.rcaR, ring: RED }, { ...CDJ.rcaL, ring: WHITE }], color: 0x1a1a1a, drift: -0.12 },
  { id: 'cdjRight_link', unit: 'cdjRight', type: 'rj45', plugs: [{ ...CDJ.link }], color: 0x2c4a7a, drift: 0.02 },
  // Mixer
  { id: 'mixer_power', unit: 'mixer', type: 'iec', plugs: [{ ...MIXER.iec }], color: 0x111111, drift: 0.08 },
  { id: 'mixer_ch3_in', unit: 'mixer', type: 'rca', plugs: [{ ...MIXER.ch3L, ring: WHITE }, { ...MIXER.ch3R, ring: RED }], color: 0x1a1a1a, drift: 0.05, vertical: true },
  { id: 'mixer_ch2_in', unit: 'mixer', type: 'rca', plugs: [{ ...MIXER.ch2L, ring: WHITE }, { ...MIXER.ch2R, ring: RED }], color: 0x1a1a1a, drift: -0.05, vertical: true },
  { id: 'mixer_master', unit: 'mixer', type: 'xlr', plugs: [{ ...MIXER.masterR }, { ...MIXER.masterL }], color: 0x161616, drift: 0.1 },
  { id: 'mixer_link', unit: 'mixer', type: 'rj45', plugs: [{ ...MIXER.link }], color: 0x2c4a7a, drift: -0.08 },
  // Left CDJ
  { id: 'cdjLeft_power', unit: 'cdjLeft', type: 'iec', plugs: [{ ...CDJ.iec }], color: 0x111111, drift: -0.06 },
  { id: 'cdjLeft_audio', unit: 'cdjLeft', type: 'rca', plugs: [{ ...CDJ.rcaR, ring: RED }, { ...CDJ.rcaL, ring: WHITE }], color: 0x1a1a1a, drift: 0.12 },
  { id: 'cdjLeft_link', unit: 'cdjLeft', type: 'rj45', plugs: [{ ...CDJ.link }], color: 0x2c4a7a, drift: -0.02 },
];
