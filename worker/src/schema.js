// Schéma du contenu éditable. Source unique, sans dépendance :
//   - le Worker valide chaque écriture avec (autorité) ;
//   - la régie (/admin) construit ses formulaires avec ;
//   - le site revalide ce qu'il reçoit de l'API avec, avant de l'afficher.
// Les morceaux (tracks), les formes d'onde et les crédits ne sont pas ici : ils restent
// dans le code du site et ne passent jamais par l'API.

export const CATS = [
  { value: 'house', label: 'House' },
  { value: 'techno', label: 'Techno' },
  { value: 'afro', label: 'Afro' },
  { value: 'disco', label: 'Disco' },
  { value: 'breaks', label: 'Breaks' },
];

// Taille maximale d'un corps de requête, en octets.
export const BODY_MAX = { content: 128 * 1024, auth: 2 * 1024 };

// ------------------------------------------------------------------ constructeurs
// `extra: true` : champ gardé dans les données mais pas affiché par le site actuel.
const text = (label, max, o = {}) => ({ kind: 'text', label, max, ...o });
const date = (label, o = {}) => ({ kind: 'date', label, required: true, ...o });
const time = (label, o = {}) => ({ kind: 'time', label, ...o });
const url = (label, o = {}) => ({ kind: 'url', label, max: 300, ...o });
const email = (label, o = {}) => ({ kind: 'email', label, max: 254, ...o });
const int = (label, min, max, o = {}) => ({ kind: 'int', label, min, max, ...o });
const choice = (label, options, o = {}) => ({ kind: 'enum', label, options, required: true, ...o });
const bool = (label, o = {}) => ({ kind: 'bool', label, ...o });
const list = (label, item, o = {}) => ({ kind: 'list', label, item, max: 50, ...o });
const object = (fields, o = {}) => ({ kind: 'object', fields, ...o });

// ------------------------------------------------------------------ sections
export const SECTIONS = {
  dates: list(
    'dates',
    object({
      date: date('Date'),
      venue: text('Lieu', 80, { required: true }),
      city: text('Ville', 60),
      set: time('Début du set'),
      soldOut: bool('Complet'),
      ticketUrl: url('Billetterie', { hint: 'Vide : le bouton affiche « lien à venir ».' }),
      doors: time('Ouverture des portes', { extra: true }),
      end: time('Fin du set', { extra: true }),
      warmup: text('Warm-up', 80, { extra: true }),
      address: text('Adresse', 160, { extra: true }),
      instagramUrl: url('Instagram du lieu', { extra: true }),
    }),
    { max: 150, one: 'date', many: 'dates', sortBy: 'date' },
  ),

  collaborators: list(
    'avec',
    object({
      name: text('Nom', 80, { required: true, hint: 'Nom de scène, tel qu’il s’affiche.' }),
      style: text('Style', 60),
      cat: choice('Famille', CATS, { hint: 'Sert au filtre de la section.' }),
      where: text('Dernier lieu', 120),
      year: int('Année', 1950, 2100),
      instagramUrl: url('Instagram'),
      country: text('Pays', 60, { extra: true }),
      sets: int('Sets partagés', 0, 9999, { extra: true }),
      note: text('Note', 240, { extra: true }),
    }),
    { max: 200, one: 'artiste', many: 'artistes' },
  ),

  bio: object({
    role: text('Rôle', 80, { hint: 'Premier mot de la ligne d’accueil.' }),
    paragraphs: list('Texte', text('Paragraphe', 1200, { required: true, long: true }), {
      max: 8,
      one: 'paragraphe',
      many: 'paragraphes',
      hint: 'Le premier paragraphe sert de chapeau.',
    }),
    facts: list(
      'Repères',
      object({
        label: text('Intitulé', 40, { required: true }),
        value: text('Valeur', 120, { required: true }),
      }),
      {
        max: 12,
        one: 'repère',
        many: 'repères',
        hint: 'Les repères « Styles » et « Basé à » complètent la ligne d’accueil.',
      },
    ),
    name: text('Nom d’artiste', 80, { extra: true }),
  }),

  contact: object({
    email: email('Adresse de contact', { hint: 'Vide : les boutons « Écrire » et « Copier l’adresse » ne s’affichent pas.' }),
    links: list(
      'Liens',
      object({
        name: text('Nom', 40, { required: true }),
        url: url('Adresse', { hint: 'Vide : le lien ne s’affiche pas.' }),
        handle: text('Identifiant', 60, { extra: true }),
      }),
      { max: 20, one: 'lien', many: 'liens' },
    ),
  }),
};

export const SECTION_NAMES = Object.keys(SECTIONS);

// ------------------------------------------------------------------ nettoyage du texte
// Caractères invisibles retirés sans bruit (collés depuis un autre logiciel) : contrôles,
// espaces de largeur nulle, marques de direction, césure conditionnelle, BOM.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
// Chevrons refusés : aucun champ n'en a besoin, et le contenu ne porte jamais de balise.
const CHEVRONS = /[<>]/;

