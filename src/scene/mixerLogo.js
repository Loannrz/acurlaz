// Artist logo on the front face of the mixer (public/img/acurlaz-logo.png, cream
// letters on transparency), like a discreet screen print on the bare front panel.
//   - the front face is found on the model (rays from the DJ side): the largest
//     flat strip facing +z, measured at load (nothing hard-coded but the probe
//     point); the model has no port or button there (checked on captures), so
//     the whole strip is free;
//   - the logo's visible letters (alpha bounding box, not the padded image) are
//     centred horizontally and vertically on that strip, proportions kept,
//     MIXER_LOGO.widthFraction of its width;
//   - a decal plane 0.03 mm in front of the face, lit like the panel (no light
//     added, no emission), mipmapped + anisotropic so it stays sharp at grazing
//     angles. Not raycast (visual only), fades in with the mixer.
// Called by createMixerLabel() (src/scene/mixerLabel.js), so main.js and
// inspect.html both get it.
import * as THREE from 'three';

export const MIXER_LOGO = {
  url: `${import.meta.env.BASE_URL}img/acurlaz-logo.png`,
  probe: [0, 46], // unit-local (x, y) mm of a point of the front face
  widthFraction: 0.34, // logo width / width of the free front strip
  maxHeightFraction: 0.42, // and never taller than this fraction of its height
  tint: 0.62, // colour factor on the logo's own cream: a printed ink, not a glowing white
  roughness: 0.55, // ink: a little smoother than the panel
  lift: 0.03, // mm in front of the face
};

export function createMixerLogo({ unit }) {
  if (!unit?.mesh) return null;
  const L = MIXER_LOGO;
  unit.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(unit.group.matrixWorld);
  // unit-local hit of a ray from the front (+z) at (x, y) mm
  const box = new THREE.Box3().setFromObject(unit.mesh);
  const front = unit.group.worldToLocal(box.max.clone()).z + 0.05;
  const hitAt = (x, y) => {
    ray.set(unit.group.localToWorld(new THREE.Vector3(x / 1000, y / 1000, front)), dir);
    const h = ray.intersectObject(unit.mesh, false)[0];
    if (!h) return null;
    const p = unit.group.worldToLocal(h.point.clone()).multiplyScalar(1000);
    const n = h.face.normal.clone(); // mesh local = unit local (the body is not rotated in its group)
    return { p, n };
  };
  const ref = hitAt(L.probe[0], L.probe[1]);
  if (!ref || ref.n.z < 0.99) { console.warn('[mixerLogo] front face not found'); return null; }
  const onFace = (x, y) => { const h = hitAt(x, y); return !!h && h.n.z > 0.99 && Math.abs(h.p.z - ref.p.z) < 0.2; };
  // extent of the flat strip through the probe point (0.5 mm steps)
  const reach = (x, y, dx, dy) => { let k = 0; while (k < 800 && onFace(x + dx * (k + 1), y + dy * (k + 1))) k++; return k; };
  const step = 0.5;
  const x0 = L.probe[0] - reach(L.probe[0], L.probe[1], -step, 0) * step;
  const x1 = L.probe[0] + reach(L.probe[0], L.probe[1], step, 0) * step;
  const cxStrip = (x0 + x1) / 2;
  const y0 = L.probe[1] - reach(cxStrip, L.probe[1], 0, -step) * step;
  const y1 = L.probe[1] + reach(cxStrip, L.probe[1], 0, step) * step;
  const strip = { x0, x1, y0, y1, z: ref.p.z, cx: cxStrip, cy: (y0 + y1) / 2 };

  // decal: a canvas holding the visible part of the logo (filled once loaded)
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 4;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16; // clamped to the GPU maximum by three
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.premultiplyAlpha = true; // clean mipmaps on a transparent background
  const mat = new THREE.MeshStandardMaterial({
    map: tex, color: new THREE.Color(L.tint, L.tint, L.tint),
    metalness: 0, roughness: L.roughness,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); // resized once the image is known
  mesh.name = 'mixer_logo';
  mesh.visible = false;
  mesh.position.set(strip.cx / 1000, strip.cy / 1000, (strip.z + L.lift) / 1000);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.raycast = () => {};
  unit.group.add(mesh);
  unit.fadeMaterials?.push({
    transparent: true, needsUpdate: false,
    set opacity(v) { mat.opacity = v; },
    get opacity() { return mat.opacity; },
  });

  const result = { mesh, strip, size: null, ready: null };
  result.ready = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // visible letters: alpha bounding box
      const W = img.naturalWidth, H = img.naturalHeight;
      const probe = document.createElement('canvas');
      probe.width = W; probe.height = H;
      const g = probe.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const a = g.getImageData(0, 0, W, H).data;
      let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 16) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      if (bx1 < 0) { resolve(null); return; }
      const pad = 6; // px of transparent margin (mipmaps / filtering never bleed the edge)
      const sw = bx1 - bx0 + 1, sh = by1 - by0 + 1;
      cv.width = sw + 2 * pad; cv.height = sh + 2 * pad;
      cv.getContext('2d').drawImage(img, bx0, by0, sw, sh, pad, pad, sw, sh);
      tex.needsUpdate = true;
      // size: proportions kept, centred on the strip (the margin is outside the letters)
      const zw = strip.x1 - strip.x0, zh = strip.y1 - strip.y0;
      let w = zw * L.widthFraction, h = (w * sh) / sw;
      if (h > zh * L.maxHeightFraction) { h = zh * L.maxHeightFraction; w = (h * sw) / sh; }
      const mmPerPx = w / sw;
      mesh.scale.set((cv.width * mmPerPx) / 1000, (cv.height * mmPerPx) / 1000, 1);
      mesh.visible = true;
      result.size = { w, h };
      resolve(result.size);
    };
    img.onerror = () => { console.warn('[mixerLogo] logo image not loaded'); resolve(null); };
    img.src = L.url;
  });
  return result;
}
