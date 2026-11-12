// Pont entre le lecteur audio (src/audio/player.js, autre module) et l'interface :
// clics sur les pistes, état des lignes, mini-lecteur, annonce vocale.
import { on, emit } from '../core/bus.js';
import { fmtTime, icons, t } from './dom.js';

// import.meta.glob : le module peut ne pas exister encore, sans casser le build.
const loaders = import.meta.glob('../audio/player.js');
let playerRef = null;
let playerPromise = null;
function getPlayer() {
  if (playerRef) return Promise.resolve(playerRef);
  if (!playerPromise) {
    const load = Object.values(loaders)[0];
    playerPromise = load
      ? load().then((m) => (playerRef = m.player ?? m.default ?? null)).catch(() => null)
      : Promise.resolve(null);
  }
  return playerPromise;
}

export function initPlayerUI(root, tracks) {
  const byId = new Map(tracks.map((tr) => [tr.id, tr]));
  const rows = [...root.querySelectorAll('.row--track')];
  const bar = root.querySelector('.player');
  const toggleBtn = root.querySelector('[data-player-toggle]');
  const icon = toggleBtn.querySelector('.btn-round__icon');
  const nameEl = root.querySelector('.player__name');
  const artistEl = root.querySelector('.player__artist');
  const timeEl = root.querySelector('[data-player-time]');
  const durEl = root.querySelector('[data-player-dur]');
  const bpmEl = root.querySelector('[data-player-bpm]');
  const fill = root.querySelector('.player__fill');
  const progress = root.querySelector('.player__bar');
  const live = root.querySelector('#live');
  const html = document.documentElement;

  let state = { playing: false, trackId: null, time: 0, duration: 0 };
  let announced = null;
  let visiblePending = false;

  function render(prev) {
    const tr = byId.get(state.trackId);
    rows.forEach((r) => {
      const sel = r.dataset.track === state.trackId;
      const play = sel && state.playing;
      r.classList.toggle('is-selected', sel);
      r.classList.toggle('is-playing', play);
      if (sel) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
      r.querySelector('.row__state').textContent = play ? ' en lecture' : sel ? ' chargé' : '';
    });
    if (!tr) return;
    bar.hidden = false;
    html.classList.add('has-player');
    if (!bar.classList.contains('is-visible') && !visiblePending) {
      visiblePending = true;
      requestAnimationFrame(() => { bar.classList.add('is-visible'); visiblePending = false; });
    }
    nameEl.textContent = tr.title;
    artistEl.textContent = tr.artist;
    bpmEl.textContent = ` ${tr.bpm} BPM`;
    const dur = state.duration || tr.duration || 0;
    durEl.textContent = fmtTime(dur);
    timeEl.textContent = fmtTime(state.time);
    const p = dur ? Math.min(1, Math.max(0, state.time / dur)) : 0;
    fill.style.transform = `scaleX(${p})`;
    progress.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    toggleBtn.setAttribute('aria-label', state.playing ? 'Mettre en pause' : 'Lire');
    toggleBtn.classList.toggle('is-playing', state.playing);
    if (prev?.playing !== state.playing || prev?.trackId !== state.trackId || !icon.firstElementChild) {
      icon.innerHTML = state.playing ? icons.pause : icons.play;
    }
    if (state.playing && (announced !== tr.id || !prev?.playing)) {
      announced = tr.id;
      live.textContent = '';
      requestAnimationFrame(() => (live.textContent = `Lecture : ${tr.title}, ${tr.artist}`));
    }
    if (!state.playing && prev?.playing) announced = null;
  }

  function apply(d) {
    const prev = state;
    state = { ...state, ...d };
    render(prev);
  }

  on('player:state', apply);
  getPlayer().then((p) => { if (p?.state) apply(p.state); });

  async function activate(id) {
    const p = await getPlayer();
    if (!p) {
      // Lecteur absent : on garde l'interface cohérente et on prévient le bus.
      apply({ trackId: id });
      emit('player:select', { trackId: id });
      return;
    }
    try {
      if (state.trackId === id) { await p.toggle(); return; }
      await p.select(id);
      await p.play();
    } catch { /* autoplay bloqué ou fichier absent : l'état réel vient de player:state */ }
  }

  root.addEventListener('click', (e) => {
    const row = e.target.closest('.row--track');
    if (row) return activate(row.dataset.track);
    if (e.target.closest('[data-player-toggle]')) {
      getPlayer().then((p) => { if (p) p.toggle(); else apply({ playing: !state.playing }); });
    }
  });

  // Flèches haut et bas dans une liste (en plus de Tab).
  root.addEventListener('keydown', (e) => {
    const cur = e.target.closest?.('.row--track');
    if (!cur || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const i = rows.indexOf(cur);
    const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
    if (rows[next]) { e.preventDefault(); rows[next].focus(); }
  });

  return { getState: () => state };
}
