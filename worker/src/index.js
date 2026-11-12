// API de contenu d'acurlaz (Cloudflare Worker + KV).
//
//   GET  /content                    public : le contenu éditable, en lecture seule
//   POST /admin/login                { password } → { token, expiresAt, mustChange, writeLocked }
//   POST /admin/logout               ferme la session courante
//   GET  /admin/session              état de la session
//   GET  /admin/content              contenu + numéros de révision
//   PUT  /admin/content/:section     { value, baseRev } → { rev, updatedAt, value }
//   POST /admin/password             { current, next } → nouvelle session, les autres tombent
//   POST /admin/sessions/revoke      ferme toutes les sessions
//
// Clés KV : `auth` (empreinte du mot de passe), `floor` (instant en deçà duquel toute session
// est caduque), `content:<section>` (source de vérité, avec sa révision), `content:public`
// (vue agrégée servie aux visiteurs : une lecture par visite), `audit`, `sess:<id>`, `rl:<ip>`.
//
// Trois limites de KV dictent la forme du code :
//   - pas de transaction, et des lectures qui peuvent dater d'une minute d'un centre
//     Cloudflare à l'autre : `auth` n'est écrit qu'à l'amorçage et au changement de mot de
//     passe, jamais recopié à partir d'une lecture ; fermer les sessions écrit un instant
//     (`floor`), sans rien relire ;
//   - une écriture par seconde et par clé, suppression comprise : une connexion réussie
//     n'écrit pas le compteur d'échecs, les écritures accessoires ne font jamais échouer la
//     requête, les écritures indispensables sont retentées une fois ;
//   - un quota d'écritures journalier : une adresse bloquée ne coûte plus aucune écriture.
//
// Rien de secret n'est écrit dans le code : AUTH_SECRET et INITIAL_PASSWORD sont des
// secrets du Worker (`wrangler secret put`). Voir README.md.

import { SECTIONS, SECTION_NAMES, BODY_MAX, validateSection } from './schema.js';
import { utf8, toHex, fromHex, toBase64Url, randomBytes, hmac, pbkdf2, timingSafeEqual } from './crypto.js';
import { lockSeconds, normalizeIp, passwordProblem, passwordAcceptable, passwordSize } from './rules.js';

const KV_AUTH = 'auth';
const KV_FLOOR = 'floor';
const KV_AUDIT = 'audit';
const KV_PUBLIC = 'content:public';
const contentKey = (name) => `content:${name}`;

// Durée minimale d'une réponse à un mot de passe refusé. Plus d'une seconde, pour que deux
// échecs successifs d'une même adresse n'écrivent jamais son compteur dans la même seconde.
const FAIL_DELAY_MS = 1200;
const KV_RETRY_MS = 1100; // attente avant de retenter une écriture refusée par KV
const RL_TTL_S = 24 * 3600; // le compteur d'échecs s'efface après 24 h sans tentative
// Le mot de passe initial ne vaut que 15 minutes à compter de sa première utilisation.
const INITIAL_TTL_MS = 15 * 60 * 1000;
// Plafond imposé par Workers pour PBKDF2 (au-delà, WebCrypto refuse).
const ITERATIONS_MAX = 100_000;
const ITERATIONS_MIN = 50_000;

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  Vary: 'Origin',
};

