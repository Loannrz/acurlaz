// Phrase fixed at the bottom of the window, typed like on a keyboard in a loop:
// "Cliquez sur les écrans pour naviguer et en savoir plus." (src/data/hints.js
// TYPE_NOTE). Pure DOM / CSS: no 3D, no camera, no per-frame work (a timer
// chain runs only while the phrase is shown).
//   const note = createTypeNote({ text, short, reducedMotion })
//   note.show()   // end of the intro: fades in, starts the loop
//   note.hide()   // intro (re)start, screen focus: fades out, loop stopped
//   note.fit()    // after a resize: the short text if the full one would not fit one line
// Loop: types (TYPE_MS / char), stays whole HOLD_MS, erases (ERASE_MS / char),
// pauses, starts again. prefers-reduced-motion: whole text, no loop.
const TYPE_MS = 45;
const ERASE_MS = 16;
const HOLD_MS = 5000;
const PAUSE_MS = 700;
const SIDE = 16; // px kept free on each side

export function createTypeNote({ text, short = text, reducedMotion = false }) {
  const el = document.createElement('p');
  el.id = 'type-note';
  el.setAttribute('aria-hidden', 'true');
  const typed = document.createElement('span');
  const caret = document.createElement('i');
  caret.className = 'tn-caret';
  caret.setAttribute('aria-hidden', 'true');
  const rest = document.createElement('span');
  rest.className = 'tn-rest';
  el.append(typed, caret, rest);
  document.body.append(el);

  let chars = Array.from(text);
  let n = 0, timer = null, on = false;
  const set = (k) => { n = k; typed.textContent = chars.slice(0, k).join(''); rest.textContent = chars.slice(k).join(''); };
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const later = (fn, ms) => { timer = setTimeout(fn, ms); };
  const type = () => {
    if (n < chars.length) { set(n + 1); later(type, TYPE_MS); } else later(erase, HOLD_MS);
  };
  const erase = () => {
    if (n > 0) { set(n - 1); later(erase, ERASE_MS); } else later(type, PAUSE_MS);
  };

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-right,0px) 0 0 env(safe-area-inset-left,0px)';
  document.body.append(probe);
  const fit = () => {
    const c = getComputedStyle(probe);
    const room = window.innerWidth - 2 * SIDE - (parseFloat(c.paddingTop) || 0) - (parseFloat(c.paddingLeft) || 0);
    const k = n;
    chars = Array.from(text); set(k);
    if (el.scrollWidth > room && short) { chars = Array.from(short); set(Math.min(k, chars.length)); }
  };

  return {
    el,
    show() {
      if (on) return;
      on = true;
      clear();
      fit();
      el.classList.add('on');
      el.setAttribute('aria-hidden', 'false');
      if (reducedMotion) { set(chars.length); caret.hidden = true; return; }
      set(0);
      later(type, 500);
    },
    hide() {
      on = false;
      clear();
      el.classList.remove('on');
      el.setAttribute('aria-hidden', 'true');
    },
    fit() { fit(); },
    get visible() { return on; },
    dispose() { clear(); el.remove(); probe.remove(); },
  };
}
