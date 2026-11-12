// La régie une fois connecté : navigation, éditeur de la section courante, barre
// d'enregistrement. L'état vit en mémoire ; il survit à une reconnexion (session expirée)
// tant que l'onglet reste ouvert.
import * as site from '../data/content.js';
import { sectionsFromDefaults } from '../data/remote.js';
import { SECTIONS, SECTION_NAMES, validateSection } from '../../worker/src/schema.js';
import { fr } from '../ui/dom.js';
import { api } from './api.js';
import { h, icons, plural, formatClock } from './dom.js';
import { toModel, fromModel, summarize } from './model.js';
import { VIEWS } from './sections.js';
import { renderSection } from './editor.js';
import { renderSecurity } from './security.js';
import { createConfirm } from './dialog.js';

const viewFromHash = () => VIEWS.find((v) => v.id === window.location.hash.slice(1)) || VIEWS[0];

export function createApp(mount, { siteUrl, onSignedOut }) {
  const defaults = sectionsFromDefaults(site);
  const state = { session: null, sections: {}, view: VIEWS[0], ready: false, expiryTimer: 0 };

  // ------------------------------------------------------------------ squelette
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const announce = (text) => {
    live.textContent = '';
    requestAnimationFrame(() => {
      live.textContent = fr(text);
    });
  };

  const navItems = new Map();
  const navList = h('ul', { class: 'navlist' });
  for (const view of VIEWS) {
    const mark = h('span', { class: 'navitem__state t-label', text: 'modifié', hidden: true });
    const link = h('a', { class: 'navitem', href: `#${view.id}` }, h('span', { class: 'navitem__idx t-label', text: view.index }), h('span', { class: 'navitem__word', text: view.word }), mark);
    navItems.set(view.id, { link, mark });
    navList.append(h('li', { class: view.section ? null : 'navlist__sep' }, link));
  }

  const sessionLine = h('p', { class: 'side__session t-label' });
  const side = h(
    'header',
    { class: 'side' },
    h(
      'div',
      { class: 'side__brand' },
      h('a', { href: siteUrl, 'aria-label': 'acurlaz, retour au site' }, h('span', { class: 'logo-mask', 'aria-hidden': 'true' })),
      h('span', { class: 'side__name t-label', text: 'Régie' }),
    ),
    h('nav', { class: 'side__nav', 'aria-label': 'Sections' }, navList),
    h('p', { class: 'side__note t-small', text: '01 sons : hors régie. Les morceaux se gèrent dans le code.' }),
    h(
      'div',
      { class: 'side__foot' },
      sessionLine,
      h('a', { class: 'link t-label', href: siteUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Voir le site', icons.external(), h('span', { class: 'sr-only', text: ' (nouvel onglet)' })),
      h('button', { type: 'button', class: 'btn btn--sm t-label', text: 'Sortir', onclick: () => signOut() }),
    ),
  );

  const bannerAction = h('a', { class: 'btn btn--sm t-label', href: '#securite', text: 'Changer le mot de passe' });
  const bannerText = h('p', { class: 'alertbar__text t-small' });
  const banner = h('div', { class: 'alertbar', hidden: true }, h('p', { class: 'alertbar__label t-label' }, icons.alert(), 'Mot de passe par défaut'), bannerText, bannerAction);

  const kickerIndex = h('span', { class: 'kicker__idx' });
  const kickerMeta = h('span', { class: 'kicker__meta' });
  const heading = h('h1', { class: 'work__word t-title', tabindex: '-1' });
  const sourceNote = h('p', { class: 'work__note t-small', hidden: true });
  const body = h('div', { class: 'work__body' });
  const work = h(
    'main',
    { class: 'work', id: 'travail' },
    h('div', { class: 'work__in' }, banner, h('div', { class: 'work__head' }, h('p', { class: 'kicker t-label' }, kickerIndex, kickerMeta), heading, sourceNote), body),
  );

  const barIcon = h('span', { class: 'savebar__icon' });
  const barLabel = h('span', { class: 'savebar__label t-label' });
  const barDetail = h('span', { class: 'savebar__detail t-small' });
  const barExtra = h('button', { type: 'button', class: 'btn btn--sm t-label', hidden: true });
  const revertButton = h('button', { type: 'button', class: 'btn t-label', text: 'Annuler', 'aria-label': 'Annuler les modifications de cette section', onclick: () => revert() });
  const saveButton = h('button', { type: 'button', class: 'btn btn--primary t-label', text: 'Enregistrer', onclick: () => save() });
  const bar = h(
    'footer',
    { class: 'savebar', 'aria-label': 'Enregistrement' },
    h('span', { class: 'savebar__progress', 'aria-hidden': 'true' }),
    h('div', { class: 'savebar__state' }, barIcon, h('span', { class: 'savebar__text' }, barLabel, barDetail)),
    barExtra,
    revertButton,
    saveButton,
  );

  const el = h('div', { class: 'regie', hidden: true }, h('a', { class: 'skip-link t-label', href: '#travail', text: 'Aller au contenu' }), side, work, bar, live);
  mount.append(el);
  const confirm = createConfirm(el);

  // ------------------------------------------------------------------ état des sections
  function initSection(name, remote, rev) {
    const node = SECTIONS[name];
    const source = remote === undefined ? 'code' : 'api';
    const raw = source === 'api' ? remote : defaults[name];
    const checked = validateSection(name, raw);
    const baseline = checked.ok ? checked.value : raw;
    state.sections[name] = {
      name,
      node,
      rev,
      source, // 'api' : déjà enregistrée ; 'code' : valeurs de content.js, jamais enregistrées
      baseline,
      baselineJson: JSON.stringify(baseline),
      model: toModel(node, baseline),
      errors: new Map(),
      saving: false,
      savedAt: null,
      problem: null, // { message, reload? } : dernier échec d'enregistrement
    };
  }

  const currentSection = () => (state.view.section ? state.sections[state.view.section] : null);
  let flash = ''; // message à montrer au prochain affichage de la page « sécurité »

  function isDirty(section) {
    const checked = validateSection(section.name, fromModel(section.node, section.model));
    return !checked.ok || JSON.stringify(checked.value) !== section.baselineJson;
  }
  const anyDirty = () => Object.values(state.sections).some(isDirty);

  // ------------------------------------------------------------------ affichage
  function paintChrome() {
    for (const view of VIEWS) {
      const { link, mark } = navItems.get(view.id);
      if (view === state.view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      const section = view.section && state.sections[view.section];
      mark.hidden = !(section && isDirty(section));
    }
    banner.hidden = !state.session?.mustChange;
    bannerAction.hidden = state.view.id === 'securite';
    bannerText.textContent = state.session?.writeLocked
      ? 'Il ne vaut que 15 minutes, et la régie ne publie rien tant qu’il est en service.'
      : 'Il ne vaut que 15 minutes. À changer maintenant.';
    sessionLine.textContent = state.session ? `Session jusqu’à ${formatClock(state.session.expiresAt)}` : '';

    const section = currentSection();
    kickerIndex.textContent = state.view.index;
    kickerIndex.hidden = !state.view.index;
    if (section?.node.kind === 'list') {
      const count = section.model.rows.filter((row) => !row.removed).length;
      kickerMeta.textContent = plural(count, section.node.one, section.node.many);
    } else kickerMeta.textContent = state.view.meta || '';

    sourceNote.hidden = !(section && section.source === 'code');
    sourceNote.textContent = 'Valeurs du code, jamais enregistrées. La régie prend la main sur cette section au premier enregistrement.';
    paintBar();
  }

  function paintBar() {
    const section = currentSection();
    bar.hidden = !section;
    if (!section) return;
    const dirty = isDirty(section);
    // Mot de passe par défaut encore en service : l'API refuse toute publication.
    const locked = Boolean(state.session?.writeLocked);
    let tone = 'idle';
    let label = 'À jour';
    let detail = '';
    if (section.saving) [tone, label] = ['busy', 'Enregistrement'];
    else if (locked) [tone, label, detail] = ['error', 'Publication bloquée', dirty ? 'Changer d’abord le mot de passe par défaut. La régie garde les modifications en cours.' : 'Changer d’abord le mot de passe par défaut.'];
    else if (section.problem) [tone, label, detail] = ['error', 'Erreur', section.problem.message];
    else if (dirty) [tone, label] = ['dirty', 'Modifications non enregistrées'];
    else if (section.savedAt) [tone, label] = ['ok', `Enregistré à ${formatClock(section.savedAt)} · en ligne`];

    bar.className = `savebar is-${tone}`;
    barIcon.replaceChildren(...(tone === 'error' ? [icons.alert()] : tone === 'ok' ? [icons.check()] : []));
    barLabel.textContent = label;
    barDetail.textContent = fr(detail);
    barDetail.hidden = !detail;
    barExtra.hidden = !(locked || section.problem?.reload);
    if (locked) {
      barExtra.textContent = 'Changer le mot de passe';
      barExtra.onclick = () => {
        window.location.hash = '#securite';
      };
    } else if (section.problem?.reload) {
      barExtra.textContent = 'Recharger';
      barExtra.onclick = () => reload(section);
    }
    saveButton.disabled = section.saving || !dirty || locked;
    revertButton.disabled = section.saving || !dirty;
    saveButton.textContent = section.saving ? 'Enregistrement' : 'Enregistrer';
  }

  function focusTarget(target) {
    if (!target) return;
    if (target.heading) {
      heading.focus({ preventScroll: true });
      return;
    }
    let node = null;
    if (target.firstError) node = body.querySelector('[aria-invalid="true"], .has-error .chip__radio, .has-error .check__box');
    else if (target.key) {
      const row = body.querySelector(`[data-key="${target.key}"]`);
      if (row) {
        const usable = (n) => n && !n.disabled && n.getClientRects().length > 0;
        if (target.part === 'first-field') node = [...row.querySelectorAll('input, textarea')].find(usable);
        else node = [...row.querySelectorAll(`[data-part="${target.part}"]`)].find(usable);
        // Bouton devenu inactif (ligne arrivée en bout de liste) : l'autre sens, sinon la poignée.
        node ||= [...row.querySelectorAll('[data-part="up"], [data-part="down"], [data-part="grip"], [data-part="toggle"], input, textarea')].find(usable);
        if (target.part === 'first-field') row.scrollIntoView({ block: 'nearest' });
      }
    }
    node?.focus();
  }

  function render(target) {
    const section = currentSection();
    heading.textContent = state.view.word;
    document.title = `${state.view.word} · régie acurlaz`;
    // Sur mobile la navigation défile à l'horizontale : l'onglet courant reste visible.
    navItems.get(state.view.id).link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (!section) {
      body.replaceChildren(
        renderSecurity({
          session: state.session,
          flash,
          confirm,
          announce,
          onPasswordChanged(data) {
            state.session = { ...state.session, expiresAt: data.expiresAt, mustChange: false, writeLocked: false, passwordChangedAt: Date.now() };
            armExpiry();
            flash = 'Mot de passe changé. Les autres sessions sont fermées.';
            render();
          },
          onRevoked: () => leave('Toutes les sessions sont fermées.'),
        }),
      );
    } else {
      const ctx = {
        errors: section.errors,
        changed() {
          section.problem = null;
          paintChrome();
        },
        restructure(focus, message) {
          section.errors.clear();
          section.problem = null;
          render(focus);
          if (message) announce(message);
        },
      };
      body.replaceChildren(renderSection({ viewId: state.view.id, name: section.name, node: section.node, model: section.model, ctx }));
    }
    flash = '';
    paintChrome();
    focusTarget(target);
  }

  function showLoading(message, retry) {
    heading.textContent = 'régie';
    kickerIndex.hidden = true;
    kickerMeta.textContent = '';
    sourceNote.hidden = true;
    bar.hidden = true;
    body.replaceChildren(
      h('p', { class: retry ? 'work__error t-body' : 'work__wait t-label', role: 'status', text: message }),
      retry ? h('button', { type: 'button', class: 'btn t-label', text: 'Réessayer', onclick: retry }) : null,
    );
  }

  // ------------------------------------------------------------------ actions
  function setErrors(section, errors) {
    section.errors.clear();
    for (const error of errors) section.errors.set(error.path, error.message);
    section.problem = { message: plural(errors.length, 'champ à corriger', 'champs à corriger') + '.' };
    render({ firstError: true });
    announce(`Enregistrement impossible : ${section.problem.message}`);
  }

  async function save() {
    const section = currentSection();
    if (!section || section.saving) return;
    const checked = validateSection(section.name, fromModel(section.node, section.model));
    if (!checked.ok) {
      setErrors(section, checked.errors);
      return;
    }
    const lines = summarize(section.node, section.model, section.baseline);
    const ok = await confirm({
      title: 'mettre en ligne ?',
      lines: lines.length ? lines : ['Aucun changement visible.'],
      note: 'Le site affiche la nouvelle version dès l’enregistrement.',
      action: 'Enregistrer',
    });
    if (!ok) return;

    section.saving = true;
    section.problem = null;
    paintBar();
    try {
      const saved = await api.save(section.name, checked.value, section.rev);
      section.rev = saved.rev;
      section.source = 'api';
      section.baseline = saved.value;
      section.baselineJson = JSON.stringify(saved.value);
      section.model = toModel(section.node, saved.value);
      section.savedAt = saved.updatedAt || Date.now();
      section.errors.clear();
      section.saving = false;
      if (currentSection() === section) render();
      else paintChrome();
      announce('Enregistré. Le site affiche la nouvelle version.');
    } catch (err) {
      section.saving = false;
      if (err.status === 422 && err.errors?.length) {
        setErrors(section, err.errors);
        return;
      }
      if (err.code === 'password_change_required') {
        state.session = { ...state.session, mustChange: true, writeLocked: true };
        paintChrome();
        announce('Publication bloquée : changer d’abord le mot de passe par défaut.');
        return;
      }
      if (err.status === 409) section.problem = { message: 'Cette section a changé ailleurs depuis son ouverture. Recharger reprend la version en ligne et abandonne les modifications faites ici.', reload: true };
      else if (err.status === 401) section.problem = { message: 'Session expirée. Rien n’est perdu : se reconnecter, puis enregistrer de nouveau.' };
      else if (err.status === 413) section.problem = { message: 'Section trop volumineuse pour un seul enregistrement.' };
      else section.problem = { message: err.message };
      paintBar();
      announce(`Enregistrement impossible. ${section.problem.message}`);
    }
  }

  async function revert() {
    const section = currentSection();
    if (!section || !isDirty(section)) return;
    const ok = await confirm({
      title: 'tout annuler ?',
      lines: summarize(section.node, section.model, section.baseline),
      note: 'La régie abandonne ces modifications. La version en ligne ne change pas.',
      action: 'Annuler les modifications',
      cancel: 'Continuer à modifier',
      danger: true,
    });
    if (!ok) return;
    section.model = toModel(section.node, section.baseline);
    section.errors.clear();
    section.problem = null;
    render({ heading: true });
    announce('Modifications annulées.');
  }

  async function reload(section) {
    try {
      const data = await api.content();
      initSection(section.name, data.content?.[section.name], data.revs?.[section.name] || 0);
      render({ heading: true });
      announce('Version en ligne rechargée.');
    } catch (err) {
      if (err.status !== 401) {
        section.problem = { message: err.message, reload: true };
        paintBar();
      }
    }
  }

  function armExpiry() {
    clearTimeout(state.expiryTimer);
    if (!state.session) return;
    const wait = Math.min(Math.max(state.session.expiresAt - Date.now(), 0) + 1500, 2 ** 31 - 1);
    // À l'échéance, une requête suffit : l'API répond 401 et l'écran de connexion revient.
    state.expiryTimer = setTimeout(() => api.session().catch(() => {}), wait);
  }

  function leave(message) {
    clearTimeout(state.expiryTimer);
    confirm.close();
    state.session = null;
    state.sections = {};
    state.ready = false;
    body.replaceChildren();
    el.hidden = true;
    onSignedOut(message);
  }

  async function signOut() {
    if (state.ready && anyDirty()) {
      const ok = await confirm({
        title: 'sortir ?',
        lines: ['Des modifications attendent encore l’enregistrement.'],
        note: 'Sortir les efface.',
        action: 'Sortir',
        cancel: 'Rester',
        danger: true,
      });
      if (!ok) return;
    }
    await api.logout();
    leave('');
  }

  async function load() {
    showLoading('Chargement');
    try {
      const [info, data] = await Promise.all([api.session(), api.content()]);
      state.session = { ...state.session, ...info };
      for (const name of SECTION_NAMES) initSection(name, data.content?.[name], data.revs?.[name] || 0);
      state.ready = true;
      state.view = viewFromHash();
      armExpiry();
      render({ heading: true });
    } catch (err) {
      if (err.status !== 401) showLoading(`${err.message} Le contenu n’a pas pu être chargé.`, load);
    }
  }

  window.addEventListener('hashchange', () => {
    if (el.hidden || !state.ready) return;
    state.view = viewFromHash();
    render({ heading: true });
    window.scrollTo(0, 0);
  });

  window.addEventListener('beforeunload', (event) => {
    if (el.hidden || !state.ready || !anyDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  return {
    // Après une connexion. Si la régie était déjà chargée (session expirée en cours de
    // travail), elle reprend telle quelle, brouillons compris.
    enter(session) {
      state.session = { ...state.session, ...session };
      el.hidden = false;
      if (state.ready) {
        // Reprise après une session expirée : l'erreur d'enregistrement n'a plus lieu d'être.
        for (const section of Object.values(state.sections)) section.problem = null;
        armExpiry();
        paintChrome();
        heading.focus({ preventScroll: true });
      } else load();
    },
    // Session refusée par l'API : la régie se met en retrait sans rien perdre.
    suspend() {
      clearTimeout(state.expiryTimer);
      confirm.close();
      el.hidden = true;
    },
    get hasUnsavedWork() {
      return state.ready && anyDirty();
    },
  };
}
