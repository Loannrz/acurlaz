// Écran de chargement : progression réelle (polices, logo, scène), compteur 000 à 100.
import gsap from 'gsap';
import { on, emit } from '../core/bus.js';
import { tokenSeconds, reducedMotion } from './dom.js';

export function initLoader(logoUrl) {
  const el = document.getElementById('loader');
  const root = document.documentElement;
  if (!el) return Promise.resolve();

  el.style.setProperty('--logo-url', `url("${logoUrl}")`);
  root.classList.add('is-loading');
  const count = el.querySelector('.loader__count');
  const fill = el.querySelector('.loader__ink--fill');
  const sr = document.getElementById('loader-sr');

  const part = { fonts: 0, logo: 0, scene: 0 };
  const total = () => Math.round(part.fonts * 35 + part.logo * 15 + part.scene * 50);
  const shown = { v: 0 };
  let lastSr = -1;
  const reduce = reducedMotion();

  const paint = () => {
    const v = Math.round(shown.v);
    count.textContent = String(v).padStart(3, '0');
    fill.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    const bucket = Math.floor(v / 25) * 25;
    if (bucket !== lastSr && sr) { lastSr = bucket; sr.textContent = `Chargement, ${bucket} %`; }
  };

  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    const out = () => {
      gsap.to(el, {
        opacity: 0,
        duration: tokenSeconds('--dur-half', 0.242),
        ease: 'ui-in',
        onComplete: () => {
          el.remove();
          root.classList.remove('is-loading');
          root.classList.add('is-loaded');
          emit('ui:ready');
          resolveDone();
        },
      });
    };
    setTimeout(out, reduce ? 0 : 120);
  };

  const update = () => {
    const target = total();
    if (reduce) { shown.v = target; paint(); if (target >= 100) finish(); return; }
    gsap.to(shown, { v: target, duration: 0.35, ease: 'none', overwrite: true, onUpdate: paint, onComplete: () => target >= 100 && finish() });
  };

  (document.fonts?.ready ?? Promise.resolve()).then(() => { part.fonts = 1; update(); });
  const img = new Image();
  img.onload = img.onerror = () => { part.logo = 1; update(); };
  img.src = logoUrl;
  on('load:progress', ({ p }) => { part.scene = Math.max(part.scene, Math.min(1, p ?? 0)); update(); });
  on('scene:ready', () => { part.scene = 1; update(); });
  // Filet de sécurité : la page ne reste jamais bloquée si la scène n'arrive pas.
  setTimeout(() => { part.fonts = part.logo = part.scene = 1; update(); }, 6000);
  // Garde-fou final : si le loader est encore là après 8 s (scène jamais prête, tween bloqué),
  // il disparaît sans condition et le site reste utilisable.
  setTimeout(() => {
    if (!el.isConnected) return;
    finished = true;
    gsap.killTweensOf(el);
    gsap.killTweensOf(shown);
    el.remove();
    root.classList.remove('is-loading');
    root.classList.add('is-loaded');
    emit('ui:ready');
    resolveDone();
  }, 8000);
  paint();
  return done;
}
