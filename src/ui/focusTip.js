// Tip shown in the screen view on a phone held upright, where the CDJ screen is
// small: "Pincez pour agrandir, ou tournez le téléphone" (src/data/hints.js
// FOCUS_TIP). Glass pill at the bottom (#focus-tip in src/styles.css), like the
// invitation; it never covers the screen.
//   const tip = createFocusTip({ focus, text, when })
//   when() -> true when the tip applies (phone, portrait)
// Shown once the camera has arrived in front of the screen; gone at once when
// the visitor pinches (then never again: localStorage), turns the phone, or
// leaves the screen view. Timers only while it is pending.
import { SCREEN_FOCUS } from '../config.js';

export function createFocusTip({ focus, text, when, storageKey = 'acurlaz:v1:focustip' }) {
  const read = () => { try { return localStorage.getItem(storageKey) === '1'; } catch { return false; } };
  const write = () => { try { localStorage.setItem(storageKey, '1'); } catch { /* storage unavailable */ } };
  const el = document.createElement('p');
  el.id = 'focus-tip';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = text;
  document.body.append(el);

  let learned = read();
  let timer = null;
  const hide = () => { clearTimeout(timer); timer = null; el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); };
  const show = () => {
    timer = null;
    if (learned || !focus.current || !when()) return;
    el.classList.add('on');
    el.setAttribute('aria-hidden', 'false');
  };
  focus.onChange((e) => {
    if (e.type === 'enter') { hide(); if (!learned && when()) timer = setTimeout(show, SCREEN_FOCUS.duration * 1000 + 200); } else hide();
  });
  focus.onMagnify?.((k) => { if (k < 1 && !learned) { learned = true; write(); hide(); } });

  return {
    el,
    // after a resize: hidden if it no longer applies (turned to landscape)
    refresh() { if (!when()) hide(); else if (focus.current && !focus.busy && !learned && !el.classList.contains('on')) show(); },
    hide,
    get visible() { return el.classList.contains('on'); },
  };
}
