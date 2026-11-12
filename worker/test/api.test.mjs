// Tests de l'API. Deux modes :
//   node test/api.test.mjs                 le Worker tourne dans Node, KV simulé en mémoire
//   TEST_PASSWORD=… node test/api.test.mjs --http [http://127.0.0.1:8787]
//                                          contre `npx wrangler dev` (état KV vierge requis :
//                                          `npx wrangler dev --persist-to <dossier vide>`)
// Le KV simulé reproduit la limite de Cloudflare : une écriture par seconde et par clé,
// suppression comprise, sinon erreur 429. Aucun mot de passe réel n'est écrit ici.
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { validateSection, SECTIONS, BODY_MAX } from '../src/schema.js';
import { lockSeconds, normalizeIp, passwordProblem, passwordAcceptable, PASSWORD_MAX_BYTES } from '../src/rules.js';

const args = process.argv.slice(2);
const HTTP = args.includes('--http');
const BASE = args.find((a) => /^https?:\/\//.test(a)) || 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5173';
const EVIL = 'https://evil.example';
const SEED_PASSWORD = HTTP ? process.env.TEST_PASSWORD : 'graine-de-test';
const NEW_PASSWORD = 'Vinyle-Orange-33-tours';
const FAIL_MS = 1150; // une réponse d'échec dure au moins 1,2 s (marge de mesure)

if (HTTP && !SEED_PASSWORD) {
  console.error('Mode --http : définir TEST_PASSWORD (le mot de passe initial du Worker local).');
  process.exit(2);
}

// ------------------------------------------------------------------ KV en mémoire
class MemoryKV {
  constructor({ writeLimitMs = 1000 } = {}) {
    this.map = new Map();
    this.lastWrite = new Map();
    this.writeLimitMs = writeLimitMs; // 0 : limite désactivée
    this.writes = 0;
    this.reads = [];
    this.refused = [];
  }
  async get(key, type) {
    this.reads.push(key);
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return type === 'json' || type?.type === 'json' ? JSON.parse(entry.value) : entry.value;
  }
  // Comme Cloudflare KV : une seule écriture par seconde sur une même clé, suppression comprise.
  touch(key, verb) {
    const last = this.lastWrite.get(key) || 0;
    if (this.writeLimitMs && Date.now() - last < this.writeLimitMs) {
      this.refused.push(`${verb} ${key}`);
      throw new Error(`KV ${verb} failed: 429 Too Many Requests`);
    }
    this.lastWrite.set(key, Date.now());
    this.writes += 1;
  }
  async put(key, value, options = {}) {
    if (options.expirationTtl !== undefined && options.expirationTtl < 60) throw new Error('expirationTtl < 60');
    this.touch(key, 'PUT');
    this.map.set(key, { value: String(value), expiresAt: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0 });
  }
  async delete(key) {
    this.touch(key, 'DELETE');
    this.map.delete(key);
  }
  // Intervention du test lui-même (hors Worker) : ni comptée, ni limitée.
  poke(key, value) {
    if (value === undefined) this.map.delete(key);
    else this.map.set(key, { value: JSON.stringify(value), expiresAt: 0 });
  }
  peek(key) {
    const entry = this.map.get(key);
    return entry ? JSON.parse(entry.value) : null;
  }
}

const makeEnv = (over = {}) => ({
  CONTENT_KV: new MemoryKV(),
  AUTH_SECRET: 'secret-de-test-0123456789-abcdefghijklmnopqrstuvwxyz',
  INITIAL_PASSWORD: SEED_PASSWORD,
  ALLOWED_ORIGINS: `${ORIGIN}, https://loannrz.github.io`,
  PBKDF2_ITERATIONS: '100000',
  SESSION_TTL_SECONDS: '7200',
  ...over,
});

const env = makeEnv();

// ------------------------------------------------------------------ client
async function call(method, path, { token, body, raw, origin = ORIGIN, ip = '203.0.113.1', type = 'application/json', useEnv = env } = {}) {
  const headers = { 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) payload = JSON.stringify(body);
  if (payload !== undefined && type) headers['Content-Type'] = type;
  const init = { method, headers, body: payload };
  const startedAt = Date.now();
  const res = HTTP ? await fetch(BASE + path, init) : await worker.fetch(new Request(`https://api.test${path}`, init), useEnv);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* pas du JSON */
  }
  return { status: res.status, headers: res.headers, data, text, ms: Date.now() - startedAt };
}

const login = (password, opts = {}) => call('POST', '/admin/login', { body: { password }, ...opts });

