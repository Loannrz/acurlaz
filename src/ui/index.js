// Interface HTML : injecte le DOM dans #app et branche les comportements.
import '../styles/typography.css';
import '../styles/layout.css';
import '../styles/components.css';

import { buildApp } from './render.js';
import { initNav } from './nav.js';
import { initPlayerUI } from './player-ui.js';
import { initReveals, replayRows } from './motion.js';
import { initLoader } from './loader.js';
import { plural } from './dom.js';

function normalise(content) {
  const dates = content.upcomingDates ? content.upcomingDates() : (content.dates || []).map((d) => ({ ...d, when: new Date(`${d.date}T12:00:00`) }));
  return {
    artist: content.artist,
    about: content.about,
    tracks: content.tracks || [],
    collaborators: content.collaborators || [],
    links: content.links || [],
    credits: content.credits,
    contact: content.contact,
    upcoming: dates,
  };
}

export function initUI({ content }) {
  const data = normalise(content);
  const root = document.getElementById('app') || document.body;
  const logoUrl = data.artist.logo.replace(/\.png$/, '.svg');

  document.documentElement.style.setProperty('--logo-url', `url("${logoUrl}")`);
  root.innerHTML = buildApp(data);

  // Le canvas de la scène 3D : créé ici s'il n'existe pas encore (DA 13.4).
  if (!document.querySelector('canvas.scene')) {
    const c = document.createElement('canvas');
    c.className = 'scene';
    c.setAttribute('aria-hidden', 'true');
    root.querySelector('.backdrop').after(c);
  }

  const loaded = initLoader(logoUrl);
  initReveals(root, loaded);
  const nav = initNav(root);
  initPlayerUI(root, data.tracks);

  // Filtre des artistes par style.
  const chips = [...root.querySelectorAll('[data-filter]')];
  const items = [...root.querySelectorAll('.arow')];
  const count = root.querySelector('[data-count]');
  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      const f = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      let n = 0;
      const shown = [];
      items.forEach((li) => {
        const ok = f === 'all' || li.dataset.cat === f;
        li.hidden = !ok;
        if (ok) { n += 1; shown.push(li); }
      });
      count.textContent = plural(n, 'artiste', 'artistes');
      replayRows(shown);
    }),
  );

  // Copier l'adresse.
  const copyBtn = root.querySelector('[data-copy]');
  if (copyBtn) {
    const status = root.querySelector('[data-copy-status]');
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(copyBtn.dataset.copy); status.textContent = 'Adresse copiée'; copyBtn.textContent = 'Adresse copiée'; }
      catch { status.textContent = 'Copie impossible'; }
      setTimeout(() => { copyBtn.textContent = 'Copier l’adresse'; }, 2400);
    });
  }

  return { goto: nav.goto, ready: loaded };
}