class HttpError extends Error {
  constructor(status, code, message, extra = {}, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.headers = headers;
  }
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

const empty = (status, headers = {}) => new Response(null, { status, headers: { ...BASE_HEADERS, ...headers } });

const log = (evt, data = {}) => console.log(JSON.stringify({ evt, ...data }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------ configuration
function intVar(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
const iterations = (env) => intVar(env.PBKDF2_ITERATIONS, ITERATIONS_MAX, ITERATIONS_MIN, ITERATIONS_MAX);
const sessionTtl = (env) => intVar(env.SESSION_TTL_SECONDS, 7200, 300, 12 * 3600);
// Tant que le mot de passe initial est en service, la régie peut lire mais pas publier.
// REQUIRE_PASSWORD_CHANGE = "false" lève ce verrou (déconseillé).
const writeLocked = (env, auth) => Boolean(auth.mustChange) && String(env.REQUIRE_PASSWORD_CHANGE ?? 'true') !== 'false';

const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

// Origines autorisées : liste exacte, jamais « * ». Une origine en http n'est admise que
// pour localhost (développement).
function allowedOrigins(env) {
  const out = new Set();
  for (const raw of String(env.ALLOWED_ORIGINS || '').split(',')) {
    const s = raw.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && isLocalHost(u.hostname))) out.add(u.origin);
    } catch {
      /* entrée illisible : ignorée */
    }
  }
  return out;
}

// Sous-clés dérivées du secret du Worker, une par usage.
let keyCache = null;
async function keys(env) {
  const secret = env.AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new HttpError(503, 'not_configured', 'Configuration du Worker incomplète.');
  }
  if (keyCache?.secret === secret) return keyCache.keys;
  const root = utf8(secret);
  const derived = {
    pepper: await hmac(root, 'acurlaz/pepper/v1'),
    session: await hmac(root, 'acurlaz/session/v1'),
    ip: await hmac(root, 'acurlaz/ip/v1'),
  };
  keyCache = { secret, keys: derived };
  return derived;
}

// ------------------------------------------------------------------ écritures KV
// KV refuse (429) une seconde écriture sur la même clé dans la seconde, suppression comprise.
const isKvBusy = (err) => /\b429\b|too many requests/i.test(String(err?.message || err));
const isKvQuota = (err) => /limit exceeded|quota/i.test(String(err?.message || err));

const busy = () => new HttpError(503, 'busy', 'Stockage occupé. Réessayer dans un instant.', {}, { 'Retry-After': '2' });

// Écriture indispensable (empreinte, session, contenu) : retentée une fois après une
// seconde. Si KV refuse encore, la requête répond 503 « réessayer », jamais 500.
async function kvWrite(op) {
  try {
    return await op();
  } catch (err) {
    if (!isKvBusy(err)) throw err;
  }
  await sleep(KV_RETRY_MS);
  try {
    return await op();
  } catch (err) {
    if (isKvBusy(err)) throw busy();
    throw err;
  }
}

// Écriture accessoire (compteur d'échecs, journal de connexion, ménage) : son échec est
// noté et n'empêche jamais la requête d'aboutir.
const kvQuiet = (promise) =>
  promise.catch((err) => {
    log('kv_write_skipped', { message: String(err?.message || err).slice(0, 80) });
  });

// ------------------------------------------------------------------ corps de requête
async function readJson(request, maxBytes) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!/^application\/json(\s*;\s*charset=utf-8)?$/.test(type)) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type application/json attendu.');
  }
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new HttpError(413, 'payload_too_large', 'Requête trop volumineuse.');
  }
  if (!request.body) throw new HttpError(400, 'invalid_request', 'Requête invalide.');

  // Lecture bornée : on s'arrête dès que la limite est dépassée, même sans Content-Length.
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'payload_too_large', 'Requête trop volumineuse.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON illisible.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'invalid_request', 'Requête invalide.');
  }
  return data;
}

const hasOnlyKeys = (obj, allowed) => Object.keys(obj).every((k) => allowed.includes(k));

// ------------------------------------------------------------------ mot de passe
// PBKDF2-HMAC-SHA256, sel aléatoire de 16 octets par mot de passe. Le mot de passe passe
// d'abord par un HMAC avec une clé dérivée du secret du Worker (« poivre ») : une copie de
// KV seule ne suffit pas pour tester des mots de passe hors ligne.
async function hashPassword(password, salt, iter, pepper) {
  const material = await hmac(pepper, passwordSize(password).normalized);
  return pbkdf2(material, salt, iter);
}

async function buildAuth(password, k, env, meta) {
  const salt = randomBytes(16);
  const iter = iterations(env);
  const hash = await hashPassword(password, salt, iter, k.pepper);
  return { v: 1, kdf: 'PBKDF2-HMAC-SHA256', iterations: iter, salt: toHex(salt), hash: toHex(hash), ...meta };
}

async function verifyPassword(password, auth, k) {
  const salt = fromHex(auth.salt);
  const expected = fromHex(auth.hash);
  if (!salt || !expected || !Number.isInteger(auth.iterations)) return false;
  const got = await hashPassword(password, salt, auth.iterations, k.pepper);
  return timingSafeEqual(got, expected);
}

