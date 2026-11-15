// Base NS-02. El GLB tiene su origen en las fundaciones; el acceso mira a +Z.
import * as THREE from 'three';
import { BASE_URL } from '../shared/base_url.js';
import { loadModel } from './loader.js';

export const STATION_MODEL_URL = `${BASE_URL}models3d/base-terrestre-ns-02/base-terrestre-ns-02.glb`;

// Huellas en el espacio del modelo: casco, vestíbulo, paneles solares y armarios.
const STRUCTURES = [
  [-11.91, 11.82, -2.61, 2.18],
  [-2.17, 2.17, 2.18, 5.73],
  [-18.83, -12.37, -1.06, 3.96],
  [12.37, 18.83, -3.10, 1.92],
  [-12.86, -11.52, 0.22, 1.79],
  [11.52, 12.86, -1.83, -0.26],
];
const RAMP = {
  halfWidth_m: 1.57,
  deckZ_m: 5.73,
  topZ_m: 6.42,
  toeZ_m: 12.53,
  deckHeight_m: 1.276,
  toeHeight_m: 0.157,
};
const RAILS = [
  [-1.62, -1.50, RAMP.deckZ_m, RAMP.toeZ_m],
  [1.50, 1.62, RAMP.deckZ_m, RAMP.toeZ_m],
];
const WALK_BLOCKS = [...STRUCTURES, ...RAILS];
const DRIVE_BLOCKS = [...STRUCTURES, [-1.67, 1.67, RAMP.deckZ_m, RAMP.toeZ_m]];

// Puntos de apoyo de las piezas de hormigón del GLB.
const FOUNDATION_PADS = [
  ...[-9.83, -5.65, -2.67, 2.67, 5.49, 9.67].flatMap((x) =>
    [-1.34, 1.34].map((z) => [x, z, 0.72, 0.92])),
  [-1.15, 4.25, 1.04, 2.36], [1.15, 4.25, 1.04, 2.36],
  ...[-1, 1].flatMap((side) => {
    const arrayZ = side < 0 ? 1.45 : -0.59;
    return [
      ...[side * 15.6 - 2.8, side * 15.6 + 2.8].flatMap((x) =>
        [-1.99, 1.99].map((dz) => [x, arrayZ + dz, 0.61, 0.63])),
      [side * 12.19, arrayZ - 0.45, 1.02, 1.13],
      [side * 3.76, -2.04, 0.88, 0.95],
      ...[0.11, 0.41, 0.71].map((fraction) =>
        [side * 1.545, 6.42 + fraction * 6.10, 0.34, 0.43]),
    ];
  }),
];

function localXZ(frame, x_m, z_m) {
  const dx = x_m - frame.x_m;
  const dz = z_m - frame.z_m;
  return [frame.cos * dx - frame.sin * dz, frame.sin * dx + frame.cos * dz];
}

function worldXZ(frame, x, z) {
  return [frame.x_m + frame.cos * x + frame.sin * z, frame.z_m - frame.sin * x + frame.cos * z];
}

function pushOut(x, z, radius, boxes) {
  const blocked = (px, pz) => boxes.some(([x0, x1, z0, z1]) =>
    px > x0 - radius && px < x1 + radius && pz > z0 - radius && pz < z1 + radius);
  if (!blocked(x, z)) return [x, z];
  // Buscar la salida más corta de la unión de las huellas, también en sus juntas.
  let nearest = [x, z];
  let best = Infinity;
  for (const [x0, x1, z0, z1] of boxes) {
    for (const [px, pz] of [[x0 - radius, z], [x1 + radius, z], [x, z0 - radius], [x, z1 + radius]]) {
      const distance = Math.abs(x - px) + Math.abs(z - pz);
      if (distance < best && !blocked(px, pz)) {
        best = distance;
        nearest = [px, pz];
      }
    }
  }
  return nearest;
}

export function createStation({ shadows = false, groundAt }) {
  const object = new THREE.Group();
  object.name = 'station';
  object.visible = false;
  const foundations = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x817967, roughness: 0.93 }),
    FOUNDATION_PADS.length,
  );
  foundations.name = 'Apoyos al terreno';
  foundations.count = 0;
  foundations.castShadow = shadows;
  foundations.receiveShadow = true;
  const transform = new THREE.Matrix4();
  let frame = null;
  let loaded = false;

  const ready = loadModel(STATION_MODEL_URL).then((model) => {
    model.name = 'base-terrestre-ns-02';
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = shadows;
      node.receiveShadow = true;
    });
    object.add(model, foundations);
    loaded = true;
  }).catch((error) => {
    console.error('No se pudo cargar el modelo de la base NS-02:', error);
  });

  return {
    object,
    ready,
    place(x_m, z_m, yaw_rad = 0) {
      frame = { x_m, z_m, cos: Math.cos(yaw_rad), sin: Math.sin(yaw_rad) };
      const toeGround_m = groundAt(...worldXZ(frame, 0, RAMP.toeZ_m));
      const mainGround_m = groundAt(x_m, z_m);
      // Cerca de un desnivel se prioriza el apoyo del casco y se prolongan las patas.
      const y_m = Math.max(mainGround_m - 0.42, toeGround_m - 0.10);
      object.position.set(x_m, y_m, z_m);
      object.rotation.y = yaw_rad;
      object.visible = true;
      let count = 0;
      for (const [x, z, width, depth] of FOUNDATION_PADS) {
        const ground_m = groundAt(...worldXZ(frame, x, z));
        const extension_m = y_m - ground_m;
        if (extension_m < 0.035) continue;
        transform.makeScale(width, extension_m + 0.11, depth);
        transform.setPosition(x, -(extension_m + 0.05) / 2, z);
        foundations.setMatrixAt(count++, transform);
      }
      foundations.count = count;
      foundations.instanceMatrix.needsUpdate = true;
      foundations.boundingSphere = null;
    },
    walkSurface_m(x_m, z_m) {
      if (!object.visible || !loaded) return -Infinity;
      const [x, z] = localXZ(frame, x_m, z_m);
      if (Math.abs(x) > RAMP.halfWidth_m || z < RAMP.deckZ_m || z > RAMP.toeZ_m) return -Infinity;
      const t = Math.max(0, (z - RAMP.topZ_m) / (RAMP.toeZ_m - RAMP.topZ_m));
      return object.position.y + THREE.MathUtils.lerp(RAMP.deckHeight_m, RAMP.toeHeight_m, t);
    },
    resolveCollision(x_m, z_m, radius_m, onFoot = true) {
      if (!object.visible || !loaded) return [x_m, z_m];
      const [x, z] = localXZ(frame, x_m, z_m);
      return worldXZ(frame, ...pushOut(x, z, radius_m, onFoot ? WALK_BLOCKS : DRIVE_BLOCKS));
    },
  };
}
