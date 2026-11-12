// Lecteur audio du site : un seul morceau à la fois, sur un seul HTMLAudioElement.
//
//   player.init(tracks)      reçoit content.tracks (sans appel, cette liste sert par défaut)
//   player.select(trackId)   charge un titre, à l'arrêt (sans effet si c'est déjà le titre chargé)
//   player.play() / pause() / toggle()
//   player.state             { playing, trackId, time, duration } + compléments ci-dessous
//
// Émet `player:state` sur le bus à chaque changement et dix fois par seconde
// pendant la lecture. Écoute `player:select` ({ trackId }) comme une demande de
// chargement. Le détail de l'événement reprend `player.state` :
//   playing   le son sort (ou va sortir : lecture lancée, tampon en cours)
//   trackId   titre chargé, ou null
//   time      position en secondes
//   duration  durée en secondes (celle du fichier dès qu'elle est connue, sinon celle de content.js)
//   track     l'objet du titre chargé, ou null
//   loading   chargement ou tampon en cours
//   blocked   lecture demandée mais refusée par le navigateur faute de geste : elle part au
//             premier clic du visiteur dans les dix secondes, puis la demande est abandonnée
//             (aucun son ne démarre longtemps après, sur un clic sans rapport : DA 11)
//   error     message lisible si le fichier ne se charge pas, sinon null
//   level     niveau sonore 0..1, seulement avec l'option `analyser`
//
// À la fin d'un titre, le suivant de la liste se charge et la lecture continue.
// Après le dernier, le premier se recharge, à l'arrêt.
//
// Compléments hors contrat : seek(secondes), next(), prev(), level.
// Option `analyser` (coupée par défaut) : branche un AnalyserNode pour lire un
// niveau. Elle fait passer le son par un AudioContext, que Safari sur iOS
// suspend à chaque interruption : à n'activer que si un visuel en dépend.
import { emit, on } from '../core/bus.js';
import { tracks as contentTracks } from '../data/content.js';

const TICK_MS = 100; // dix états par seconde pendant la lecture
const UNLOCK_WINDOW_MS = 10000; // durée de vie d'une lecture refusée, en attente d'un clic
const MEDIA_ERRORS = {
  1: 'Chargement interrompu.',
  2: 'Connexion perdue pendant le chargement du titre.',
  3: 'Fichier audio illisible.',
  4: 'Titre introuvable ou format non pris en charge.',
};

const options = { continuous: true, loop: false, analyser: false };
const usable = (tracks) => (Array.isArray(tracks) ? tracks.filter((t) => t && t.id && t.url) : []);
let list = usable(contentTracks); // liste par défaut, remplacée par init(tracks)
let audio = null;
let current = null; // titre chargé
let wantPlay = false; // lecture demandée (survit au chargement et au déblocage)
let blocked = false;
let loading = false;
let error = null;
let resumeAt = 0; // position à reprendre après une erreur réseau
let pendingSeek = 0; // position à poser dès que les métadonnées du titre rechargé arrivent
let ticker = 0;
let armed = false;
let unlockTimer = 0;
let primed = false; // l'élément audio a été présenté au navigateur pendant un geste
let graph = null; // { ctx, analyser, data } si l'option `analyser` a pu s'installer
let graphTried = false;

const hasAudio = () => typeof window !== 'undefined' && typeof window.Audio === 'function';

// Hors ligne, le navigateur annonce un « format non pris en charge » : on dit ce qui se passe vraiment.
function describeError(code) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Connexion absente. Le titre ne peut pas se charger.';
  return MEDIA_ERRORS[code] ?? 'Lecture impossible.';
}

function snapshot() {
  const fileDuration = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  const duration = fileDuration || current?.duration || 0;
  const time = audio && current ? Math.min(audio.currentTime || 0, duration || Infinity) : 0;
  const state = {
    playing: Boolean(audio && current && !error && !audio.paused && !audio.ended),
    trackId: current?.id ?? null,
    time,
    duration,
    track: current,
    loading,
    blocked,
    error,
  };
  if (options.analyser) state.level = level();
  return state;
}

function sync() {
  const state = snapshot();
  if (state.playing && !ticker) ticker = window.setInterval(sync, TICK_MS);
  else if (!state.playing && ticker) { window.clearInterval(ticker); ticker = 0; }
  emit('player:state', state);
  return state;
}

