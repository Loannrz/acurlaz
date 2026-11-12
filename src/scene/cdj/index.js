// Le CDJ-3000 jouable du site.
//
//   const cdj = await createCdj({ renderer });
//   float.add(cdj.root);                        // DA 13.6 : scene > rig > float > cdj
//   cdj.onPlayPress(() => player.toggle());
//   on('player:state', (s) => {
//     cdj.setPlaying(s.playing);
//     cdj.setScreen(s.track && { title, artist, time: s.time, duration: s.duration, bpm, key });
//   });
//   // à chaque image : cdj.update(dt)
//
// API du contrat (docs/CONTRAT-MODULES.md) :
//   root         THREE.Group centré à l'origine, en mètres. Le châssis est à (0, -0.059, 0) dedans.
//   jog          THREE.Group, la pièce tournante (axe y)
//   setPlaying(bool)
//   setScreen({ title, artist, time, duration, bpm, key })   null ou sans titre : écran d'attente
//   onPlayPress(cb)   abonne cb à l'appui sur Play ; rend la fonction de désabonnement
//   pickables    Object3D[] à passer au rayon de la scène : la zone de clic de Play
//                (userData.action === 'play'), masquée par le châssis et le jog comme une pièce pleine
//   update(dt)   dt en secondes ; rend true si l'image a changé (rendu à la demande)
//   dispose()
//
// Clic sur Play : la scène lance son rayon sur `pickables` ; si un objet est touché,
// elle appelle `cdj.pressPlay()` (ou `hit.object.userData.press()`), qui enfonce le
// bouton et prévient les abonnés de onPlayPress. Le CDJ n'écoute aucun événement du DOM.
//
// Compléments hors contrat :
//   pressPlay()            voir ci-dessus
//   setScreenLevel(k)      luminosité de l'écran et de l'afficheur du jog, de 0 à 1 (DA 8, colonne
//                          « Écran du CDJ » ; plafonnée à 1 pour que le crème reste crème)
//   setGlow(k)             luminosité des aplats non éclairés (voyants, index), de 0 à 1, pour un allumage de scène
//   setReducedMotion(bool) force ou lève le mouvement réduit (par défaut : réglage du système)
//   screenMesh, playButton pour un cadrage ou un réglage fin
//
// Options de createCdj, toutes facultatives :
//   reducedMotion   true ou false pour forcer ; absent : réglage du système, suivi en direct
//   texture         { mono, scale, sharpen } : par défaut la texture peinte passe en gris chauds
//                   (les voyants verts, orange et bleus de la photo sortent des trois encres) et
//                   elle est agrandie deux fois et accentuée au-dessus de 900 px de large.
//                   { mono: false } rend les couleurs d'origine.
//   url             autre emplacement du glb
//
// Ce que le module reconstruit, le glb n'ayant aucun nœud par pièce (docs/CDJ-MODEL.md) :
// un seul CDJ isolé du maillage, le jog (plateau tournant, afficheur fixe, collerette),
// les boutons Play et Cue, la molette de navigation, l'écran. L'image d'origine de ces
// pièces est recouverte ou repeinte : rien ne reste en double dessous.
import * as THREE from 'three';
import { loadCdj, ZONES, MM } from './model.js';
import { prepareTexture } from './texture.js';
import { jogGeometries, buttonGeometries, browseGeometries, BUTTON } from './parts.js';
import { createScreen, createJogDisplay, createButtonLabel, forgetInks } from './screen.js';
import { DA } from './da.js';

const MODEL_URL = `${import.meta.env.BASE_URL}models/pioneer_cdj_3000.glb`;
const DEG = Math.PI / 180;
const FLAT_LIFT = -1; // polygonOffset des aplats posés sur une surface
const FONT_PROBE = "600 64px 'Martian Mono Variable'";

// Courbes GSAP nommées par la DA, écrites en clair pour ne dépendre que de dt.
const power2Out = (t) => 1 - (1 - t) ** 3;
const power3Out = (t) => 1 - (1 - t) ** 4;

