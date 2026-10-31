// Music library + site content shown on the CDJ screens.
//   const library = createLibrary(); await library.ready;
//   library.loaded / library.error          // manifest state (error: string or null)
//   library.sources   -> [{ id, name, index, tracks: [track] }]   ("USB 1", "USB 2"...)
//   library.tracks    -> every track: { id ('usb1:1'), sourceId, sourceName, number (1-based
//                        in its source), file, url, title, artist, bpm, key, duration,
//                        license, sourceUrl }
//   library.track(id) -> track | null
//   library.playlists -> [{ id, name, trackIds }]  ("Warm-up", "Peak time", "Closing"),
//                        built from the same files; library.playlistTracks(pl) -> [track]
//   library.albums    -> [{ id, name, trackIds }]: tracks grouped by their `album`
//                        (manifest; a track without one goes under its key's name),
//                        in order of first appearance; library.playlistTracks(album) too
//   library.links     -> src/data/links.js (networks of the LINK page)
//   library.dates     -> src/data/dates.js, sorted, each with a Date `when`, upcoming
//                        only (today included: from the start of the current day)
//   library.feat      -> src/data/feat.js
//   library.about     -> src/data/about.js (+ photoUrl)
//   library.artist    -> 'ARTISTE' (placeholder)
//   library.image(url)-> HTMLImageElement once loaded, else null (starts loading;
//                        a change event fires when it arrives, or fails)
//   library.imageState(url) -> 'none' (never asked) | 'loading' | 'ok' | 'failed'
//   library.onChange(fn) -> fn() when the manifest or an image has loaded
// Audio: public/audio/manifest.json + files next to it, read at runtime with
// import.meta.env.BASE_URL (schema: { sources: [{ id, name, tracks: [{ file,
// title, artist, album, bpm, key, duration, license, sourceUrl }] }] }; album
// and key are optional: key = Camelot notation, e.g. "8A"). The demo
// files are meant to be replaced: edit the manifest, nothing else.
import { DATES } from './dates.js';
import { FEAT } from './feat.js';
import { ABOUT, ARTIST } from './about.js';
import { LINKS } from './links.js';

const BASE = import.meta.env.BASE_URL || '/';
export const assetUrl = (path) => `${BASE.replace(/\/?$/, '/')}${String(path).replace(/^\//, '')}`;

const PLAYLISTS = [
  { id: 'warmup', name: 'Warm-up' },
  { id: 'peak', name: 'Peak time' },
  { id: 'closing', name: 'Closing' },
];

// Every date of src/data/dates.js, sorted (`when`: noon, local time).
const ALL_DATES = DATES.map((d) => ({ ...d, when: new Date(`${d.date}T12:00:00`) })).sort((a, b) => a.when - b.when);

export function createLibrary() {
  const listeners = new Set();
  let upcoming = null, upcomingDay = ''; // past dates hidden, recomputed when the day changes
  const emit = () => { for (const fn of listeners) fn(); };
  const images = new Map(); // url -> { img, ok }
  const lib = {
    loaded: false,
    error: null,
    artist: ARTIST,
    sources: [],
    tracks: [],
    playlists: [],
    albums: [],
    links: LINKS.slice(),
    get dates() {
      const now = new Date();
      const day = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (day !== upcomingDay) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // today, 00:00
        upcoming = ALL_DATES.filter((d) => d.when >= start);
        upcomingDay = day;
      }
      return upcoming;
    },
    feat: FEAT.slice(),
    about: { ...ABOUT, photoUrl: assetUrl(ABOUT.photo) },
    track: (id) => lib.tracks.find((t) => t.id === id) ?? null,
    playlistTracks: (pl) => (pl?.trackIds ?? []).map((id) => lib.track(id)).filter(Boolean),
    image(url) {
      let e = images.get(url);
      if (!e) {
        const img = new Image();
        e = { img, ok: false, failed: false };
        images.set(url, e);
        img.decoding = 'async';
        img.onload = () => { e.ok = true; emit(); };
        img.onerror = () => { e.ok = false; e.failed = true; emit(); };
        img.src = url;
      }
      return e.ok ? e.img : null;
    },
    imageState(url) {
      const e = images.get(url);
      return !e ? 'none' : e.ok ? 'ok' : e.failed ? 'failed' : 'loading';
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ready: null,
  };

  lib.ready = fetch(assetUrl('audio/manifest.json'))
    .then((r) => {
      if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) throw new Error('manifeste audio introuvable');
      return r.json();
    })
    .then((m) => {
      const sources = Array.isArray(m?.sources) ? m.sources : [];
      lib.sources = sources.map((s, si) => ({
        id: String(s.id ?? `usb${si + 1}`),
        name: String(s.name ?? `USB ${si + 1}`),
        index: si,
        tracks: (Array.isArray(s.tracks) ? s.tracks : []).map((t, ti) => ({
          id: `${s.id ?? `usb${si + 1}`}:${ti + 1}`,
          sourceId: String(s.id ?? `usb${si + 1}`),
          sourceName: String(s.name ?? `USB ${si + 1}`),
          number: ti + 1,
          file: t.file,
          url: assetUrl(`audio/${t.file}`),
          title: String(t.title ?? t.file ?? ''),
          artist: String(t.artist ?? ''),
          album: String(t.album ?? '').trim() || String(s.name ?? `USB ${si + 1}`),
          bpm: Number(t.bpm) || null,
          key: t.key ? String(t.key) : '',
          duration: Number(t.duration) || 0,
          license: t.license ?? '',
          sourceUrl: t.sourceUrl ?? '',
        })),
      }));
      lib.tracks = lib.sources.flatMap((s) => s.tracks);
      lib.playlists = buildPlaylists(lib.tracks);
      lib.albums = buildAlbums(lib.tracks);
      lib.loaded = true;
    })
    .catch((e) => { lib.error = e?.message || String(e); })
    .finally(emit);
  return lib;
}

// Fake playlists from the same files: by tempo, a third each (slowest first
// for the warm-up, fastest for the peak, the rest to close), at least one track.
function buildPlaylists(tracks) {
  const byBpm = [...tracks].sort((a, b) => (a.bpm ?? 0) - (b.bpm ?? 0));
  const n = byBpm.length;
  const third = Math.max(1, Math.round(n / 3));
  const warm = byBpm.slice(0, third);
  const peak = byBpm.slice(Math.max(third, n - third));
  const closing = byBpm.filter((t) => !warm.includes(t) && !peak.includes(t));
  const lists = { warmup: warm, peak: [...peak].reverse(), closing: closing.length ? closing : byBpm.slice(0, 1) };
  return PLAYLISTS.map((p) => ({ ...p, trackIds: lists[p.id].map((t) => t.id) }));
}

// Albums / collections: one entry per distinct `album`, in manifest order.
function buildAlbums(tracks) {
  const map = new Map();
  for (const t of tracks) {
    if (!map.has(t.album)) map.set(t.album, { id: `album-${map.size + 1}`, name: t.album, trackIds: [] });
    map.get(t.album).trackIds.push(t.id);
  }
  return [...map.values()];
}
