// Poussière (docs/DA.md 8, priorité 3) : 400 points crème d'un à deux pixels dans un volume
// de 6 m, dérive de 2 cm par seconde, opacité 0,35. 150 points sur mobile.
// Points carrés, à plat, sans atténuation : ils ne servent qu'à donner de la parallaxe.
//
// Taille : `size` s'exprime en pixels CSS. WebGLRenderer la multiplie lui-même par son ratio
// de pixels (WebGLMaterials.refreshUniformsPoints : size * pixelRatio), y compris sans
// atténuation. Mesuré sur capture : 1 et 2 px en ratio 1, 2 et 4 px du tampon en ratio 2.
// Ne pas la multiplier une seconde fois dans setPixelRatio.
import * as THREE from 'three';
import { DA } from './da.js';

export function createPoussiere({ nombre = 400, volume = 6, vitesse = 0.02, opacite = 0.35 } = {}) {
  const groupe = new THREE.Group();
  groupe.name = 'poussiere';
  const demi = volume / 2;
  const lots = [];

  // Deux lots : points d'un pixel et points de deux pixels (pixels CSS).
  const construire = (total) => {
    for (const lot of lots.splice(0)) {
      groupe.remove(lot.points);
      lot.points.geometry.dispose();
      lot.points.material.dispose();
    }
    [1, 2].forEach((taille, rang) => {
      const n = rang === 0 ? Math.ceil(total * 0.6) : Math.floor(total * 0.4);
      const positions = new Float32Array(n * 3);
      const derives = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        positions[i * 3] = (Math.random() * 2 - 1) * demi;
        positions[i * 3 + 1] = (Math.random() * 2 - 1) * demi;
        positions[i * 3 + 2] = (Math.random() * 2 - 1) * demi;
        // direction au hasard sur la sphère, vitesse constante
        const z = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - z * z);
        derives[i * 3] = Math.cos(a) * r * vitesse;
        derives[i * 3 + 1] = z * vitesse;
        derives[i * 3 + 2] = Math.sin(a) * r * vitesse;
      }
      const geometrie = new THREE.BufferGeometry();
      geometrie.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      const matiere = new THREE.PointsMaterial({
        color: DA.color.creme,
        size: taille,
        sizeAttenuation: false,
        transparent: true,
        opacity: opacite,
        depthWrite: false,
        toneMapped: false,
      });
      const points = new THREE.Points(geometrie, matiere);
      points.frustumCulled = false;
      groupe.add(points);
      lots.push({ points, positions, derives, n });
    });
  };
  construire(nombre);

  return {
    objet: groupe,
    setNombre: construire,
    update(dt) {
      if (!groupe.visible || dt <= 0) return false;
      for (const { points, positions, derives, n } of lots) {
        for (let i = 0; i < n * 3; i += 1) {
          let v = positions[i] + derives[i] * dt;
          if (v > demi) v -= volume;
          else if (v < -demi) v += volume;
          positions[i] = v;
        }
        points.geometry.attributes.position.needsUpdate = true;
      }
      return true;
    },
    dispose() {
      for (const { points } of lots) {
        points.geometry.dispose();
        points.material.dispose();
      }
    },
  };
}
