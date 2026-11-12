// Présentation des sections dans la régie : ordre, numéros, résumés de ligne, largeurs de champ.
// Les règles de validation vivent dans worker/src/schema.js, pas ici.
import { CATS } from '../../worker/src/schema.js';
import { formatDay, formatHour, parseDay } from './dom.js';

// Mêmes mots et mêmes numéros que les sections du site. « sons » (01) n'est pas dans la
// régie : les morceaux se gèrent dans le code.
export const VIEWS = [
  { id: 'dates', section: 'dates', index: '02', word: 'dates' },
  { id: 'avec', section: 'collaborators', index: '03', word: 'avec' },
  { id: 'bio', section: 'bio', index: '04', word: 'bio', meta: 'texte et repères' },
  { id: 'contact', section: 'contact', index: '05', word: 'contact', meta: 'adresse et liens' },
  { id: 'securite', section: null, index: '', word: 'sécurité', meta: 'mot de passe et sessions' },
];

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const catLabel = (value) => CATS.find((c) => c.value === value)?.label || '';

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Par liste (chemin dans la section) : disposition, libellés, résumé d'une ligne repliée.
//   layout 'drawer' : ligne résumée, champs dans un tiroir ; 'inline' : champs dans la ligne.
export const LISTS = {
  dates: {
    layout: 'drawer',
    addAt: 'top',
    add: 'Ajouter une date',
    blank: 'Nouvelle date',
    hint: 'Classées par date à l’enregistrement. Une date passée ne s’affiche plus sur le site.',
    summary(value, { all }) {
      const today = startOfToday();
      const day = parseDay(value.date);
      const upcoming = all.map((v) => parseDay(v.date)).filter((d) => d && d >= today);
      const next = upcoming.length ? Math.min(...upcoming.map((d) => d.getTime())) : null;
      const tags = [];
      if (day && day < today) tags.push({ text: 'Passée' });
      else if (day && day.getTime() === next) tags.push({ text: 'Prochaine', tone: 'accent' });
      if (value.soldOut) tags.push({ text: 'Complet' });
      return {
        title: value.venue,
        sub: value.city,
        data: [formatDay(value.date), formatHour(value.set)].filter(Boolean).join(' · '),
        tags,
      };
    },
  },
  collaborators: {
    layout: 'drawer',
    addAt: 'top',
    add: 'Ajouter un artiste',
    blank: 'Nouvel artiste',
    hint: 'L’ordre de la liste est celui du site et des anneaux de noms autour du CDJ.',
    summary: (value) => ({
      title: value.name,
      sub: value.style,
      data: [value.where, value.year].filter(Boolean).join(', '),
      tags: catLabel(value.cat) ? [{ text: catLabel(value.cat) }] : [],
    }),
  },
  'bio.paragraphs': {
    layout: 'inline',
    addAt: 'bottom',
    add: 'Ajouter un paragraphe',
    rowLabel: (i) => (i === 0 ? 'Chapeau' : `Paragraphe ${i + 1}`),
  },
  'bio.facts': {
    layout: 'inline',
    addAt: 'bottom',
    add: 'Ajouter un repère',
  },
  'contact.links': {
    layout: 'drawer',
    addAt: 'bottom',
    add: 'Ajouter un lien',
    blank: 'Nouveau lien',
    summary: (value) => ({
      title: value.name,
      sub: '',
      data: host(value.url),
      tags: value.url ? [] : [{ text: 'Masqué' }],
    }),
  },
};

// Largeur d'un champ dans la grille de 6 colonnes (une seule colonne sur mobile).
const SPANS = {
  dates: { date: 2, venue: 4, city: 2, set: 2, soldOut: 2, ticketUrl: 6, doors: 2, end: 2, warmup: 2, address: 6, instagramUrl: 6 },
  collaborators: { name: 3, style: 3, cat: 6, where: 4, year: 2, instagramUrl: 6, country: 2, sets: 2, note: 6 },
  bio: { role: 3, name: 3 },
  'bio.facts': { label: 2, value: 4 },
  contact: { email: 4 },
  'contact.links': { name: 2, url: 4, handle: 3 },
};
const SPAN_BY_KIND = { date: 2, time: 2, int: 2, bool: 2, enum: 6, url: 6, email: 4, text: 3 };

export function spanOf(path, key, node) {
  if (node.long) return 6;
  return SPANS[path]?.[key] ?? SPAN_BY_KIND[node.kind] ?? 3;
}
