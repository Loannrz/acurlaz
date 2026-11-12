// Confirmation plein écran, sur le modèle de l'index mobile du site : un panneau noir
// opaque, une question en grand, deux boutons. <dialog> natif : focus retenu dans le
// panneau, Échap annule, le focus revient ensuite où il était.
import { h } from './dom.js';
import { fr } from '../ui/dom.js';

export function createConfirm(mount) {
  const dialog = h('dialog', { class: 'ask' });
  mount.append(dialog);
  let settle = null;

  dialog.addEventListener('close', () => {
    dialog.removeAttribute('aria-labelledby');
    dialog.replaceChildren();
    const done = settle;
    settle = null;
    done?.(dialog.returnValue === 'ok');
  });

  // danger : l'action détruit quelque chose, le focus se pose sur « Annuler ».
  function confirm({ title, lines = [], note = '', action, cancel = 'Annuler', danger = false }) {
    if (settle) return Promise.resolve(false);
    return new Promise((resolve) => {
      settle = resolve;
      const no = h('button', { type: 'button', class: 'btn t-label', text: cancel, onclick: () => dialog.close('') });
      const yes = h('button', { type: 'button', class: 'btn btn--primary t-label', text: action, onclick: () => dialog.close('ok') });
      dialog.replaceChildren(
        h(
          'div',
          { class: 'ask__in' },
          h('p', { class: 'kicker t-label' }, h('span', { class: 'kicker__idx', text: 'Confirmation' })),
          h('h2', { class: 'ask__title t-title', id: 'ask-titre', text: fr(title) }),
          lines.length ? h('ul', { class: 'ask__lines' }, lines.map((line) => h('li', { class: 't-data', text: fr(line) }))) : null,
          note ? h('p', { class: 'ask__note t-body', text: fr(note) }) : null,
          h('div', { class: 'ask__actions' }, no, yes),
        ),
      );
      dialog.setAttribute('aria-labelledby', 'ask-titre');
      dialog.returnValue = '';
      dialog.showModal();
      (danger ? no : yes).focus();
    });
  }

  confirm.close = () => {
    if (dialog.open) dialog.close('');
  };
  return confirm;
}
