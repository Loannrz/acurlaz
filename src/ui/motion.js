// Entrées de contenu (DA 7) : jouées une fois, en durée fixe, quand le transit passe la moitié.
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { tokenSeconds, reducedMotion } from './dom.js';

gsap.registerPlugin(CustomEase);
CustomEase.create('ui-out', '0.16,1,0.3,1');
CustomEase.create('ui-in', '0.7,0,0.84,0');

export function initReveals(root, whenReady) {
  const reduce = reducedMotion();
  const D = {
    fade: tokenSeconds('--dur-tick', 0.121),
    beat: tokenSeconds('--dur-beat', 0.484),
    two: tokenSeconds('--dur-2beat', 0.968),
    stagger: tokenSeconds('--stagger', 0.06),
  };
  const shiftM = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.5;
  const sections = [...root.querySelectorAll('.stage')];

  // État initial, posé avant le premier affichage.
  sections.forEach((sec) => {
    sec.querySelectorAll('[data-reveal]').forEach((el) => {
      const type = el.dataset.reveal;
      if (reduce) return gsap.set(el, { opacity: 0 });
      if (type === 'lines') gsap.set(el.querySelectorAll('.line__in'), { yPercent: 110 });
      else if (type === 'rows') gsap.set(el.children, { opacity: 0, y: shiftM });
      else gsap.set(el, { opacity: 0, y: shiftM / 3 });
    });
  });

  function play(sec) {
    if (sec.classList.contains('is-inview')) return;
    sec.classList.add('is-inview');
    const tl = gsap.timeline({ defaults: { ease: 'ui-out' } });
    [...sec.querySelectorAll('[data-reveal]')].forEach((el, i) => {
      const at = i * D.stagger * 2;
      const type = el.dataset.reveal;
      if (reduce) return tl.to(el, { opacity: 1, duration: D.fade, ease: 'none' }, 0);
      if (type === 'lines') tl.to(el.querySelectorAll('.line__in'), { yPercent: 0, duration: D.two, stagger: D.stagger }, at);
      else if (type === 'rows') tl.to(el.children, { opacity: 1, y: 0, duration: D.beat, stagger: D.stagger }, at);
      else tl.to(el, { opacity: 1, y: 0, duration: D.beat }, at);
    });
  }

  const pending = new Set();
  let ready = false;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        if (ready) play(e.target);
        else pending.add(e.target);
      });
    },
    { rootMargin: '0px 0px -50% 0px' },
  );
  sections.forEach((s) => io.observe(s));

  whenReady.then(() => {
    ready = true;
    pending.forEach(play);
    pending.clear();
  });
  return { io };
}

// Réaffichage rapide d'une liste filtrée.
export function replayRows(items) {
  if (!items.length) return;
  if (reducedMotion()) {
    gsap.fromTo(items, { opacity: 0 }, { opacity: 1, duration: tokenSeconds('--dur-tick', 0.121), ease: 'none' });
    return;
  }
  gsap.fromTo(
    items,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: tokenSeconds('--dur-half', 0.242), stagger: tokenSeconds('--stagger', 0.06) / 2, ease: 'ui-out', overwrite: 'auto' },
  );
}
