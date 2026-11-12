// Navigation, menu mobile, rail, section courante.
import { on, bus } from '../core/bus.js';
import { reducedMotion, isMobile } from './dom.js';
import { SECTIONS } from './render.js';

const IDS = ['ouverture', ...SECTIONS.map((s) => s.id)];

export function initNav(root) {
  const body = document.body;
  const html = document.documentElement;
  const sections = IDS.map((id) => document.getElementById(id));
  const navLinks = [...root.querySelectorAll('.nav__link, .menu__link')];
  const words = [...root.querySelectorAll('.backdrop [data-section]')];
  const ticks = [...root.querySelectorAll('.rail__tick')];
  const rail = root.querySelector('.rail');
  const menu = root.querySelector('#menu');
  const menuBtn = root.querySelector('[data-menu-open]');
  let current = null;
  let external = false;

  function setCurrent(id) {
    if (id === current) return;
    current = id;
    body.dataset.section = id;
    navLinks.forEach((a) => {
      if (a.dataset.goto === id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    words.forEach((w) => w.classList.toggle('is-current', w.dataset.section === id));
    sections.forEach((s) => s.classList.toggle('is-current', s.id === id));
    ticks.forEach((tk) => tk.classList.toggle('is-current', tk.dataset.tick === id));
  }

  function setProgress(p) {
    rail.style.setProperty('--p', p.toFixed(4));
  }

  function measure() {
    const vh = window.innerHeight;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    ticks.forEach((tk) => {
      const s = document.getElementById(tk.dataset.tick);
      const top = s.getBoundingClientRect().top + window.scrollY;
      tk.style.top = `${Math.min(100, Math.max(0, (top / max) * 100))}%`;
    });
  }

  function update() {
    const vh = window.innerHeight;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    if (external) return;
    setProgress(Math.min(1, Math.max(0, window.scrollY / max)));
    const sceneBottom = isMobile() && !window.matchMedia('(orientation: landscape)').matches
      ? vh * 0.44 : 0;
    const line = sceneBottom + (vh - sceneBottom) * (isMobile() ? 0.3 : 0.5);
    let cur = IDS[0];
    sections.forEach((s) => { if (s.getBoundingClientRect().top <= line) cur = s.id; });
    if (window.scrollY + vh >= document.documentElement.scrollHeight - 2) cur = IDS[IDS.length - 1];
    setCurrent(cur);
  }

  let raf = 0;
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measure(); onScroll(); });
  // La timeline de scène, quand elle existe, fait foi pour la section et la progression.
  on('scroll:progress', ({ p, section }) => {
    external = true;
    if (typeof p === 'number') setProgress(p);
    if (section) setCurrent(section);
  });
  on('ui:ready', () => { measure(); update(); });
  measure();
  update();

  // ---- aller à une section
  function goto(id, { fromMenu = false } = {}) {
    const target = document.getElementById(id);
    if (!target) return;
    // Un module de défilement (Lenis) peut prendre la main : ev.preventDefault().
    const ev = new CustomEvent('ui:goto', { detail: { id }, cancelable: true });
    bus.dispatchEvent(ev);
    if (!ev.defaultPrevented) {
      target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    history.replaceState(null, '', `#${id}`);
    // Le menu est fermé d'abord : main est inert tant qu'il est ouvert, le focus serait perdu.
    if (fromMenu) closeMenu(false);
    const h2 = target.querySelector('h2');
    if (h2) h2.focus({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-goto], a.scroll-cue');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.goto || a.getAttribute('href').slice(1);
    goto(id, { fromMenu: Boolean(a.closest('.menu')) });
  });

  // ---- menu mobile
  const inertTargets = () => [root.querySelector('.nav'), root.querySelector('main'), root.querySelector('.player'), root.querySelector('.rail')];
  function openMenu() {
    menu.hidden = false;
    inertTargets().forEach((el) => el && el.setAttribute('inert', ''));
    menuBtn.setAttribute('aria-expanded', 'true');
    html.classList.add('menu-open');
    requestAnimationFrame(() => {
      menu.classList.add('is-open');
      (menu.querySelector('.menu__link[aria-current]') || menu.querySelector('.menu__link')).focus();
    });
  }
  function closeMenu(restore = true) {
    if (menu.hidden) return;
    menu.classList.remove('is-open');
    inertTargets().forEach((el) => el && el.removeAttribute('inert'));
    menuBtn.setAttribute('aria-expanded', 'false');
    html.classList.remove('menu-open');
    const finish = () => { menu.hidden = true; };
    if (reducedMotion()) finish(); else setTimeout(finish, 242);
    if (restore) menuBtn.focus();
  }
  menuBtn.addEventListener('click', openMenu);
  menu.querySelector('[data-menu-close]').addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeMenu(); return; }
    if (e.key === 'Tab' && !menu.hidden) {
      const f = [...menu.querySelectorAll('a, button')];
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia('(min-width: 900px)').addEventListener('change', (m) => { if (m.matches) closeMenu(false); });

  return { goto, closeMenu, setCurrent };
}
