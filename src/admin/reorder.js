// Réordonner une liste : glisser la poignée (souris, doigt, stylet), ou flèches haut et bas
// quand la poignée a le focus. Les boutons Monter et Descendre de chaque ligne font la même
// chose au clic : le glisser n'est jamais le seul moyen.
//
// Pendant le glisser, la ligne change de place dans le DOM en direct ; `onMove(de, vers)`
// n'est appelé qu'au lâcher, avec les rangs de départ et d'arrivée.

const EDGE = 96; // px : zone de défilement automatique en haut et en bas de la fenêtre
const SPEED = 14; // px par image

export function enableReorder(list, { onMove }) {
  let drag = null;

  const indexOf = (li) => [...list.children].indexOf(li);

  function settle() {
    const { li, y } = drag;
    for (;;) {
      const prev = li.previousElementSibling;
      const next = li.nextElementSibling;
      if (prev) {
        const r = prev.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          list.insertBefore(li, prev);
          continue;
        }
      }
      if (next) {
        const r = next.getBoundingClientRect();
        if (y > r.top + r.height / 2) {
          list.insertBefore(next, li);
          continue;
        }
      }
      break;
    }
  }

  function frame() {
    if (!drag) return;
    if (drag.y < EDGE) window.scrollBy(0, -SPEED);
    else if (drag.y > window.innerHeight - EDGE * 1.5) window.scrollBy(0, SPEED);
    settle();
    drag.raf = requestAnimationFrame(frame);
  }

  function finish(commit) {
    if (!drag) return;
    const { li, grip, from, raf, pointerId } = drag;
    cancelAnimationFrame(raf);
    drag = null;
    if (grip.hasPointerCapture?.(pointerId)) grip.releasePointerCapture(pointerId);
    li.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    const to = indexOf(li);
    if (commit && to !== from) onMove(from, to);
    else if (to !== from) list.insertBefore(li, list.children[from + (to < from ? 1 : 0)] || null); // annulé : retour en place
  }

  list.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('[data-part="grip"]');
    if (!grip || !list.contains(grip) || event.button !== 0 || drag) return;
    const li = grip.closest('li');
    if (!li || li.parentElement !== list) return;
    event.preventDefault();
    grip.focus();
    grip.setPointerCapture(event.pointerId);
    drag = { li, grip, from: indexOf(li), y: event.clientY, pointerId: event.pointerId, raf: 0 };
    li.classList.add('is-dragging');
    list.classList.add('is-sorting');
    drag.raf = requestAnimationFrame(frame);
  });

  list.addEventListener('pointermove', (event) => {
    if (drag && event.pointerId === drag.pointerId) drag.y = event.clientY;
  });
  list.addEventListener('pointerup', (event) => {
    if (drag && event.pointerId === drag.pointerId) finish(true);
  });
  list.addEventListener('pointercancel', (event) => {
    if (drag && event.pointerId === drag.pointerId) finish(false);
  });

  list.addEventListener('keydown', (event) => {
    const grip = event.target.closest?.('[data-part="grip"]');
    if (!grip || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const li = grip.closest('li');
    if (!li || li.parentElement !== list) return;
    event.preventDefault();
    const from = indexOf(li);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (to >= 0 && to < list.children.length) onMove(from, to);
  });
}