function ensureAudio() {
  if (audio || !hasAudio()) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  if (options.analyser) audio.crossOrigin = 'anonymous';
  const listen = (type, fn) => audio.addEventListener(type, fn);
  listen('loadedmetadata', () => {
    if (pendingSeek > 0) {
      const at = pendingSeek;
      pendingSeek = 0;
      try { audio.currentTime = at; } catch { /* reprise au début */ }
    }
    sync();
  });
  listen('durationchange', sync);
  listen('canplay', () => { loading = false; sync(); });
  // iOS ne précharge rien avant la première lecture : le navigateur le signale par `suspend`.
  listen('suspend', () => { if (loading && audio.paused) { loading = false; sync(); } });
  listen('waiting', () => { loading = true; sync(); });
  listen('playing', () => { loading = false; blocked = false; sync(); });
  listen('play', sync);
  // Pause venue d'ailleurs (touche multimédia, casque débranché, appel) : la demande de lecture tombe.
  // En fin de titre, `pause` précède `ended` : l'enchaînement reste l'affaire de onEnded.
  // (Un `pause` en retard, alors qu'une nouvelle lecture est déjà lancée, ne compte pas.)
  listen('pause', () => { if (audio.paused && !audio.ended) wantPlay = false; sync(); });
  listen('seeked', sync);
  listen('ended', onEnded);
  listen('error', onError);
  return audio;
}

// resumeFrom : position à reprendre (nouvel essai après une erreur), 0 pour un chargement normal.
function load(track, resumeFrom = 0) {
  if (!ensureAudio()) return false;
  current = track;
  wantPlay = false;
  blocked = false;
  disarm();
  error = null;
  resumeAt = resumeFrom;
  pendingSeek = resumeFrom;
  loading = true;
  audio.src = track.url;
  audio.load();
  describe(track);
  sync();
  return true;
}

function onEnded() {
  const next = list[list.indexOf(current) + 1];
  if (next && options.continuous) { load(next); player.play(); return; }
  if (!next && options.loop && list.length) { load(list[0]); player.play(); return; }
  const target = next ?? list[0];
  if (target && target !== current) load(target);
  else { wantPlay = false; sync(); }
}

function onError() {
  if (!current) return; // src retiré volontairement
  const code = audio.error?.code ?? 0;
  if (code === 1) return;
  resumeAt = audio.currentTime || resumeAt;
  error = describeError(code);
  wantPlay = false;
  blocked = false;
  disarm();
  loading = false;
  console.warn(`[player] ${current.id} : ${error}`, audio.error?.message ?? '');
  sync();
}

// Lecture refusée faute de geste : elle repart au premier clic du visiteur.
// Le clic seul, écouté sur window : il y arrive après les gestionnaires de la page, donc un
// bouton Play cliqué traite d'abord son propre clic (un `pointerup` ou un `keydown` passerait
// avant, lancerait la lecture, et le clic du bouton la remettrait aussitôt en pause).
// Sans clic dans les dix secondes, la demande est abandonnée.
function arm() {
  if (!armed) {
    armed = true;
    window.addEventListener('click', onGesture, { passive: true });
  }
  window.clearTimeout(unlockTimer);
  unlockTimer = window.setTimeout(() => {
    if (!blocked) return;
    blocked = false;
    wantPlay = false;
    disarm();
    sync();
  }, UNLOCK_WINDOW_MS);
}
function disarm() {
  if (unlockTimer) { window.clearTimeout(unlockTimer); unlockTimer = 0; }
  if (!armed) return;
  armed = false;
  window.removeEventListener('click', onGesture);
}
function onGesture() {
  if (blocked && wantPlay) { player.play(); return; }
  disarm();
  if (blocked) { blocked = false; sync(); }
}

// Safari et iOS lèvent l'exigence de geste élément par élément, à l'appel de play() pendant un
// geste. Au premier geste du visiteur, avant qu'un titre soit chargé, on présente donc l'élément
// (play puis pause, sans source, sans un son) : une lecture demandée un instant plus tard dans la
// même interaction, après un `await` de l'interface, ne sera pas refusée faute de geste.
const PRIME_EVENTS = ['touchend', 'click', 'keydown'];
function prime() {
  if (primed) { unprime(); return; }
  if (current) return; // un titre est chargé : la vraie lecture s'en charge
  if (!ensureAudio()) return;
  primed = true;
  try {
    const attempt = audio.play();
    // geste non reconnu par le navigateur : on réessaiera au geste suivant
    attempt?.catch?.((e) => { if (e?.name === 'NotAllowedError') primed = false; });
    audio.pause();
  } catch { primed = false; }
}
function unprime() {
  for (const type of PRIME_EVENTS) window.removeEventListener(type, prime, true);
}
if (typeof window !== 'undefined') {
  for (const type of PRIME_EVENTS) window.addEventListener(type, prime, { capture: true, passive: true });
}

