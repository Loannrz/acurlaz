// Le monde autour du CDJ (docs/DA.md 8 et 13.6) : sillons, règle de dates, anneaux de noms,
// poussière. Matières unies, sans dégradé ni flou. Aucun de ces éléments ne tourne avec le rig.
import { createSillons } from './sillons.js';
import { createRegle } from './regle.js';
import { createAnneaux } from './anneaux.js';
import { createPoussiere } from './poussiere.js';

// Fenêtre de la règle : calée à gauche de l'image sur ordinateur (le contenu occupe la
// droite), centrée sous l'appareil dans le bandeau mobile.
const FENETRE = {
  ordinateur: { zGauche: 0.62, longueur: 0.92, zDepart: 0.04 },
  mobile: { zGauche: 0.36, longueur: 0.72, zDepart: -0.08 },
};

// surChangement : appelé quand un élément change hors de la boucle (texture des anneaux
// dessinée après l'arrivée de la police). La scène y branche sa demande d'image.
export function createWorld({ scene, renderer, mobile = false, reduit = false, dates = [], collaborators = [], surChangement = null } = {}) {
  const sillons = createSillons();
  const regle = createRegle({ dates });
  const anneaux = createAnneaux({
    noms: collaborators.map((c) => c?.name).filter(Boolean),
    anisotropie: Math.min(8, renderer?.capabilities.getMaxAnisotropy?.() ?? 1),
    surPeinture: surChangement,
  });
  const poussiere = createPoussiere({ nombre: mobile ? 150 : 400 });
  scene.add(sillons.objet, regle.objet, anneaux.objet, poussiere.objet);
  // Demande du client : plus de ronds dans le fond ni d'onde vermillon au rythme du titre.
  sillons.objet.visible = false;

  const mode = { mobile, reduit, priorite2: true, poussiere: true };
  const appliquerMode = () => {
    regle.cadrer(mode.mobile ? FENETRE.mobile : FENETRE.ordinateur);
    poussiere.objet.visible = mode.poussiere && !mode.reduit;
    if (!mode.priorite2 || mode.reduit) sillons.eteindre();
  };
  appliquerMode();

  return {
    sillons,
    regle,
    anneaux,
    poussiere,
    pret: anneaux.pret,
    // Apparitions liées à p : l'état vient de la timeline maîtresse.
    poser(etat) {
      const actif = mode.priorite2;
      regle.poser(actif ? etat.regle : 0, etat.glisse);
      anneaux.poser(actif ? etat.anneaux : 0, etat.tour);
    },
    // Un temps du titre en lecture : une onde part du premier sillon.
    battre() {
      // désactivé : les sillons ne sont plus affichés
    },
    // Rend true tant qu'une onde vit (le rendu doit continuer à pleine cadence).
    // ambiance : 0 à 1, part de vie de la poussière. À 0 elle se fige et ne coûte plus rien.
    update(dt, dtTemps, ambiance = 1) {
      const onde = sillons.update(dtTemps);
      if (ambiance > 0) poussiere.update(dt * ambiance);
      return onde;
    },
    setPixelRatio(ratio) {
      sillons.setPixelRatio(ratio);
    },
    setMode({ mobile: m = mode.mobile, reduit: r = mode.reduit } = {}) {
      if (m !== mode.mobile) poussiere.setNombre(m ? 150 : 400);
      mode.mobile = m;
      mode.reduit = r;
      appliquerMode();
    },
    // Budget mobile (DA 10) : la poussière d'abord, puis les éléments de priorité 2.
    couperPoussiere() {
      mode.poussiere = false;
      appliquerMode();
    },
    couperPriorite2() {
      mode.priorite2 = false;
      appliquerMode();
    },
    dispose() {
      scene.remove(sillons.objet, regle.objet, anneaux.objet, poussiere.objet);
      sillons.dispose();
      regle.dispose();
      anneaux.dispose();
      poussiere.dispose();
    },
  };
}
