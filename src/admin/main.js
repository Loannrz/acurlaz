// Régie d'acurlaz (/admin) : page séparée du site, sans three ni gsap.
// Sécurité côté navigateur : aucun innerHTML (voir dom.js), politique CSP posée à la
// construction (vite.config.js), refus d'être affichée dans un cadre, jeton en
// sessionStorage envoyé par en-tête (voir api.js). L'autorité reste le Worker.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/martian-mono/wdth.css';
import '../styles/base.css';
import '../styles/typography.css';
import '../styles/components.css';
import './admin.css';

import { assetUrl } from '../data/content.js';
import { api } from './api.js';
import { h } from './dom.js';
import { createGate } from './login.js';
import { createApp } from './app.js';

const mount = document.getElementById('regie');
const siteUrl = import.meta.env.BASE_URL || '/';

function boot() {
  // Jamais dans un cadre : une page tierce ne peut pas superposer la régie à un leurre.
  if (window.top !== window.self) {
    mount.replaceChildren(h('p', { class: 'notice t-body', text: 'La régie ne s’affiche pas dans un cadre.' }));
    return;
  }
  document.documentElement.style.setProperty('--logo-url', `url("${assetUrl('img/acurlaz-logo.svg')}")`);

  if (!api.configured) {
    mount.replaceChildren(
      h(
        'main',
        { class: 'notice' },
        h('p', { class: 'kicker t-label' }, h('span', { class: 'kicker__idx', text: 'Régie' }), h('span', { class: 'kicker__meta', text: 'hors service' })),
        h('h1', { class: 't-head', text: 'adresse de l’API absente' }),
        h('p', { class: 't-body', text: 'Le site a été construit sans la variable VITE_API_URL. Les étapes sont dans worker/README.md.' }),
        h('a', { class: 'link t-label', href: siteUrl, text: 'Retour au site' }),
      ),
    );
    return;
  }

  const gate = createGate(mount, { siteUrl, onEnter: (session) => { gate.hide(); app.enter(session); } });
  const app = createApp(mount, { siteUrl, onSignedOut: (message) => gate.show({ message }) });

  // L'API refuse le jeton : session expirée ou fermée depuis un autre appareil.
  api.onUnauthorized(() => {
    const working = app.hasUnsavedWork;
    app.suspend();
    gate.show({ message: working ? 'Session expirée. Les modifications en cours restent dans cet onglet.' : 'Session expirée.' });
  });

  if (!api.hasToken()) {
    gate.show();
    return;
  }
  // Jeton encore en mémoire de l'onglet : on le vérifie avant d'ouvrir la régie.
  api.session().then(
    (session) => app.enter(session),
    (err) => {
      if (err.status !== 401) gate.show({ message: err.status === 0 ? 'API injoignable.' : err.message });
    },
  );
}

boot();