// Même coût de calcul qu'une vérification, sans rien vérifier. Sert quand il n'y a encore
// aucune empreinte : la réponse ne trahit pas l'état du Worker, et un appel à
// /admin/login suffit à éprouver le temps de calcul après un déploiement (README).
async function burn(env, k) {
  await pbkdf2(await hmac(k.pepper, 'acurlaz/burn'), new Uint8Array(16), iterations(env));
}

// Égalité de deux secrets sans fuite par le temps de réponse : on compare leurs HMAC.
async function sameSecret(k, a, b) {
  const [x, y] = await Promise.all([hmac(k.pepper, passwordSize(a).normalized), hmac(k.pepper, passwordSize(b).normalized)]);
  return timingSafeEqual(x, y);
}

// Le mot de passe initial est borné dans le temps : passé 15 minutes après l'amorçage, il
// ne vaut plus rien, ni lui ni les sessions qu'il a ouvertes. Seule une remise à zéro
// explicite (README, « Mot de passe perdu ») rouvre l'accès.
const initialExpired = (auth) => Boolean(auth.mustChange) && Date.now() - (Number(auth.createdAt) || 0) > INITIAL_TTL_MS;

const expiredError = () =>
  new HttpError(403, 'initial_password_expired', 'Le mot de passe initial a expiré. Remise à zéro : worker/README.md.');

// Amorçage : KV ne contient encore aucune empreinte. Il n'a lieu qu'ici, depuis
// /admin/login, et seulement quand le mot de passe initial vient d'être présenté.
async function seed(env, k, initial) {
  const now = Date.now();
  const auth = await buildAuth(initial, k, env, { mustChange: true, createdAt: now, changedAt: null });
  await kvWrite(() => env.CONTENT_KV.put(KV_AUTH, JSON.stringify(auth)));
  await kvWrite(() => closeSessions(env, now)); // après une remise à zéro, aucune session d'avant ne survit
  log('seeded');
  return auth;
}

// ------------------------------------------------------------------ limitation des tentatives
const tooMany = (seconds) =>
  new HttpError(429, 'too_many_attempts', 'Trop de tentatives.', { retryAfter: seconds }, { 'Retry-After': String(seconds) });

// Adresses dont une tentative est en cours dans cet isolat (une instance du Worker). KV n'a
// pas d'écriture atomique : sans ce verrou, des requêtes en rafale liraient toutes le même
// compteur. Il ne vaut que dans l'isolat ; entre isolats, c'est LOGIN_LIMITER qui borne.
const inFlight = new Set();

// Encadre toute vérification de mot de passe. Trois barrières, dans l'ordre :
//   1. une seule tentative à la fois par adresse et par isolat (refus immédiat, 429) ;
//   2. garde-fou de rafale de Cloudflare, si le binding LOGIN_LIMITER existe (429) ;
//   3. blocage progressif tenu dans KV : refus (429) si l'adresse est bloquée.
// Le compteur n'est écrit qu'après un ÉCHEC, une fois : une connexion réussie ne touche
// pas à la clé (KV refuse deux écritures par seconde sur une même clé).
// Les adresses IP ne sont jamais stockées : seule leur empreinte HMAC sert de clé.
async function withAttempt(request, env, k, run) {
  const ipKey = toHex(await hmac(k.ip, normalizeIp(request.headers.get('CF-Connecting-IP')))).slice(0, 32);
  if (inFlight.has(ipKey)) throw tooMany(1);
  inFlight.add(ipKey);
  try {
    if (env.LOGIN_LIMITER) {
      const { success } = await env.LOGIN_LIMITER.limit({ key: ipKey });
      if (!success) throw tooMany(60);
    }
    const kvKey = `rl:${ipKey}`;
    const record = await env.CONTENT_KV.get(kvKey, 'json');
    if (record && record.until > Date.now()) throw tooMany(Math.ceil((record.until - Date.now()) / 1000));
    return await run({
      ipKey,
      // Mot de passe refusé : le compteur monte. Renvoie le blocage déclenché, en secondes.
      async fail() {
        const fails = (record?.fails || 0) + 1;
        const lock = lockSeconds(fails);
        const value = JSON.stringify({ fails, until: lock ? Date.now() + lock * 1000 : 0 });
        await kvQuiet(env.CONTENT_KV.put(kvKey, value, { expirationTtl: RL_TTL_S }));
        return { fails, lock };
      },
      // Mot de passe accepté : le compteur s'efface, s'il existe.
      clear: () => (record ? kvQuiet(env.CONTENT_KV.delete(kvKey)) : Promise.resolve()),
    });
  } finally {
    inFlight.delete(ipKey);
  }
}