function cleanText(value) {
  return value
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/[\t\n\r\u2028\u2029]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

const count = (s) => [...s].length;

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function cleanUrl(value, max) {
  const s = value.normalize('NFC').replace(INVISIBLE, '').trim();
  if (s === '' || s === '#') return { value: '' };
  if (count(s) > max) return { error: `${max} caractères au plus.` };
  if (/[\s<>"'`\\^{}|]/.test(s)) return { error: 'adresse invalide.' };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { error: 'adresse invalide. Exemple : https://exemple.fr/page' };
  }
  if (u.protocol !== 'https:') return { error: 'l’adresse doit commencer par https://' };
  if (u.username || u.password) return { error: 'adresse invalide.' };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname)) return { error: 'nom de domaine invalide.' };
  if (count(u.href) > max) return { error: `${max} caractères au plus.` };
  return { value: u.href };
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

// ------------------------------------------------------------------ validation
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const join = (path, key) => (path ? `${path}.${key}` : key);

// Valide `value` contre `node`. Renvoie la valeur normalisée ; les erreurs s'ajoutent à
// `errors` sous la forme { path, message }. Tout champ inconnu est une erreur.
function check(node, value, path, errors) {
  const fail = (message) => {
    errors.push({ path, message: `${node.label ? `${node.label} : ` : ''}${message}` });
    return undefined;
  };

  switch (node.kind) {
    case 'object': {
      if (!isPlainObject(value)) return fail('objet attendu.');
      const out = {};
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(node.fields, key)) errors.push({ path: join(path, key), message: 'Champ inconnu.' });
      }
      for (const [key, field] of Object.entries(node.fields)) {
        out[key] = check(field, value[key], join(path, key), errors);
      }
      return out;
    }

    case 'list': {
      if (!Array.isArray(value)) return fail('liste attendue.');
      if (value.length > node.max) return fail(`${node.max} lignes au plus.`);
      const out = value.map((item, i) => check(node.item, item, `${path}[${i}]`, errors));
      if (node.sortBy && errors.length === 0) {
        const key = node.sortBy;
        return out
          .map((row, i) => ({ row, i }))
          .sort((a, b) => (a.row[key] < b.row[key] ? -1 : a.row[key] > b.row[key] ? 1 : a.i - b.i))
          .map((x) => x.row);
      }
      return out;
    }

    case 'text': {
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') return fail('texte attendu.');
      const s = cleanText(value);
      if (CHEVRONS.test(s)) return fail('les signes < et > ne sont pas acceptés.');
      if (count(s) > node.max) return fail(`${node.max} caractères au plus.`);
      if (node.required && s === '') return fail('à remplir.');
      return s;
    }

    case 'date': {
      if (typeof value !== 'string' || !isRealDate(value.trim())) return fail('date invalide.');
      return value.trim();
    }

    case 'time': {
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') return fail('heure invalide.');
      const s = value.trim();
      if (s === '') return node.required ? fail('à remplir.') : '';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return fail('heure invalide (HH:MM).');
      return s;
    }

    case 'url': {
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') return fail('adresse invalide.');
      const r = cleanUrl(value, node.max);
      if (r.error) return fail(r.error);
      if (node.required && r.value === '') return fail('à remplir.');
      return r.value;
    }

    case 'email': {
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') return fail('adresse invalide.');
      const s = value.normalize('NFC').replace(INVISIBLE, '').trim();
      if (s === '') return node.required ? fail('à remplir.') : '';
      if (count(s) > node.max || !EMAIL.test(s)) return fail('adresse invalide.');
      return s;
    }

    case 'int': {
      if (value === undefined || value === null || value === '') return node.required ? fail('à remplir.') : null;
      if (typeof value !== 'number' || !Number.isInteger(value)) return fail('nombre entier attendu.');
      if (value < node.min || value > node.max) return fail(`entre ${node.min} et ${node.max}.`);
      return value;
    }

    case 'enum': {
      if (typeof value !== 'string' || !node.options.some((o) => o.value === value)) return fail('choix invalide.');
      return value;
    }

    case 'bool': {
      if (value === undefined || value === null) return false;
      if (typeof value !== 'boolean') return fail('oui ou non attendu.');
      return value;
    }

    default:
      return fail('type inconnu.');
  }
}

// Valide une section entière. { ok: true, value } ou { ok: false, errors: [{ path, message }] }.
export function validateSection(name, value) {
  if (typeof name !== 'string' || !Object.hasOwn(SECTIONS, name)) {
    return { ok: false, errors: [{ path: '', message: 'Section inconnue.' }] };
  }
  const errors = [];
  const out = check(SECTIONS[name], value, '', errors);
  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };
  return { ok: true, value: out };
}

// Valeur vide d'un nœud (nouvelle ligne dans la régie).
export function emptyValue(node) {
  switch (node.kind) {
    case 'object':
      return Object.fromEntries(Object.entries(node.fields).map(([k, f]) => [k, emptyValue(f)]));
    case 'list':
      return [];
    case 'int':
      return null;
    case 'bool':
      return false;
    case 'enum':
      return node.options[0].value;
    default:
      return '';
  }
}
