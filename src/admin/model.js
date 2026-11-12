// Brouillon d'une section : même forme que le schéma, avec pour chaque liste des lignes
// qui portent une clé stable, leur état d'origine et une marque de suppression. Rien
// n'est envoyé tant que « Enregistrer » n'est pas confirmé.
import { emptyValue } from '../../worker/src/schema.js';
import { plural } from './dom.js';

let sequence = 0;

export function makeRow(itemNode, value, fresh, position = -1) {
  const model = toModel(itemNode, value);
  return {
    key: `l${++sequence}`,
    value: model,
    removed: false,
    fresh, // ajoutée depuis le dernier enregistrement
    open: fresh,
    position, // rang au chargement, pour détecter un changement d'ordre
    original: fresh ? null : JSON.stringify(fromModel(itemNode, model)),
  };
}

export function toModel(node, value) {
  if (node.kind === 'object') {
    const out = {};
    for (const [key, field] of Object.entries(node.fields)) out[key] = toModel(field, value?.[key]);
    return out;
  }
  if (node.kind === 'list') {
    return { rows: (Array.isArray(value) ? value : []).map((item, i) => makeRow(node.item, item, false, i)) };
  }
  return value === undefined || value === null ? emptyValue(node) : value;
}

// Valeur à envoyer : les lignes marquées « supprimée » n'en font pas partie.
export function fromModel(node, model) {
  if (node.kind === 'object') {
    const out = {};
    for (const [key, field] of Object.entries(node.fields)) out[key] = fromModel(field, model[key]);
    return out;
  }
  if (node.kind === 'list') return model.rows.filter((row) => !row.removed).map((row) => fromModel(node.item, row.value));
  return model;
}

const same = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.trim() === b.trim() : a === b);

// Résumé des changements, en phrases courtes, pour l'écran de confirmation.
export function summarize(node, model, baseline, prefix = '') {
  const lines = [];
  if (node.kind === 'object') {
    for (const [key, field] of Object.entries(node.fields)) {
      if (field.kind === 'list') lines.push(...summarize(field, model[key], baseline?.[key], `${field.label} : `));
      else if (!same(model[key], baseline?.[key] ?? emptyValue(field))) lines.push(`${prefix}${field.label} : modifié`);
    }
    return lines;
  }
  if (node.kind === 'list') {
    const rows = model.rows;
    const added = rows.filter((r) => r.fresh && !r.removed).length;
    const removed = rows.filter((r) => !r.fresh && r.removed).length;
    const kept = rows.filter((r) => !r.fresh && !r.removed);
    const edited = kept.filter((r) => JSON.stringify(fromModel(node.item, r.value)) !== r.original).length;
    const moved = !node.sortBy && kept.some((r, i) => i > 0 && r.position < kept[i - 1].position);
    if (added) lines.push(prefix + plural(added, 'ligne ajoutée', 'lignes ajoutées'));
    if (edited) lines.push(prefix + plural(edited, 'ligne modifiée', 'lignes modifiées'));
    if (removed) lines.push(prefix + plural(removed, 'ligne supprimée', 'lignes supprimées'));
    if (moved) lines.push(`${prefix}ordre modifié`);
  }
  return lines;
}
