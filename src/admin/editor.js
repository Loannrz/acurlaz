// Éditeur d'une section, construit à partir du schéma : champs simples, puis une liste par
// tableau (ajouter, modifier, supprimer, réordonner). Les champs écrivent dans le brouillon
// à chaque frappe ; rien ne part vers l'API avant « Enregistrer ».
import { emptyValue } from '../../worker/src/schema.js';
import { h, icons, pad2, plural } from './dom.js';
import { fromModel, makeRow } from './model.js';
import { LISTS, spanOf } from './sections.js';
import { enableReorder } from './reorder.js';

let counter = 0;
const uid = (prefix) => `${prefix}-${++counter}`;

const hasErrorUnder = (errors, path) => {
  for (const key of errors.keys()) if (key === path || key.startsWith(`${path}.`) || key.startsWith(`${path}[`)) return true;
  return false;
};

// Le message du schéma commence par le libellé du champ : inutile sous le champ lui-même.
const shortMessage = (node, message) => {
  const prefix = `${node.label} : `;
  const text = message.startsWith(prefix) ? message.slice(prefix.length) : message;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// ------------------------------------------------------------------ champ
// `get` / `set` lisent et écrivent le brouillon. `ctx.changed()` prévient la régie.
function renderField({ key, node, get, set, path, uiPath, ctx, onInput, label }) {
  const id = uid('champ');
  const hintId = node.hint ? `${id}-aide` : null;
  const errorId = `${id}-erreur`;
  const message = ctx.errors.get(path);
  const wrap = h('div', { class: `fld fld--${spanOf(uiPath, key, node)}${message ? ' has-error' : ''}` });
  const errorEl = h('p', { class: 'fld__error t-small', id: errorId, hidden: !message }, icons.alert(), h('span', { text: message ? shortMessage(node, message) : '' }));
  const describedBy = [hintId, message ? errorId : null].filter(Boolean).join(' ') || null;
  const text = label || node.label;
  let control;

  const commit = (value) => {
    set(value);
    if (ctx.errors.delete(path)) {
      wrap.classList.remove('has-error');
      errorEl.hidden = true;
      control.removeAttribute?.('aria-invalid');
    }
    onInput?.();
    ctx.changed();
  };

  const common = {
    id,
    class: 'field',
    'aria-describedby': describedBy,
    'aria-invalid': message ? 'true' : null,
    'aria-required': node.required ? 'true' : null,
  };

  let labelEl = h('label', { class: 'fld__label t-label', for: id }, text, node.required ? h('span', { class: 'fld__req', text: 'requis' }) : null);
  let counterEl = null;

  switch (node.kind) {
    case 'text':
      if (node.long) {
        counterEl = h('span', { class: 'fld__count t-data', 'aria-hidden': 'true' });
        const paint = () => {
          counterEl.textContent = `${[...control.value].length} / ${node.max}`;
        };
        control = h('textarea', { ...common, rows: 5, maxlength: node.max, value: get(), oninput: () => { paint(); commit(control.value); } });
        paint();
      } else {
        control = h('input', { ...common, type: 'text', maxlength: node.max, autocomplete: 'off', value: get(), oninput: () => commit(control.value) });
      }
      break;
    case 'date':
      control = h('input', { ...common, type: 'date', min: '2000-01-01', max: '2100-12-31', value: get(), oninput: () => commit(control.value) });
      break;
    case 'time':
      control = h('input', { ...common, type: 'time', value: get(), oninput: () => commit(control.value) });
      break;
    case 'url':
      control = h('input', { ...common, type: 'url', inputmode: 'url', maxlength: node.max, placeholder: 'https://', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: get(), oninput: () => commit(control.value) });
      break;
    case 'email':
      control = h('input', { ...common, type: 'email', inputmode: 'email', maxlength: node.max, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: get(), oninput: () => commit(control.value) });
      break;
    case 'int': {
      const current = get();
      control = h('input', {
        ...common,
        type: 'text',
        inputmode: 'numeric',
        maxlength: 6,
        autocomplete: 'off',
        value: current === null || current === undefined ? '' : String(current),
        oninput: () => {
          const raw = control.value.trim();
          // Un nombre entier part en nombre ; toute autre saisie reste telle quelle et sera signalée.
          commit(raw === '' ? null : /^\d+$/.test(raw) ? Number(raw) : raw);
        },
      });
      break;
    }
    case 'bool': {
      control = h('input', { id, type: 'checkbox', class: 'check__box', checked: Boolean(get()), 'aria-describedby': describedBy, onchange: () => commit(control.checked) });
      wrap.classList.add('fld--check');
      wrap.append(h('label', { class: 'check', for: id }, control, h('span', { class: 'check__text', text })));
      if (node.hint) wrap.append(h('p', { class: 'fld__hint t-small', id: hintId, text: node.hint }));
      wrap.append(errorEl);
      return wrap;
    }
    case 'enum': {
      const name = uid('choix');
      control = h('fieldset', { class: 'fld__set', 'aria-describedby': describedBy });
      control.append(h('legend', { class: 'fld__label t-label', text }));
      const chips = h('div', { class: 'chips' });
      for (const option of node.options) {
        const optionId = uid('option');
        const radio = h('input', { type: 'radio', class: 'chip__radio', id: optionId, name, value: option.value, checked: get() === option.value, onchange: () => commit(option.value) });
        chips.append(h('span', { class: 'chip' }, radio, h('label', { class: 'chip__label tag tag--filter t-label', for: optionId, text: option.label })));
      }
      control.append(chips);
      wrap.append(control);
      if (node.hint) wrap.append(h('p', { class: 'fld__hint t-small', id: hintId, text: node.hint }));
      wrap.append(errorEl);
      return wrap;
    }
    default:
      control = h('input', { ...common, type: 'text', value: String(get() ?? ''), oninput: () => commit(control.value) });
  }

  wrap.append(h('div', { class: 'fld__top' }, labelEl, counterEl), control);
  if (node.hint) wrap.append(h('p', { class: 'fld__hint t-small', id: hintId, text: node.hint }));
  wrap.append(errorEl);
  return wrap;
}

// Champs simples d'un objet : d'abord ceux que le site affiche, puis les autres, repliés.
function renderFields({ node, model, path, uiPath, ctx, onInput }) {
  const shown = [];
  const extra = [];
  let extraHasError = false;
  for (const [key, field] of Object.entries(node.fields)) {
    if (field.kind === 'list') continue;
    const fieldPath = path ? `${path}.${key}` : key;
    const el = renderField({
      key,
      node: field,
      get: () => model[key],
      set: (value) => {
        model[key] = value;
      },
      path: fieldPath,
      uiPath,
      ctx,
      onInput,
    });
    if (field.extra) {
      extra.push(el);
      if (ctx.errors.has(fieldPath)) extraHasError = true;
    } else shown.push(el);
  }
  const box = h('div', { class: 'fieldset' });
  if (shown.length) box.append(h('div', { class: 'fields' }, shown));
  if (extra.length) {
    box.append(
      h(
        'details',
        { class: 'extras', open: extraHasError },
        h('summary', { class: 'extras__summary t-label' }, h('span', { text: `Hors affichage · ${plural(extra.length, 'champ', 'champs')}` }), icons.chevron()),
        h('p', { class: 'extras__note t-small', text: 'Gardés en réserve : le site ne montre pas encore ces champs.' }),
        h('div', { class: 'fields' }, extra),
      ),
    );
  }
  return box;
}

// ------------------------------------------------------------------ liste
function renderList({ node, model, path, uiPath, title, ctx }) {
  const ui = LISTS[uiPath] || { layout: 'drawer', addAt: 'bottom', add: 'Ajouter' };
  const rows = model.rows;
  const live = rows.filter((row) => !row.removed);
  const liveValues = live.map((row) => fromModel(node.item, row.value));
  const sortable = !node.sortBy;
  const full = live.length >= node.max;
  const nearFull = live.length >= node.max * 0.8;

  const add = () => {
    const row = makeRow(node.item, emptyValue(node.item), true);
    if (ui.addAt === 'top') rows.unshift(row);
    else rows.push(row);
    ctx.restructure({ key: row.key, part: 'first-field' }, 'Ligne ajoutée.');
  };

  const move = (from, to) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const [row] = rows.splice(from, 1);
    rows.splice(to, 0, row);
    return row;
  };

  const block = h('section', { class: 'lblock' });
  const hintText = ui.hint || node.hint;
  block.append(
    h(
      'div',
      { class: 'lhead' },
      h(
        'div',
        { class: 'lhead__text' },
        title ? h('h2', { class: 'lhead__title t-head', text: title }) : null,
        // Le compteur d'une liste de premier niveau est déjà dans l'en-tête de page.
        title || nearFull ? h('p', { class: 'lhead__meta t-label', text: `${plural(live.length, node.one || 'ligne', node.many || 'lignes')}${nearFull ? ` · ${node.max} au plus` : ''}` }) : null,
        hintText ? h('p', { class: 'lhead__hint t-small', text: hintText }) : null,
      ),
      h('button', { type: 'button', class: 'btn btn--sm t-label', disabled: full, onclick: add }, icons.plus(), ui.add),
    ),
  );

  if (!rows.length) {
    block.append(h('p', { class: 'empty t-body', text: 'Liste vide. Le bouton « Ajouter » crée la première ligne.' }));
    return block;
  }

  const list = h('ul', { class: `elist elist--${ui.layout}` });
  let rank = 0;
  rows.forEach((row, index) => {
    const liveIndex = row.removed ? -1 : rank++;
    const rowPath = liveIndex < 0 ? null : `${path}[${liveIndex}]`;
    const shared = { node, rows, row, index, liveIndex, liveValues, rowPath, uiPath, ui, sortable, ctx, total: rows.length, move };
    list.append(row.removed ? renderRemovedRow(shared) : ui.layout === 'inline' ? renderInlineRow(shared) : renderDrawerRow(shared));
  });
  if (sortable) {
    enableReorder(list, {
      onMove(from, to) {
        const row = move(from, to);
        if (row) ctx.restructure({ key: row.key, part: 'grip' }, `Ligne déplacée : position ${to + 1} sur ${rows.length}.`);
      },
    });
  }
  block.append(list);
  return block;
}

