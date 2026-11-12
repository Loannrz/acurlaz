// Construction du DOM (chaînes HTML). Structure : docs/DA.md 13.4.
import { esc, t, isLink, pad2, fmtTime, fmtHour, dateParts, plural, icons } from './dom.js';

export const SECTIONS = [
  { id: 'sons', label: 'sons' },
  { id: 'dates', label: 'dates' },
  { id: 'avec', label: 'avec' },
  { id: 'bio', label: 'bio' },
  { id: 'contact', label: 'contact' },
];

const CAT_LABELS = { house: 'House', techno: 'Techno', afro: 'Afro', disco: 'Disco', breaks: 'Breaks' };

const lines = (arr) =>
  arr.map((l) => `<span class="line"><span class="line__in">${t(l)}</span></span>`).join('');

const kicker = (idx, meta = '', metaAttrs = '') =>
  `<p class="kicker t-label" data-reveal="fade"><span class="kicker__idx">${esc(idx)}</span>${
    meta ? `<span class="kicker__meta" ${metaAttrs}>${t(meta)}</span>` : ''
  }</p>`;

const extLink = (href, label, cls = 'link') =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${t(label)}${icons.arrow}<span class="sr-only"> (nouvel onglet)</span></a>`;

// ---------------------------------------------------------------- backdrop
function backdrop() {
  const words = SECTIONS.map(
    (s) => `<span class="backdrop__word t-giant" data-section="${s.id}">${s.label}</span>`,
  ).join('');
  return `<div class="backdrop" aria-hidden="true"><span class="backdrop__logo" data-section="ouverture"></span>${words}</div>`;
}

// ---------------------------------------------------------------- ouverture
function ouverture({ artist, about }) {
  const styles = about.facts.find((f) => /style/i.test(f.label))?.value;
  const city = about.facts.find((f) => /bas/i.test(f.label))?.value;
  const bits = [artist.role, styles, city].filter(Boolean);
  return `<section class="stage" id="ouverture" aria-labelledby="titre-ouverture">
    <h2 class="sr-only" id="titre-ouverture" tabindex="-1">Accueil</h2>
    <div class="stage__panel stage__panel--ouverture">
      <p class="intro t-label" data-reveal="fade">${bits.map((b) => `<span>${t(b)}</span>`).join('')}</p>
      <span class="stage__logo-mobile" aria-hidden="true" data-reveal="fade"></span>
      <a class="scroll-cue t-label" href="#sons" data-reveal="fade">Défiler<span class="scroll-cue__line" aria-hidden="true"></span></a>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- sons
function trackRow(tr, i) {
  return `<li><button type="button" class="row row--track" data-track="${esc(tr.id)}">
    <span class="row__index t-data" aria-hidden="true"><span class="row__num">${pad2(i + 1)}</span><span class="row__playing">${icons.play}</span></span>
    <span class="row__main"><span class="row__title t-item">${t(tr.title)}</span><span class="row__sub t-data">${t(tr.artist)}</span></span>
    <span class="row__bpm t-data">${esc(tr.bpm)}<span class="row__unit">&nbsp;BPM</span></span>
    <span class="row__key t-data">${esc(tr.key)}</span>
    <span class="row__dur t-data">${fmtTime(tr.duration)}</span>
    <span class="sr-only row__state"></span>
  </button></li>`;
}

