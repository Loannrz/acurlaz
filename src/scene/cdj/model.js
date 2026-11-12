// Charge le glb et en sort UN CDJ-3000 normalisé.
//
// Le fichier contient deux CDJ et une table de mixage en deux maillages
// monolithiques, sans nœud pour le jog, le bouton Play ou l'écran
// (docs/CDJ-MODEL.md). On isole donc le CDJ de gauche par géométrie :
//   1. composantes connexes du maillage des CDJ ;
//   2. châssis = composante de plus grande empreinte, côté x négatif ;
//   3. on garde ce qui repose dans son empreinte (boutons, pieds, pod de
//      l'écran) et ce qui repose sur le pod (touches au-dessus de l'écran),
//      on jette les câbles, les fiches et la clé USB ;
//   4. on retire le relief grossier du jog et du bouton Play, remplacés par
//      des pièces reconstruites (parts.js).
//
// Repère local rendu (celui de docs/CDJ-MODEL.md) : x vers la droite, y vers
// le haut, z vers le DJ ; origine au centre de l'empreinte, sous les pieds.
// Unités : mètres pour la géométrie, millimètres pour les mesures (`mm`).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { splitComponents, geometryFromComponents } from './split.js';

export const CDJ_WIDTH = 0.329; // largeur réelle d'un CDJ-3000, en mètres
export const MM = 0.001;

// Emplacements peints sur la texture (mm, repère local, docs/CDJ-MODEL.md).
export const ZONES = {
  play: { x: -137.5, z: 199, r: 17.5 },
  cue: { x: -138, z: 152.8, r: 17 },
  browse: { x: 132, z: -142, r: 22 }, // molette de navigation, à droite de l'écran
  jog: { x: 0, z: 83.5, r: 111 }, // axe du jog : centre de l'anneau peint sur le panneau
  // surface affichable de l'écran : centre, largeur, hauteur le long de la pente
  screen: { x: -0.1, z: -138.3, w: 200.8, h: 117.2 },
};

const footprint = (box) => (box.max.x - box.min.x) * (box.max.z - box.min.z);

// Durées du chargement, relevées par l'API User Timing (onglet Performance, ou
// performance.getEntriesByName('cdj:decoupe')) : 'cdj:glb' pour le téléchargement et le
// décodage du fichier, 'cdj:decoupe' pour splitComponents, qui bloque le fil principal.
const chrono = (nom) => {
  const debut = typeof performance !== 'undefined' ? performance.now() : 0;
  return () => {
    const ms = typeof performance !== 'undefined' ? performance.now() - debut : 0;
    try {
      performance.measure(nom, { start: debut, duration: ms });
    } catch {
      /* navigateur sans cette forme de measure() : la durée reste dans stats */
    }
    return ms;
  };
};