const rowTitle = (shared) => {
  const { node, row, ui, liveIndex, liveValues } = shared;
  const value = fromModel(node.item, row.value);
  if (ui.summary) return ui.summary(value, { all: liveValues, index: liveIndex }).title || ui.blank || 'Sans titre';
  if (typeof value === 'string') return value.slice(0, 60) || 'Ligne vide';
  return Object.values(value).filter((v) => typeof v === 'string' && v).join(' · ').slice(0, 60) || 'Ligne vide';
};

const gripButton = (label) =>
  h('button', { type: 'button', class: 'grip', 'data-part': 'grip', 'aria-label': `Déplacer ${label}. Glisser, ou flèches haut et bas.`, title: 'Glisser pour déplacer' }, icons.grip());

function moveButtons({ index, total, row, move, ctx }, label) {
  const go = (to, part) => () => {
    if (move(index, to)) ctx.restructure({ key: row.key, part }, `Ligne déplacée : position ${to + 1} sur ${total}.`);
  };
  return [
    h('button', { type: 'button', class: 'iconbtn', 'data-part': 'up', disabled: index === 0, 'aria-label': `Monter ${label}`, title: 'Monter', onclick: go(index - 1, 'up') }, icons.up()),
    h('button', { type: 'button', class: 'iconbtn', 'data-part': 'down', disabled: index === total - 1, 'aria-label': `Descendre ${label}`, title: 'Descendre', onclick: go(index + 1, 'down') }, icons.down()),
  ];
}

