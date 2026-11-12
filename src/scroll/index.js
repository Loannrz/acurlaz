// Défilement : Lenis + ScrollTrigger (docs/DA.md 7 et 13.8).
// Calcule p par morceaux à partir des vraies sections, pilote les mots géants et prévient
// la scène. Émet 'scroll:progress' { p, section } sur le bus.
//
// Ordinateur : Lenis lisse la molette, la progression suit sans retard (scrub: true).
// Tactile : défilement natif, scrub de 0,5 s pour absorber les à-coups du doigt.
// Mouvement réduit : Lenis coupé, défilement natif, aucun lissage.
// Ni snap ni pin : les paliers sont des position: sticky, côté interface.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { bus, emit } from '../core/bus.js';
import { DA, MEDIA } from '../scene/world/da.js';
import { SECTIONS, sectionDepuisP } from './keys.js';
import { mesurerSegments, pDepuisScroll, scrollDepuisP } from './progress.js';
import { creerMots } from './mots.js';

let gsapPret = false;
function preparerGsap() {
  if (gsapPret) return;
  gsapPret = true;
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('entree', DA.ease.out);
  CustomEase.create('sortie', DA.ease.in);
  CustomEase.create('transit', DA.ease.inOut);
  CustomEase.create('mecanique', DA.ease.mech);
  gsap.defaults({ ease: 'entree', duration: DA.dur.beat });
  ScrollTrigger.config({ ignoreMobileResize: true });
}