// Une réponse à un mot de passe refusé dure au moins FAIL_DELAY_MS. Les refus de la
// limitation (429) et les erreurs de forme, eux, répondent tout de suite.
async function padDelay(startedAt) {
  const remaining = FAIL_DELAY_MS - (Date.now() - startedAt);
  if (remaining > 0) await sleep(remaining);
}

// ------------------------------------------------------------------ sessions
// Jeton aléatoire de 256 bits, remis une seule fois au navigateur. KV ne garde que son
// HMAC (clé dérivée du secret) : lire KV ne donne aucun jeton utilisable, et écrire dans
// KV sans le secret ne permet pas d'en fabriquer un.
async function createSession(env, k, floor, auth) {
  const token = toBase64Url(randomBytes(32));
  const now = Math.max(Date.now(), floor + 1); // toujours au-delà du dernier « tout fermer »
  let expiresAt = now + sessionTtl(env) * 1000;
  // Une session ouverte avec le mot de passe initial s'arrête avec lui.
  if (auth.mustChange) expiresAt = Math.min(expiresAt, (Number(auth.createdAt) || now) + INITIAL_TTL_MS);
  const id = toHex(await hmac(k.session, token));
  const ttl = Math.max(60, Math.ceil((expiresAt - Date.now()) / 1000)); // KV : 60 s au moins
  await kvWrite(() => env.CONTENT_KV.put(`sess:${id}`, JSON.stringify({ createdAt: now, expiresAt }), { expirationTtl: ttl }));
  return { token, expiresAt };
}

// Instant en deçà duquel toute session est caduque. Une écriture simple, sans lecture
// préalable : même partie d'un centre en retard, elle ne peut que fermer des sessions.
const readFloor = async (env) => Number(await env.CONTENT_KV.get(KV_FLOOR)) || 0;
const closeSessions = (env, at) => env.CONTENT_KV.put(KV_FLOOR, String(at));

async function requireSession(request, env) {
  const denied = () => new HttpError(401, 'unauthorized', 'Session absente ou expirée.');
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw denied();
  const k = await keys(env);
  const id = toHex(await hmac(k.session, match[1]));
  // La session d'abord : un jeton inconnu s'arrête ici, sans lire `auth`. Une requête
  // quelconque ne peut donc pas faire mémoriser « auth absent » à un centre Cloudflare.
  const session = await env.CONTENT_KV.get(`sess:${id}`, 'json');
  if (!session || !(session.expiresAt > Date.now())) throw denied();
  const [auth, floor] = await Promise.all([env.CONTENT_KV.get(KV_AUTH, 'json'), readFloor(env)]);
  // Un changement de mot de passe ou « tout fermer » relève `floor` : les sessions ouvertes
  // avant tombent. Une session du mot de passe initial tombe avec lui, au bout de 15 minutes.
  if (!auth || !(session.createdAt > floor) || initialExpired(auth)) throw denied();
  return { id, session, auth, k };
}

// ------------------------------------------------------------------ routes : authentification
async function readPassword(request) {
  try {
    const body = await readJson(request, BODY_MAX.auth);
    return hasOnlyKeys(body, ['password']) && passwordAcceptable(body.password) ? body.password : null;
  } catch {
    return null; // corps illisible : même réponse qu'un mauvais mot de passe
  }
}

