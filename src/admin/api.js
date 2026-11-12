// Client de l'API. Le jeton de session voyage dans l'en-tête Authorization, jamais dans un
// cookie : le navigateur ne l'envoie donc jamais de lui-même, ce qui écarte le CSRF, et le
// montage marche entre deux domaines (github.io et workers.dev) quel que soit le navigateur.
// Il vit dans sessionStorage : propre à cet onglet, effacé à sa fermeture.
import { API_URL } from '../data/remote.js';

const TOKEN_KEY = 'acurlaz:regie:jeton';
const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

function readToken() {
  try {
    const value = sessionStorage.getItem(TOKEN_KEY);
    return /^[A-Za-z0-9_-]{43}$/.test(value || '') ? value : null;
  } catch {
    return null;
  }
}

let token = readToken();
let onUnauthorized = () => {};

function storeToken(value) {
  token = value;
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible : le jeton reste en mémoire, la session tient jusqu'au rechargement */
  }
}

// `quiet` : un refus du jeton ne déclenche pas l'écran de reconnexion (déconnexion volontaire).
async function request(method, path, { body, auth = true, quiet = false } = {}) {
  const headers = {};
  if (auth) {
    if (!token) {
      if (!quiet) onUnauthorized();
      throw new ApiError(401, 'unauthorized', 'Session absente ou expirée.');
    }
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ApiError(0, 'network', 'API injoignable. Rien n’a été enregistré.');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  if (res.ok) return data;

  if (res.status === 401 && auth) {
    storeToken(null);
    if (!quiet) onUnauthorized();
  }
  throw new ApiError(res.status, data?.error || 'error', data?.message || `Erreur ${res.status}.`, {
    retryAfter: Number.isFinite(data?.retryAfter) ? data.retryAfter : null,
    errors: Array.isArray(data?.errors) ? data.errors : null,
    rev: Number.isInteger(data?.rev) ? data.rev : null,
  });
}

export const api = {
  configured: Boolean(API_URL),
  hasToken: () => Boolean(token),
  // Appelé quand l'API refuse le jeton (session expirée ou fermée ailleurs).
  onUnauthorized(fn) {
    onUnauthorized = fn;
  },

  async login(password) {
    const data = await request('POST', '/admin/login', { body: { password }, auth: false });
    storeToken(data.token);
    return data;
  },
  async logout() {
    try {
      await request('POST', '/admin/logout', { quiet: true });
    } catch {
      /* session déjà fermée côté serveur : rien à faire */
    } finally {
      storeToken(null);
    }
  },
  session: () => request('GET', '/admin/session'),
  content: () => request('GET', '/admin/content'),
  save: (section, value, baseRev) => request('PUT', `/admin/content/${section}`, { body: { value, baseRev } }),
  async changePassword(current, next) {
    const data = await request('POST', '/admin/password', { body: { current, next } });
    storeToken(data.token);
    return data;
  },
  async revokeAll() {
    await request('POST', '/admin/sessions/revoke');
    storeToken(null);
  },
};
