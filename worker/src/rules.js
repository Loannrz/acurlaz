// Règles pures (sans E/S) : blocage progressif, clé d'adresse IP, bornes et robustesse du
// mot de passe. Partagé avec la régie, qui applique les mêmes règles avant d'envoyer.

export const FREE_FAILS = 5; // échecs tolérés avant le premier blocage
export const LOCK_BASE_S = 60; // premier blocage : 1 minute
export const LOCK_MAX_S = 12 * 3600; // plafond : 12 heures

// Durée du blocage après `fails` échecs consécutifs : 0 jusqu'à 4, puis 1 min au 5e,
// et le double à chaque échec suivant (2, 4, 8 min…), plafonné à 12 h.
export function lockSeconds(fails) {
  if (!Number.isFinite(fails) || fails < FREE_FAILS) return 0;
  return Math.min(LOCK_BASE_S * 2 ** (fails - FREE_FAILS), LOCK_MAX_S);
}

// Clé de limitation : l'adresse IPv4 entière, ou le préfixe /64 d'une IPv6 (un abonné
// dispose de tout un /64 : compter par adresse ne limiterait rien).
export function normalizeIp(raw) {
  const ip = String(raw || '').trim().toLowerCase();
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = ip.includes('::') ? Math.max(0, 8 - left.length - right.length) : 0;
  const groups = [...left, ...Array(missing).fill('0'), ...right].map((g) => g.replace(/^0+(?=.)/, ''));
  return `${groups.slice(0, 4).join(':')}::/64`;
}

// ------------------------------------------------------------------ mot de passe
// Une seule mesure, partout (connexion, changement, mot de passe initial, régie) : le mot
// de passe est normalisé (NFKC), sa longueur se compte en caractères pour le minimum et en
// octets UTF-8 pour le plafond.
export const PASSWORD_MIN = 10; // caractères
export const PASSWORD_MAX_BYTES = 256; // octets
const TOO_COMMON = ['123456', '654321', 'azerty', 'qwerty', 'password', 'motdepasse', 'acurlaz'];
const encoder = new TextEncoder();

export function passwordSize(password) {
  const normalized = String(password).normalize('NFKC');
  return { chars: [...normalized].length, bytes: encoder.encode(normalized).length, normalized };
}

// Un mot de passe présenté à la vérification : une chaîne non vide, sous le plafond.
export function passwordAcceptable(password) {
  if (typeof password !== 'string') return false;
  const { bytes } = passwordSize(password);
  return bytes >= 1 && bytes <= PASSWORD_MAX_BYTES;
}

// Renvoie le défaut d'un nouveau mot de passe, ou null s'il est acceptable.
export function passwordProblem(password) {
  if (typeof password !== 'string') return 'Mot de passe invalide.';
  const { chars, bytes, normalized } = passwordSize(password);
  if (chars < PASSWORD_MIN) return `${PASSWORD_MIN} caractères au minimum.`;
  if (bytes > PASSWORD_MAX_BYTES) return `Trop long : ${PASSWORD_MAX_BYTES} octets au plus.`;
  if (/[\u0000-\u001F\u007F]/.test(password)) return 'Caractères de contrôle refusés.';
  if (new Set([...normalized]).size < 5) return 'Trop répétitif : au moins cinq caractères différents.';
  const lower = normalized.toLowerCase();
  if (TOO_COMMON.some((w) => lower.includes(w))) return 'Trop facile à deviner : éviter les suites (123456, azerty) et le nom du site.';
  return null;
}
