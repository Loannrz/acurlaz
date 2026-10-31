// Keyboard shortcuts. Ignored while typing in a field or with a modifier held.
//   R: replay   Space: pause/resume (intro only)   Escape: skip   H: show click zones (dev)
//   P: show / hide the dev panel (dev; also ignored with Shift)
// A handler returning false leaves the key to the browser (no preventDefault).
// Created once the loading screen is done (src/main.js): nothing reacts before.
export function createKeys(handlers) {
  const onKey = (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.repeat) return;
    if (e.code === 'KeyP' && e.shiftKey) return;
    // Space on a focused button / link activates it: never intercepted there.
    if (e.code === 'Space' && t?.closest?.('button, a[href], [role="button"], summary, [tabindex]:not([tabindex="-1"])')) return;
    const fn = {
      KeyR: handlers.replay,
      Space: handlers.togglePause,
      Escape: handlers.skip,
      KeyH: handlers.toggleZones,
      KeyP: handlers.togglePanel,
    }[e.code];
    if (!fn) return;
    if (fn(e) === false) return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  return { dispose: () => window.removeEventListener('keydown', onKey) };
}
