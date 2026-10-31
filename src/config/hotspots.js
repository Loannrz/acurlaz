// Click zones, as top-down footprints in unit-local millimetres (x -> right,
// z -> towards the DJ, origin at the centre of the unit's footprint), i.e. the
// position of the button painted on the model's texture seen from above
// (calibrate on /inspect.html?unit=mixer&view=top&px=3&zones=1).
//   shape 'circle': r (radius)   |   shape 'rect': w (x extent), h (z extent)
//   tilt (optional, radians about x, towards the DJ): the zone lies on a tilted
//   surface (CDJ screen, buttons above it) and h is measured along it.
// No height to set: picking casts the pointer ray on the model itself and
// looks up the footprint under the hit point (src/scene/hotspots.js), so a
// zone matches its button from any angle, on knobs, fader caps, the jog, etc.
// Overlapping footprints: the smallest wins. In dev, H shows the zones on the
// model and Alt+click prints the local coordinates (and zone) under the cursor.

const CDJ_ZONES = [
  // Transport
  { id: 'play', label: 'PLAY/PAUSE', shape: 'circle', x: -137.5, z: 199, r: 17.5 },
  { id: 'cue', label: 'CUE', shape: 'circle', x: -138, z: 152.8, r: 17 },
  { id: 'track_search_prev', label: 'TRACK SEARCH <<', shape: 'circle', x: -147.5, z: 88.3, r: 8 },
  { id: 'track_search_next', label: 'TRACK SEARCH >>', shape: 'circle', x: -127.5, z: 88.3, r: 8 },
  { id: 'search_rev', label: 'SEARCH <', shape: 'circle', x: -147.5, z: 114.8, r: 8 },
  { id: 'search_fwd', label: 'SEARCH >', shape: 'circle', x: -127.5, z: 114.8, r: 8 },
  { id: 'direction', label: 'DIRECTION', shape: 'rect', x: -148, z: 51, w: 18, h: 22 },
  { id: 'slip_reverse', label: 'SLIP REVERSE', shape: 'rect', x: -128, z: 51, w: 20, h: 22 },
  // Loop
  { id: 'in_cue', label: 'IN/CUE (IN ADJUST)', shape: 'circle', x: -148, z: -34.2, r: 10 },
  { id: 'out', label: 'OUT (OUT ADJUST)', shape: 'circle', x: -122, z: -34.2, r: 10 },
  { id: 'reloop_exit', label: 'RELOOP/EXIT', shape: 'circle', x: -93, z: -34.2, r: 8 },
  { id: 'beat_loop_4', label: '4 BEAT LOOP', shape: 'circle', x: -148, z: -8.2, r: 8 },
  { id: 'beat_loop_8', label: '8 BEAT LOOP', shape: 'circle', x: -122, z: -7.5, r: 8 },
  { id: 'beat_jump_back', label: 'BEAT JUMP <', shape: 'rect', x: -147.5, z: 16.8, w: 15, h: 12 },
  { id: 'beat_jump_fwd', label: 'BEAT JUMP >', shape: 'rect', x: -121.5, z: 16.8, w: 15, h: 12 },
  { id: 'call', label: 'CALL', shape: 'rect', x: -145, z: -57.7, w: 20, h: 12 },
  // Hot cues (under the screen)
  { id: 'hot_cue_a', label: 'HOT CUE A', shape: 'rect', x: -104, z: -58, w: 22, h: 12 },
  { id: 'hot_cue_b', label: 'HOT CUE B', shape: 'rect', x: -74, z: -58, w: 22, h: 12 },
  { id: 'hot_cue_c', label: 'HOT CUE C', shape: 'rect', x: -44, z: -58, w: 22, h: 12 },
  { id: 'hot_cue_d', label: 'HOT CUE D', shape: 'rect', x: -14, z: -58, w: 22, h: 12 },
  { id: 'hot_cue_e', label: 'HOT CUE E', shape: 'rect', x: 15.5, z: -58, w: 22, h: 12 },
  { id: 'hot_cue_f', label: 'HOT CUE F', shape: 'rect', x: 45.5, z: -58, w: 22, h: 12 },
  { id: 'hot_cue_g', label: 'HOT CUE G', shape: 'rect', x: 75.5, z: -58, w: 22, h: 12 },
  { id: 'hot_cue_h', label: 'HOT CUE H', shape: 'rect', x: 105.5, z: -58, w: 22, h: 12 },
  { id: 'cue_loop_call_prev', label: 'CUE/LOOP CALL <', shape: 'circle', x: 44, z: -34.2, r: 7 },
  { id: 'cue_loop_call_next', label: 'CUE/LOOP CALL >', shape: 'circle', x: 64, z: -34.2, r: 7 },
  { id: 'delete', label: 'DELETE', shape: 'circle', x: 84, z: -34.2, r: 7 },
  { id: 'memory', label: 'MEMORY', shape: 'circle', x: 105, z: -34.2, r: 7 },
  // Browse / screen
  { id: 'browse', label: 'BROWSE (rotary)', shape: 'circle', x: 132, z: -142, r: 22 },
  { id: 'back', label: 'BACK', shape: 'circle', x: 122, z: -171.2, r: 7 },
  { id: 'tag_track', label: 'TAG TRACK', shape: 'circle', x: 143, z: -171.2, r: 7 },
  { id: 'screen', label: 'SCREEN', shape: 'rect', x: -2, z: -137.5, w: 230, h: 130, tilt: 0.1717 },
  // Row above the screen: each key carries a 3D keycap with a printed text
  // (TOP_ROW_LABELS in src/scene/screens.js, centres measured on the texture,
  // z -208): each zone covers its whole cap + ~1 mm. MENU (cap "ÉCHAP") leaves
  // the screen focus.
  { id: 'source', label: 'SOURCE', shape: 'rect', x: -91.1, z: -208.0, w: 32, h: 12, tilt: 0.1717 },
  { id: 'browse_btn', label: 'BROWSE', shape: 'rect', x: -54.8, z: -208.0, w: 32, h: 12, tilt: 0.1717 },
  { id: 'tag_list', label: 'TAG LIST', shape: 'rect', x: -18.45, z: -208.0, w: 32, h: 12, tilt: 0.1717 },
  { id: 'playlist', label: 'PLAYLIST', shape: 'rect', x: 17.9, z: -208.0, w: 32, h: 12, tilt: 0.1717 },
  { id: 'search', label: 'SEARCH', shape: 'rect', x: 54.1, z: -208.0, w: 32, h: 12, tilt: 0.1717 },
  { id: 'menu', label: 'MENU', shape: 'rect', x: 90.7, z: -208.0, w: 32, h: 12, tilt: 0.1717 },
  // Left column
  { id: 'usb_stop', label: 'USB STOP', shape: 'circle', x: -130, z: -177.2, r: 7 },
  { id: 'time_mode', label: 'TIME MODE / AUTO CUE', shape: 'circle', x: -148, z: -108.2, r: 7 },
  { id: 'auto_cue', label: 'AUTO CUE', shape: 'circle', x: -130, z: -108.2, r: 7 },
  { id: 'quantize', label: 'QUANTIZE', shape: 'rect', x: -150, z: -90.2, w: 16, h: 8 },
  { id: 'shortcut', label: 'SHORTCUT', shape: 'rect', x: -130, z: -90.2, w: 16, h: 8 },
  // Right column
  { id: 'vinyl_speed_adjust', label: 'VINYL SPEED ADJ.', shape: 'circle', x: 136, z: -59, r: 8 },
  { id: 'vinyl', label: 'VINYL / CDJ', shape: 'rect', x: 128, z: -34.2, w: 20, h: 12 },
  { id: 'jog_mode', label: 'JOG MODE', shape: 'rect', x: 146, z: -34.2, w: 18, h: 12 },
  { id: 'jog_adjust', label: 'JOG ADJUST', shape: 'circle', x: 90, z: -4.5, r: 8 },
  { id: 'beat_sync', label: 'BEAT SYNC', shape: 'rect', x: 128, z: -5.2, w: 20, h: 12 },
  { id: 'master', label: 'MASTER', shape: 'rect', x: 146, z: -5.2, w: 18, h: 12 },
  { id: 'key_sync', label: 'KEY SYNC', shape: 'rect', x: 136, z: 12.8, w: 36, h: 10 },
  { id: 'tempo_range', label: 'TEMPO RANGE', shape: 'rect', x: 136, z: 42.8, w: 24, h: 12 },
  { id: 'master_tempo', label: 'MASTER TEMPO', shape: 'circle', x: 136, z: 66.8, r: 7 },
  { id: 'tempo', label: 'TEMPO slider', shape: 'rect', x: 137.5, z: 146.5, w: 23, h: 128 },
  { id: 'tempo_reset', label: 'TEMPO RESET', shape: 'circle', x: 107, z: 145.8, r: 7 },
  // Jog
  { id: 'jog', label: 'JOG', shape: 'circle', x: 0, z: 81, r: 109 },
];