async function login(request, env) {
  const startedAt = Date.now();
  const k = await keys(env);

  return withAttempt(request, env, k, async (attempt) => {
    const password = await readPassword(request);
    let auth = await env.CONTENT_KV.get(KV_AUTH, 'json');
    let ok = false;

    if (auth) {
      // Vérifié avant le mot de passe : la réponse ne dit rien de la valeur présentée.
      if (initialExpired(auth)) throw expiredError();
      ok = password !== null && (await verifyPassword(password, auth, k));
    } else {
      const initial = env.INITIAL_PASSWORD;
      if (!passwordAcceptable(initial)) {
        await burn(env, k);
        throw new HttpError(503, 'not_initialized', 'Mot de passe initial non défini côté Worker.');
      }
      if (password !== null && (await sameSecret(k, password, initial))) {
        auth = await seed(env, k, initial);
        ok = true;
      } else {
        await burn(env, k);
      }
    }

    if (!ok) {
      const { fails, lock } = await attempt.fail();
      await padDelay(startedAt);
      log('login_failed', { ip: attempt.ipKey.slice(0, 12), fails });
      throw new HttpError(401, 'invalid_credentials', 'Connexion refusée.', lock ? { retryAfter: lock } : {});
    }

    await attempt.clear();
    const session = await createSession(env, k, await readFloor(env), auth);
    const audit = await env.CONTENT_KV.get(KV_AUDIT, 'json');
    await kvQuiet(env.CONTENT_KV.put(KV_AUDIT, JSON.stringify({ lastLoginAt: Date.now(), previousLoginAt: audit?.lastLoginAt ?? null })));
    log('login_ok', { ip: attempt.ipKey.slice(0, 12) });
    return json(200, { token: session.token, expiresAt: session.expiresAt, mustChange: Boolean(auth.mustChange), writeLocked: writeLocked(env, auth) });
  });
}

async function logout(request, env) {
  const { id } = await requireSession(request, env);
  await kvWrite(() => env.CONTENT_KV.delete(`sess:${id}`));
  return empty(204);
}

async function sessionInfo(request, env) {
  const { session, auth } = await requireSession(request, env);
  const audit = await env.CONTENT_KV.get(KV_AUDIT, 'json');
  return json(200, {
    expiresAt: session.expiresAt,
    mustChange: Boolean(auth.mustChange),
    writeLocked: writeLocked(env, auth),
    passwordChangedAt: auth.changedAt ?? null,
    previousLoginAt: audit?.previousLoginAt ?? null,
  });
}

// Changer le mot de passe exige une session valide ET l'ancien mot de passe. Depuis une
// session du mot de passe initial, c'est la seule écriture permise, et elle n'est possible
// que dans ses 15 minutes : au-delà, requireSession a déjà refusé la session.
async function changePassword(request, env) {
  const startedAt = Date.now();
  const { id, auth, k } = await requireSession(request, env);
  const body = await readJson(request, BODY_MAX.auth);
  if (!hasOnlyKeys(body, ['current', 'next']) || typeof body.current !== 'string' || typeof body.next !== 'string') {
    throw new HttpError(400, 'invalid_request', 'Requête invalide.');
  }
  const problem = passwordProblem(body.next);
  if (problem) throw new HttpError(422, 'weak_password', problem);

  // Même limitation que la connexion.
  await withAttempt(request, env, k, async (attempt) => {
    const ok = passwordAcceptable(body.current) && (await verifyPassword(body.current, auth, k));
    if (!ok) {
      const { fails, lock } = await attempt.fail();
      await padDelay(startedAt);
      log('password_change_refused', { ip: attempt.ipKey.slice(0, 12), fails });
      throw new HttpError(403, 'invalid_credentials', 'Mot de passe actuel refusé.', lock ? { retryAfter: lock } : {});
    }
    await attempt.clear();
  });
  if (passwordSize(body.next).normalized === passwordSize(body.current).normalized) {
    throw new HttpError(422, 'weak_password', 'Le nouveau mot de passe doit différer de l’ancien.');
  }

  const now = Date.now();
  const updated = await buildAuth(body.next, k, env, { mustChange: false, createdAt: auth.createdAt ?? now, changedAt: now });
  await kvWrite(() => env.CONTENT_KV.put(KV_AUTH, JSON.stringify(updated)));
  await kvWrite(() => closeSessions(env, now)); // toutes les sessions ouvertes tombent
  await kvQuiet(env.CONTENT_KV.delete(`sess:${id}`)); // ménage : `floor` l'a déjà rendue caduque
  const session = await createSession(env, k, now, updated); // seule session valide désormais
  log('password_changed');
  return json(200, { token: session.token, expiresAt: session.expiresAt });
}

