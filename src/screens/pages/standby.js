// STANDBY page: the CRÉDITS screen of the mixer (its Beat FX display) at rest.
// Shows the word "CRÉDITS", large and centred (the screen is small in the
// overview), with a short accent rule. A click on the screen flies the camera
// to it and the end credits roll there (page `credits`, src/screens/index.js).
//
// CONTRACT: reads nothing, writes nothing; no touch zone (out of focus the
// screen is a click zone, `mixer_screen`, handled by src/input/screenFocus.js).
// Static: drawn once (frameRate 0, `static`: no redraw for library news).
import { registerPage } from '../registry.js';
import { C, FONT, font, rect, fill } from '../design.js';

const WORD = 'CRÉDITS';

registerPage('standby', {
  static: true,
  draw(ctx, state, api) {
    const w = api.width, h = api.height;
    // the largest size at which the word fills ~74 % of the width
    const spacing = 0.09; // em
    let size = 200;
    ctx.font = font(size, 300, FONT.family);
    ctx.letterSpacing = `${size * spacing}px`;
    size *= (w * 0.74) / ctx.measureText(WORD).width;
    ctx.font = font(size, 300, FONT.family);
    ctx.letterSpacing = `${size * spacing}px`;
    const capH = ctx.measureText('H').actualBoundingBoxAscent || size * 0.72;
    const cy = h * 0.47;
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // centred: the trailing letter spacing is not part of the visible word
    ctx.fillText(WORD, w / 2 + (size * spacing) / 2, cy + capH / 2);
    ctx.letterSpacing = '0px';
    // accent rule under the word (same blue as the CDJ screens)
    const rw = Math.round(w * 0.09), rh = Math.max(3, Math.round(h * 0.008));
    fill(ctx, rect(Math.round((w - rw) / 2), Math.round(cy + capH / 2 + h * 0.08), rw, rh), C.highlight);
  },
});
