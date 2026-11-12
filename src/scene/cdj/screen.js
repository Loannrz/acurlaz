// Dessins 2D du CDJ : écran principal, afficheur du jog, marquage des boutons.
// La voix de la machine (DA 1) : Martian Mono, trois encres à plat, fond noir,
// texte crème, vermillon pour ce qui est actif (lecture, tête de lecture).
import * as THREE from 'three';
import { INK } from './da.js';
import { waveformFor } from '../../audio/waveforms.js';

export const SCREEN_SIZE = [1024, 598]; // DA 8
const FAMILY = "'Martian Mono Variable', monospace";

// Gris de tokens.css (mélanges crème sur noir). Lus dans la page quand la feuille
// est chargée, recalculés par le même mélange sinon.
const TOKENS = { 'creme-2': 0.64, 'creme-3': 0.54, 'trait-fort': 0.4, trait: 0.16 };
const mixCache = new Map();
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function ink(name) {
  if (INK[name]) return INK[name];
  if (mixCache.has(name)) return mixCache.get(name);
  let value = '';
  if (typeof document !== 'undefined') value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!value) {
    const a = channels(INK.noir), b = channels(INK.creme), k = TOKENS[name] ?? 0.5;
    value = `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(', ')})`;
  }
  mixCache.set(name, value);
  return value;
}
export const forgetInks = () => mixCache.clear();

// Police du canvas. La chasse (condensed, semi-condensed) passe par le raccourci `font` ;
// un navigateur qui refuserait ce mot-clé garde la ligne précédente, valide, en chasse normale :
// le texte sort plus large, jamais dans la police par défaut du canvas.
function setFont(ctx, size, weight = 400, stretch = 'semi-condensed') {
  ctx.font = `${weight} ${size}px ${FAMILY}`;
  ctx.font = `${weight} ${stretch} ${size}px ${FAMILY}`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch; // même valeur par la propriété, là où elle existe
}
export const clock = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function makeTexture(canvas, anisotropy) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

// Texte calé à gauche qui rétrécit jusqu'à `min`, puis se coupe d'une ellipse.
function fitText(ctx, text, x, y, maxWidth, size, min, weight, stretch) {
  let s = size;
  setFont(ctx, s, weight, stretch);
  while (s > min && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    setFont(ctx, s, weight, stretch);
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = `${out.slice(0, -2).trimEnd()}…`;
  ctx.fillText(out, x, y);
}

function spaced(ctx, text, x, y, tracking, align = 'left') {
  // letter-spacing du canvas n'existe pas partout : approche posée lettre à lettre.
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cx = align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + tracking; });
  ctx.textAlign = prev;
  return total;
}

// Texte espacé, coupé d'une ellipse s'il dépasse.
function fitSpaced(ctx, text, x, y, tracking, maxWidth) {
  let out = text;
  const width = (t) => ctx.measureText(t).width + tracking * (t.length - 1);
  while (out.length > 1 && width(out) > maxWidth) out = `${out.slice(0, -2).trimEnd()}…`;
  return spaced(ctx, out, x, y, tracking);
}