async function revokeAll(request, env) {
  await requireSession(request, env);
  await kvWrite(() => closeSessions(env, Date.now()));
  log('sessions_revoked');
  return empty(204);
}

// ------------------------------------------------------------------ routes : contenu
// Une clé KV par section (source de vérité) : enregistrer « bio » ne réécrit jamais « dates ».
async function readSections(env) {
  const stored = await Promise.all(SECTION_NAMES.map((name) => env.CONTENT_KV.get(contentKey(name), 'json')));
  const sections = {};
  SECTION_NAMES.forEach((name, i) => {
    if (stored[i]) sections[name] = stored[i];
  });
  return sections;
}

// La vue publique (`content:public`) rassemble les sections pour qu'une visite ne coûte
// qu'une lecture. Pour chaque section on garde l'entrée de révision la plus haute.
function mergePublic(current, sections) {
  const merged = {};
  let changed = false;
  for (const name of SECTION_NAMES) {
    const known = current?.sections?.[name];
    const fresh = sections[name];
    const best = fresh && (!known || fresh.rev >= known.rev) ? fresh : known;
    if (best) merged[name] = best;
    if ((best?.rev || 0) !== (known?.rev || 0)) changed = true;
  }
  const updatedAt = Math.max(0, ...Object.values(merged).map((s) => s.updatedAt || 0)) || null;
  return { doc: { v: 1, updatedAt, sections: merged }, changed: changed || !current };
}

async function publishPublic(env, sections) {
  const current = await env.CONTENT_KV.get(KV_PUBLIC, 'json');
  const { doc, changed } = mergePublic(current, sections);
  if (changed) await kvWrite(() => env.CONTENT_KV.put(KV_PUBLIC, JSON.stringify(doc)));
}

async function publicContent(env) {
  if (!env.CONTENT_KV) throw new HttpError(503, 'not_configured', 'Configuration du Worker incomplète.');
  const doc = await env.CONTENT_KV.get(KV_PUBLIC, 'json');
  const content = {};
  for (const name of SECTION_NAMES) {
    if (doc?.sections?.[name]) content[name] = doc.sections[name].value;
  }
  // Une minute de cache dans le navigateur : c'est aussi le délai de propagation de KV.
  return json(200, { v: 1, content, updatedAt: doc?.updatedAt ?? null }, { 'Cache-Control': 'public, max-age=60' });
}

async function adminContent(request, env) {
  await requireSession(request, env);
  const sections = await readSections(env);
  // Ouvrir la régie remet la vue publique d'aplomb si un enregistrement s'est arrêté entre
  // ses deux écritures. Accessoire : la lecture aboutit dans tous les cas.
  if (Object.keys(sections).length) {
    await publishPublic(env, sections).catch((err) => log('public_sync_skipped', { message: String(err?.message || err).slice(0, 80) }));
  }
  const content = {};
  const revs = {};
  let updatedAt = null;
  for (const name of SECTION_NAMES) {
    revs[name] = sections[name]?.rev || 0;
    if (!sections[name]) continue;
    content[name] = sections[name].value;
    updatedAt = Math.max(updatedAt ?? 0, sections[name].updatedAt || 0);
  }
  return json(200, { v: 1, content, revs, updatedAt });
}

