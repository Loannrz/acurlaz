// Sillons : 40 cercles crème d'un pixel sur le plan y = -0,45 m, rayons de 0,5 à 4,5 m,
// opacité de 0,22 à 0 vers l'extérieur (docs/DA.md 8). Le vide central est l'étiquette du disque.
//
// Un seul plan, un seul appel de dessin : le trait est calculé par fragment à partir de la
// distance au sillon le plus proche, mesurée en pixels d'écran. Il garde donc un pixel de
// large à toute distance et sous tout angle, sans moiré quand les sillons se resserrent
// vers l'horizon. La matière reste un MeshBasicMaterial non tonemappé : le hex sort exact.
//
// Onde (lecture) : sur chaque temps, le premier sillon s'allume en vermillon et l'allumage
// s'éloigne de sillon en sillon jusqu'à 4,5 m en deux mesures. Huit ondes au plus.
import * as THREE from 'three';
import { DA } from './da.js';

const N_ONDES = 8;

export function createSillons({ nombre = 40, r0 = 0.5, r1 = 4.5, y = -0.45, opacite = 0.22 } = {}) {
  const pas = (r1 - r0) / (nombre - 1);
  const uniforms = {
    uTrait: { value: 1 }, // épaisseur du trait, en pixels du tampon de rendu
    uR0: { value: r0 },
    uPas: { value: pas },
    uNombre: { value: nombre },
    uOpacite: { value: opacite },
    uAccent: { value: new THREE.Color(DA.color.accent) },
    uOndes: { value: new Array(N_ONDES).fill(-1) }, // rang du sillon allumé, -1 = onde éteinte
  };

  const matiere = new THREE.MeshBasicMaterial({
    color: DA.color.creme,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  matiere.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPlan;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlan = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vPlan;
        uniform float uTrait;
        uniform float uR0;
        uniform float uPas;
        uniform float uNombre;
        uniform float uOpacite;
        uniform vec3 uAccent;
        uniform float uOndes[${N_ONDES}];`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float rayon = length(vPlan);
        float rang = clamp(floor((rayon - uR0) / uPas + 0.5), 0.0, uNombre - 1.0);
        float rayonSillon = uR0 + rang * uPas;
        float pente = max(length(vec2(dFdx(rayon), dFdy(rayon))), 1e-6); // mètres par pixel
        float ecart = abs(rayon - rayonSillon) / pente;                  // pixels
        float trait = 1.0 - smoothstep(uTrait * 0.5 - 0.5, uTrait * 0.5 + 0.5, ecart);
        // Sillons plus serrés que quelques pixels : on rend leur couverture moyenne.
        float pasPixels = uPas / pente;
        trait = mix(clamp(uTrait / pasPixels, 0.0, 1.0), trait, smoothstep(1.5, 3.0, pasPixels));
        float loin = 1.0 - rang / (uNombre - 1.0);
        float onde = 0.0;
        for (int i = 0; i < ${N_ONDES}; i++) {
          if (uOndes[i] >= 0.0 && abs(uOndes[i] - rang) < 0.5) onde = 1.0;
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, uAccent, onde);
        diffuseColor.a *= trait * loin * mix(uOpacite, 0.9, onde);
        if (diffuseColor.a < 0.003) discard;`,
      );
  };

  const cote = 2 * r1 + 0.2;
  const plan = new THREE.Mesh(new THREE.PlaneGeometry(cote, cote), matiere);
  plan.name = 'sillons';
  plan.rotation.x = -Math.PI / 2;
  plan.position.y = y;
  plan.renderOrder = -2;

  // ---- ondes : une par temps, vivante huit temps (deux mesures)
  const ondes = []; // âges en temps
  const DUREE = 8;

  return {
    objet: plan,
    // Épaisseur d'un pixel CSS, quel que soit le ratio de pixels.
    setPixelRatio(ratio) {
      uniforms.uTrait.value = Math.max(1, ratio);
    },
    battre() {
      ondes.unshift(0);
      if (ondes.length > N_ONDES) ondes.length = N_ONDES;
    },
    // dtTemps : durée écoulée, exprimée en temps musicaux. Rend true tant qu'une onde vit.
    update(dtTemps) {
      for (let i = ondes.length - 1; i >= 0; i -= 1) {
        ondes[i] += dtTemps;
        if (ondes[i] >= DUREE) ondes.splice(i, 1);
      }
      const rangs = uniforms.uOndes.value;
      for (let i = 0; i < N_ONDES; i += 1) {
        rangs[i] = i < ondes.length ? Math.floor((ondes[i] / DUREE) * nombre) : -1;
      }
      return ondes.length > 0;
    },
    eteindre() {
      ondes.length = 0;
      uniforms.uOndes.value.fill(-1);
    },
    dispose() {
      plan.geometry.dispose();
      matiere.dispose();
    },
  };
}