export async function loadCdj(url) {
  const finGlb = chrono('cdj:glb');
  const gltf = await new GLTFLoader().loadAsync(url);
  const glbMs = finGlb();
  gltf.scene.updateMatrixWorld(true);

  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const source = meshes.find((m) => /cdj/i.test(m.name));
  if (!source) throw new Error(`[cdj] maillage « cdj » introuvable dans ${url}`);
  const texture = source.material.map ?? null;

  // Les matrices des nœuds (Z haut vers Y haut, échelles) passent dans la géométrie.
  const raw = source.geometry.clone().applyMatrix4(source.matrixWorld);
  const finDecoupe = chrono('cdj:decoupe');
  const parts = splitComponents(raw);
  const splitMs = finDecoupe();
  if (!parts.length) throw new Error(`[cdj] maillage « cdj » vide dans ${url}`);

  // Les deux châssis : plus grandes empreintes, disjointes en x. On garde le gauche.
  const byArea = [...parts].sort((a, b) => footprint(b.box) - footprint(a.box));
  const first = byArea[0];
  const second = byArea.find((p) => p.box.max.x < first.box.min.x || p.box.min.x > first.box.max.x);
  const body = !second || first.box.min.x < second.box.min.x ? first : second;
  const scale = CDJ_WIDTH / (body.box.max.x - body.box.min.x);
  const rawMm = MM / scale; // un millimètre réel, en unités brutes

  const centre = new THREE.Vector3();
  const inFootprint = (p, host) => {
    p.box.getCenter(centre);
    return centre.x >= host.box.min.x && centre.x <= host.box.max.x && centre.z >= host.box.min.z && centre.z <= host.box.max.z;
  };
  const onBody = parts.filter((p) => p === body || inFootprint(p, body));
  // Pod de l'écran : la pièce qui dépasse le châssis vers l'arrière.
  const pod = onBody
    .filter((p) => p !== body && p.box.min.z < body.box.min.z - rawMm)
    .sort((a, b) => footprint(b.box) - footprint(a.box))[0] ?? null;
  // Touches posées sur le pod (leur centre sort de l'empreinte du châssis).
  const onPod = pod
    ? parts.filter((p) => !onBody.includes(p) && inFootprint(p, pod) && p.box.min.y > pod.box.max.y - 10 * rawMm)
    : [];
  // Clé USB branchée à l'arrière gauche : pièce étroite qui dépasse nettement du dessus.
  const isUsbStick = (p) =>
    p.box.max.y > body.box.max.y + 8 * rawMm
    && p.box.max.x - p.box.min.x < 30 * rawMm
    && p.box.min.x < body.box.min.x + 35 * rawMm
    && p.box.min.z < body.box.min.z + 30 * rawMm;
  let kept = [...onBody, ...onPod].filter((p) => p === body || !isUsbStick(p));

  // Repère local : centre de l'empreinte, dessous des pieds.
  const bounds = new THREE.Box3();
  for (const p of kept) bounds.union(p.box);
  const origin = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2);
  const toMm = (box) => ({
    x0: (box.min.x - origin.x) / rawMm, x1: (box.max.x - origin.x) / rawMm,
    y0: (box.min.y - origin.y) / rawMm, y1: (box.max.y - origin.y) / rawMm,
    z0: (box.min.z - origin.z) / rawMm, z1: (box.max.z - origin.z) / rawMm,
  });
  const panelY = toMm(body.box).y1; // dessus plat du châssis, en mm

  const pos = raw.attributes.position, uv = raw.attributes.uv;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = new THREE.Triangle();
  const n = new THREE.Vector3();
  const local = (v, i) => v.fromBufferAttribute(pos, i).sub(origin).multiplyScalar(1 / rawMm);

  // Couvercle d'un prisme : centre, normale et rayon de sa face tournée vers le haut (mm).
  const capOf = (part) => {
    const centre = new THREE.Vector3(), normal = new THREE.Vector3();
    let total = 0, radius = 0;
    const corners = [];
    for (let t = 0; t < part.index.length; t += 3) {
      tri.set(local(a, part.index[t]), local(b, part.index[t + 1]), local(c, part.index[t + 2]));
      tri.getNormal(n);
      if (n.y < 0.9) continue;
      const area = tri.getArea();
      centre.addScaledVector(a, area / 3).addScaledVector(b, area / 3).addScaledVector(c, area / 3);
      normal.addScaledVector(n, area);
      total += area;
      corners.push(a.clone(), b.clone(), c.clone());
    }
    if (!total) return null;
    centre.multiplyScalar(1 / total);
    normal.normalize();
    for (const v of corners) radius = Math.max(radius, v.distanceTo(centre));
    return { centre, normal, radius };
  };

  // Reliefs à remplacer : cherchés par leur emplacement, jamais par un nom.
  const reliefAt = (zone, { minR, maxR, minTop }) => {
    let best = null;
    for (const p of kept) {
      if (p === body || p === pod) continue;
      const m = toMm(p.box);
      const r = Math.max(m.x1 - m.x0, m.z1 - m.z0) / 2;
      const x = (m.x0 + m.x1) / 2, z = (m.z0 + m.z1) / 2;
      if (r < minR || r > maxR || m.y1 < panelY + minTop) continue;
      if (Math.hypot(x - zone.x, z - zone.z) > Math.max(6, zone.r * 0.12)) continue;
      if (!best || r > best.r) best = { part: p, x, z, r, top: m.y1 - panelY };
    }
    return best;
  };
  const reliefs = {
    jog: reliefAt(ZONES.jog, { minR: 80, maxR: 125, minTop: 4 }),
    play: reliefAt(ZONES.play, { minR: 12, maxR: 24, minTop: 1 }),
    cue: reliefAt(ZONES.cue, { minR: 12, maxR: 24, minTop: 1 }),
  };
  for (const [name, relief] of Object.entries(reliefs)) {
    if (!relief) console.warn(`[cdj] relief « ${name} » introuvable : la pièce reconstruite sera posée par-dessus`);
  }
  // Molette de navigation : deux prismes inclinés emboîtés (la tourelle, puis le bouton).
  const turret = [];
  for (const p of kept) {
    if (p === body || p === pod) continue;
    const m = toMm(p.box);
    const r = Math.max(m.x1 - m.x0, m.z1 - m.z0) / 2;
    const round = Math.abs((m.x1 - m.x0) - (m.z1 - m.z0)) < 12;
    if (!round || r < 10 || r > 30 || m.y1 < panelY + 20) continue;
    if (Math.hypot((m.x0 + m.x1) / 2 - ZONES.browse.x, (m.z0 + m.z1) / 2 - ZONES.browse.z) > 8) continue;
    turret.push({ part: p, r });
  }
  turret.sort((p, q) => q.r - p.r);
  const towerCap = turret.length === 2 ? capOf(turret[0].part) : null;
  const knobCap = turret.length === 2 ? capOf(turret[1].part) : null;
  const browse = towerCap && knobCap
    ? {
      centre: towerCap.centre, // centre du dessus de la tourelle
      normal: towerCap.normal, // axe de la molette, incliné comme l'écran
      towerRadius: towerCap.radius, // rayon du polygone d'origine (sommets)
      knobRadius: knobCap.radius,
      knobHeight: knobCap.centre.clone().sub(towerCap.centre).dot(towerCap.normal),
    }
    : null;
  if (!browse) console.warn('[cdj] molette de navigation introuvable : le relief d\'origine est conservé');

  const removed = [...Object.values(reliefs).map((r) => r?.part), ...(browse ? turret.map((t) => t.part) : [])];
  kept = kept.filter((p) => !removed.includes(p));
  // Pieds : seules pièces qui descendent sous le châssis. Rendus à part, en caoutchouc.
  const feet = kept.filter((p) => p !== body && p.box.min.y < body.box.min.y - rawMm);
  kept = kept.filter((p) => !feet.includes(p));

  // Correspondance (x, z) mm vers uv sur une face : plus grand triangle orienté vers le haut.
  const topFace = (part, minY) => {
    let best = null;
    for (let t = 0; t < part.index.length; t += 3) {
      const i0 = part.index[t], i1 = part.index[t + 1], i2 = part.index[t + 2];
      tri.set(local(a, i0), local(b, i1), local(c, i2));
      tri.getNormal(n);
      if (n.y < 0.9 || Math.min(a.y, b.y, c.y) < minY) continue;
      const area = tri.getArea();
      if (best && area <= best.area) continue;
      best = {
        area,
        normal: n.clone(),
        point: a.clone(),
        affine: affine([
          [a.x, a.z, uv.getX(i0), uv.getY(i0)],
          [b.x, b.z, uv.getX(i1), uv.getY(i1)],
          [c.x, c.z, uv.getX(i2), uv.getY(i2)],
        ]),
      };
    }
    return best;
  };

  const top = topFace(body, panelY - 0.05);
  const slope = pod ? topFace(pod, panelY) : null;

  const normalised = (list) => {
    const g = geometryFromComponents(raw, list);
    g.translate(-origin.x, -origin.y, -origin.z).scale(scale, scale, scale);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  };
  const geometry = normalised(kept);
  const feetGeometry = feet.length ? normalised(feet) : null;

  raw.dispose();
  for (const m of meshes) {
    m.geometry.dispose();
    m.material.dispose(); // la texture, partagée, reste vivante
  }

  const measure = (r) => (r ? { x: r.x, z: r.z, r: r.r, top: r.top } : null);
  return {
    geometry,
    feet: feetGeometry,
    texture,
    panelY, // mm
    uvTop: top?.affine ?? null,
    // Plan de l'écran : hauteur y (mm) du pan incliné à l'abscisse z, et sa normale.
    screen: slope
      ? {
        normal: slope.normal,
        yAt: (x, z) => slope.point.y - (slope.normal.x * (x - slope.point.x) + slope.normal.z * (z - slope.point.z)) / slope.normal.y,
      }
      : null,
    // Reliefs retirés, mesurés (mm) : centre, rayon, hauteur au-dessus du panneau.
    reliefs: { jog: measure(reliefs.jog), play: measure(reliefs.play), cue: measure(reliefs.cue), browse },
    stats: { components: parts.length, kept: kept.length + feet.length, glbMs, splitMs },
  };
}

// Affine (x, z) mm vers (u, v), à partir de trois points [x, z, u, v].
export function affine([[x0, z0, u0, v0], [x1, z1, u1, v1], [x2, z2, u2, v2]]) {
  const det = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0);
  if (Math.abs(det) < 1e-9) return { a: 0, b: 0, c: u0, d: 0, e: 0, f: v0 };
  const a = ((u1 - u0) * (z2 - z0) - (u2 - u0) * (z1 - z0)) / det;
  const b = ((x1 - x0) * (u2 - u0) - (x2 - x0) * (u1 - u0)) / det;
  const d = ((v1 - v0) * (z2 - z0) - (v2 - v0) * (z1 - z0)) / det;
  const e = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
  return { a, b, c: u0 - a * x0 - b * z0, d, e, f: v0 - d * x0 - e * z0 };
}
