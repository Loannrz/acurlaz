// VU meter covers for the mixer. The texture bakes lit green bars; since no
// music plays, each bar is covered by a plane showing unlit segments.
//   vu.setLevel('ch1', 0.6)   // channels: ch1..ch4, masterL, masterR; 0..1
//   vu.setSegments('ch1', 7)  // number of lit segments (0..15), repaints only on change
// Segments light from the bottom (front) up, like the baked bars of the model
// (DJM-900NXS2): yellow-green, 4 orange, then red at the top (1 on a channel, 2 on
// the master). Driven by the real audio: src/audio/levels.js (VU_MAP in config.js).
import * as THREE from 'three';

// Columns in mixer-local millimetres (measured on the model texture).
const COLUMNS = {
  ch1: { x: -102, z0: -135, z1: -36, w: 5.6 },
  ch2: { x: -59.2, z0: -135, z1: -36, w: 5.6 },
  ch3: { x: -16.2, z0: -135, z1: -36, w: 5.6 },
  ch4: { x: 26.8, z0: -135, z1: -36, w: 5.6 },
  masterL: { x: 77.5, z0: -136, z1: -35, w: 4.6 },
  masterR: { x: 93.5, z0: -136, z1: -35, w: 4.6 },
};
const SEGMENTS = 15;
const RED = { ch: 1, master: 2 }; // red segments at the top
const ORANGE = 4;
const GREEN = '#d6dc3c', AMBER = '#e8a24a', CLIP = '#e2384c'; // colours sampled on the model
const LIFT = 0.0006;

export function createVuMeters(unit) {
  const meters = {};
  for (const [id, col] of Object.entries(COLUMNS)) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
    const h = col.z1 - col.z0;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(col.w / 1000, h / 1000), material);
    mesh.rotation.x = -Math.PI / 2; // plane +y -> -z (rear = top of the meter)
    mesh.position.set(col.x / 1000, unit.surfaceY + LIFT, (col.z0 + col.z1) / 2000);
    mesh.name = `mixer_vu_${id}`;
    unit.group.add(mesh);
    unit.fadeMaterials.push(material);
    meters[id] = { canvas, ctx, texture, mesh, material, level: 0, lit: 0, red: id.startsWith('master') ? RED.master : RED.ch };
    paint(meters[id], 0);
  }
  return {
    meters,
    setLevel(id, level) {
      const m = meters[id];
      if (!m) return;
      m.level = THREE.MathUtils.clamp(level, 0, 1);
      paint(m, Math.round(m.level * SEGMENTS));
    },
    setSegments(id, n) {
      const m = meters[id];
      if (!m) return;
      n = Math.max(0, Math.min(SEGMENTS, Math.round(n)));
      if (n === m.lit) return; // same picture: no repaint, no texture upload
      paint(m, n);
    },
  };
}

function paint(m, lit) {
  m.lit = lit;
  const { ctx, canvas } = m;
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0d0d0d'; // dark recess around the LEDs
  ctx.fillRect(0, 0, w, h);
  const segH = h / SEGMENTS;
  for (let i = 0; i < SEGMENTS; i++) {
    // i = 0 is the bottom segment (front of the mixer = bottom of the texture)
    const y = h - (i + 1) * segH;
    let color = '#232323'; // unlit
    if (i < lit) color = i >= SEGMENTS - m.red ? CLIP : i >= SEGMENTS - m.red - ORANGE ? AMBER : GREEN;
    ctx.fillStyle = color;
    ctx.fillRect(w * 0.18, y + segH * 0.22, w * 0.64, segH * 0.56);
  }
  m.texture.needsUpdate = true;
}
