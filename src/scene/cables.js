// Cables that plug into the rear ports one by one. Each cable is a group
// (child of its unit) holding one or two connectors plus a tube trailing away
// behind the unit. Only a short stub of each tube is shown: CABLE.solid metres
// fully opaque after the plug, then a gradient to transparent over CABLE.fade
// metres, as if the cable ran very far away (see src/config.js). The stub is
// part of the group, so it travels with the connector. Two animated values:
//   approach 0..1  connector slides in from behind onto the port
//   opacity  0..1  overall opacity of the tube (fades in as the plug arrives)
import * as THREE from 'three';
import { CABLES } from '../config/ports.js';
import { CABLE } from '../config.js';

const FROM_BEHIND = 0.22; // metres of travel before plugging
const INSERT = 0.02; // last metres of travel, straight along the port axis
const BACK = new THREE.Vector3(0, 0, -1);

export function createCables(units) {
  const raycaster = new THREE.Raycaster();
  const cables = [];
  const forward = new THREE.Vector3(0, 0, 1);

  for (const def of CABLES) {
    const unit = units[def.unit];
    if (!unit) continue;
    const group = new THREE.Group();
    group.name = `cable_${def.id}`;
    group.visible = false;
    unit.group.add(group);

    const rubber = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55, metalness: 0.05, transparent: true });
    rubber.onBeforeCompile = injectFade(rubber);
    const state = { approach: 0, opacity: 0 };
    const connectors = [];
    const axis = new THREE.Vector3(); // mean outward panel normal of the cable's ports

    for (let i = 0; i < def.plugs.length; i++) {
      const p = def.plugs[i];
      // Exact panel depth and orientation under this port. Units are not
      // rotated at creation and the mesh sits at the group origin, so the hit
      // face normal is already in unit-local axes.
      raycaster.set(new THREE.Vector3(p.x / 1000, p.y / 1000, -1).add(unit.group.position), forward);
      const hit = raycaster.intersectObject(unit.mesh, false)[0];
      const z = hit ? hit.point.z - unit.group.position.z : unit.bounds.min.z + 0.03;
      const normal = hit && hit.face.normal.z < -0.7 ? hit.face.normal.clone().normalize() : BACK.clone();
      axis.add(normal);
      const port = new THREE.Vector3(p.x / 1000, p.y / 1000, z);
      const plug = buildPlug(def.type, p.ring);
      plug.position.copy(port);
      // Plug body (built along -z) along the outward normal: axis perpendicular to the panel.
      plug.quaternion.setFromUnitVectors(BACK, normal);
      group.add(plug);

      // Path: out of the plug (along its axis), slight droop, then away and down to the floor.
      const len = plugLength(def.type);
      // Lateral drift of the far end. In a side-by-side pair the plug lying
      // further in the drift direction drifts more, so the two never cross; a
      // stacked (vertical) pair ends side by side instead of on top of each other.
      const drift = def.drift ?? 0;
      const lead = def.plugs.reduce((b, q) => (q.x * Math.sign(drift) > b.x * Math.sign(drift) ? q : b), def.plugs[0]);
      const lateral = drift * (def.vertical || p === lead ? 1 : 0.8);
      const side = def.vertical && i > 0 ? Math.sign(drift || 1) * cableRadius(def.type) * 2.4 : 0;
      const pts = [
        port.clone().addScaledVector(normal, len),
        port.clone().addScaledVector(normal, len + 0.05).add(new THREE.Vector3(lateral * 0.15, -0.004, 0)),
        port.clone().add(new THREE.Vector3(lateral * 0.6 + side * 0.6, -port.y * 0.45, -0.17)),
        port.clone().add(new THREE.Vector3(lateral + side, -port.y + 0.006, -0.32)),
        port.clone().add(new THREE.Vector3(lateral * 1.5 + side, -port.y + 0.004, -0.55)),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, cableRadius(def.type), 10, false), rubber);
      tube.castShadow = false; // the shadow pass ignores the alpha fade
      addAlongAttribute(tube.geometry, 48, 10, curve.getLength());
      group.add(tube);
      connectors.push({ plug, tube, port });
    }

    axis.normalize();
    cables.push({
      id: def.id, def, unit, group, state, connectors, material: rubber, axis,
      update() {
        group.visible = state.approach > 0;
        // Slide in from behind, the last INSERT metres straight along the port
        // axis (identical to a pure -z slide for vertical panels).
        const s = (1 - state.approach) * FROM_BEHIND;
        group.position.copy(axis).multiplyScalar(Math.min(s, INSERT)).addScaledVector(BACK, Math.max(0, s - INSERT));
        rubber.userData.uOpacity.value = state.opacity;
      },
    });
  }
  return cables;
}