function sons({ tracks }) {
  return `<section class="stage" id="sons" aria-labelledby="titre-sons">
    <h2 class="sr-only" id="titre-sons" tabindex="-1">Sons</h2>
    <div class="stage__panel stage__panel--left">
      <div class="stack stack--fill">
        <div class="head">
          ${kicker('01', plural(tracks.length, 'titre', 'titres'))}
          <p class="hint t-small" data-reveal="fade">Choisir un titre, puis Play.</p>
        </div>
        <ul class="rows rows--scroll rows--tracks" data-reveal="rows" data-lenis-prevent>${tracks.map(trackRow).join('')}</ul>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- dates
function dateRow(d, isNext) {
  const p = dateParts(d.when);
  const sold = Boolean(d.soldOut);
  let action;
  if (sold) {
    action = `<span class="tag tag--accent t-label">Complet</span>`;
  } else if (isLink(d.ticketUrl)) {
    action = extLink(d.ticketUrl, 'Billetterie', 'btn btn--sm t-label');
  } else {
    action = `<button type="button" class="btn btn--sm t-label" disabled title="Lien à venir">Billetterie<span class="sr-only"> : lien à venir</span></button>`;
  }
  return `<li class="drow${isNext ? ' is-next' : ''}${sold ? ' is-soldout' : ''}">
    <div class="drow__date"><span class="drow__day t-head">${p.day}</span><span class="drow__dm t-label">${esc(p.week)} ${esc(p.month)}</span></div>
    <div class="drow__place">
      <span class="drow__venue t-item">${t(d.venue)}</span>
      <span class="drow__sub"><span class="drow__city t-label">${t(d.city)}</span>${
        isNext ? '<span class="tag tag--accent t-label">Prochaine</span>' : ''
      }</span>
    </div>
    <span class="drow__time t-data"><span class="sr-only">Set à </span>${esc(fmtHour(d.set))}</span>
    <div class="drow__action">${action}</div>
  </li>`;
}

function dates({ upcoming }) {
  const list = upcoming.length
    ? `<ul class="rows rows--scroll rows--dates" data-reveal="rows" data-lenis-prevent>${upcoming
        .map((d, i) => dateRow(d, i === 0))
        .join('')}</ul>`
    : `<p class="empty t-body" data-reveal="fade">Aucune date annoncée pour l’instant. Les prochaines s’affichent ici dès leur confirmation.</p>`;
  return `<section class="stage" id="dates" aria-labelledby="titre-dates">
    <h2 class="sr-only" id="titre-dates" tabindex="-1">Dates</h2>
    <div class="stage__panel stage__panel--right">
      <div class="stack stack--fill">
        <div class="head">${kicker('02', plural(upcoming.length, 'date', 'dates'))}</div>
        ${list}
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- avec
function avecRow(c) {
  const where = [c.where, c.year].filter(Boolean).join(', ');
  const insta = isLink(c.instagramUrl)
    ? extLink(c.instagramUrl, 'Instagram', 'link t-label')
    : '';
  return `<li class="arow" data-cat="${esc(c.cat)}">
    <span class="arow__name t-item">${t(c.name)}</span>
    <span class="arow__style t-label">${t(c.style)}</span>
    <span class="arow__where t-data">${t(where)}</span>
    ${insta}
  </li>`;
}

function avec({ collaborators }) {
  const cats = [...new Set(collaborators.map((c) => c.cat))];
  const chips = [
    `<button type="button" class="tag tag--filter t-label" data-filter="all" aria-pressed="true">Tous</button>`,
    ...cats.map(
      (c) =>
        `<button type="button" class="tag tag--filter t-label" data-filter="${esc(c)}" aria-pressed="false">${esc(CAT_LABELS[c] || c)}</button>`,
    ),
  ].join('');
  return `<section class="stage" id="avec" aria-labelledby="titre-avec">
    <h2 class="sr-only" id="titre-avec" tabindex="-1">Avec</h2>
    <div class="stage__panel stage__panel--left">
      <div class="stack stack--fill">
        <div class="head">
          ${kicker('03', plural(collaborators.length, 'artiste', 'artistes'), 'data-count aria-live="polite"')}
          <div class="chips" role="group" aria-label="Filtrer par style" data-reveal="fade">${chips}</div>
        </div>
        <ul class="rows rows--scroll rows--avec" data-reveal="rows" data-lenis-prevent>${collaborators.map(avecRow).join('')}</ul>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- bio
function bio({ about }) {
  const [lead, ...rest] = about.paragraphs;
  return `<section class="stage" id="bio" aria-labelledby="titre-bio">
    <h2 class="sr-only" id="titre-bio" tabindex="-1">Bio</h2>
    <div class="stage__panel stage__panel--right stage__panel--volet">
      <div class="stack">
        ${kicker('04')}
        <p class="t-lead" data-reveal="fade">${t(lead)}</p>
        ${rest.map((p) => `<p class="t-body" data-reveal="fade">${t(p)}</p>`).join('')}
        <dl class="facts" data-reveal="rows">${about.facts
          .map((f) => `<div class="fact"><dt class="t-label">${t(f.label)}</dt><dd class="t-item">${t(f.value)}</dd></div>`)
          .join('')}</dl>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- contact
function contact({ links, contact: c }) {
  const email = c?.email;
  const write = isLink(email)
    ? `<a class="btn btn--primary t-label" href="mailto:${esc(email)}">Écrire</a>
       <button type="button" class="btn t-label" data-copy="${esc(email)}">Copier l’adresse</button>`
    : '';
  const socials = links
    .filter((l) => isLink(l.url))
    .map((l) => `<li>${extLink(l.url, l.name, 'link t-label')}</li>`)
    .join('');
  return `<section class="stage" id="contact" aria-labelledby="titre-contact">
    <h2 class="sr-only" id="titre-contact" tabindex="-1">Contact</h2>
    <div class="stage__panel stage__panel--center stage__panel--contact">
      <div class="stack stack--center">
        ${kicker('05')}
        <p class="t-title" data-reveal="lines">${lines(['Une date, un projet ?', 'Écrivez.'])}</p>
        ${write ? `<div class="actions" data-reveal="fade">${write}<span class="sr-only" role="status" data-copy-status></span></div>` : ''}
        <ul class="socials" data-reveal="fade">${socials}</ul>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- navigation, rail, lecteur
function nav() {
  const items = SECTIONS.map(
    (s) => `<li><a class="nav__link t-label" href="#${s.id}" data-goto="${s.id}">${s.label}</a></li>`,
  ).join('');
  return `<header class="nav">
    <a class="nav__logo" href="#ouverture" data-goto="ouverture" aria-label="acurlaz, retour à l’accueil"><span class="logo-mask" aria-hidden="true"></span></a>
    <nav aria-label="Navigation principale"><ul class="nav__list">${items}</ul></nav>
    <button type="button" class="nav__menu t-label" aria-expanded="false" aria-controls="menu" data-menu-open>Menu</button>
  </header>`;
}

function menu() {
  const items = SECTIONS.map(
    (s, i) => `<li><a class="menu__link t-title" href="#${s.id}" data-goto="${s.id}"><span class="menu__idx t-label">${pad2(i + 1)}</span>${s.label}</a></li>`,
  ).join('');
  return `<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Menu" hidden>
    <button type="button" class="menu__close btn t-label" data-menu-close>${icons.close}Fermer</button>
    <ul class="menu__list">${items}</ul>
  </div>`;
}

function rail() {
  const ticks = SECTIONS.map((s) => `<span class="rail__tick" data-tick="${s.id}"></span>`).join('');
  return `<div class="rail" aria-hidden="true"><span class="rail__line"></span><span class="rail__fill"></span>${ticks}</div>`;
}

function player() {
  return `<section class="player" aria-label="Lecteur" hidden>
    <div class="player__bar" role="progressbar" aria-label="Progression du titre" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="player__fill"></span></div>
    <button type="button" class="btn-round" data-player-toggle aria-label="Lire"><span class="btn-round__icon">${icons.play}</span></button>
    <p class="player__title"><span class="player__name t-item"></span><span class="player__artist t-data"></span></p>
    <p class="player__time t-readout" data-player-time>00:00</p>
    <p class="player__meta t-data"><span data-player-dur>00:00</span><span data-player-bpm></span></p>
  </section>
  <p class="sr-only" id="live" aria-live="polite"></p>`;
}

// ---------------------------------------------------------------- assemblage
export function buildApp(content) {
  const { artist, about, tracks, collaborators, links, credits, upcoming } = content;
  const ctx = { artist, about, tracks, collaborators, links, credits, upcoming, contact: content.contact };
  return [
    backdrop(),
    nav(),
    player(),
    `<main id="contenu" tabindex="-1">
      <h1 class="sr-only">acurlaz</h1>
      ${ouverture(ctx)}${sons(ctx)}${dates(ctx)}${avec(ctx)}${bio(ctx)}${contact(ctx)}
    </main>`,
    rail(),
    menu(),
  ].join('');
}
