// Loading screen (#loader, markup and styles inline in index.html so it shows
// before any script). The intro waits behind it until everything it draws is
// loaded, built, compiled and uploaded; the bar then reaches 100 % and fades.
//
//   const loader = createLoader();
//   loader.define({ model: 40, textures: 15, ... }) // weights of the real steps
//   loader.set('model', 0.5, 'Chargement')        // fraction of one step (+ the word under the bar)
//   loader.done('model')                            // step finished
//   await loader.fail(message)                      // error + "Réessayer"; resolves on click
//   await loader.complete()                         // 100 %, then fades out (resolves when the fade starts)
//
// The progress never goes back and never shows 100 % before complete(). The
// bar moves by a CSS transform transition (compositor): it keeps gliding while
// the main thread is busy compiling or parsing.
export function createLoader({ reducedMotion = false } = {}) {
  const el = document.getElementById('loader');
  const bar = el?.querySelector('.loader-track'); // role="progressbar"
  const fill = el?.querySelector('.loader-fill');
  const label = el?.querySelector('.loader-step');
  const error = el?.querySelector('.loader-error');
  const steps = new Map(); // name -> { weight, value }
  let shown = 0; // 0..1, never decreases
  let finished = false;
  let lastText = '';
  let swapTimer = 0;

  const write = () => {
    if (!el) return;
    const p = Math.round(shown * 100);
    if (fill && fill.style.animationName !== 'none') fill.style.animationName = 'none'; // end of the CSS creep (index.html)
    fill?.style.setProperty('transform', `translateX(${((shown - 1) * 100).toFixed(2)}%)`);
    bar?.setAttribute('aria-valuenow', String(p));
    bar?.setAttribute('aria-valuetext', `${lastText || 'Chargement'}, ${p} %`); // screen readers only: no figure on screen
  };
  const update = () => {
    let sum = 0, total = 0;
    for (const s of steps.values()) { sum += s.weight * s.value; total += s.weight; }
    const target = total ? Math.min(finished ? 1 : 0.99, sum / total) : 0;
    if (target > shown) { shown = target; write(); }
  };
  const setLabel = (text) => {
    if (!text || text === lastText || !label) return;
    lastText = text;
    write();
    // short cross-fade of the word (instant with reduced motion)
    if (reducedMotion) { label.textContent = text; return; }
    label.classList.add('swap');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => { label.textContent = lastText; label.classList.remove('swap'); }, 160);
  };

  return {
    get progress() { return shown; },
    get closed() { return !!el?.classList.contains('done'); },
    define(weights) {
      for (const [name, weight] of Object.entries(weights)) if (!steps.has(name)) steps.set(name, { weight, value: 0 });
      update();
    },
    set(name, value, text) {
      const s = steps.get(name);
      if (s) s.value = Math.max(s.value, Math.min(1, Math.max(0, value || 0)));
      setLabel(text);
      update();
    },
    done(name, text) { this.set(name, 1, text); },
    label: setLabel,
    // Error message with a "Réessayer" button; resolves when it is pressed.
    fail(message) {
      if (!el || !error) return new Promise(() => {});
      el.classList.add('failed');
      error.hidden = false;
      error.querySelector('.loader-msg').textContent = message;
      const btn = error.querySelector('button');
      btn?.focus({ preventScroll: true });
      return new Promise((resolve) => {
        btn?.addEventListener('click', () => {
          el.classList.remove('failed');
          error.hidden = true;
          resolve();
        }, { once: true });
      });
    },
    // Fatal error without retry (e.g. no WebGL): the loader steps aside for the fallback message.
    remove() { el?.remove(); },
    async complete() {
      finished = true;
      setLabel('Prêt');
      update();
      // let the 100 % be seen (the bar transition takes ~350 ms)
      await new Promise((r) => setTimeout(r, reducedMotion ? 60 : 380));
      if (!el) return;
      el.classList.add('done');
      el.setAttribute('aria-busy', 'false');
      const remove = () => { el.hidden = true; };
      if (reducedMotion) remove();
      else { el.addEventListener('transitionend', remove, { once: true }); setTimeout(remove, 1200); }
    },
  };
}

// fetch with byte progress: onProgress(loaded, total) (total = 0 when unknown:
// no Content-Length, or a compressed transfer).
// Resolves with the Response body as a Blob. HTTP errors reject.
export async function fetchProgress(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  // With a Content-Encoding the stream yields decoded bytes while
  // Content-Length counts encoded ones: the total is then unknown (0).
  const encoded = (r.headers.get('content-encoding') || 'identity') !== 'identity';
  const total = encoded ? 0 : Number(r.headers.get('content-length')) || 0;
  const type = r.headers.get('content-type') || '';
  if (!r.body?.getReader) { const b = await r.blob(); onProgress?.(b.size, b.size); return b; }
  const reader = r.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  return new Blob(chunks, { type });
}