async function saveSection(request, env, name) {
  const { auth } = await requireSession(request, env);
  if (!Object.hasOwn(SECTIONS, name)) throw new HttpError(404, 'unknown_section', 'Section inconnue.');
  if (writeLocked(env, auth)) {
    throw new HttpError(403, 'password_change_required', 'Changer d’abord le mot de passe par défaut.');
  }
  const body = await readJson(request, BODY_MAX.content);
  if (!hasOnlyKeys(body, ['value', 'baseRev']) || !Number.isInteger(body.baseRev) || body.baseRev < 0) {
    throw new HttpError(400, 'invalid_request', 'Requête invalide.');
  }
  const result = validateSection(name, body.value);
  if (!result.ok) throw new HttpError(422, 'invalid_content', 'Contenu refusé.', { errors: result.errors });

  // Contrôle de révision : lecture puis écriture, sans transaction (KV n'en a pas). Il
  // arrête l'onglet resté ouvert sur une vieille version, pas deux écritures simultanées.
  const current = (await env.CONTENT_KV.get(contentKey(name), 'json'))?.rev || 0;
  if (body.baseRev !== current) {
    throw new HttpError(409, 'conflict', 'Cette section a été modifiée ailleurs.', { rev: current });
  }
  const entry = { rev: current + 1, updatedAt: Date.now(), value: result.value };
  await kvWrite(() => env.CONTENT_KV.put(contentKey(name), JSON.stringify(entry)));
  await publishPublic(env, { [name]: entry });
  log('content_saved', { section: name, rev: entry.rev });
  return json(200, { rev: entry.rev, updatedAt: entry.updatedAt, value: entry.value });
}

// ------------------------------------------------------------------ aiguillage
async function route(request, env, url, originOk) {
  const { pathname } = url;
  const { method } = request;
  const isAdmin = pathname.startsWith('/admin/');

  if (method === 'OPTIONS') {
    if (!originOk || (pathname !== '/content' && !isAdmin)) throw new HttpError(403, 'forbidden_origin', 'Origine refusée.');
    return empty(204, {
      'Access-Control-Allow-Methods': 'GET, POST, PUT',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    });
  }

  if (pathname === '/content') {
    if (method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Méthode refusée.', {}, { Allow: 'GET' });
    return publicContent(env);
  }

  if (!isAdmin) throw new HttpError(404, 'not_found', 'Introuvable.');

  // Tout ce qui suit est réservé à la régie.
  if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
    throw new HttpError(400, 'https_required', 'HTTPS obligatoire.');
  }
  // Anti-CSRF : l'en-tête Origin doit être présent et figurer dans la liste. Le jeton voyage
  // dans Authorization (jamais dans un cookie), donc un autre site ne peut pas le faire partir.
  if (!originOk) throw new HttpError(403, 'forbidden_origin', 'Origine refusée.');
  if (!env.CONTENT_KV) throw new HttpError(503, 'not_configured', 'Configuration du Worker incomplète.');

  switch (`${method} ${pathname}`) {
    case 'POST /admin/login':
      return login(request, env);
    case 'POST /admin/logout':
      return logout(request, env);
    case 'GET /admin/session':
      return sessionInfo(request, env);
    case 'GET /admin/content':
      return adminContent(request, env);
    case 'POST /admin/password':
      return changePassword(request, env);
    case 'POST /admin/sessions/revoke':
      return revokeAll(request, env);
    default:
  }
  const section = /^\/admin\/content\/([a-z]+)$/.exec(pathname);
  if (section && method === 'PUT') return saveSection(request, env, section[1]);
  throw new HttpError(404, 'not_found', 'Introuvable.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const originOk = origin !== null && allowedOrigins(env).has(origin);

    let response;
    try {
      response = await route(request, env, url, originOk);
    } catch (err) {
      if (err instanceof HttpError) {
        response = json(err.status, { error: err.code, message: err.message, ...err.extra }, err.headers);
      } else if (isKvBusy(err)) {
        // KV a refusé une écriture (une par seconde et par clé) : à réessayer, rien de cassé.
        response = json(503, { error: 'busy', message: 'Stockage occupé. Réessayer dans un instant.' }, { 'Retry-After': '2' });
      } else if (isKvQuota(err)) {
        log('kv_quota', { message: String(err?.message || err).slice(0, 80) });
        response = json(503, { error: 'quota', message: 'Quota de stockage atteint pour aujourd’hui. Réessayer après minuit UTC.' }, { 'Retry-After': '3600' });
      } else {
        // Jamais de détail interne dans la réponse, jamais de secret dans le journal.
        console.error(JSON.stringify({ evt: 'error', message: String(err?.message || err) }));
        response = json(500, { error: 'internal', message: 'Erreur interne.' });
      }
    }

    if (originOk) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Expose-Headers', 'Retry-After');
    }
    if (url.protocol === 'https:') response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return response;
  },
};