// ------------------------------------------------------------------ mini-banc
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  ÉCHEC ${name}\n        ${String(err?.message || err).split('\n').join('\n        ')}`);
  }
}

const sampleDates = [
  { date: '2027-03-14', venue: 'Le Hangar 9', city: 'Lyon', set: '02:00', ticketUrl: 'https://billets.example.fr/hangar', soldOut: false },
  { date: '2027-01-09', venue: 'Cassita Club', city: 'Marseille', set: '01:30', ticketUrl: '#', soldOut: true, warmup: 'Lina Morel' },
];

console.log(`Mode : ${HTTP ? `HTTP (${BASE})` : 'Worker dans Node, KV en mémoire limité à une écriture par seconde et par clé'}\n`);

// ================================================================== règles pures
console.log('Règles');
await test('blocage progressif : 0 avant 5 échecs, puis 1, 2, 4 min, plafond 12 h', () => {
  assert.deepEqual([0, 1, 4, 5, 6, 7, 8].map(lockSeconds), [0, 0, 0, 60, 120, 240, 480]);
  assert.equal(lockSeconds(40), 12 * 3600);
});
await test('clé IP : IPv4 entière, IPv6 ramenée au /64', () => {
  assert.equal(normalizeIp('203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(normalizeIp('2001:db8:1:2::9'), normalizeIp('2001:0db8:0001:0002:ffff::1'));
  assert.notEqual(normalizeIp('2001:db8:1:2::9'), normalizeIp('2001:db8:1:3::9'));
  assert.equal(normalizeIp('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeIp(null), 'unknown');
});
await test('nouveau mot de passe : 10 caractères, pas de suite évidente', () => {
  assert.match(passwordProblem('court'), /10 caractères/);
  assert.match(passwordProblem('aaaaaaaaaaaa'), /répétitif/);
  assert.match(passwordProblem('1234567890'), /deviner/);
  assert.match(passwordProblem('Acurlaz-2026!'), /deviner/);
  assert.equal(passwordProblem(NEW_PASSWORD), null);
});
await test('une seule mesure : minimum en caractères, plafond en octets', () => {
  assert.equal(passwordProblem('éèàùçôîëüœ'), null); // 10 caractères pour 20 octets : c'est le nombre de caractères qui compte
  assert.match(passwordProblem('é'.repeat(9)), /10 caractères/);
  assert.equal(passwordProblem(`Vinyle-${'é'.repeat(100)}`), null); // 207 octets
  assert.match(passwordProblem(`Vinyle-${'é'.repeat(130)}`), /octets/); // 267 octets
  assert.equal(passwordAcceptable('x'.repeat(PASSWORD_MAX_BYTES)), true);
  assert.equal(passwordAcceptable('x'.repeat(PASSWORD_MAX_BYTES + 1)), false);
  assert.equal(passwordAcceptable('é'.repeat(PASSWORD_MAX_BYTES / 2 + 1)), false); // même longueur en caractères, trop d'octets
  assert.equal(passwordAcceptable(''), false);
  assert.equal(passwordAcceptable(42), false);
});

// ================================================================== schéma
console.log('\nSchéma');
await test('accepte une liste valide, normalise et trie par date', () => {
  const r = validateSection('dates', sampleDates);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.map((d) => d.date), ['2027-01-09', '2027-03-14']);
  assert.equal(r.value[0].ticketUrl, ''); // « # » = emplacement vide
  assert.equal(r.value[0].address, ''); // champ absent complété
  assert.equal(r.value[1].soldOut, false);
});
await test('refuse tout champ inconnu', () => {
  const r = validateSection('dates', [{ ...sampleDates[0], admin: true }]);
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].path, '[0].admin');
});
await test('refuse __proto__ et les types inattendus', () => {
  assert.equal(validateSection('dates', JSON.parse('[{"date":"2027-01-09","venue":"X","__proto__":{"a":1}}]')).ok, false);
  assert.equal(validateSection('dates', { length: 1 }).ok, false);
  assert.equal(validateSection('dates', [{ date: '2027-01-09', venue: ['x'] }]).ok, false);
  assert.equal(validateSection('collaborators', [{ name: 'A', cat: 'house', year: '2024' }]).ok, false);
  assert.equal(validateSection('collaborators', [{ name: 'A', cat: 'polka' }]).ok, false);
  assert.equal(validateSection('constructor', []).ok, false);
  assert.equal(validateSection('tracks', []).ok, false); // les morceaux ne sont pas éditables
});
await test('refuse les balises et les adresses dangereuses', () => {
  assert.equal(validateSection('dates', [{ date: '2027-01-09', venue: '<img src=x onerror=alert(1)>' }]).ok, false);
  for (const bad of ['javascript:alert(1)', 'http://exemple.fr', 'data:text/html,x', '//exemple.fr', 'https://u:p@exemple.fr', 'https://exemple.fr/"onmouseover="x', 'https://localhost/x']) {
    assert.equal(validateSection('dates', [{ date: '2027-01-09', venue: 'X', ticketUrl: bad }]).ok, false, bad);
  }
  assert.equal(validateSection('contact', { email: 'a@b', links: [] }).ok, false);
  assert.equal(validateSection('contact', { email: 'x"onclick="y@exemple.fr', links: [] }).ok, false);
});
await test('refuse dates, heures, longueurs et tailles hors bornes', () => {
  assert.equal(validateSection('dates', [{ date: '2027-02-30', venue: 'X' }]).ok, false);
  assert.equal(validateSection('dates', [{ date: '14/03/2027', venue: 'X' }]).ok, false);
  assert.equal(validateSection('dates', [{ date: '2027-03-14', venue: 'X', set: '25:00' }]).ok, false);
  assert.equal(validateSection('dates', [{ date: '2027-03-14', venue: 'x'.repeat(81) }]).ok, false);
  assert.equal(validateSection('dates', [{ date: '2027-03-14', venue: '' }]).ok, false);
  const tooMany = Array.from({ length: SECTIONS.dates.max + 1 }, () => ({ date: '2027-03-14', venue: 'X' }));
  assert.equal(validateSection('dates', tooMany).ok, false);
});
await test('retire les caractères invisibles, garde les espaces insécables', () => {
  const zeroWidth = String.fromCharCode(0x200b);
  const nbsp = String.fromCharCode(0xa0);
  const r = validateSection('bio', { role: ` DJ${zeroWidth} et\tproducteur `, paragraphs: [`Une${nbsp}ligne\n suivie`], facts: [] });
  assert.equal(r.ok, true);
  assert.equal(r.value.role, 'DJ et producteur');
  assert.equal(r.value.paragraphs[0], `Une${nbsp}ligne suivie`);
});

// ================================================================== API
console.log('\nLecture publique et CORS');
await test('GET /content sans session : 200, contenu vide au départ', async () => {
  const r = await call('GET', '/content', { origin: null });
  assert.equal(r.status, 200);
  assert.equal(r.data.v, 1);
  assert.deepEqual(r.data.content, {});
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});
await test('GET /content : cache public d’une minute ; routes admin : jamais de cache', async () => {
  assert.equal((await call('GET', '/content')).headers.get('cache-control'), 'public, max-age=60');
  assert.equal((await call('GET', '/admin/session')).headers.get('cache-control'), 'no-store');
});
await test('CORS : origine du site reprise telle quelle, jamais « * »', async () => {
  const ok = await call('GET', '/content');
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(ok.headers.get('access-control-allow-credentials'), null);
  assert.match(ok.headers.get('vary') || '', /Origin/i);
  const evil = await call('GET', '/content', { origin: EVIL });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});
await test('préflight : accepté pour le site, refusé ailleurs', async () => {
  const ok = await call('OPTIONS', '/admin/content/dates');
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(ok.headers.get('access-control-allow-headers'), /Authorization/);
  const evil = await call('OPTIONS', '/admin/content/dates', { origin: EVIL });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});
await test('écriture impossible sur la route publique', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const r = await call(method, '/content', { body: { content: {} } });
    assert.equal(r.status, 405, method);
  }
});

console.log('\nAccès sans session');
await test('routes admin sans Origin ou depuis un autre site : 403', async () => {
  assert.equal((await call('GET', '/admin/content', { origin: null })).status, 403);
  assert.equal((await call('GET', '/admin/content', { origin: EVIL })).status, 403);
  assert.equal((await login(SEED_PASSWORD, { origin: EVIL, ip: '203.0.113.2' })).status, 403);
});
await test('routes admin sans jeton ou avec un faux jeton : 401', async () => {
  assert.equal((await call('GET', '/admin/content')).status, 401);
  assert.equal((await call('GET', '/admin/session')).status, 401);
  assert.equal((await call('PUT', '/admin/content/dates', { body: { value: sampleDates, baseRev: 0 } })).status, 401);
  assert.equal((await call('POST', '/admin/password', { body: { current: 'a', next: NEW_PASSWORD } })).status, 401);
  assert.equal((await call('POST', '/admin/sessions/revoke')).status, 401);
  const fake = 'A'.repeat(43);
  assert.equal((await call('GET', '/admin/content', { token: fake })).status, 401);
  assert.equal((await call('PUT', '/admin/content/dates', { token: fake, body: { value: sampleDates, baseRev: 0 } })).status, 401);
  const still = await call('GET', '/content');
  assert.deepEqual(still.data.content, {});
});

console.log('\nConnexion');
let token;
await test('mauvais mot de passe : 401, message générique, délai constant', async () => {
  const r = await login('pas-le-bon', { ip: '203.0.113.10' });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'invalid_credentials');
  assert.equal(r.data.message, 'Connexion refusée.');
  assert.ok(r.ms >= FAIL_MS, `réponse en ${r.ms} ms`);
});
await test('corps malformé : même réponse qu’un mauvais mot de passe', async () => {
  const cases = [
    { raw: 'pas du json' },
    { body: { password: SEED_PASSWORD, admin: true } },
    { body: { password: 42 } },
    { body: { password: SEED_PASSWORD }, type: 'text/plain' },
    { body: { password: 'x'.repeat(PASSWORD_MAX_BYTES + 1) } },
  ];
  for (const [i, c] of cases.entries()) {
    const r = await call('POST', '/admin/login', { ...c, ip: `203.0.113.${20 + i}` });
    assert.equal(r.status, 401, JSON.stringify(c).slice(0, 60));
    assert.equal(r.data.message, 'Connexion refusée.');
    assert.ok(r.ms >= FAIL_MS);
  }
});
await test('bon mot de passe : jeton de session, mot de passe à changer', async () => {
  const r = await login(SEED_PASSWORD);
  assert.equal(r.status, 200);
  assert.match(r.data.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(r.data.mustChange, true);
  assert.ok(r.data.expiresAt > Date.now());
  assert.equal(r.headers.get('set-cookie'), null);
  token = r.data.token;
  const s = await call('GET', '/admin/session', { token });
  assert.equal(s.status, 200);
  assert.equal(s.data.mustChange, true);
});
await test('session du mot de passe initial : 15 minutes au plus', async () => {
  const s = await call('GET', '/admin/session', { token });
  const left = s.data.expiresAt - Date.now();
  assert.ok(left > 10 * 60 * 1000 && left <= 15 * 60 * 1000, `${Math.round(left / 1000)} s`);
});

console.log('\nMot de passe par défaut');
await test('tant qu’il est en service : lecture permise, publication refusée', async () => {
  const s = await call('GET', '/admin/session', { token });
  assert.equal(s.data.writeLocked, true);
  assert.equal((await call('GET', '/admin/content', { token })).status, 200);
  const r = await call('PUT', '/admin/content/dates', { token, body: { value: sampleDates, baseRev: 0 } });
  assert.equal(r.status, 403);
  assert.equal(r.data.error, 'password_change_required');
  assert.deepEqual((await call('GET', '/content')).data.content, {});
});

console.log('\nChangement de mot de passe');
let otherToken;
await test('exige l’ancien, 10 caractères au moins, différent de l’ancien', async () => {
  otherToken = (await login(SEED_PASSWORD, { ip: '203.0.113.30' })).data.token; // deuxième session
  assert.ok(otherToken);
  const change = (body, ip = '203.0.113.31') => call('POST', '/admin/password', { token, body, ip });
  const wrong = await change({ current: 'pas-le-bon', next: NEW_PASSWORD });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.data.message, 'Mot de passe actuel refusé.');
  assert.ok(wrong.ms >= FAIL_MS);
  assert.equal((await change({ current: SEED_PASSWORD, next: 'court' })).status, 422);
  assert.equal((await change({ current: SEED_PASSWORD, next: '1234567890' })).status, 422);
  assert.equal((await change({ next: NEW_PASSWORD })).status, 400);
  assert.equal((await change({ current: SEED_PASSWORD, next: NEW_PASSWORD, epoch: 0 })).status, 400);
  if (SEED_PASSWORD.length >= 10) assert.equal((await change({ current: SEED_PASSWORD, next: SEED_PASSWORD })).status, 422);
  assert.equal((await call('GET', '/admin/session', { token })).status, 200); // session intacte
});
await test('réussi : nouvelle session, toutes les autres tombent', async () => {
  const r = await call('POST', '/admin/password', { token, body: { current: SEED_PASSWORD, next: NEW_PASSWORD }, ip: '203.0.113.31' });
  assert.equal(r.status, 200);
  assert.match(r.data.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(r.data.token, token);
  assert.equal((await call('GET', '/admin/session', { token })).status, 401); // ancien jeton
  assert.equal((await call('GET', '/admin/session', { token: otherToken })).status, 401); // autre session
  assert.equal((await call('PUT', '/admin/content/dates', { token: otherToken, body: { value: [], baseRev: 1 } })).status, 401);
  token = r.data.token;
  const s = await call('GET', '/admin/session', { token });
  assert.equal(s.status, 200);
  assert.equal(s.data.mustChange, false);
  assert.equal(s.data.writeLocked, false);
  assert.ok(s.data.passwordChangedAt > 0);
  assert.ok(s.data.expiresAt - Date.now() > 60 * 60 * 1000, 'session normale : 2 heures');
});
await test('l’ancien mot de passe ne marche plus, le nouveau oui', async () => {
  assert.equal((await login(SEED_PASSWORD, { ip: '203.0.113.32' })).status, 401);
  const r = await login(NEW_PASSWORD, { ip: '203.0.113.32' });
  assert.equal(r.status, 200);
  assert.equal(r.data.mustChange, false);
});

console.log('\nÉcriture');
await test('PUT avec session : enregistré, visible aussitôt en lecture publique', async () => {
  const r = await call('PUT', '/admin/content/dates', { token, body: { value: sampleDates, baseRev: 0 } });
  assert.equal(r.status, 200);
  assert.equal(r.data.rev, 1);
  const pub = await call('GET', '/content', { origin: null });
  assert.deepEqual(pub.data.content.dates.map((d) => d.venue), ['Cassita Club', 'Le Hangar 9']);
  const adm = await call('GET', '/admin/content', { token });
  assert.equal(adm.data.revs.dates, 1);
  assert.equal(adm.data.revs.bio, 0);
});
await test('contenu invalide : 422 avec le chemin du champ, rien n’est écrit', async () => {
  const cases = [
    [{ ...sampleDates[0], role: 'admin' }],
    [{ ...sampleDates[0], venue: '<script>alert(1)</script>' }],
    [{ ...sampleDates[0], ticketUrl: 'javascript:alert(1)' }],
    [{ ...sampleDates[0], date: 'demain' }],
    'pas une liste',
  ];
  for (const value of cases) {
    const r = await call('PUT', '/admin/content/dates', { token, body: { value, baseRev: 1 } });
    assert.equal(r.status, 422, JSON.stringify(value));
    assert.equal(r.data.error, 'invalid_content');
    assert.ok(Array.isArray(r.data.errors) && r.data.errors.length > 0);
  }
  const pub = await call('GET', '/content');
  assert.equal(pub.data.content.dates.length, 2);
});
await test('requête mal formée : 400, 404, 413, 415', async () => {
  const put = (opts) => call('PUT', '/admin/content/dates', { token, ...opts });
  assert.equal((await put({ body: { value: sampleDates } })).status, 400); // baseRev absent
  assert.equal((await put({ body: { value: sampleDates, baseRev: 1, force: true } })).status, 400); // clé inconnue
  assert.equal((await put({ raw: '{"value": [' })).status, 400);
  assert.equal((await put({ body: { value: sampleDates, baseRev: 1 }, type: 'text/plain' })).status, 415);
  assert.equal((await put({ body: { value: sampleDates, baseRev: 1 }, type: 'application/x-www-form-urlencoded' })).status, 415);
  const huge = { value: [{ ...sampleDates[0], address: 'x'.repeat(BODY_MAX.content) }], baseRev: 1 };
  assert.equal((await put({ body: huge })).status, 413);
  assert.equal((await call('PUT', '/admin/content/tracks', { token, body: { value: [], baseRev: 0 } })).status, 404);
  assert.equal((await call('PUT', '/admin/content/__proto__', { token, body: { value: [], baseRev: 0 } })).status, 404);
  assert.equal((await call('PUT', '/admin/content/public', { token, body: { value: [], baseRev: 0 } })).status, 404);
  assert.equal((await call('DELETE', '/admin/content/dates', { token })).status, 404);
});
await test('révision périmée : 409, la version en ligne n’est pas écrasée', async () => {
  const r = await call('PUT', '/admin/content/dates', { token, body: { value: [], baseRev: 0 } });
  assert.equal(r.status, 409);
  assert.equal(r.data.rev, 1);
  assert.equal((await call('GET', '/content')).data.content.dates.length, 2);
});
await test('autres sections, enregistrées coup sur coup : bio puis contact', async () => {
  const bio = await call('PUT', '/admin/content/bio', {
    token,
    body: { value: { role: 'DJ', paragraphs: ['Un texte.'], facts: [{ label: 'Basé à', value: 'Paris' }] }, baseRev: 0 },
  });
  assert.equal(bio.status, 200);
  const contact = await call('PUT', '/admin/content/contact', {
    token,
    body: { value: { email: 'booking@exemple.fr', links: [{ name: 'Instagram', url: 'https://www.instagram.com/exemple' }] }, baseRev: 0 },
  });
  assert.equal(contact.status, 200);
  const pub = await call('GET', '/content');
  assert.equal(pub.data.content.contact.email, 'booking@exemple.fr');
  assert.equal(pub.data.content.bio.facts[0].value, 'Paris');
  assert.equal(pub.data.content.dates.length, 2);
});

console.log('\nLimitation des tentatives');
await test('5 échecs puis blocage : 429 immédiat, même avec le bon mot de passe', async () => {
  const ip = '203.0.113.40';
  for (let i = 1; i <= 5; i++) {
    const r = await login(`faux-${i}`, { ip });
    assert.equal(r.status, 401, `tentative ${i}`);
    if (i === 5) assert.equal(r.data.retryAfter, 60);
    else assert.equal(r.data.retryAfter, undefined);
  }
  const blocked = await login('faux-6', { ip });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.error, 'too_many_attempts');
  assert.ok(blocked.ms < 600, `429 en ${blocked.ms} ms`);
  const wait = Number(blocked.headers.get('retry-after'));
  assert.ok(wait > 0 && wait <= 60, `Retry-After = ${wait}`);
  const good = await login(NEW_PASSWORD, { ip });
  assert.equal(good.status, 429);
});
await test('le blocage vaut pour un /64 IPv6 entier, pas pour les autres adresses', async () => {
  for (let i = 1; i <= 5; i++) await login(`faux-${i}`, { ip: `2001:db8:aa:bb::${i}` });
  assert.equal((await login(NEW_PASSWORD, { ip: '2001:db8:aa:bb:1234::99' })).status, 429);
  assert.equal((await login(NEW_PASSWORD, { ip: '203.0.113.41' })).status, 200);
});
await test('rafale parallèle : une seule tentative passe, les autres sont refusées', async () => {
  const ip = '203.0.113.43';
  const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => login(`faux-${i}`, { ip })));
  const tried = burst.filter((r) => r.status === 401).length;
  const refused = burst.filter((r) => r.status === 429).length;
  assert.equal(tried, 1, `${tried} tentatives vérifiées`);
  assert.equal(refused, 19);
});
await test('le changement de mot de passe est limité de la même façon', async () => {
  const ip = '203.0.113.42';
  for (let i = 1; i <= 5; i++) {
    const r = await call('POST', '/admin/password', { token, body: { current: `faux-${i}`, next: 'Un-Autre-Secret-45' }, ip });
    assert.equal(r.status, 403);
  }
  const r = await call('POST', '/admin/password', { token, body: { current: NEW_PASSWORD, next: 'Un-Autre-Secret-45' }, ip });
  assert.equal(r.status, 429);
});
await test('un échec puis le bon mot de passe, aussitôt, depuis la même adresse : 200', async () => {
  const ip = '203.0.113.44';
  assert.equal((await login('une-faute-de-frappe', { ip })).status, 401);
  const r = await login(NEW_PASSWORD, { ip });
  assert.equal(r.status, 200);
  assert.equal((await login(NEW_PASSWORD, { ip })).status, 200); // et encore, sans attendre
});

console.log('\nFin de session');
await test('déconnexion juste après la connexion : le jeton ne vaut plus rien', async () => {
  const t = (await login(NEW_PASSWORD, { ip: '203.0.113.50' })).data.token;
  assert.equal((await call('POST', '/admin/logout', { token: t })).status, 204);
  assert.equal((await call('GET', '/admin/session', { token: t })).status, 401);
  assert.equal((await call('GET', '/admin/session', { token })).status, 200); // l'autre session vit
});
await test('fermer toutes les sessions', async () => {
  const t = (await login(NEW_PASSWORD, { ip: '203.0.113.51' })).data.token;
  assert.equal((await call('POST', '/admin/sessions/revoke', { token: t })).status, 204);
  assert.equal((await call('GET', '/admin/session', { token: t })).status, 401);
  assert.equal((await call('GET', '/admin/session', { token })).status, 401);
  assert.equal((await login(NEW_PASSWORD, { ip: '203.0.113.51' })).status, 200);
});

// ================================================================== KV et configuration (mode Node)
if (!HTTP) {
  const kv = env.CONTENT_KV;

  console.log('\nLimite KV : une écriture par seconde et par clé');
  await test('aucune écriture n’a été refusée sans être rattrapée pendant le parcours', async () => {
    // Les refus notés ici ont tous été retentés ou ignorés sans effet : aucune requête n'a fini en 500.
    assert.ok(!results.some((r) => !r.ok), 'un test précédent a échoué');
    assert.ok(kv.refused.every((w) => !w.includes(' rl:')), `compteur d’échecs écrit deux fois dans la seconde : ${kv.refused.join(', ')}`);
  });
  await test('une connexion réussie n’écrit pas le compteur d’échecs', async () => {
    const e = makeEnv();
    await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.80' }); // amorçage
    const before = [...e.CONTENT_KV.lastWrite.keys()];
    for (let i = 0; i < 3; i++) assert.equal((await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.80' })).status, 200);
    assert.ok(![...e.CONTENT_KV.lastWrite.keys()].some((key) => key.startsWith('rl:')), 'clé rl: écrite');
    assert.deepEqual(e.CONTENT_KV.refused.filter((w) => !w.includes('audit')), []); // seul le journal de connexion est sauté
    assert.ok(before.includes('auth'));
  });
  await test('un échec n’écrit le compteur qu’une fois ; le succès suivant l’efface', async () => {
    const e = makeEnv();
    await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.81' });
    const w0 = e.CONTENT_KV.writes;
    assert.equal((await login('faux', { useEnv: e, ip: '203.0.113.82' })).status, 401);
    assert.equal(e.CONTENT_KV.writes - w0, 1);
    const rlKey = [...e.CONTENT_KV.map.keys()].find((key) => key.startsWith('rl:'));
    assert.equal(e.CONTENT_KV.peek(rlKey).fails, 1);
    assert.equal((await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.82' })).status, 200);
    assert.equal(e.CONTENT_KV.map.has(rlKey), false);
  });
  await test('KV refuse une écriture indispensable deux fois de suite : 503 « réessayer », jamais 500', async () => {
    const e = makeEnv({ REQUIRE_PASSWORD_CHANGE: 'false' });
    const t = (await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.83' })).data.token;
    const realPut = e.CONTENT_KV.put.bind(e.CONTENT_KV);
    e.CONTENT_KV.put = async (key, ...rest) => {
      if (key.startsWith('content:')) throw new Error('KV PUT failed: 429 Too Many Requests');
      return realPut(key, ...rest);
    };
    const r = await call('PUT', '/admin/content/dates', { useEnv: e, token: t, body: { value: sampleDates, baseRev: 0 } });
    assert.equal(r.status, 503);
    assert.equal(r.data.error, 'busy');
    assert.equal(r.headers.get('retry-after'), '2');
    e.CONTENT_KV.put = realPut;
    assert.equal((await call('PUT', '/admin/content/dates', { useEnv: e, token: t, body: { value: sampleDates, baseRev: 0 } })).status, 200);
  });
  await test('journal de connexion ou ménage refusés par KV : la connexion aboutit quand même', async () => {
    const e = makeEnv();
    await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.84' });
    const realPut = e.CONTENT_KV.put.bind(e.CONTENT_KV);
    const realDelete = e.CONTENT_KV.delete.bind(e.CONTENT_KV);
    assert.equal((await login('faux', { useEnv: e, ip: '203.0.113.85' })).status, 401);
    e.CONTENT_KV.put = async (key, ...rest) => {
      if (key === 'audit') throw new Error('KV PUT failed: 429 Too Many Requests');
      return realPut(key, ...rest);
    };
    e.CONTENT_KV.delete = async (key) => {
      if (key.startsWith('rl:')) throw new Error('KV DELETE failed: 429 Too Many Requests');
      return realDelete(key);
    };
    assert.equal((await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.85' })).status, 200);
  });

  console.log('\nMot de passe initial borné dans le temps');
  await test('tant que personne ne présente le mot de passe initial, rien n’est amorcé', async () => {
    const e = makeEnv();
    assert.equal((await login('pas-le-bon', { useEnv: e, ip: '203.0.113.90' })).status, 401);
    assert.equal(e.CONTENT_KV.map.has('auth'), false);
    assert.equal((await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.91' })).status, 200);
    assert.equal(e.CONTENT_KV.peek('auth').mustChange, true);
  });
  await test('passé 15 minutes : connexion refusée quel que soit le mot de passe, sessions closes', async () => {
    const e = makeEnv();
    const t = (await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.92' })).data.token;
    assert.equal((await call('GET', '/admin/session', { useEnv: e, token: t })).status, 200);
    const auth = e.CONTENT_KV.peek('auth');
    e.CONTENT_KV.poke('auth', { ...auth, createdAt: Date.now() - 16 * 60 * 1000 }); // amorcé il y a 16 minutes
    const good = await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.93' });
    assert.equal(good.status, 403);
    assert.equal(good.data.error, 'initial_password_expired');
    const bad = await login('pas-le-bon', { useEnv: e, ip: '203.0.113.94' });
    assert.equal(bad.status, 403); // même réponse : rien ne dit si le mot de passe était le bon
    assert.equal(bad.data.error, 'initial_password_expired');
    assert.equal((await call('GET', '/admin/session', { useEnv: e, token: t })).status, 401);
    const change = await call('POST', '/admin/password', { useEnv: e, token: t, body: { current: SEED_PASSWORD, next: NEW_PASSWORD } });
    assert.equal(change.status, 401); // le changement n'est possible que dans les 15 minutes
  });
  await test('remise à zéro explicite (clé auth supprimée) : nouvel amorçage, sessions d’avant closes', async () => {
    const e = makeEnv();
    const old = (await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.65' })).data.token;
    assert.equal((await call('GET', '/admin/session', { useEnv: e, token: old })).status, 200);
    e.CONTENT_KV.poke('auth', undefined); // npx wrangler kv key delete auth
    assert.equal((await call('GET', '/admin/session', { useEnv: e, token: old })).status, 401); // sans empreinte, rien ne passe
    assert.equal((await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.65' })).status, 200); // réamorçage
    assert.equal((await call('GET', '/admin/session', { useEnv: e, token: old })).status, 401);
  });
  await test('un mot de passe changé n’expire pas', async () => {
    const auth = kv.peek('auth');
    kv.poke('auth', { ...auth, createdAt: Date.now() - 400 * 24 * 3600 * 1000 });
    assert.equal((await login(NEW_PASSWORD, { ip: '203.0.113.95' })).status, 200);
    kv.poke('auth', auth);
  });
  await test('sans secret ou sans mot de passe initial : 503, pas d’accès', async () => {
    assert.equal((await login(SEED_PASSWORD, { useEnv: makeEnv({ AUTH_SECRET: undefined }) })).status, 503);
    assert.equal((await login(SEED_PASSWORD, { useEnv: makeEnv({ AUTH_SECRET: 'A_REMPLACER' }) })).status, 503); // valeur de .dev.vars.example
    for (const INITIAL_PASSWORD of [undefined, '']) {
      const e = makeEnv({ INITIAL_PASSWORD });
      const r = await login('nimporte', { useEnv: e });
      assert.equal(r.status, 503);
      assert.equal(r.data.error, 'not_initialized');
      assert.equal(e.CONTENT_KV.writes, 0);
    }
  });

  console.log('\nLectures KV');
  await test('un jeton inconnu ne fait lire que la clé de session, jamais l’empreinte', async () => {
    const e = makeEnv();
    await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.96' });
    e.CONTENT_KV.reads.length = 0;
    assert.equal((await call('GET', '/admin/session', { useEnv: e, token: 'B'.repeat(43) })).status, 401);
    assert.equal(e.CONTENT_KV.reads.length, 1);
    assert.ok(e.CONTENT_KV.reads[0].startsWith('sess:'));
  });
  await test('une visite du site coûte une seule lecture KV', async () => {
    kv.reads.length = 0;
    const r = await call('GET', '/content');
    assert.equal(r.status, 200);
    assert.deepEqual(kv.reads, ['content:public']);
    assert.equal(Object.keys(r.data.content).length, 3);
  });
  await test('une clé par section, plus la vue publique ; enregistrer l’une ne réécrit pas les autres', async () => {
    const keys = [...kv.map.keys()].filter((key) => key.startsWith('content'));
    assert.deepEqual(keys.sort(), ['content:bio', 'content:contact', 'content:dates', 'content:public']);
    const before = kv.map.get('content:dates').value;
    const t = (await login(NEW_PASSWORD, { ip: '203.0.113.61' })).data.token;
    const r = await call('PUT', '/admin/content/bio', { token: t, body: { value: { role: 'DJ', paragraphs: [], facts: [] }, baseRev: 1 } });
    assert.equal(r.status, 200);
    assert.equal(kv.map.get('content:dates').value, before);
    assert.equal(kv.peek('content:public').sections.bio.rev, 2);
    assert.equal(kv.peek('content:public').sections.dates.rev, 1);
  });
  await test('vue publique perdue ou en retard : ouvrir la régie la reconstruit', async () => {
    const t = (await login(NEW_PASSWORD, { ip: '203.0.113.62' })).data.token;
    kv.poke('content:public', undefined);
    assert.deepEqual((await call('GET', '/content')).data.content, {});
    assert.equal((await call('GET', '/admin/content', { token: t })).status, 200);
    const pub = await call('GET', '/content');
    assert.deepEqual(Object.keys(pub.data.content).sort(), ['bio', 'contact', 'dates']);
    // en retard d'une révision sur une section
    const doc = kv.peek('content:public');
    kv.poke('content:public', { ...doc, sections: { ...doc.sections, bio: { ...doc.sections.bio, rev: 1, value: { role: 'ancien', paragraphs: [], facts: [], name: '' } } } });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await call('GET', '/admin/content', { token: t });
    assert.equal((await call('GET', '/content')).data.content.bio.role, 'DJ');
  });

  console.log('\nStockage et configuration');
  await test('KV ne contient ni mot de passe ni jeton en clair', async () => {
    const dump = JSON.stringify([...kv.map.entries()]);
    assert.ok(!dump.includes(SEED_PASSWORD));
    assert.ok(!dump.includes(NEW_PASSWORD));
    assert.ok(!dump.includes(token));
    const auth = kv.peek('auth');
    assert.equal(auth.kdf, 'PBKDF2-HMAC-SHA256');
    assert.equal(auth.iterations, 100000);
    assert.match(auth.salt, /^[0-9a-f]{32}$/);
    assert.match(auth.hash, /^[0-9a-f]{64}$/);
    assert.ok(![...kv.map.keys()].some((key) => key.includes('203.0.113')), 'aucune adresse IP en clair');
  });
  await test('fermer les sessions ne touche jamais à l’empreinte, même sur une lecture périmée', async () => {
    const e = makeEnv({ REQUIRE_PASSWORD_CHANGE: 'false' });
    const intruder = (await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.72' })).data.token; // connaît l'ancien mot de passe
    const owner = (await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.73' })).data.token;
    const staleAuth = e.CONTENT_KV.map.get('auth').value;
    const changed = await call('POST', '/admin/password', { useEnv: e, token: owner, body: { current: SEED_PASSWORD, next: NEW_PASSWORD }, ip: '203.0.113.73' });
    assert.equal(changed.status, 200);
    const fresh = e.CONTENT_KV.map.get('auth').value;
    // L'intrus appelle depuis un centre en retard : il y voit encore l'ancienne empreinte et l'ancien plancher.
    const realGet = e.CONTENT_KV.get.bind(e.CONTENT_KV);
    e.CONTENT_KV.get = async (key, type) => (key === 'auth' ? JSON.parse(staleAuth) : key === 'floor' ? null : realGet(key, type));
    const revoke = await call('POST', '/admin/sessions/revoke', { useEnv: e, token: intruder });
    e.CONTENT_KV.get = realGet;
    assert.equal(revoke.status, 204);
    assert.equal(e.CONTENT_KV.map.get('auth').value, fresh, 'empreinte réécrite');
    assert.equal((await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.74' })).status, 401); // l'ancien mot de passe reste mort
    assert.equal((await login(NEW_PASSWORD, { useEnv: e, ip: '203.0.113.74' })).status, 200);
    assert.equal((await call('GET', '/admin/session', { useEnv: e, token: intruder })).status, 401);
  });
  await test('REQUIRE_PASSWORD_CHANGE = "false" lève le verrou de publication', async () => {
    const e = makeEnv({ REQUIRE_PASSWORD_CHANGE: 'false' });
    const first = await login(SEED_PASSWORD, { useEnv: e, ip: '203.0.113.66' });
    assert.equal(first.data.mustChange, true);
    assert.equal(first.data.writeLocked, false);
    const r = await call('PUT', '/admin/content/dates', { useEnv: e, token: first.data.token, body: { value: sampleDates, baseRev: 0 } });
    assert.equal(r.status, 200);
  });
  await test('sel différent à chaque mot de passe, même valeur', async () => {
    const a = makeEnv();
    const b = makeEnv();
    await login(SEED_PASSWORD, { useEnv: a });
    await login(SEED_PASSWORD, { useEnv: b });
    const [x, y] = [a, b].map((e) => e.CONTENT_KV.peek('auth'));
    assert.notEqual(x.salt, y.salt);
    assert.notEqual(x.hash, y.hash);
  });
  await test('l’empreinte dépend du secret du Worker (poivre)', async () => {
    const a = makeEnv();
    await login(SEED_PASSWORD, { useEnv: a });
    const moved = makeEnv({ CONTENT_KV: a.CONTENT_KV, AUTH_SECRET: 'un-autre-secret-0123456789-abcdefghijklmnop' });
    assert.equal((await login(SEED_PASSWORD, { useEnv: moved, ip: '203.0.113.60' })).status, 401);
  });
  await test('origines : « * » et http hors localhost sont ignorés', async () => {
    const e = makeEnv({ ALLOWED_ORIGINS: '*, http://exemple.fr, https://loannrz.github.io' });
    assert.equal((await call('GET', '/admin/content', { useEnv: e, origin: 'http://exemple.fr' })).status, 403);
    assert.equal((await call('GET', '/admin/content', { useEnv: e, origin: '*' })).status, 403);
    const ok = await call('GET', '/content', { useEnv: e, origin: 'https://loannrz.github.io' });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://loannrz.github.io');
  });
  await test('HTTPS obligatoire hors localhost', async () => {
    const res = await worker.fetch(new Request('http://api.test/admin/session', { headers: { Origin: ORIGIN } }), env);
    assert.equal(res.status, 400);
  });
  await test('garde-fou de rafale : refuse avant tout calcul', async () => {
    const e = makeEnv({ LOGIN_LIMITER: { limit: async () => ({ success: false }) } });
    await login(SEED_PASSWORD, { useEnv: makeEnv({ CONTENT_KV: e.CONTENT_KV }) }); // amorce KV
    const before = e.CONTENT_KV.writes;
    const r = await login(SEED_PASSWORD, { useEnv: e });
    assert.equal(r.status, 429);
    assert.equal(e.CONTENT_KV.writes, before);
  });
  await test('une adresse bloquée ne coûte plus aucune écriture KV', async () => {
    const e = makeEnv();
    for (let i = 0; i < 5; i++) await login('faux', { useEnv: e, ip: '203.0.113.70' });
    const before = e.CONTENT_KV.writes;
    for (let i = 0; i < 3; i++) assert.equal((await login('faux', { useEnv: e, ip: '203.0.113.70' })).status, 429);
    assert.equal(e.CONTENT_KV.writes, before);
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} réussis, ${failed.length} en échec sur ${results.length}.`);
process.exit(failed.length ? 1 : 0);