// --- écran principal ---------------------------------------------------------
// data : { title, artist, time, duration, bpm, key } ou null (aucun titre chargé).
export function createScreen({ anisotropy = 1 } = {}) {
  const [W, H] = SCREEN_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = makeTexture(canvas, anisotropy);

  let data = null;
  let playing = false;
  let signature = '';
  let peaks = null;
  let peaksKey = '';

  // Tout texte fait 40 px au moins : vu depuis la section sons, l'écran mesure environ
  // 300 px de large, soit 12 px à l'écran pour 40 px de canvas.
  const M = 46; // marge
  const WAVE = { x: M, y: 280, w: W - 2 * M, h: 116 };

  function draw() {
    ctx.fillStyle = ink('noir');
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const loaded = Boolean(data?.title);
    const duration = loaded ? Math.max(0, Number(data.duration) || 0) : 0;
    const time = loaded ? Math.min(Math.max(0, Number(data.time) || 0), duration || Infinity) : 0;
    const progress = duration > 0 ? time / duration : 0;

    // État : pictogramme et mot, jamais la couleur seule.
    const stateY = 86;
    ctx.fillStyle = playing ? ink('accent') : loaded ? ink('creme') : ink('creme-2');
    if (playing) {
      ctx.beginPath();
      ctx.moveTo(M, stateY - 30); ctx.lineTo(M + 27, stateY - 15); ctx.lineTo(M, stateY);
      ctx.closePath();
      ctx.fill();
    } else if (loaded) {
      ctx.fillRect(M, stateY - 30, 9, 30);
      ctx.fillRect(M + 17, stateY - 30, 9, 30);
    } else {
      ctx.fillRect(M, stateY - 18, 26, 6);
    }
    setFont(ctx, 40, 600, 'condensed');
    spaced(ctx, playing ? 'LECTURE' : loaded ? 'PAUSE' : 'EN ATTENTE', M + 44, stateY, 3);

    // Durée totale, en haut à droite.
    if (loaded) {
      ctx.fillStyle = ink('creme-2');
      setFont(ctx, 40, 500, 'semi-condensed');
      ctx.textAlign = 'right';
      ctx.fillText(clock(Math.round(duration)), W - M, stateY); // 146,96 s s'annonce 02:27, comme dans la liste
      ctx.textAlign = 'left';
    }

    // Titre et artiste (ou consigne).
    ctx.fillStyle = ink('creme');
    if (loaded) {
      fitText(ctx, String(data.title), M - 3, 180, W - 2 * M, 84, 54, 700, 'condensed');
      ctx.fillStyle = ink('creme-2');
      setFont(ctx, 40, 500, 'condensed');
      const artist = String(data.artist ?? '').toUpperCase();
      if (artist) fitSpaced(ctx, artist, M, 240, 3, W - 2 * M);
    } else {
      setFont(ctx, 68, 700, 'condensed');
      ctx.fillText('Choisir un titre,', M - 3, 174);
      ctx.fillText('puis Play.', M - 3, 250);
    }

    // Onde du titre, ou simple barre de progression quand l'onde manque.
    const { x, y, w, h } = WAVE;
    const mid = y + h / 2;
    let span = w; // largeur réellement dessinée, pour caler la tête de lecture
    if (loaded && peaks) {
      // Barres au pas entier (4 px pleins, 2 px vides) : un rythme net, sans battement.
      const pitch = 6, bar = 4;
      const count = Math.floor((w + pitch - bar) / pitch);
      span = count * pitch - (pitch - bar);
      for (let j = 0; j < count; j++) {
        const from = Math.floor((j * peaks.length) / count), to = Math.max(from + 1, Math.floor(((j + 1) * peaks.length) / count));
        let level = 0;
        for (let i = from; i < to; i++) level = Math.max(level, peaks[i]);
        const amp = Math.max(3, Math.round((level / 63) * (h / 2)));
        ctx.fillStyle = (j + 0.5) / count <= progress ? ink('creme') : ink('trait-fort');
        ctx.fillRect(x + j * pitch, mid - amp, bar, amp * 2);
      }
    } else {
      ctx.fillStyle = ink('trait');
      ctx.fillRect(x, mid - 4, w, 8);
      if (loaded) {
        ctx.fillStyle = ink('creme');
        ctx.fillRect(x, mid - 4, Math.round(w * progress), 8);
      }
    }
    if (loaded) {
      // Tête de lecture vermillon.
      const head = 6;
      const px = Math.min(x + Math.round(span * progress), x + span - head);
      ctx.fillStyle = ink('accent');
      ctx.fillRect(px, y - 14, head, h + 28);
    }

    // Temps écoulé, puis BPM et tonalité du titre chargé.
    const baseY = H - M + 2;
    ctx.fillStyle = loaded ? ink('creme') : ink('trait-fort');
    setFont(ctx, 116, 600, 'semi-condensed');
    ctx.fillText(clock(time), M - 6, baseY);
    if (loaded) {
      ctx.textAlign = 'right';
      setFont(ctx, 62, 600, 'semi-condensed');
      const key = data.key ? String(data.key) : '';
      if (key) ctx.fillText(key, W - M, baseY);
      const keyWidth = key ? Math.max(ctx.measureText(key).width, ctx.measureText('10A').width) + 44 : 0;
      if (Number(data.bpm) > 0) {
        const unitRight = W - M - keyWidth;
        ctx.fillStyle = ink('creme-2');
        setFont(ctx, 40, 500, 'condensed');
        const unitWidth = spaced(ctx, 'BPM', unitRight, baseY, 3, 'right');
        ctx.fillStyle = ink('creme');
        setFont(ctx, 62, 600, 'semi-condensed');
        ctx.fillText(String(Math.round(Number(data.bpm))), unitRight - unitWidth - 14, baseY);
      }
      ctx.textAlign = 'left';
    }

    texture.needsUpdate = true;
  }

  return {
    canvas,
    texture,
    // Rend true si l'image a été redessinée.
    set(next, isPlaying) {
      data = next?.title ? next : null;
      playing = Boolean(isPlaying) && Boolean(data);
      const key = data ? `${data.title}|${data.artist ?? ''}|${Math.round((Number(data.duration) || 0) * 10)}` : '';
      if (key !== peaksKey) {
        peaksKey = key;
        peaks = data ? next.peaks ?? waveformFor(data) : null;
      }
      const duration = data ? Number(data.duration) || 0 : 0;
      const time = data ? Number(data.time) || 0 : 0;
      const head = duration > 0 ? Math.round((Math.min(time, duration) / duration) * WAVE.w) : 0;
      const sig = `${key}|${data?.bpm ?? ''}|${data?.key ?? ''}|${playing}|${Math.floor(time)}|${head}`;
      if (sig === signature) return false;
      signature = sig;
      draw();
      return true;
    },
    redraw() { draw(); },
    dispose() { texture.dispose(); },
  };
}