// Touches multimédia du clavier, écran verrouillé.
function describe(track) {
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  if (!session || typeof window.MediaMetadata !== 'function') return;
  try {
    session.metadata = new window.MediaMetadata({ title: track.title, artist: track.artist ?? '', album: track.album ?? '' });
    session.setActionHandler('play', () => player.play());
    session.setActionHandler('pause', () => player.pause());
    session.setActionHandler('nexttrack', () => player.next());
    session.setActionHandler('previoustrack', () => player.prev());
  } catch { /* confort seulement */ }
}

// Option `analyser` : installée après une première lecture réussie, quand le
// contexte audio tourne vraiment. Un échec laisse le son sur sa sortie directe.
async function ensureGraph() {
  if (!options.analyser || graph || graphTried) return;
  graphTried = true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  let ctx = null;
  try {
    ctx = new Ctx();
    if (ctx.state !== 'running') await ctx.resume();
    if (ctx.state !== 'running') throw new Error(`contexte ${ctx.state}`);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaElementSource(audio).connect(analyser);
    analyser.connect(ctx.destination);
    graph = { ctx, analyser, data: new Uint8Array(analyser.fftSize) };
  } catch (e) {
    console.warn('[player] niveau sonore indisponible', e);
    try { ctx?.close(); } catch { /* rien à fermer */ }
  }
}

function level() {
  if (!graph || !audio || audio.paused) return 0;
  graph.analyser.getByteTimeDomainData(graph.data);
  let sum = 0;
  for (let i = 0; i < graph.data.length; i++) {
    const v = (graph.data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / graph.data.length) * 2.2);
}

function step(delta) {
  if (!list.length) return false;
  const i = current ? list.indexOf(current) : -1;
  const target = list[(i + delta + list.length) % list.length];
  const resume = wantPlay || snapshot().playing;
  if (!load(target)) return false;
  if (resume) player.play();
  return true;
}

export const player = {
  // Reçoit content.tracks. Peut être rappelé avec une autre liste.
  init(tracks = contentTracks, opts = {}) {
    list = usable(tracks);
    Object.assign(options, opts);
    if (audio && options.analyser) audio.crossOrigin = 'anonymous';
    if (current && !list.includes(current)) {
      const same = list.find((t) => t.id === current.id);
      if (same) current = same;
    }
    return player;
  },

  // Charge un titre, à l'arrêt. Sans effet si c'est déjà le titre chargé (la lecture continue).
  select(trackId) {
    const track = list.find((t) => t.id === trackId);
    if (!track) {
      console.warn(`[player] titre inconnu : ${trackId}`);
      return false;
    }
    if (current === track && !error) return true;
    return load(track);
  },

  // Lance la lecture du titre chargé (le premier de la liste si rien n'est chargé).
  async play() {
    if (!current && !(list.length && load(list[0]))) return false;
    if (!ensureAudio()) return false;
    // Nouvel essai après une erreur : on recharge et on reprend où le son s'est arrêté.
    if (error) load(current, resumeAt);
    wantPlay = true;
    if (graph && graph.ctx.state !== 'running') graph.ctx.resume().catch(() => {});
    try {
      await audio.play();
      blocked = false;
      primed = true;
      unprime();
      disarm();
      ensureGraph();
      sync();
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false; // remplacée par une pause ou un autre chargement
      if (e?.name === 'NotAllowedError') {
        blocked = true;
        arm();
      } else if (!error) {
        // Source absente ou illisible : l'événement `error` de l'élément donne le détail s'il arrive.
        error = describeError(audio.error?.code);
        wantPlay = false;
        blocked = false;
        disarm();
        loading = false;
        console.warn(`[player] ${current?.id} : ${error}`, e);
      }
      sync();
      return false;
    }
  },

  pause() {
    wantPlay = false;
    blocked = false;
    disarm();
    if (audio && !audio.paused) audio.pause(); // l'événement `pause` publie l'état
    else sync();
  },

  toggle() {
    return snapshot().playing ? player.pause() : player.play();
  },

  seek(seconds) {
    if (!audio || !current) return;
    const { duration } = snapshot();
    const t = Math.max(0, Math.min(Number(seconds) || 0, duration ? duration - 0.05 : 0));
    try { audio.currentTime = t; } catch { /* métadonnées pas encore là */ }
    sync();
  },

  next() { return step(1); },
  prev() { return step(-1); },

  get state() { return snapshot(); },
  get level() { return level(); },
  get tracks() { return list; },
};

// Demande de chargement venue du bus (src/core/bus.js) : écoutée dès l'import, même sans init().
on('player:select', (detail) => { if (detail?.trackId) player.select(detail.trackId); });
