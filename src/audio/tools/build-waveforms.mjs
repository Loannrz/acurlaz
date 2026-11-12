// Calcule l'onde de chaque titre de content.js et écrit src/audio/waveforms.data.js.
// Outil de développement, hors build : à relancer dès qu'un fichier de public/audio change.
//
//   node src/audio/tools/build-waveforms.mjs
//
// Demande ffmpeg dans le PATH (décodage du mp3). Aucune dépendance npm.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tracks } from '../../data/content.js';

const BINS = 160; // une barre par pas de l'écran du CDJ
const RATE = 8000; // Hz : bien assez pour une enveloppe
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const lines = [];
for (const track of tracks) {
  const file = path.join(root, 'public', track.url.replace(/^\//, ''));
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const duration = samples.length / RATE;
  // Énergie efficace par pas.
  const rms = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) {
    const from = Math.floor((b / BINS) * samples.length), to = Math.floor(((b + 1) / BINS) * samples.length);
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    rms[b] = Math.sqrt(sum / Math.max(1, to - from));
  }
  // Normalisation sur le 98e centile, puis légère expansion : les titres masterisés
  // fort donnent sinon un bloc plein, sans relief.
  const sorted = Float64Array.from(rms).sort();
  const ref = sorted[Math.floor(BINS * 0.98)] || 1;
  let code = '';
  for (let b = 0; b < BINS; b++) {
    const v = Math.min(1, rms[b] / ref) ** 1.6;
    code += ALPHABET[Math.round(v * 63)];
  }
  lines.push(`  '${track.id}': { d: ${duration.toFixed(1)}, p: '${code}' },`);
  console.log(track.id, track.title, `${duration.toFixed(1)} s`);
}

const out = `// Fichier généré par src/audio/tools/build-waveforms.mjs : ne pas modifier à la main.
// Une entrée par titre de content.js : d = durée mesurée du fichier (secondes),
// p = ${BINS} niveaux de 0 à 63, un caractère par niveau (alphabet base64url).
export const WAVEFORMS = {
${lines.join('\n')}
};
`;
writeFileSync(path.join(root, 'src/audio/waveforms.data.js'), out);
console.log('écrit : src/audio/waveforms.data.js');
