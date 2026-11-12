import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './styles/base.css';
import './styles/typography.css';
import './styles/layout.css';
import './styles/components.css';

import * as defaults from './data/content.js';
import { loadContent } from './data/remote.js';
import { initUI } from './ui/index.js';
import { player } from './audio/player.js';

// Le contenu éditable (dates, artistes, bio, contact) vient de l'API ; content.js sert de
// repli. En attendant la réponse, l'écran de chargement montre déjà le logo, et le lot de
// la scène (three, gsap, lenis) se télécharge en parallèle.
document.getElementById('loader')?.style.setProperty('--logo-url', `url("${defaults.artist.logo.replace(/\.png$/, '.svg')}")`);

// Import dynamique : si three/gsap/lenis échouent à charger, l'interface
// reste affichée (et le loader se ferme par son repli).
const sceneEnChemin = import('./scene/stage.js');
sceneEnChemin.catch(() => {}); // l'échec est traité plus bas, une fois l'interface montée

async function demarrer() {
  const content = await loadContent(defaults).catch(() => defaults);

  // Ordre : l'interface crée le DOM (dont canvas.scene), le lecteur reçoit les
  // pistes, puis la scène 3D se branche sur le canvas et sur le bus.
  initUI({ content });
  player.init(content.tracks);

  const canvas = document.querySelector('canvas.scene');
  if (canvas) {
    sceneEnChemin
      .then(({ initScene }) =>
        initScene({ canvas, tracks: content.tracks, dates: content.dates, collaborators: content.collaborators }),
      )
      .catch((err) => {
        // La page reste utilisable sans 3D (html.sans-webgl posé par la scène).
        console.error('[acurlaz] scène 3D indisponible', err);
        document.documentElement.classList.add('sans-webgl');
      });
  }
}

demarrer();