export async function createCdj({ renderer = null, reducedMotion, url = MODEL_URL, texture: textureOptions = {} } = {}) {
  const model = await loadCdj(url);
  const anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy?.() ?? 1);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // --- matériaux (DA 8) ---
  // Texture agrandie et accentuée sur ordinateur ; telle quelle sous 900 px (DA 10), où le
  // CDJ tient dans un bandeau et où la mémoire compte.
  const wide = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 900px)').matches);
  const roomy = (renderer?.capabilities.maxTextureSize ?? 0) >= 4096;
  const panelMap = model.texture
    ? keep(prepareTexture(model.texture, {
      uvTop: model.uvTop,
      anisotropy,
      scale: wide && roomy ? 2 : 1,
      sharpen: wide && roomy ? 1 : 0,
      ...textureOptions,
      patches: ['play', 'cue'].map((k) => model.reliefs[k] ?? ZONES[k]).map((z) => ({ x: z.x, z: z.z, r: 19.4 })),
    }))
    : null;
  model.texture?.dispose();
  model.texture?.image?.close?.(); // l'image d'origine a été recopiée sur un canvas
  const standard = (params) => keep(new THREE.MeshStandardMaterial(params));
  const flat = (color, extra = {}) => keep(new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra }));
  const M = DA.materiaux; // gris de matière : seule exception à « aucun hex hors DA.color » (da.js)
  const mat = {
    panel: standard({ map: panelMap, metalness: 0.1, roughness: 0.55, envMapIntensity: 0.9, name: 'cdj_chassis' }),
    rubber: standard({ color: M.rubber, metalness: 0, roughness: 0.92, name: 'cdj_pieds' }),
    platter: standard({ color: M.platter, metalness: 0.25, roughness: 0.18, name: 'cdj_jog_plateau' }),
    crown: standard({ color: M.crown, metalness: 1, roughness: 0.35, name: 'cdj_jog_couronne' }),
    steel: standard({ color: M.steel, metalness: 1, roughness: 0.22, name: 'cdj_jog_chanfrein' }),
    collar: standard({ color: M.collar, metalness: 0, roughness: 0.5, name: 'cdj_jog_collerette' }),
    tower: standard({ color: M.tower, metalness: 0.35, roughness: 0.42, name: 'cdj_molette_tourelle' }),
    cap: standard({ color: M.cap, metalness: 0.65, roughness: 0.36, name: 'cdj_bouton_capuchon' }),
    ringOff: standard({ color: M.ringOff, metalness: 0, roughness: 0.42, name: 'cdj_bouton_anneau' }),
    // aplats non éclairés : le hex exact à l'écran
    ringOn: flat(DA.color.accent, { name: 'cdj_voyant_play' }),
    outline: flat(DA.color.accent, { polygonOffset: true, polygonOffsetFactor: FLAT_LIFT, polygonOffsetUnits: FLAT_LIFT }),
    arc: flat(DA.color.accent, { polygonOffset: true, polygonOffsetFactor: FLAT_LIFT, polygonOffsetUnits: FLAT_LIFT, name: 'cdj_voyant_arc' }),
    index: flat(DA.color.creme, { polygonOffset: true, polygonOffsetFactor: FLAT_LIFT, polygonOffsetUnits: FLAT_LIFT, name: 'cdj_index' }),
    backing: flat(DA.color.noir),
    hit: keep(new THREE.MeshBasicMaterial({ visible: false })),
  };
  const glowing = [mat.ringOn, mat.outline, mat.arc, mat.index].map((m) => ({ m, base: m.color.clone() }));

  // --- graphe (DA 13.6) ---
  const root = new THREE.Group();
  root.name = 'cdj_root';
  const cdj = new THREE.Group();
  cdj.name = 'cdj';
  cdj.position.set(0, -0.059, 0);
  root.add(cdj);

  const mesh = (geometry, material, name, parent) => {
    const m = new THREE.Mesh(keep(geometry), material);
    m.name = name;
    parent.add(m);
    return m;
  };
  const chassis = mesh(model.geometry, mat.panel, 'cdj_chassis', cdj);
  if (model.feet) mesh(model.feet, mat.rubber, 'cdj_pieds', cdj);
  const panelY = model.panelY * MM;

  // --- jog ---
  const jogAt = model.reliefs.jog ?? ZONES.jog;
  const jogMount = new THREE.Group();
  jogMount.name = 'jog_socle';
  jogMount.position.set(jogAt.x * MM, panelY, jogAt.z * MM);
  cdj.add(jogMount);
  const jogGeo = jogGeometries();
  mesh(jogGeo.collar, mat.collar, 'jog_collerette', jogMount);
  const arc = mesh(jogGeo.arc, mat.arc, 'jog_arc', jogMount);
  arc.visible = false;
  const jogDisplay = keep(createJogDisplay({ anisotropy }));
  const jogDisplayMaterial = flat(M.neutral, { map: jogDisplay.texture, name: 'cdj_jog_afficheur' });
  mesh(jogGeo.display, jogDisplayMaterial, 'jog_afficheur', jogMount);
  const jog = new THREE.Group();
  jog.name = 'jog';
  jogMount.add(jog);
  const platter = mesh(jogGeo.platter, mat.platter, 'jog_plateau', jog);
  mesh(jogGeo.bevel, mat.steel, 'jog_chanfrein', jog);
  const crown = mesh(jogGeo.crown, mat.crown, 'jog_couronne', jog);
  mesh(jogGeo.index, mat.index, 'jog_index', jog);

  // --- molette de navigation : tourelle et bouton refaits sur l'axe d'origine ---
  if (model.reliefs.browse) {
    const { centre: at, normal: axis, towerRadius, knobRadius, knobHeight } = model.reliefs.browse;
    const browseGeo = browseGeometries({ towerRadius, knobRadius, knobHeight });
    const browse = new THREE.Group();
    browse.name = 'molette';
    browse.position.copy(at).multiplyScalar(MM);
    browse.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    cdj.add(browse);
    mesh(browseGeo.tower, mat.tower, 'molette_tourelle', browse);
    mesh(browseGeo.ring, mat.steel, 'molette_bague', browse);
    mesh(browseGeo.knob, mat.cap, 'molette_bouton', browse);
  }

  // --- boutons Play et Cue ---
  const buttonGeo = buttonGeometries();
  const makeButton = (kind) => {
    const at = model.reliefs[kind] ?? ZONES[kind];
    const group = new THREE.Group();
    group.name = `bouton_${kind}`;
    group.position.set(at.x * MM, panelY, at.z * MM);
    cdj.add(group);
    const moving = new THREE.Group();
    group.add(moving);
    const ring = mesh(buttonGeo.ring, mat.ringOff, `${kind}_anneau`, moving);
    mesh(buttonGeo.cap, mat.cap, `${kind}_capuchon`, moving);
    const label = keep(createButtonLabel(kind, { anisotropy }));
    const labelMaterial = standard({
      map: label.texture, transparent: true, depthWrite: false, metalness: 0, roughness: 0.7,
      polygonOffset: true, polygonOffsetFactor: FLAT_LIFT, polygonOffsetUnits: FLAT_LIFT,
    });
    mesh(buttonGeo.label, labelMaterial, `${kind}_marquage`, moving);
    return { group, moving, ring, label };
  };
  const play = makeButton('play');
  const cue = makeButton('cue');
  const outline = mesh(buttonGeo.outline, mat.outline, 'play_contour', play.moving);
  outline.visible = false;

  // Zone de clic de Play, élargie à 26 mm (DA 11). Invisible, mais pleine pour le rayon :
  // ce que le châssis ou le jog cache à la caméra ne se clique pas.
  const hit = mesh(buttonGeo.hit, mat.hit, 'play_zone', play.group);
  const occluders = [chassis, crown, platter];
  const meshRaycast = THREE.Mesh.prototype.raycast;
  hit.raycast = function raycast(raycaster, intersects) {
    const own = [];
    meshRaycast.call(this, raycaster, own);
    if (!own.length) return;
    const blockers = [];
    for (const o of occluders) o.raycast(raycaster, blockers);
    // le bouton lui-même est juste sous la zone : 6 mm de marge, à l'échelle de la scène
    const limit = own[0].distance - 0.006 * this.matrixWorld.getMaxScaleOnAxis();
    if (blockers.some((b) => b.distance < limit)) return;
    intersects.push(...own);
  };

  // --- écran : fond noir sur l'image peinte, puis le canvas ---
  const screen = keep(createScreen({ anisotropy }));
  const screenMaterial = flat(M.neutral, { map: screen.texture, name: 'cdj_ecran' });
  const zone = ZONES.screen;
  const normal = model.screen?.normal.clone() ?? new THREE.Vector3(0, Math.cos(0.1717), Math.sin(0.1717));
  const screenY = model.screen ? model.screen.yAt(zone.x, zone.z) : 117.8;
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
  const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
  const centre = new THREE.Vector3(zone.x, screenY, zone.z).multiplyScalar(MM);
  const ecran = new THREE.Group();
  ecran.name = 'ecran';
  ecran.position.copy(centre);
  ecran.quaternion.copy(orientation);
  cdj.add(ecran);
  const backing = mesh(new THREE.PlaneGeometry((zone.w + 1.6) * MM, (zone.h + 1.6) * MM), mat.backing, 'ecran_fond', ecran);
  backing.position.z = 0.6 * MM;
  const screenMesh = mesh(new THREE.PlaneGeometry(zone.w * 0.965 * MM, zone.h * 0.965 * MM), screenMaterial, 'ecran_image', ecran);
  screenMesh.position.z = 0.9 * MM;

  // --- état ---
  const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let forcedReduced = typeof reducedMotion === 'boolean' ? reducedMotion : null;
  const reduced = () => forcedReduced ?? Boolean(media?.matches);

  let playing = false;
  let loaded = false;
  let bpm = DA.bpm;
  let dirty = true; // quelque chose a changé depuis le dernier update()
  let disposed = false;
  const listeners = new Set();

  const spin = { speed: 0, from: 0, to: 0, t: 0, duration: 0, ease: power2Out }; // degrés par seconde
  const targetSpeed = () => (playing && !reduced() ? DA.jog.rpm * 6 : 0);
  function retarget() {
    const to = targetSpeed();
    if (to === spin.to) return;
    spin.from = spin.speed;
    spin.to = to;
    spin.t = 0;
    spin.duration = to > 0 ? DA.jog.spinUp : DA.jog.brake;
    spin.ease = to > 0 ? power2Out : power3Out;
  }

  // Voyant Play (DA 7) : éteint sans titre, clignotant au tempo en pause, plein en lecture.
  // Mouvement réduit : plein en lecture, contour seul en pause.
  let blink = 0; // en temps du titre
  let lit = null;
  let outlined = null;
  function showIndicator() {
    let on = false, contour = false;
    if (playing) on = true;
    else if (loaded && reduced()) contour = true;
    else if (loaded) on = blink % 1 < 0.5;
    if (on !== lit) {
      lit = on;
      play.ring.material = on ? mat.ringOn : mat.ringOff;
      dirty = true;
    }
    if (contour !== outlined) {
      outlined = contour;
      outline.visible = contour;
      dirty = true;
    }
  }

  let press = -1; // secondes écoulées depuis l'appui, -1 au repos

  let level = 1;
  let glow = 1;
  function applyLevels() {
    screenMaterial.color.setScalar(level);
    jogDisplayMaterial.color.setScalar(level);
    for (const { m, base } of glowing) m.color.copy(base).multiplyScalar(glow);
    dirty = true;
  }
  // Les textes attendent Martian Mono : on redessine dès que la police est là.
  const redraw = () => {
    if (disposed) return;
    forgetInks();
    screen.redraw();
    jogDisplay.redraw();
    play.label.redraw();
    cue.label.redraw();
    dirty = true;
  };
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (fonts) {
    fonts.load(FONT_PROBE).then(redraw, () => {});
    fonts.addEventListener?.('loadingdone', redraw);
  }
  function setPlaying(value) {
    const next = Boolean(value);
    if (next === playing) return;
    playing = next;
    if (!playing) blink = 0; // la pause commence voyant allumé
    retarget();
    showIndicator();
    if (screen.set(lastScreen, playing)) dirty = true;
  }

  let lastScreen = null;
  let lastText = '';
  function setScreen(data) {
    lastScreen = data?.title ? data : null;
    loaded = Boolean(lastScreen);
    // Un titre peut demander un autre sous-ensemble de la police (latin étendu, cyrillique) :
    // on le réclame avec le texte réel, puis on redessine. Un canvas seul ne le charge pas partout.
    const text = loaded ? `${lastScreen.title} ${lastScreen.artist ?? ''}` : '';
    if (text && text !== lastText) fonts?.load(FONT_PROBE, text).then(redraw, () => {});
    lastText = text;
    if (loaded && Number(lastScreen.bpm) > 0) bpm = Number(lastScreen.bpm);
    if (screen.set(lastScreen, playing)) dirty = true;
    if (jogDisplay.set(loaded ? lastScreen.bpm : null)) dirty = true;
    // Arc de progression : 0 à 360 degrés sur la durée du titre.
    const duration = loaded ? Number(lastScreen.duration) || 0 : 0;
    const progress = duration > 0 ? Math.min(1, Math.max(0, (Number(lastScreen.time) || 0) / duration)) : 0;
    const steps = Math.round(progress * jogGeo.arcSteps);
    if (arc.userData.steps !== steps) {
      arc.userData.steps = steps;
      arc.geometry.setDrawRange(0, steps * 6);
      arc.visible = steps > 0;
      dirty = true;
    }
    showIndicator();
  }

  function pressPlay() {
    press = 0;
    dirty = true;
    for (const cb of [...listeners]) {
      try { cb(); } catch (e) { console.error('[cdj] onPlayPress', e); }
    }
  }
  hit.userData.action = 'play';
  hit.userData.press = pressPlay;

  function update(dt = 0) {
    if (disposed) return false;
    const step = Math.min(Math.max(dt, 0), 0.1);
    retarget(); // suit aussi un changement du réglage « mouvement réduit »

    if (spin.speed !== spin.to) {
      spin.t += step;
      const k = spin.duration > 0 ? Math.min(1, spin.t / spin.duration) : 1;
      spin.speed = spin.from + (spin.to - spin.from) * spin.ease(k);
      if (k >= 1) spin.speed = spin.to;
    }
    if (spin.speed !== 0) {
      jog.rotation.y = (jog.rotation.y - spin.speed * DEG * step) % (Math.PI * 2); // sens horaire, vu de dessus
      dirty = true;
    }

    if (loaded && !playing && !reduced()) {
      // un temps sur deux au-delà de 150 BPM : le clignotement reste sous 3 Hz (DA 11)
      blink += step * ((bpm > 150 ? bpm / 2 : bpm) / 60);
    }
    showIndicator();

    if (press >= 0) {
      press += step;
      const down = DA.dur.cut, up = DA.dur.tick;
      const k = press < down ? press / down : 1 - Math.min(1, (press - down) / up);
      play.moving.position.y = -BUTTON.travel * MM * k;
      if (press >= down + up) { press = -1; play.moving.position.y = 0; }
      dirty = true;
    }

    const changed = dirty;
    dirty = false;
    return changed;
  }

  const onMotionChange = () => { retarget(); showIndicator(); dirty = true; };
  media?.addEventListener?.('change', onMotionChange);

  screen.set(null, false);
  jogDisplay.set(null);
  jogDisplay.redraw();
  showIndicator();
  applyLevels();

  return {
    root,
    jog,
    setPlaying,
    setScreen,
    onPlayPress(cb) {
      if (typeof cb !== 'function') return () => {};
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    pickables: [hit],
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      fonts?.removeEventListener?.('loadingdone', redraw);
      media?.removeEventListener?.('change', onMotionChange);
      root.removeFromParent();
      for (const d of disposables) d.dispose?.();
    },

    // compléments hors contrat
    pressPlay,
    setScreenLevel(k) {
      // plafonné à 1 : au-delà, le crème virerait au blanc
      const next = Math.min(1, Math.max(0, Number(k) || 0));
      if (next !== level) { level = next; applyLevels(); }
    },
    setGlow(k) {
      const next = Math.min(1, Math.max(0, Number(k) || 0));
      if (next !== glow) { glow = next; applyLevels(); }
    },
    setReducedMotion(value) {
      forcedReduced = typeof value === 'boolean' ? value : null;
      onMotionChange();
    },
    screenMesh,
    playButton: play.group,
  };
}