const MIXER_ZONES = [
  { id: 'crossfader', label: 'CROSSFADER', shape: 'rect', x: -19.8, z: 172, w: 100, h: 22 },
  { id: 'master_level', label: 'MASTER LEVEL', shape: 'circle', x: 86.2, z: -164, r: 11 },
  { id: 'balance', label: 'BALANCE', shape: 'circle', x: 86.2, z: -8, r: 10 },
  { id: 'master_cue', label: 'MASTER CUE', shape: 'rect', x: 86.2, z: 17, w: 24, h: 10 },
  { id: 'booth_monitor', label: 'BOOTH MONITOR', shape: 'circle', x: 86.2, z: 58.5, r: 11 },
  { id: 'eq_curve', label: 'EQ CURVE', shape: 'rect', x: 86.2, z: 88, w: 14, h: 10 },
  { id: 'ch_fader_curve', label: 'CH FADER CURVE', shape: 'rect', x: 86.2, z: 112, w: 14, h: 10 },
  { id: 'crossfader_curve', label: 'CROSS FADER CURVE', shape: 'rect', x: 86.2, z: 134, w: 14, h: 10 },
  // Headphones
  { id: 'headphones_mixing', label: 'HEADPHONES MIXING', shape: 'circle', x: -134.8, z: 98, r: 10 },
  { id: 'headphones_level', label: 'HEADPHONES LEVEL', shape: 'circle', x: -134.8, z: 128, r: 10 },
  { id: 'link_cue', label: 'LINK CUE', shape: 'rect', x: -134.8, z: 54, w: 24, h: 10 },
  { id: 'mono_split', label: 'MONO SPLIT / STEREO', shape: 'rect', x: -134.8, z: 70, w: 20, h: 8 },
  // Sound color FX
  { id: 'fx_space', label: 'SPACE', shape: 'rect', x: -151.8, z: -18, w: 14, h: 8 },
  { id: 'fx_dub_echo', label: 'DUB ECHO', shape: 'rect', x: -134.8, z: -18, w: 14, h: 8 },
  { id: 'fx_sweep', label: 'SWEEP', shape: 'rect', x: -117.8, z: -18, w: 14, h: 8 },
  { id: 'fx_noise', label: 'NOISE', shape: 'rect', x: -151.8, z: 3, w: 14, h: 8 },
  { id: 'fx_crush', label: 'CRUSH', shape: 'rect', x: -134.8, z: 3, w: 14, h: 8 },
  { id: 'fx_filter', label: 'FILTER', shape: 'rect', x: -117.8, z: 3, w: 14, h: 8 },
  { id: 'fx_parameter', label: 'PARAMETER', shape: 'circle', x: -134.8, z: 28, r: 10 },
  // Mic / USB
  { id: 'mic1_level', label: 'MIC 1 LEVEL', shape: 'circle', x: -149.8, z: -108, r: 8 },
  { id: 'mic2_level', label: 'MIC 2 LEVEL', shape: 'circle', x: -121, z: -107.5, r: 8 },
  { id: 'mic_eq_hi', label: 'MIC EQ HI', shape: 'circle', x: -134.8, z: -86, r: 7 },
  { id: 'mic_eq_low', label: 'MIC EQ LOW', shape: 'circle', x: -134.8, z: -70, r: 7 }, // on its knob (was z -64, 6 mm off)
  { id: 'talk_over', label: 'TALK OVER', shape: 'rect', x: -134.8, z: -48, w: 18, h: 8 },
  { id: 'usb_a', label: 'USB A', shape: 'rect', x: -149.8, z: -138, w: 16, h: 8 },
  { id: 'usb_b', label: 'USB B', shape: 'rect', x: -121.8, z: -138, w: 16, h: 8 },
  // Beat FX section
  // The Beat FX display is the CRÉDITS screen (src/screens/pages/standby.js,
  // credits.js): a click flies the camera to it (src/input/screenFocus.js).
  { id: 'screen', label: 'CRÉDITS', shape: 'rect', x: 132.5, z: -94.5, w: 55, h: 37 },
  // 3D key "ÉCHAP" laid where the section title "BEAT FX" was printed, above
  // the display (MIXER_TOP_KEYS in src/scene/screens.js): leaves the screen focus.
  { id: 'menu', label: 'ÉCHAP', shape: 'rect', x: 132.8, z: -117.3, w: 24, h: 7 },
  { id: 'xpad', label: 'X-PAD', shape: 'rect', x: 131.2, z: -49, w: 50, h: 22 },
  { id: 'beat_prev', label: 'BEAT <', shape: 'rect', x: 114.2, z: -24, w: 16, h: 8 },
  { id: 'beat_next', label: 'BEAT >', shape: 'rect', x: 152.2, z: -24, w: 16, h: 8 },
  { id: 'auto_tap', label: 'AUTO / TAP', shape: 'circle', x: 114.2, z: -7, r: 8 },
  { id: 'tap', label: 'TAP', shape: 'circle', x: 133.2, z: -7, r: 10 },
  { id: 'quantize', label: 'QUANTIZE', shape: 'circle', x: 152.2, z: -7, r: 8 },
  { id: 'fx_freq_low', label: 'FX FREQUENCY LOW', shape: 'rect', x: 114.2, z: 18, w: 16, h: 8 },
  { id: 'fx_freq_mid', label: 'FX FREQUENCY MID', shape: 'rect', x: 133.2, z: 18, w: 16, h: 8 },
  { id: 'fx_freq_hi', label: 'FX FREQUENCY HI', shape: 'rect', x: 152.2, z: 18, w: 16, h: 8 },
  { id: 'fx_select', label: 'FX SELECT', shape: 'circle', x: 133.2, z: 44, r: 12 },
  { id: 'fx_channel', label: 'FX CHANNEL SELECT', shape: 'circle', x: 133.2, z: 70, r: 8 },
  { id: 'fx_time', label: 'TIME', shape: 'circle', x: 133.2, z: 101.5, r: 11 },
  { id: 'fx_level_depth', label: 'LEVEL / DEPTH', shape: 'circle', x: 133.2, z: 134, r: 11 },
  { id: 'fx_on_off', label: 'FX ON/OFF', shape: 'circle', x: 133.2, z: 168, r: 14 },
  { id: 'send_return_level', label: 'SEND/RETURN LEVEL', shape: 'circle', x: 121, z: -133, r: 9 },
  { id: 'send_return_on', label: 'SEND/RETURN ON/OFF', shape: 'circle', x: 151.2, z: -133, r: 10 },
];

