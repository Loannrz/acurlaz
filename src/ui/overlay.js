// Minimal HTML overlay: impact flash, "Passer" button, WebGL fallback. (The
// loading screen, src/ui/loader.js, covers the page until the intro starts.)
export function createOverlay() {
  const flash = document.getElementById('flash');
  const skip = document.getElementById('skip');
  // Hidden = invisible AND out of the keyboard / pointer path (inert), not just transparent.
  const showSkip = (v) => {
    if (!skip) return;
    skip.classList.toggle('hidden', !v);
    skip.inert = !v;
    if (!v && document.activeElement === skip) skip.blur();
  };
  return {
    flash, skip, showSkip,
    onSkip(fn) { skip?.addEventListener('click', fn); },
    showFallback(message) {
      showSkip(false);
      const el = document.createElement('div');
      el.id = 'fallback';
      el.textContent = message;
      document.body.appendChild(el);
    },
  };
}
