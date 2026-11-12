// Écran de connexion. Le mot « régie » occupe le bas de l'écran, éteint ; il se remplit
// en crème quand l'accès est accordé, comme le logo de l'écran de chargement du site.
import { api } from './api.js';
import { h, icons, formatCountdown } from './dom.js';
import { tokenSeconds } from '../ui/dom.js';

export function createGate(mount, { siteUrl, onEnter }) {
  let busy = false;
  let lockTimer = 0;

  const password = h('input', {
    class: 'field',
    id: 'acces-mot-de-passe',
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: 200,
    'aria-describedby': 'acces-etat',
  });
  const reveal = h('button', { type: 'button', class: 'btn btn--sm t-label pass__toggle', 'aria-pressed': 'false', text: 'Afficher' });
  reveal.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show));
    reveal.textContent = show ? 'Masquer' : 'Afficher';
  });

  const notice = h('p', { class: 'gate__notice t-small', hidden: true });
  const statusText = h('span');
  const status = h('p', { class: 'gate__status t-small', id: 'acces-etat', role: 'alert', hidden: true }, icons.alert(), statusText);
  const clock = h('span', { class: 'gate__clock t-readout' });
  const lock = h('p', { class: 'gate__lock', hidden: true }, h('span', { class: 't-label', text: 'Nouvel essai dans' }), clock);
  const submit = h('button', { type: 'submit', class: 'btn btn--primary t-label', text: 'Entrer' });

  const form = h(
    'form',
    { class: 'gate__form', novalidate: '' },
    // Champ d'identifiant fixe : les gestionnaires de mots de passe rangent l'entrée sous ce nom.
    h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'acurlaz', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', readonly: true }),
    h('div', { class: 'fld' }, h('label', { class: 'fld__label t-label', for: 'acces-mot-de-passe', text: 'Mot de passe' }), h('div', { class: 'pass' }, password, reveal)),
    status,
    lock,
    submit,
  );

  const el = h(
    'div',
    { class: 'gate', hidden: true },
    h(
      'header',
      { class: 'gate__top' },
      h('a', { class: 'gate__brand', href: siteUrl, 'aria-label': 'acurlaz, retour au site' }, h('span', { class: 'logo-mask', 'aria-hidden': 'true' })),
      h('a', { class: 'link t-label', href: siteUrl }, 'Voir le site'),
    ),
    h(
      'main',
      { class: 'gate__panel' },
      h('h1', { class: 'sr-only', text: 'Régie d’acurlaz : connexion' }),
      h('p', { class: 'kicker t-label' }, h('span', { class: 'kicker__idx', text: '00' }), h('span', { class: 'kicker__meta', text: 'Accès réservé' })),
      notice,
      form,
    ),
    h('div', { class: 'gate__word', 'aria-hidden': 'true' }, h('span', { class: 'gate__ink t-giant', text: 'régie' }), h('span', { class: 'gate__ink gate__ink--fill t-giant', text: 'régie' })),
  );
  mount.append(el);

  function setStatus(text) {
    statusText.textContent = text || '';
    status.hidden = !text;
  }

  function setBusy(value) {
    busy = value;
    submit.disabled = value || Boolean(lockTimer);
    submit.textContent = value ? 'Vérification' : 'Entrer';
    form.setAttribute('aria-busy', String(value));
  }

  // Blocage temporaire : compte à rebours, bouton coupé jusqu'à la fin.
  function startLock(seconds) {
    clearInterval(lockTimer);
    const until = Date.now() + seconds * 1000;
    const paint = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      clock.textContent = formatCountdown(left);
      if (left === 0) {
        clearInterval(lockTimer);
        lockTimer = 0;
        lock.hidden = true;
        submit.disabled = busy;
        setStatus('');
      }
    };
    lock.hidden = false;
    lockTimer = setInterval(paint, 1000);
    paint();
    submit.disabled = true;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || lockTimer) return;
    if (!password.value) {
      setStatus('Saisir le mot de passe.');
      password.focus();
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const session = await api.login(password.value);
      password.value = '';
      el.classList.add('is-open');
      await new Promise((resolve) => setTimeout(resolve, tokenSeconds('--dur-beat', 0.484) * 1000));
      setBusy(false);
      onEnter(session);
    } catch (err) {
      setBusy(false);
      if (err.status === 429) {
        setStatus('Trop de tentatives.');
        startLock(err.retryAfter || 60);
      } else if (err.status === 401) {
        setStatus('Connexion refusée.');
        if (err.retryAfter) startLock(err.retryAfter);
      } else if (err.code === 'initial_password_expired') {
        setStatus('Le mot de passe initial a expiré : il ne vaut que 15 minutes. La remise à zéro est décrite dans worker/README.md.');
      } else if (err.status === 403) {
        setStatus('L’API n’autorise pas cette adresse (ALLOWED_ORIGINS).');
      } else if (err.code === 'not_initialized' || err.code === 'not_configured') {
        setStatus('L’API n’est pas encore initialisée. Voir worker/README.md.');
      } else {
        setStatus(err.status === 0 ? 'API injoignable.' : err.message);
      }
      password.select();
      password.focus();
    }
  });

  return {
    show({ message = '' } = {}) {
      el.classList.remove('is-open');
      notice.textContent = message;
      notice.hidden = !message;
      setStatus('');
      el.hidden = false;
      document.title = 'acurlaz · régie';
      password.focus();
    },
    hide() {
      el.hidden = true;
    },
  };
}