export function initScroll({ scene = null, surProgression = () => {} } = {}) {
  preparerGsap();

  const mots = creerMots();
  const mesure = { segments: null, vh: window.innerHeight, max: 0 };
  const etat = { p: -1, section: null, reduit: false, tactile: false, mobile: false };
  let lenis = null;
  let declencheur = null;
  let detruit = false;

  // Hauteur du bandeau mobile : le bord haut d'une section s'arrête dessous (DA 13.8).
  // Nulle sur ordinateur, et sur téléphone en paysage où la scène occupe toute la hauteur.
  const hauteurArret = () => {
    if (!etat.mobile) return 0;
    const el = scene || document.querySelector('canvas.scene');
    if (!el) return 0;
    const boite = el.getBoundingClientRect();
    return boite.height < window.innerHeight - 2 && boite.width > window.innerWidth - 2 ? boite.height : 0;
  };

  // L'interface verrouille le défilement en posant overflow: hidden sur <html> (écran de
  // chargement, menu plein écran). Lenis ignore alors la molette au lieu de l'accumuler.
  // On lit l'état nous-mêmes : l'option autoToggle de Lenis dépend de transition-behavior,
  // absent de Safari avant 17.4, et laisserait la page bloquée après le chargement.
  let verrouille = false;
  const lireVerrou = () => {
    const debordement = getComputedStyle(document.documentElement).overflowY;
    verrouille = debordement === 'hidden' || debordement === 'clip';
  };
  lireVerrou();
  const observateurVerrou = 'MutationObserver' in window ? new MutationObserver(lireVerrou) : null;
  observateurVerrou?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

  function mesurer() {
    mesure.vh = window.innerHeight;
    mesure.max = Math.max(0, document.documentElement.scrollHeight - mesure.vh);
    mesure.segments = mesurerSegments({ vh: mesure.vh, arret: hauteurArret(), scrollY: window.scrollY });
  }

  function majDepuis(defilement, force = false) {
    // Sans les cinq sections dans le DOM, p suit simplement la course de la page.
    const p = mesure.segments
      ? pDepuisScroll(mesure.segments, defilement)
      : mesure.max > 0 ? Math.min(1, Math.max(0, defilement / mesure.max)) : 0;
    const section = sectionDepuisP(p);
    if (!force && p === etat.p && section === etat.section) return;
    etat.p = p;
    etat.section = section;
    if (!etat.reduit) mots.poser(p);
    surProgression(p, section);
    emit('scroll:progress', { p, section });
  }

  // Position de défilement où le bord haut d'une section s'arrête : le palier y a commencé.
  function positionDe(id) {
    if (id === SECTIONS[0]) return 0;
    const segment = mesure.segments?.find((seg) => seg.section === id);
    if (segment) return Math.ceil(segment.pose);
    const el = document.getElementById(id);
    return el ? Math.ceil(el.getBoundingClientRect().top + window.scrollY) : 0;
  }

  // Saut vers une section : une mesure, courbe de transit (DA 7). Immédiat en mouvement réduit.
  function allerA(id, { immediat = false } = {}) {
    if (!SECTIONS.includes(id)) return false;
    const y = positionDe(id);
    if (lenis && !immediat && !etat.reduit) {
      lenis.scrollTo(y, { duration: DA.dur.bar, easing: gsap.parseEase('transit') });
    } else {
      window.scrollTo(0, y);
    }
    return true;
  }

  // ---- deux variantes : mouvement normal et mouvement réduit
  const mm = gsap.matchMedia();
  mm.add({ tous: 'all', reduit: MEDIA.reduit, tactile: MEDIA.tactile, mobile: MEDIA.mobile }, (ctx) => {
    const { reduit, tactile, mobile } = ctx.conditions;
    Object.assign(etat, { reduit: Boolean(reduit), tactile: Boolean(tactile), mobile: Boolean(mobile) });
    let raf = null;

    if (reduit) {
      mots.liberer();
    } else {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false, virtualScroll: () => !verrouille });
      lenis.on('scroll', ScrollTrigger.update);
      raf = (t) => lenis.raf(t * 1000);
      gsap.ticker.add(raf, false, true); // avant le rendu de la scène, dans la même image
      gsap.ticker.lagSmoothing(0);
    }

    if (reduit) {
      declencheur = ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => majDepuis(self.scroll()),
        onRefresh: (self) => {
          mesurer();
          majDepuis(self.scroll(), true);
        },
      });
    } else {
      // Le scrub de ScrollTrigger lisse une position de défilement normalisée ;
      // le passage à p (par morceaux) se fait à la sortie.
      const suivi = { s: 0 };
      const lisse = () => suivi.s * (declencheur ? declencheur.end - declencheur.start : mesure.max);
      declencheur = ScrollTrigger.create({
        start: 0,
        end: 'max',
        scrub: tactile ? 0.5 : true,
        animation: gsap.fromTo(suivi, { s: 0 }, { s: 1, duration: 1, ease: 'none', onUpdate: () => majDepuis(lisse()) }),
        // Après une nouvelle mesure, on repart de la position lissée : pas d'à-coup en tactile.
        onRefresh: () => {
          mesurer();
          majDepuis(lisse(), true);
        },
      });
    }

    mesurer();
    majDepuis(window.scrollY, true);

    return () => {
      declencheur?.kill();
      declencheur = null;
      if (lenis) {
        gsap.ticker.remove(raf);
        lenis.destroy();
        lenis = null;
      }
    };
  });

  // ---- navigation
  // L'interface annonce ses sauts par un événement annulable 'ui:goto' { id } :
  // on prend la main quand Lenis tourne, sinon le saut natif fait foi.
  const surGoto = (ev) => {
    const id = ev.detail?.id;
    if (!lenis || etat.reduit || !SECTIONS.includes(id)) return;
    ev.preventDefault();
    allerA(id);
  };
  bus.addEventListener('ui:goto', surGoto);

  // Filet de sécurité : une ancre vers une section que personne n'a prise en charge.
  const surClic = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!lenis || etat.reduit) return;
    const lien = e.target.closest?.('a[href*="#"]');
    if (!lien || lien.target === '_blank') return;
    const url = new URL(lien.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    const id = decodeURIComponent(url.hash.slice(1));
    if (!SECTIONS.includes(id) || !document.getElementById(id)) return;
    e.preventDefault();
    allerA(id);
    window.history.replaceState(null, '', `#${id}`);
  };
  document.addEventListener('click', surClic);

  // ---- la longueur d'une section peut changer (polices, liste filtrée) : on remesure
  let attente = 0;
  const rafraichir = () => {
    if (detruit) return;
    window.clearTimeout(attente);
    attente = window.setTimeout(() => ScrollTrigger.refresh(), 120);
  };
  const observateur = 'ResizeObserver' in window ? new ResizeObserver(rafraichir) : null;
  const observer = () => {
    if (!observateur) return;
    observateur.disconnect();
    observateur.observe(document.body);
    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observateur.observe(el);
    }
  };
  observer();
  document.fonts?.ready?.then(rafraichir);

  return {
    get p() { return etat.p; },
    get section() { return etat.section; },
    get reduit() { return etat.reduit; },
    get tactile() { return etat.tactile; },
    get mobile() { return etat.mobile; },
    get lenis() { return lenis; },
    get segments() { return mesure.segments; },
    allerA,
    positionDe,
    // Position de défilement pour une valeur de p (banc d'essai, liens profonds).
    scrollPourP: (p) => (mesure.segments ? scrollDepuisP(mesure.segments, p) : p * mesure.max),
    rafraichir() {
      observer();
      ScrollTrigger.refresh();
    },
    detruire() {
      detruit = true;
      window.clearTimeout(attente);
      observateur?.disconnect();
      observateurVerrou?.disconnect();
      document.removeEventListener('click', surClic);
      bus.removeEventListener('ui:goto', surGoto);
      mm.revert();
    },
  };
}
