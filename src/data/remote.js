// Contenu éditable depuis la régie (/admin) : lu dans l'API au chargement.
// Le contenu de content.js reste le repli : API absente, lente, en panne ou réponse
// invalide, le site s'affiche quand même. Les morceaux et les crédits ne passent jamais
// par l'API : ils viennent toujours de content.js.
import { validateSection, SECTION_NAMES } from '../../worker/src/schema.js';

// Adresse du Worker, fixée à la construction (VITE_API_URL). Vide : pas d'appel réseau.
export const API_URL = String(import.meta.env?.VITE_API_URL || '').trim().replace(/\/+$/, '');

// Délai de garde. Court quand le navigateur garde déjà une copie du dernier contenu publié
// (le repli est alors le vrai contenu) ; plus long à la première visite, où le repli est
// le contenu du code.
const TIMEOUT_WITH_COPY_MS = 1200;
const TIMEOUT_FIRST_VISIT_MS = 2500;
const CACHE_KEY = 'acurlaz:contenu:v1';

const str = (v) => (typeof v === 'string' ? v : '');
const link = (v) => (v === '#' ? '' : str(v)); // « # » = emplacement à remplir
const int = (v) => (Number.isInteger(v) ? v : null);

// Le contenu du code, mis au format des sections de l'API (point de départ de la régie).
export function sectionsFromDefaults(d) {
  return {
    dates: d.dates.map((x) => ({
      date: str(x.date),
      venue: str(x.venue),
      city: str(x.city),
      set: str(x.set),
      ticketUrl: link(x.ticketUrl),
      soldOut: Boolean(x.soldOut),
      doors: str(x.doors),
      end: str(x.end),
      warmup: str(x.warmup),
      address: str(x.address),
      instagramUrl: link(x.instagramUrl),
    })),
    collaborators: d.collaborators.map((x) => ({
      name: str(x.name),
      style: str(x.style),
      cat: str(x.cat),
      where: str(x.where),
      year: int(x.year),
      instagramUrl: link(x.instagramUrl),
      country: str(x.country),
      sets: int(x.sets),
      note: str(x.note),
    })),
    bio: {
      role: str(d.artist.role),
      paragraphs: d.about.paragraphs.map(str),
      facts: d.about.facts.map((f) => ({ label: str(f.label), value: str(f.value) })),
      name: str(d.artist.name),
    },
    contact: {
      email: str(d.contact.email),
      links: d.links.map((l) => ({ name: str(l.name), url: link(l.url), handle: str(l.handle) })),
    },
  };
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Pose les sections reçues par-dessus le contenu du code. Chaque section est revalidée
// avec le schéma du Worker : une section absente ou invalide garde sa valeur du code.
export function mergeContent(defaults, remote) {
  const merged = { ...defaults };
  const sections = {};
  if (remote !== null && typeof remote === 'object') {
    for (const name of SECTION_NAMES) {
      if (!Object.hasOwn(remote, name)) continue;
      const result = validateSection(name, remote[name]);
      if (result.ok) sections[name] = result.value;
    }
  }
  const { dates, collaborators, bio, contact } = sections;
  if (dates) merged.dates = dates;
  if (collaborators) merged.collaborators = collaborators;
  if (bio) {
    const name = bio.name || defaults.artist.name;
    merged.artist = { ...defaults.artist, name, role: bio.role };
    merged.about = { ...defaults.about, name, role: bio.role, paragraphs: bio.paragraphs, facts: bio.facts };
  }
  if (contact) {
    merged.contact = { email: contact.email };
    merged.links = contact.links.map((l) => ({ id: slug(l.name), ...l }));
  }
  merged.upcomingDates = (list = merged.dates, now) => defaults.upcomingDates(list, now);
  return merged;
}

// Dernière réponse valide de l'API, gardée dans le navigateur : si l'API tombe, un visiteur
// déjà venu revoit le dernier contenu publié plutôt que celui du code.
function remember(content) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(content));
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}

function recall() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

// Renvoie toujours un contenu complet et ne lève jamais d'erreur.
export async function loadContent(defaults) {
  let remote = null;
  if (API_URL) {
    const copy = recall();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), copy ? TIMEOUT_WITH_COPY_MS : TIMEOUT_FIRST_VISIT_MS);
    try {
      // Pas de `cache: 'no-store'` : l'API autorise une minute de cache dans le navigateur.
      const res = await fetch(`${API_URL}/content`, {
        signal: abort.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      remote = (await res.json())?.content ?? null;
      remember(remote);
    } catch (err) {
      console.warn('[acurlaz] API de contenu indisponible, contenu de secours affiché.', err?.message || err);
      remote = copy;
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    return mergeContent(defaults, remote);
  } catch (err) {
    console.warn('[acurlaz] contenu distant ignoré.', err);
    return mergeContent(defaults, null);
  }
}
