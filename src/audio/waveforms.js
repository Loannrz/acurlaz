// Onde des titres, pour l'écran du CDJ.
// Les niveaux sont calculés hors ligne à partir des fichiers de public/audio
// (src/audio/tools/build-waveforms.mjs) : rien n'est décodé dans le navigateur.
// Un titre sans onde calculée, ou dont le fichier a changé depuis, rend null :
// l'écran affiche alors une simple barre de progression.
import { tracks } from '../data/content.js';
import { WAVEFORMS } from './waveforms.data.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const TOLERANCE = 1.5; // secondes d'écart admises entre l'onde et le titre joué
const decoded = new Map();

// track : { id } ou { title, artist }, et si possible { duration } (durée réelle du fichier).
// Rend un Uint8Array de niveaux 0..63, ou null.
export function waveformFor(track) {
  if (!track) return null;
  const entry = tracks.find((t) => (track.id ? t.id === track.id : t.title === track.title && (!track.artist || t.artist === track.artist)));
  const data = entry ? WAVEFORMS[entry.id] : null;
  if (!data) return null;
  const duration = Number(track.duration) || entry.duration;
  if (Math.abs(data.d - duration) > TOLERANCE || Math.abs(data.d - entry.duration) > TOLERANCE) return null;
  let levels = decoded.get(entry.id);
  if (!levels) {
    levels = Uint8Array.from(data.p, (c) => Math.max(0, ALPHABET.indexOf(c)));
    decoded.set(entry.id, levels);
  }
  return levels;
}