// --- afficheur du jog ----------------------------------------------------------
// Petit écran rond et fixe au centre du plateau : le tempo du titre chargé.
export function createJogDisplay({ anisotropy = 1 } = {}) {
  const S = 384;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = makeTexture(canvas, anisotropy);
  let bpm = null;

  function draw() {
    ctx.fillStyle = ink('noir');
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = bpm ? ink('creme') : ink('trait-fort');
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 26, 0, Math.PI * 2);
    ctx.stroke();
    if (bpm) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ink('creme');
      setFont(ctx, 112, 600, 'condensed');
      ctx.fillText(String(bpm), S / 2, S / 2 + 30);
      ctx.fillStyle = ink('creme-2');
      setFont(ctx, 40, 500, 'condensed');
      ctx.textAlign = 'left';
      const label = 'BPM', tracking = 4;
      const width = [...label].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + tracking * (label.length - 1);
      spaced(ctx, label, S / 2 - width / 2, S / 2 + 92, tracking);
    }
    texture.needsUpdate = true;
  }

  return {
    texture,
    set(value) {
      const next = Number(value) > 0 ? Math.round(Number(value)) : null;
      if (next === bpm) return false;
      bpm = next;
      draw();
      return true;
    },
    redraw() { draw(); },
    dispose() { texture.dispose(); },
  };
}

// --- marquage des boutons --------------------------------------------------------
// Encre noire imprimée sur le capuchon d'aluminium : triangle et barres pour Play,
// le mot CUE pour Cue.
export function createButtonLabel(kind, { anisotropy = 1 } = {}) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = makeTexture(canvas, anisotropy);

  function draw() {
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = ink('noir');
    if (kind === 'play') {
      const cy = S / 2, h = 62;
      ctx.beginPath();
      ctx.moveTo(62, cy - h / 2); ctx.lineTo(62 + 54, cy); ctx.lineTo(62, cy + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(138, cy - h / 2, 18, h);
      ctx.fillRect(172, cy - h / 2, 18, h);
    } else {
      setFont(ctx, 74, 700, 'condensed');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CUE', S / 2, S / 2 + 4);
    }
    texture.needsUpdate = true;
  }
  draw();
  return { texture, redraw() { draw(); }, dispose() { texture.dispose(); } };
}