// --- helpers ---

function plugLength(type) {
  return { iec: 0.03, rca: 0.022, rj45: 0.026, xlr: 0.05 }[type] ?? 0.03;
}
function cableRadius(type) {
  return { iec: 0.0036, rca: 0.0022, rj45: 0.0028, xlr: 0.0032 }[type] ?? 0.003;
}

const plugMaterials = {
  black: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.5, metalness: 0.1 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2b3f66, roughness: 0.45, metalness: 0.1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.3, metalness: 0.9 }),
  grey: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.6 }),
};

// Connector geometries, with the tip at the origin and the body towards -z.
function buildPlug(type, ring) {
  const g = new THREE.Group();
  const add = (geo, mat, z, extra) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.z = z;
    if (extra) extra(m);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (type === 'iec') {
    add(new THREE.BoxGeometry(0.019, 0.013, 0.012), plugMaterials.grey, -0.006); // nose
    add(new THREE.BoxGeometry(0.026, 0.019, 0.03), plugMaterials.black, -0.027);
  } else if (type === 'rca') {
    const ringMat = new THREE.MeshStandardMaterial({ color: ring ?? 0xffffff, roughness: 0.5 });
    add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.012, 8), plugMaterials.metal, -0.004, (m) => (m.rotation.x = Math.PI / 2));
    add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 16), plugMaterials.metal, -0.011, (m) => (m.rotation.x = Math.PI / 2));
    add(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 16), ringMat, -0.02, (m) => (m.rotation.x = Math.PI / 2));
    add(new THREE.CylinderGeometry(0.0045, 0.0035, 0.012, 16), plugMaterials.black, -0.029, (m) => (m.rotation.x = Math.PI / 2));
  } else if (type === 'rj45') {
    add(new THREE.BoxGeometry(0.0115, 0.008, 0.02), plugMaterials.blue, -0.01);
    add(new THREE.BoxGeometry(0.013, 0.01, 0.014), plugMaterials.blue, -0.027);
  } else if (type === 'xlr') {
    add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.02, 20), plugMaterials.grey, -0.008, (m) => (m.rotation.x = Math.PI / 2));
    add(new THREE.CylinderGeometry(0.0095, 0.0095, 0.03, 20), plugMaterials.black, -0.033, (m) => (m.rotation.x = Math.PI / 2));
    add(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 16), plugMaterials.black, -0.052, (m) => (m.rotation.x = Math.PI / 2));
  }
  return g;
}

// Distance along the tube in metres from the plug (TubeGeometry samples the
// curve at equal arc lengths, so ring i sits at i / segments * length).
function addAlongAttribute(geometry, tubularSegments, radialSegments, length) {
  const count = geometry.attributes.position.count;
  const along = new Float32Array(count);
  for (let i = 0; i <= tubularSegments; i++) {
    for (let j = 0; j <= radialSegments; j++) along[i * (radialSegments + 1) + j] = (i / tubularSegments) * length;
  }
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
}

// Alpha: 1 over the first CABLE.solid metres, smooth gradient to 0 over the
// next CABLE.fade metres, times the overall uOpacity.
function injectFade(material) {
  material.userData.uOpacity = { value: 0 };
  return (shader) => {
    shader.uniforms.uOpacity = material.userData.uOpacity;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float along;\nvarying float vAlong;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uOpacity;\nvarying float vAlong;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
{
  float a = uOpacity * (1.0 - smoothstep(${CABLE.solid.toFixed(4)}, ${(CABLE.solid + CABLE.fade).toFixed(4)}, vAlong));
  if (a <= 0.003) discard;
  gl_FragColor.a *= a;
}`);
  };
}
