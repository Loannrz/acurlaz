// Scène 3D : renderer, lumières, monde, CDJ, caméra liée au défilement, pointeur.
// Référence : docs/DA.md (sections 8, 9, 10 et 13). Réglages de caméra : src/scroll/keys.js.
//
// Graphe (DA 13.6) :
//   scene
//   ├ rig        rotation = pose de la clé courante
//   │ └ float    flottement au repos et suivi du pointeur
//   │   └ cdj    racine rendue par createCdj (centrée sur le volume de l'appareil)
//   ├ sillons, regle, anneaux, poussiere   (ne tournent pas avec le rig)
//   └ key, rim, accent                     (studio fixe)
import * as THREE from 'three';
import gsap from 'gsap';
import { emit, on } from '../core/bus.js';
import * as contenu from '../data/content.js';
import { DA, MEDIA, rad, borne } from './world/da.js';
import { createWorld } from './world/index.js';
import { createLumieres, PREREGLAGES } from './world/lumieres.js';
import { initScroll } from '../scroll/index.js';
import { creerTimeline } from '../scroll/timeline.js';
import { cleA } from '../scroll/keys.js';

// Modules écrits en parallèle : on les charge s'ils existent, sans casser la scène sinon.
const modulesCdj = import.meta.glob('./cdj/index.js');
const modulesAudio = import.meta.glob('../audio/player.js');

// Ratios de référence des clés : 16:10 sur ordinateur, bandeau de 390 × 371 sur mobile.
// Sur une fenêtre plus étroite, la distance grandit pour garder le cadrage horizontal (DA 13.7).
const RATIO_ORDINATEUR = 1.6;
const RATIO_BANDEAU = 390 / 371;
// Décalage horizontal maximal du CDJ, en fraction de la largeur : il reste dans l'image.
const CADRAGE_MAX = 0.4;
// Le décalage vertical compté en largeurs (`cl` des clés) cesse de croître au-delà de ce
// ratio : sur une fenêtre très large, la règle de dates sortirait par le bas.
const RATIO_MAX_CYL = 1.85;

async function chargerCdj(renderer, doublure) {
  const charger = !doublure && modulesCdj['./cdj/index.js'];
  if (charger) {
    try {
      const module = await charger();
      const cdj = await module.createCdj({ renderer });
      if (cdj?.root?.isObject3D) return cdj;
      console.warn('[scene] createCdj n’a pas rendu de racine : doublure utilisée.');
    } catch (erreur) {
      console.warn('[scene] CDJ indisponible : doublure utilisée.', erreur);
    }
  }
  const { createCdj } = await import('./world/cdjStub.js');
  return createCdj({ renderer });
}

