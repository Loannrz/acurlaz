// Loading screen (#loader, markup and styles inline in index.html so it shows
// before any script). The intro waits behind it until everything it draws is
// loaded, built, compiled and uploaded. The logo fills in white from left to
// right with the progress, a percentage under its right corner counts up, then
// the screen fades out.
//
//   const loader = createLoader();
//   loader.define({ model: 40, textures: 15, ... }) // weights of the real steps
//   loader.set('model', 0.5)                         // fraction of one step
//   loader.done('model')                             // step finished
//   await loader.fail(message)                      // error + "Réessayer"; resolves on click
//   await loader.complete()                         // 100 %, short pause, then fades out (resolves when the fade starts)
//
// The real progress never goes back and never reaches 100 % before complete().
// The displayed figure follows it one unit at a time (a few units per frame when
// it lags far behind), so it never jumps; the logo fill is tied to that figure.
// (The optional text arguments of set / done / label are ignored: no status word any more.)
const STEP_MS = 24; // minimum time per displayed unit
const HOLD_MS = 250; // pause on 100 % before the fade

export function createLoader({ reducedMotion = false } = {}) {
  const el = document.getElementById('loader');
  const bar = el?.querySelector('.loader-box'); // role="progressbar"
  const fill = el?.querySelector('.loader-fill');
  const pct = el?.querySelector('.loader-pct');
  const error = el?.querySelector('.loader-error');
  const steps = new Map(); // name -> { weight, value }
  let shown = 0; // real progress 0..1, never decreases
  let finished = false;
  let shownPct = 0; // displayed integer 0..100
  let raf = 0, lastStep = 0;
  let waiters = [];

  const paint = () => {
    fill?.style.setProperty('clip-path', `inset(0 ${100 - shownPct}% 0 0)`);
    if (pct) pct.textContent = `${shownPct} %`;
    bar?.setAttribute('aria-valuenow', String(shownPct));
    bar?.setAttribute('aria-valuetext', `Chargement ${shownPct} %`);
  };
  const flush = () => { if (shownPct >= 100 || (finished && shownPct >= Math.round(shown * 100))) { const w = waiters; waiters = []; for (const f of w) f(); } };
  const tick = (now) => {
    raf = 0;
    const target = Math.round(shown * 100);
    if (shownPct < target && now - lastStep >= STEP_MS) {
      // one unit per step; more when far behind (never a jump of more than a few)
      shownPct = Math.min(target, shownPct + Math.max(1, Math.min(4, Math.floor((target - shownPct) / 12))));
      lastStep = now;
      paint();
    }
    if (shownPct < target) raf = requestAnimationFrame(tick);
    else flush();
  };
  const write = () => {
    if (!el) return;
    if (reducedMotion) { shownPct = Math.round(shown * 100); paint(); flush(); return; } // no easing: the fill still follows
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const update = () => {
    let sum = 0, total = 0;
    for (const s of steps.values()) { sum += s.weight * s.value; total += s.weight; }
    const target = total ? Math.min(finished ? 1 : 0.99, sum / total) : 0;
    if (target > shown) { shown = target; write(); }
  };
  const setLabel = () => {};

  return {
    get progress() { return shown; },
    get closed() { return !!el?.classList.contains('done'); },
    define(weights) {
      for (const [name, weight] of Object.entries(weights)) if (!steps.has(name)) steps.set(name, { weight, value: 0 });
      update();
    },
    set(name, value) {
      const s = steps.get(name);
      if (s) s.value = Math.max(s.value, Math.min(1, Math.max(0, value || 0)));
      update();
    },
    done(name) { this.set(name, 1); },
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
      update();
      // the figure reaches 100 % (a timeout covers a throttled background tab), then a short pause
      if (!reducedMotion && shownPct < 100) await new Promise((r) => { waiters.push(r); setTimeout(r, 2500); });
      shownPct = 100; paint();
      await new Promise((r) => setTimeout(r, reducedMotion ? 60 : HOLD_MS));
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
