// Floor plan of the club (metres). The DJ gear sits on the booth counter top
// at y = 0, centred on the origin; the DJ stands at +z, the dance floor is at -z.
//
//          z = BACK (4.0)  ── brick wall behind the DJ (arches, plants) ──
//          |  stage (wood) at STAGE_Y, full width
//          |      [ booth counter, top at y = 0, x in +-DESK.halfW ]
//   z = FRONT (-0.45) ── booth / stage front (tiles, green LED) ──
//          |  dance floor (lacquered terracotta) at DANCE_Y
//          |  high tables, banquettes in the side arches
//          z = FAR (-9.5) ── green plaster wall, bar arch, neon ──
//
// The free camera (ORBIT / ZOOM: +-65 deg azimuth, 15-62 deg elevation, up to
// ~3.7 m away on a portrait window) and the intro path stay well inside this
// box: x within +-3.4, y below 3.35, z within -0.95 .. 3.6.
export const DANCE_Y = -1.45;
export const STAGE_Y = -1.05;
export const CEIL_Y = 3.45;
export const X_MIN = -5.6;
export const X_MAX = 5.6;
export const FAR = -9.5;
export const BACK = 4.0;
export const FRONT = -0.45;
export const DESK = { halfW: 1.35, front: FRONT, back: 0.5, top: 0, slab: 0.06, lip: 0.035 };
// beam over the dance floor carrying the PAR cans
export const TRUSS_Y = 2.45;