export async function initScene({ canvas, tracks = [], dates, collaborators, doublure = false } = {}) {
  const toile = canvas || document.querySelector('canvas.scene');
  if (!toile) throw new Error('[scene] canvas.scene introuvable');

  // La mise en page (.scene) cale le canvas sur --scene-w / --scene-h. Filet de sécurité si
  // elle manque : mêmes jetons, posés en ligne.
  if (getComputedStyle(toile).position === 'static') {
    // svh date d'iOS 15.4 : sans lui, la valeur de repli serait invalide et le canvas sans hauteur.
    const plein = window.CSS?.supports?.('height', '1svh') ? '100svh' : '100vh';
    Object.assign(toile.style, { position: 'fixed', top: '0', left: '0', width: 'var(--scene-w, 100vw)', height: `var(--scene-h, ${plein})` });
  }

  const media = {
    mobile: window.matchMedia(MEDIA.mobile),
    reduit: window.matchMedia(MEDIA.reduit),
    survol: window.matchMedia(MEDIA.survol),
  };
  const mode = { mobile: media.mobile.matches, reduit: media.reduit.matches, survol: media.survol.matches };

  // ------------------------------------------------------------------ renderer
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: toile, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (erreur) {
    // Sans WebGL (DA 10) : le défilement, les mots et le contenu continuent de fonctionner.
    console.warn('[scene] WebGL indisponible.', erreur);
    document.documentElement.classList.add('sans-webgl');
    const defilement = initScroll({ scene: toile });
    emit('scene:ready', { webgl: false });
    return { webgl: false, defilement, dispose: () => defilement.detruire() };
  }
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  emit('load:progress', { p: 0.15 });

  // Le modèle (2,2 Mo) part tout de suite : son téléchargement court pendant que la lumière,
  // le monde et le défilement se montent, au lieu d'attendre la fin de leur mise en place.
  const cdjEnChemin = chargerCdj(renderer, doublure);

  // ------------------------------------------------------------------ graphe
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, DA.camera.near, DA.camera.far);
  const rig = new THREE.Group();
  rig.name = 'rig';
  const flot = new THREE.Group();
  flot.name = 'float';
  rig.add(flot);
  scene.add(rig);

  const lumieres = createLumieres({ renderer, scene });
  const monde = createWorld({
    scene,
    renderer,
    mobile: mode.mobile,
    reduit: mode.reduit,
    dates: dates || (contenu.upcomingDates ? contenu.upcomingDates() : contenu.dates) || [],
    collaborators: collaborators || contenu.collaborators || [],
    // Anneaux redessinés après l'arrivée de la police : une image, même en veille.
    // (Appel différé : `invalider` est défini juste après.)
    surChangement: () => invalider(),
  });
  emit('load:progress', { p: 0.3 });

  // ------------------------------------------------------------------ état et cadence du rendu
  const { etat, poser, tl: timeline } = creerTimeline({ prereglages: PREREGLAGES });

  // DA 8 : rendu à la demande quand rien ne bouge. Trois régimes :
  //   plein   un geste est récent (défilement, pointeur, clic), un titre joue ou une
  //           animation court (onde, bouton, voyant, allumage) : une image par rafraîchissement ;
  //   repos   REPOS secondes sans geste : l'ambiance (flottement, poussière) continue à
  //           30 images par seconde. Elle bouge de moins d'un pixel par image : la baisse
  //           de cadence ne se voit pas, et la simulation avance à chaque tic ;
  //   veille  VEILLE secondes sans geste : l'ambiance s'éteint en FONDU secondes, puis seul
  //           ce qui change encore demande une image (le voyant Play qui clignote quand un
  //           titre est chargé en pause : 4 à 5 par seconde ; sinon aucune). Au premier geste
  //           l'ambiance remonte de la même façon, en partant d'une amplitude nulle : pas de
  //           saccade à la reprise.
  // En mouvement réduit il n'y a pas d'ambiance : rendu à la demande, lecture comprise.
  const REPOS = 1.5;
  const VEILLE = 10;
  const FONDU = 1.2;
  const PAS_REPOS = 1000 / 30; // millisecondes entre deux images au repos
  const cadence = { geste: performance.now(), rendu: 0, vie: mode.reduit ? 0 : 1, images: 0 };
  let sale = true;
  const reveiller = () => {
    cadence.geste = performance.now();
  };
  const invalider = () => {
    sale = true;
    reveiller();
  };

  const taille = { w: 0, h: 0, ratio: 0 };
  const budget = { etape: 0, chauffe: 3, cumul: 0, images: 0, regulieres: 0, lentes: 0 };

  function redimensionner() {
    const w = Math.max(1, toile.clientWidth);
    const h = Math.max(1, toile.clientHeight);
    const plafond = mode.mobile ? (budget.etape >= 3 ? 1 : 1.5) : 2;
    const ratio = Math.min(window.devicePixelRatio || 1, plafond);
    if (w === taille.w && h === taille.h && ratio === taille.ratio) return;
    Object.assign(taille, { w, h, ratio });
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    monde.setPixelRatio(ratio);
    invalider();
  }

  // De l'état de la timeline à la caméra : coordonnées sphériques autour de la cible,
  // lookAt à chaque image, haut (0, 1, 0), aucun roulis.
  const cible = new THREE.Vector3();
  function cadrer() {
    const { w, h } = taille;
    const ratio = w / h;
    const reference = mode.mobile ? RATIO_BANDEAU : RATIO_ORDINATEUR;
    let d = mode.mobile ? etat.dm : etat.d;
    if (ratio < reference) d *= reference / ratio;
    const theta = rad(etat.theta);
    const phi = rad(Math.min(etat.phi, DA.camera.maxPhi));
    cible.set(etat.tx, etat.ty, etat.tz);
    camera.position.set(
      cible.x + d * Math.sin(theta) * Math.cos(phi),
      cible.y + d * Math.sin(phi),
      cible.z + d * Math.cos(theta) * Math.cos(phi),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(cible);
    camera.fov = etat.focale;
    // Cadrage : décalage du CDJ à l'écran, en fraction de la fenêtre (du bandeau sur mobile,
    // avec ses propres valeurs). `cxh` s'exprime en hauteurs de fenêtre et `cyl` en largeurs :
    // ils suivent un mot dont la taille dépend de l'autre dimension. Le centre du CDJ ne sort
    // jamais de l'image.
    const cx = borne(mode.mobile ? etat.cxm : etat.cx + etat.cxh / ratio, -CADRAGE_MAX, CADRAGE_MAX);
    const cy = mode.mobile ? etat.cym : etat.cy + etat.cyl * Math.min(ratio, RATIO_MAX_CYL);
    camera.setViewOffset(w, h, -cx * w, cy * h, w, h);
    rig.rotation.set(rad(etat.rx), rad(etat.ry), rad(etat.rz), 'XYZ');
  }

  // ------------------------------------------------------------------ défilement
  // Mouvement réduit (DA 10) : la caméra ne voyage plus. Une pose fixe par section (clé « a »),
  // fondu du canvas de 121 ms au changement.
  const pose = { section: null };
  function changerPose(section, immediat = false) {
    const premiere = pose.section === null;
    pose.section = section;
    const appliquer = () => {
      poser(cleA(section).p);
      invalider();
    };
    gsap.killTweensOf(toile);
    if (immediat || premiere) {
      appliquer();
      gsap.set(toile, { opacity: 1 });
      return;
    }
    gsap.to(toile, {
      opacity: 0,
      duration: DA.dur.tick,
      ease: 'none',
      onComplete: () => {
        appliquer();
        gsap.to(toile, { opacity: 1, duration: DA.dur.tick, ease: 'none' });
      },
    });
  }

  const suivi = { p: 0, section: 'ouverture' };
  const defilement = initScroll({
    scene: toile,
    surProgression(p, section) {
      suivi.p = p;
      suivi.section = section;
      if (mode.reduit) {
        if (section !== pose.section) changerPose(section);
      } else {
        poser(p);
        invalider();
      }
    },
  });

  // ------------------------------------------------------------------ CDJ
  redimensionner();
  const cdj = await cdjEnChemin;
  // Contrat : racine centrée sur le volume. On corrige un écart grossier (origine au bas du châssis).
  const boite = new THREE.Box3().setFromObject(cdj.root);
  if (!boite.isEmpty()) {
    const milieu = boite.getCenter(new THREE.Vector3());
    if (Math.abs(milieu.y) > 0.03 || Math.abs(milieu.x) > 0.05 || Math.abs(milieu.z) > 0.08) {
      console.warn('[scene] racine du CDJ décentrée, recalée sur son volume.', milieu.toArray());
      cdj.root.position.sub(milieu);
    }
  }
  flot.add(cdj.root);
  emit('load:progress', { p: 0.9 });

  // Niveau de l'écran par section (DA 8) et allumage des aplats non éclairés (voyants, index).
  // Par les compléments du CDJ s'ils existent, sinon en modulant le plan nommé « ecran » (DA 13.6).
  let matiereEcran;
  let niveauEcran = -1;
  let niveauAplats = -1;
  function reglerEcran(niveau, montee = 1) {
    // Plafonné à 1 : au-delà, le crème de l'écran blanchirait et sortirait des trois encres.
    const ecran = Math.min(1, niveau) * montee;
    if (Math.abs(montee - niveauAplats) > 0.004) {
      niveauAplats = montee;
      cdj.setGlow?.(montee);
    }
    if (Math.abs(ecran - niveauEcran) < 0.004) return;
    niveauEcran = ecran;
    if (typeof cdj.setScreenLevel === 'function') {
      cdj.setScreenLevel(ecran);
      return;
    }
    if (matiereEcran === undefined) {
      const plan = cdj.root.getObjectByName('ecran');
      matiereEcran = plan?.material?.color?.isColor ? plan.material : null;
    }
    if (matiereEcran) matiereEcran.color.setScalar(ecran);
  }

  // ------------------------------------------------------------------ lecteur audio
  let lecteur = null;
  const tempo = { lecture: false, bpm: DA.bpm, position: 0, rang: -1, piste: null };
  const pistes = new Map(tracks.map((t) => [t.id, t]));

  function surEtatLecteur(st = {}) {
    const piste = st.track || pistes.get(st.trackId) || null;
    const lecture = Boolean(st.playing);
    cdj.setPlaying?.(lecture);
    cdj.setScreen?.({
      title: piste?.title ?? '',
      artist: piste?.artist ?? '',
      time: st.time ?? 0,
      duration: st.duration || piste?.duration || 0,
      bpm: piste?.bpm ?? null,
      key: piste?.key ?? '',
    });
    // Le lecteur émet une dizaine de fois par seconde pendant la lecture. Seul un changement
    // d'état (lecture, pause, autre titre) touche la lumière : lui seul demande une image.
    // Le reste (temps affiché, arc) passe par cdj.update(), qui signale ce qu'il a redessiné.
    const change = lecture !== tempo.lecture || (piste?.id ?? null) !== tempo.piste;
    tempo.lecture = lecture;
    tempo.piste = piste?.id ?? null;
    tempo.bpm = piste?.bpm || DA.bpm;
    // Recalage du temps musical sur la position réelle du titre.
    const position = ((st.time ?? 0) * tempo.bpm) / 60;
    if (Math.abs(position - tempo.position) > 0.5) tempo.rang = Math.floor(position / (tempo.bpm > 150 ? 2 : 1));
    tempo.position = position;
    if (change) invalider();
  }
  const finEcouteLecteur = on('player:state', surEtatLecteur);

  const chargerLecteur = modulesAudio['../audio/player.js'];
  if (chargerLecteur) {
    chargerLecteur()
      .then((module) => {
        lecteur = module.player || null;
        if (lecteur?.state) surEtatLecteur(lecteur.state);
      })
      .catch((erreur) => console.warn('[scene] lecteur audio indisponible.', erreur));
  }

  // Bouton Play 3D : un seul basculement par appui, d'où qu'il vienne.
  let dernierAppui = 0;
  const basculer = () => {
    const t = performance.now();
    if (t - dernierAppui < 250) return;
    dernierAppui = t;
    lecteur?.toggle?.();
  };
  cdj.onPlayPress?.(basculer);

  // ------------------------------------------------------------------ pointeur
  const rayon = new THREE.Raycaster();
  const visee = new THREE.Vector2();
  const pointeur = { x: 0, y: 0, rx: 0, ry: 0, client: null, survole: false };

  // Le rayon ne vise que `pickables` : la zone de clic de Play. L'occlusion par le châssis
  // et le jog est l'affaire du CDJ (sa zone se comporte comme une pièce pleine).
  function viser(clientX, clientY) {
    const cibles = cdj.pickables || [];
    if (!cibles.length) return null;
    const b = toile.getBoundingClientRect();
    visee.set(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
    rayon.setFromCamera(visee, camera);
    return rayon.intersectObjects(cibles, true)[0] || null;
  }

  const surMouvement = (e) => {
    if (!mode.survol || mode.reduit || e.pointerType === 'touch') return;
    pointeur.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointeur.y = (e.clientY / window.innerHeight) * 2 - 1;
    reveiller(); // le CDJ suit le pointeur : plein régime le temps du geste
  };
  const surSurvol = (e) => {
    if (e.pointerType === 'touch') return;
    pointeur.client = [e.clientX, e.clientY];
    if (mode.reduit) invalider(); // rendu à la demande : une image pour mettre le curseur à jour
  };
  const surSortie = () => {
    pointeur.client = null;
    if (pointeur.survole) {
      pointeur.survole = false;
      toile.style.cursor = '';
    }
  };
  const surClic = (e) => {
    const touche = viser(e.clientX, e.clientY);
    if (!touche) return;
    // Le CDJ enfonce son bouton puis prévient les abonnés de onPlayPress (donc `basculer`).
    const appui = touche.object.userData?.press || cdj.pressPlay;
    if (typeof appui === 'function') appui();
    else basculer();
    invalider();
  };
  window.addEventListener('pointermove', surMouvement, { passive: true });
  toile.addEventListener('pointermove', surSurvol, { passive: true });
  toile.addEventListener('pointerleave', surSortie);
  toile.addEventListener('click', surClic);

  // ------------------------------------------------------------------ arrivée
  // Le liseré s'allume d'abord, le dessus ensuite, en une mesure (DA 9, ouverture).
  const allumage = { rim: 0, key: 0, lance: false, fini: false, montee: null, delai: 0 };
  function allumer() {
    if (allumage.lance) return;
    allumage.lance = true;
    if (mode.reduit) {
      Object.assign(allumage, { rim: 1, key: 1, fini: true });
      invalider();
      return;
    }
    allumage.montee = gsap
      .timeline({ onUpdate: invalider, onComplete: () => { allumage.fini = true; } })
      .to(allumage, { rim: 1, duration: DA.dur.bar * 0.5, ease: 'power2.out' }, 0)
      .to(allumage, { key: 1, duration: DA.dur.bar * 0.6, ease: 'power2.inOut' }, DA.dur.bar * 0.4);
  }

  // ------------------------------------------------------------------ boucle
  let horloge = 0;
  let contextePerdu = false;

  // Budget mobile (DA 10) : sous 40 images par seconde, on coupe la poussière, puis les
  // éléments de priorité 2, puis on ramène le ratio de pixels à 1.
  // Une cadence régulière de 30 images par seconde est un plafond du système (mode économie
  // d'énergie d'iOS), pas une scène qui peine : couper des éléments n'y changerait rien.
  function surveiller(dt) {
    if (!mode.mobile || budget.etape >= 3 || dt > 0.25) return;
    if (budget.chauffe > 0) {
      budget.chauffe -= dt;
      return;
    }
    budget.cumul += dt;
    budget.images += 1;
    if (Math.abs(dt - 1 / 30) < 0.004) budget.regulieres += 1;
    if (budget.cumul < 2) return;
    const ips = budget.images / budget.cumul;
    const plafonnee = budget.regulieres / budget.images > 0.85;
    budget.cumul = 0;
    budget.images = 0;
    budget.regulieres = 0;
    budget.lentes = ips < 40 && !plafonnee ? budget.lentes + 1 : 0;
    if (budget.lentes < 2) return;
    budget.lentes = 0;
    budget.chauffe = 1;
    budget.etape += 1;
    if (budget.etape === 1) monde.couperPoussiere();
    else if (budget.etape === 2) monde.couperPriorite2();
    else redimensionner();
  }

  function image(_temps, deltaMs) {
    if (document.hidden || contextePerdu) return;
    const maintenant = performance.now();
    const ecoule = Math.max(0, deltaMs / 1000);
    const dt = Math.min(0.1, ecoule);
    horloge += dt;

    // Temps musical : onde sur chaque temps (un sur deux au-delà de 150 BPM).
    const dtTemps = (dt * tempo.bpm) / 60;
    const pas = tempo.bpm > 150 ? 2 : 1;
    let phase = null;
    if (tempo.lecture) {
      tempo.position += dtTemps;
      const rang = Math.floor(tempo.position / pas);
      if (rang > tempo.rang) {
        tempo.rang = rang;
        monde.battre();
      }
      if (!mode.reduit) phase = (tempo.position / pas) % 1;
    }

    // Ambiance : part de vie du flottement et de la poussière, de 0 à 1 (voir « cadence »).
    const inactif = (maintenant - cadence.geste) / 1000;
    const joue = tempo.lecture && !mode.reduit;
    const eveil = !mode.reduit && (joue || inactif < VEILLE);
    cadence.vie = borne(cadence.vie + (eveil ? dt : -dt) / FONDU);
    const vie = cadence.vie * cadence.vie * (3 - 2 * cadence.vie);

    // La simulation avance à chaque tic, qu'une image soit rendue ou non.
    const ondeVivante = monde.update(dt, dtTemps, vie);
    const cdjVivant = cdj.update?.(dt) === true;

    // Faut-il une image ? Rien ne bouge : aucune. Ambiance seule : 30 par seconde.
    const anime = joue || ondeVivante || cdjVivant;
    if (!sale && !anime && cadence.vie <= 0) return;
    const plein = sale || anime || inactif < REPOS;
    if (!plein && maintenant - cadence.rendu < PAS_REPOS - 4) return;
    cadence.rendu = maintenant;
    cadence.images += 1;
    sale = false;

    // Flottement au repos (période de 4 mesures) et suivi du pointeur, ordinateur seulement.
    const k = mode.reduit ? 0 : etat.flot * vie;
    const w = (horloge / DA.float.period) * Math.PI * 2;
    const amorti = 1 - (1 - DA.pointer.lerp) ** (dt * 60);
    const suit = mode.survol && !mode.reduit;
    pointeur.rx += ((suit ? pointeur.y * rad(DA.pointer.maxDeg) : 0) - pointeur.rx) * amorti;
    pointeur.ry += ((suit ? pointeur.x * rad(DA.pointer.maxDeg) : 0) - pointeur.ry) * amorti;
    flot.position.y = DA.float.y * Math.sin(w) * k;
    flot.rotation.set(
      rad(DA.float.rotX) * Math.sin(w + 1.3) * k + pointeur.rx,
      pointeur.ry,
      rad(DA.float.rotZ) * Math.sin(w + 2.6) * k,
    );

    cadrer();
    lumieres.regler(etat, { lecture: tempo.lecture, phase, allumage: allumage.fini ? null : allumage });
    reglerEcran(etat.ecran, allumage.fini ? 1 : allumage.key);
    monde.poser(etat);

    renderer.render(scene, camera);

    // Curseur sur le bouton Play (après le rendu : les matrices sont à jour).
    if (pointeur.client && mode.survol) {
      const dessus = Boolean(viser(pointeur.client[0], pointeur.client[1]));
      if (dessus !== pointeur.survole) {
        pointeur.survole = dessus;
        toile.style.cursor = dessus ? 'pointer' : '';
      }
    }
    surveiller(ecoule);
  }
  gsap.ticker.add(image);

  // ------------------------------------------------------------------ fenêtre, onglet, contexte
  const observateurTaille = 'ResizeObserver' in window ? new ResizeObserver(redimensionner) : null;
  observateurTaille?.observe(toile);
  window.addEventListener('resize', redimensionner);

  // Pas d'IntersectionObserver : le canvas est fixe et couvre la fenêtre (ou le bandeau), il
  // ne quitte jamais l'image. Seul l'onglet masqué arrête le rendu (document.hidden).
  const surVisibilite = () => {
    if (!document.hidden) invalider();
  };
  document.addEventListener('visibilitychange', surVisibilite);

  const surPerte = (e) => {
    e.preventDefault();
    contextePerdu = true;
  };
  const surRetour = () => {
    contextePerdu = false;
    lumieres.regenerer({ perdu: true }); // l'environnement PMREM vivait sur la carte graphique : on le refait
    taille.w = 0;
    redimensionner();
    invalider();
  };
  toile.addEventListener('webglcontextlost', surPerte);
  toile.addEventListener('webglcontextrestored', surRetour);

  const surMedia = () => {
    mode.mobile = media.mobile.matches;
    mode.reduit = media.reduit.matches;
    mode.survol = media.survol.matches;
    monde.setMode(mode);
    if (mode.reduit) {
      // Plus de suivi du pointeur : le CDJ revient droit tout de suite. Le rendu passe à la
      // demande, il n'y aurait pas d'images pour amortir ce retour.
      Object.assign(pointeur, { x: 0, y: 0, rx: 0, ry: 0 });
      changerPose(suivi.section, true);
    } else {
      pose.section = null;
      gsap.killTweensOf(toile);
      gsap.set(toile, { opacity: 1 });
      poser(suivi.p);
    }
    taille.w = 0;
    redimensionner();
  };
  Object.values(media).forEach((m) => m.addEventListener('change', surMedia));

  // ------------------------------------------------------------------ prêt
  await Promise.race([Promise.resolve(monde.pret).catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  if (mode.reduit) changerPose(suivi.section, true);
  else poser(suivi.p);
  redimensionner();
  cadrer();
  lumieres.regler(etat, { allumage });
  reglerEcran(etat.ecran, allumage.key);
  monde.poser(etat);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  defilement.rafraichir(); // après le modèle et les polices (DA 7)

  // La lumière monte quand l'écran de chargement s'efface ('ui:ready'), ou tout de suite
  // s'il n'y en a pas.
  const finEcouteInterface = on('ui:ready', allumer);
  const chargement = document.getElementById('loader');
  if (!chargement || !document.documentElement.classList.contains('is-loading')) allumer();
  else allumage.delai = window.setTimeout(allumer, 8000);

  emit('load:progress', { p: 1 });
  emit('scene:ready', { webgl: true, doublure: Boolean(cdj.doublure) });

  return {
    webgl: true,
    renderer,
    scene,
    camera,
    rig,
    flot,
    cdj,
    monde,
    lumieres,
    defilement,
    etat,
    mode,
    invalider,
    // nombre d'images rendues depuis le départ (contrôle de la cadence)
    get images() {
      return cadence.images;
    },
    // true quand la lumière d'arrivée a fini de monter
    get allume() {
      return allumage.fini;
    },
    dispose() {
      gsap.ticker.remove(image);
      gsap.killTweensOf(toile);
      timeline.kill();
      allumage.montee?.kill();
      window.clearTimeout(allumage.delai);
      toile.style.cursor = '';
      finEcouteLecteur();
      finEcouteInterface();
      Object.values(media).forEach((m) => m.removeEventListener('change', surMedia));
      window.removeEventListener('pointermove', surMouvement);
      window.removeEventListener('resize', redimensionner);
      document.removeEventListener('visibilitychange', surVisibilite);
      toile.removeEventListener('pointermove', surSurvol);
      toile.removeEventListener('pointerleave', surSortie);
      toile.removeEventListener('click', surClic);
      toile.removeEventListener('webglcontextlost', surPerte);
      toile.removeEventListener('webglcontextrestored', surRetour);
      observateurTaille?.disconnect();
      defilement.detruire();
      monde.dispose();
      lumieres.dispose();
      cdj.root.removeFromParent();
      cdj.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss(); // rend le contexte WebGL tout de suite
    },
  };
}