// Per-channel strips on the mixer (channels 1..4).
const CHANNEL_X = { 1: -83.8, 2: -40.8, 3: 2.7, 4: 46.2 };
for (const [n, x] of Object.entries(CHANNEL_X)) {
  MIXER_ZONES.push(
    { id: `ch${n}_input`, label: `CH${n} INPUT SELECT`, shape: 'circle', x, z: -162, r: 9 },
    { id: `ch${n}_trim`, label: `CH${n} TRIM`, shape: 'circle', x, z: -135, r: 10 },
    { id: `ch${n}_eq_hi`, label: `CH${n} EQ HI`, shape: 'circle', x, z: -107, r: 11 },
    { id: `ch${n}_eq_mid`, label: `CH${n} EQ MID`, shape: 'circle', x, z: -76, r: 11 },
    { id: `ch${n}_eq_low`, label: `CH${n} EQ LOW`, shape: 'circle', x, z: -46, r: 11 },
    { id: `ch${n}_color`, label: `CH${n} COLOR`, shape: 'circle', x, z: -8, r: 14 },
    { id: `ch${n}_cue`, label: `CH${n} CUE`, shape: 'rect', x, z: 17, w: 24, h: 10 },
    { id: `ch${n}_beat_fx`, label: `CH${n} BEAT FX ASSIGN`, shape: 'rect', x, z: 33, w: 18, h: 7 },
    { id: `ch${n}_fader`, label: `CH${n} FADER`, shape: 'rect', x, z: 82, w: 22, h: 62 },
    { id: `ch${n}_xf_assign`, label: `CH${n} CROSSFADER ASSIGN`, shape: 'rect', x, z: 134, w: 14, h: 10 }
  );
}

export const HOTSPOTS = {
  cdjLeft: CDJ_ZONES,
  cdjRight: CDJ_ZONES,
  mixer: MIXER_ZONES,
};
