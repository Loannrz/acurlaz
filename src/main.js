import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './styles/base.css';
import './styles/typography.css';
import './styles/layout.css';
import './styles/components.css';

import * as content from './data/content.js';
import { initUI } from './ui/index.js';
import { player } from './audio/player.js';

// Ordre : l'interface crée le DOM (dont canvas.scene), le lecteur reçoit les
// pistes, puis la scène 3D se branche sur le canvas et sur le bus.
initUI({ content });
player.init(content.tracks);

const canvas = document.querySelector('canvas.scene');
if (canvas) {
  // Import dynamique : si three/gsap/lenis échouent à charger, l'interface
  // reste affichée (et le loader se ferme par son repli).
  import('./scene/stage.js')
    .then(({ initScene }) =>
      initScene({ canvas, tracks: content.tracks, dates: content.dates, collaborators: content.collaborators }),
    )
    .catch((err) => {
    // La page reste utilisable sans 3D (html.sans-webgl posé par la scène).
    console.error('[acurlaz] scène 3D indisponible', err);
    document.documentElement.classList.add('sans-webgl');
  });
}