const removeRow = ({ row, rows, ctx }) => () => {
  if (row.fresh) rows.splice(rows.indexOf(row), 1); // jamais enregistrée : elle disparaît
  else row.removed = true;
  row.open = false;
  ctx.restructure(row.fresh ? null : { key: row.key, part: 'restore' }, row.fresh ? 'Ligne retirée.' : 'Ligne marquée « supprimée ». Elle le sera à l’enregistrement.');
};

// Ligne marquée « supprimée » : elle reste visible, barrée, jusqu'à l'enregistrement.
function renderRemovedRow(shared) {
  const { row, ctx } = shared;
  return h(
    'li',
    { class: 'erow is-removed', 'data-key': row.key },
    h(
      'div',
      { class: 'erow__gone' },
      h('span', { class: 'erow__title t-item', text: rowTitle(shared) }),
      h('span', { class: 'tag t-label', text: 'Supprimée' }),
      h('button', {
        type: 'button',
        class: 'btn btn--sm t-label',
        'data-part': 'restore',
        text: 'Rétablir',
        onclick: () => {
          row.removed = false;
          ctx.restructure({ key: row.key, part: 'toggle' }, 'Ligne rétablie.');
        },
      }),
    ),
  );
}

// Ligne résumée ; ses champs s'ouvrent dans un tiroir.
function renderDrawerRow(shared) {
  const { node, row, liveIndex, liveValues, rowPath, uiPath, ui, sortable, ctx } = shared;
  const hasError = hasErrorUnder(ctx.errors, rowPath);
  if (hasError) row.open = true;
  const bodyId = uid('tiroir');

  const index = h('span', { class: 'erow__idx t-data', text: pad2(liveIndex + 1) });
  const title = h('span', { class: 'erow__title t-item' });
  const sub = h('span', { class: 'erow__sub t-label' });
  const data = h('span', { class: 'erow__data t-data' });
  const tags = h('span', { class: 'erow__tags' });
  const paint = () => {
    const value = fromModel(node.item, row.value);
    const all = liveValues.map((v, i) => (i === liveIndex ? value : v));
    const s = ui.summary ? ui.summary(value, { all, index: liveIndex }) : { title: '', sub: '', data: '', tags: [] };
    title.textContent = s.title || ui.blank || 'Sans titre';
    title.classList.toggle('is-blank', !s.title);
    sub.textContent = s.sub || '';
    data.textContent = s.data || '';
    tags.replaceChildren(
      ...(row.fresh ? [h('span', { class: 'tag tag--accent t-label', text: 'Nouvelle' })] : []),
      ...(hasErrorUnder(ctx.errors, rowPath) ? [h('span', { class: 'tag tag--accent t-label' }, icons.alert(), 'À corriger')] : []),
      ...(s.tags || []).map((t) => h('span', { class: `tag${t.tone === 'accent' ? ' tag--accent' : ''} t-label`, text: t.text })),
    );
  };
  paint();

  const label = `la ligne ${liveIndex + 1}`;
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'erow__toggle',
      'data-part': 'toggle',
      'aria-expanded': String(row.open),
      'aria-controls': bodyId,
      onclick: () => {
        row.open = !row.open;
        li.classList.toggle('is-open', row.open);
        toggle.setAttribute('aria-expanded', String(row.open));
        body.hidden = !row.open;
      },
    },
    index,
    h('span', { class: 'erow__main' }, title, sub, tags),
    data,
    h('span', { class: 'erow__chev' }, icons.chevron()),
  );

  const body = h(
    'div',
    { class: 'erow__body', id: bodyId, hidden: !row.open },
    renderFields({ node: node.item, model: row.value, path: rowPath, uiPath, ctx, onInput: paint }),
    h(
      'div',
      { class: 'erow__foot' },
      h('button', { type: 'button', class: 'btn btn--sm t-label', text: 'Supprimer', onclick: removeRow(shared) }),
      sortable ? h('span', { class: 'erow__moves erow__moves--foot' }, moveButtons(shared, label)) : null,
      h('button', {
        type: 'button',
        class: 'btn btn--sm t-label',
        text: 'Replier',
        onclick: () => {
          toggle.click();
          toggle.focus();
        },
      }),
    ),
  );

  const li = h(
    'li',
    { class: `erow${row.open ? ' is-open' : ''}${hasError ? ' has-error' : ''}`, 'data-key': row.key },
    h('div', { class: 'erow__head' }, sortable ? gripButton(label) : null, toggle, sortable ? h('span', { class: 'erow__moves erow__moves--head' }, moveButtons(shared, label)) : null),
    body,
  );
  return li;
}

