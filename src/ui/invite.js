// Invitation line at the bottom of the page ("Cliquez sur un écran pour entrer",
// src/data/hints.js INVITE), shown once the intro is over.
//   const invite = createInvite({ text })
//   invite.show()        // end of the intro: fades in after `delay` ms, unless already seen
//   invite.interacted()  // a click / wheel / hint: starts the `autoHide` countdown
//   invite.dismiss()     // fades out and remembers it (first screen focus, countdown)
//   invite.hide()        // hides without remembering (replay of the intro)
// "Seen" is stored in localStorage (`storageKey`); without storage it simply comes
// back on the next visit. Timers only while it is pending / counting down.
export function createInvite({ text, storageKey = 'acurlaz:v1:invite', delay = 900, autoHide = 8000 }) {
  const read = () => { try { return localStorage.getItem(storageKey) === '1'; } catch { return false; } };
  const write = () => { try { localStorage.setItem(storageKey, '1'); } catch { /* storage unavailable */ } };

  const el = document.createElement('p');
  el.id = 'invite';
  el.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = text;
  el.append(label);
  document.body.append(el);

  let done = read();
  let shown = false;
  let showTimer = null, autoTimer = null;
  const clear = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  };
  const off = () => {
    clear();
    shown = false;
    el.classList.remove('on');
    el.setAttribute('aria-hidden', 'true');
  };
  const dismiss = () => {
    if (done) return;
    done = true;
    write();
    off();
  };

  return {
    el,
    show() {
      if (done || shown || showTimer) return;
      showTimer = setTimeout(() => {
        showTimer = null;
        shown = true;
        el.classList.add('on');
        el.setAttribute('aria-hidden', 'false');
      }, delay);
    },
    interacted() {
      if (!shown || autoTimer) return;
      autoTimer = setTimeout(dismiss, autoHide);
    },
    dismiss,
    hide: off,
    get visible() { return shown; },
    get done() { return done; },
  };
}
