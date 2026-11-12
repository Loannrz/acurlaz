// Page « sécurité » : changer le mot de passe, voir et fermer les sessions.
import { passwordProblem, PASSWORD_MIN } from '../../worker/src/rules.js';
import { api } from './api.js';
import { h, icons, plural, formatClock, formatStamp } from './dom.js';

let counter = 0;

function passwordField(label, autocomplete, hint) {
  const id = `secret-${++counter}`;
  const input = h('input', { class: 'field', id, type: 'password', autocomplete, autocapitalize: 'off', spellcheck: 'false', maxlength: 200, 'aria-describedby': `${id}-aide ${id}-erreur` });
  const hintEl = h('p', { class: 'fld__hint t-small', id: `${id}-aide`, text: hint || '', hidden: !hint });
  const errorText = h('span');
  const errorEl = h('p', { class: 'fld__error t-small', id: `${id}-erreur`, hidden: true }, icons.alert(), errorText);
  const wrap = h('div', { class: 'fld' }, h('label', { class: 'fld__label t-label', for: id, text: label }), input, hintEl, errorEl);
  const setError = (message) => {
    errorText.textContent = message || '';
    errorEl.hidden = !message;
    wrap.classList.toggle('has-error', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  input.addEventListener('input', () => setError(''));
  return { wrap, input, hintEl, setError };
}

const waitText = (seconds) => (seconds < 60 ? plural(seconds, 'seconde', 'secondes') : plural(Math.ceil(seconds / 60), 'minute', 'minutes'));

// `flash` : message à afficher d'emblée (le mot de passe vient d'être changé).
export function renderSecurity({ session, flash = '', confirm, announce, onPasswordChanged, onRevoked }) {
  const current = passwordField('Mot de passe actuel', 'current-password');
  const next = passwordField('Nouveau mot de passe', 'new-password', 'Une phrase de plusieurs mots convient.');
  const again = passwordField('Nouveau mot de passe, une seconde fois', 'new-password');
  const fields = [current, next, again];

  const meter = h('p', { class: 'secure__meter t-data', 'aria-hidden': 'true' });
  const paintMeter = () => {
    const n = [...next.input.value].length;
    meter.textContent = `${plural(n, 'caractère', 'caractères')} / ${PASSWORD_MIN} min.`;
    meter.classList.toggle('is-ok', n >= PASSWORD_MIN);
  };
  next.input.addEventListener('input', paintMeter);
  paintMeter();
  next.wrap.insertBefore(meter, next.hintEl);

  const showId = `secret-${++counter}`;
  const show = h('input', { type: 'checkbox', class: 'check__box', id: showId });
  show.addEventListener('change', () => {
    for (const f of fields) f.input.type = show.checked ? 'text' : 'password';
  });

  const statusText = h('span');
  const status = h('p', { class: 'secure__status t-small', role: 'status', hidden: true }, statusText);
  const setStatus = (message, tone = 'ok') => {
    statusText.textContent = message || '';
    status.hidden = !message;
    status.classList.toggle('is-error', tone === 'error');
  };

  setStatus(flash);

  const submit = h('button', { type: 'submit', class: 'btn btn--primary t-label', text: 'Changer le mot de passe' });
  const form = h(
    'form',
    { class: 'secure__form', novalidate: '' },
    h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'acurlaz', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', readonly: true }),
    current.wrap,
    next.wrap,
    again.wrap,
    h('label', { class: 'check', for: showId }, show, h('span', { class: 'check__text', text: 'Afficher les mots de passe' })),
    status,
    submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    setStatus('');
    const problem = passwordProblem(next.input.value);
    const errors = [
      [current, current.input.value ? '' : 'À remplir.'],
      [next, problem || (next.input.value === current.input.value ? 'Le nouveau mot de passe doit différer de l’ancien.' : '')],
      [again, again.input.value === next.input.value ? '' : 'Les deux saisies diffèrent.'],
    ];
    for (const [field, message] of errors) field.setError(message);
    const first = errors.find(([, message]) => message);
    if (first) {
      first[0].input.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Vérification';
    try {
      const data = await api.changePassword(current.input.value, next.input.value);
      announce('Mot de passe changé. Les autres sessions sont fermées.');
      onPasswordChanged(data); // la page est redessinée avec le nouvel état
    } catch (err) {
      if (err.status === 403) {
        current.setError(err.retryAfter ? `Mot de passe actuel refusé. Nouvel essai possible dans ${waitText(err.retryAfter)}.` : 'Mot de passe actuel refusé.');
        current.input.focus();
      } else if (err.status === 422) {
        next.setError(err.message);
        next.input.focus();
      } else if (err.status === 429) {
        setStatus(`Trop de tentatives. Nouvel essai possible dans ${waitText(err.retryAfter || 60)}.`, 'error');
      } else if (err.status !== 401) {
        setStatus(err.message, 'error');
      }
    } finally {
      submit.disabled = false;
      submit.textContent = 'Changer le mot de passe';
    }
  });

  const revoke = h('button', {
    type: 'button',
    class: 'btn t-label',
    text: 'Fermer toutes les sessions',
    onclick: async () => {
      const ok = await confirm({
        title: 'tout fermer ?',
        lines: ['Ferme toutes les sessions ouvertes, celle-ci comprise.'],
        note: 'Il faudra se reconnecter. Les modifications non enregistrées disparaissent.',
        action: 'Fermer les sessions',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.revokeAll();
        onRevoked();
      } catch (err) {
        if (err.status !== 401) announce(err.message);
      }
    },
  });

  const fact = (label, value) => h('div', { class: 'secure__fact' }, h('dt', { class: 't-label', text: label }), h('dd', { class: 't-item', text: value }));

  return h(
    'div',
    { class: 'secure' },
    h(
      'section',
      { class: 'secure__block' },
      h('h2', { class: 'lhead__title t-head', text: 'mot de passe' }),
      h('p', {
        class: 'secure__lead t-body',
        text: session.mustChange
          ? 'Le mot de passe par défaut est encore en service, pour 15 minutes au plus. Le remplacer ferme toutes les autres sessions.'
          : session.passwordChangedAt
            ? `Changé le ${formatStamp(session.passwordChangedAt)}. Le remplacer ferme toutes les autres sessions.`
            : 'Le remplacer ferme toutes les autres sessions.',
      }),
      form,
    ),
    h(
      'section',
      { class: 'secure__block' },
      h('h2', { class: 'lhead__title t-head', text: 'session' }),
      h(
        'dl',
        { class: 'secure__facts' },
        fact('Ouverte jusqu’à', formatClock(session.expiresAt)),
        fact('Connexion précédente', session.previousLoginAt ? formatStamp(session.previousLoginAt) : 'Aucune'),
      ),
      revoke,
    ),
    h(
      'section',
      { class: 'secure__block' },
      h('h2', { class: 'lhead__title t-head', text: 'à savoir' }),
      h(
        'ul',
        { class: 'secure__notes t-small' },
        h('li', { text: 'Cinq essais ratés bloquent l’adresse une minute. Chaque échec suivant double l’attente, jusqu’à douze heures.' }),
        h('li', { text: 'L’API garde une empreinte du mot de passe et rien d’autre.' }),
        h('li', { text: 'La session vit dans cet onglet : le fermer déconnecte.' }),
        h('li', { text: 'Mot de passe perdu : worker/README.md décrit la remise à zéro.' }),
      ),
    ),
  );
}