// Ligne courte : ses champs restent visibles (paragraphes, repères).
function renderInlineRow(shared) {
  const { node, row, liveIndex, rowPath, uiPath, ui, sortable, ctx } = shared;
  const label = `la ligne ${liveIndex + 1}`;
  let content;
  if (node.item.kind === 'object') {
    content = renderFields({ node: node.item, model: row.value, path: rowPath, uiPath, ctx });
  } else {
    content = h(
      'div',
      { class: 'fields' },
      renderField({
        key: 'item',
        node: node.item,
        get: () => row.value,
        set: (value) => {
          row.value = value;
        },
        path: rowPath,
        uiPath,
        ctx,
        label: ui.rowLabel ? ui.rowLabel(liveIndex) : `${node.item.label} ${liveIndex + 1}`,
      }),
    );
  }
  return h(
    'li',
    { class: `irow${hasErrorUnder(ctx.errors, rowPath) ? ' has-error' : ''}`, 'data-key': row.key },
    sortable ? gripButton(label) : null,
    h('span', { class: 'irow__idx t-data', text: pad2(liveIndex + 1) }),
    h('div', { class: 'irow__fields' }, content),
    h(
      'div',
      { class: 'irow__tools' },
      sortable ? moveButtons(shared, label) : null,
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': `Supprimer ${label}`, title: 'Supprimer', onclick: removeRow(shared) }, icons.close()),
    ),
  );
}

// ------------------------------------------------------------------ section
// ctx : { errors: Map<chemin, message>, changed(), restructure(focus, annonce) }
export function renderSection({ viewId, name, node, model, ctx }) {
  const root = h('div', { class: `editor editor--${viewId}` });
  if (node.kind === 'list') {
    root.append(renderList({ node, model, path: '', uiPath: name, title: '', ctx }));
    return root;
  }
  root.append(renderFields({ node, model, path: '', uiPath: name, ctx }));
  for (const [key, field] of Object.entries(node.fields)) {
    if (field.kind !== 'list') continue;
    root.append(renderList({ node: field, model: model[key], path: key, uiPath: `${name}.${key}`, title: field.label.toLowerCase(), ctx }));
  }
  return root;
}
