// Base o estación de superficie, hecha con primitivas de three.js. Origen en el suelo.
// Es un diseño del equipo [diseño]: no reproduce ningún hábitat real.
import * as THREE from 'three';

// [diseño] Medidas, en metros.
const HAB_RADIUS_M = 2.2;
const HAB_LENGTH_M = 8.5;
// Radio del círculo de colisión alrededor del centro de la base.
export const STATION_RADIUS_M = 6.5;

export function createStation({ shadows = false } = {}) {
  const group = new THREE.Group();
  group.name = 'station';
  const hull = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.55, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3c3f, roughness: 0.7, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc65b27, roughness: 0.6 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.35, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffd29a, emissive: 0xffb45c, emissiveIntensity: 1.8 });
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Módulo habitable: un cilindro tumbado con tapas redondeadas, sobre patas.
  const hab = add(new THREE.CylinderGeometry(HAB_RADIUS_M, HAB_RADIUS_M, HAB_LENGTH_M, 28), hull, 0, HAB_RADIUS_M + 0.5, 0);
  hab.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const cap = add(new THREE.SphereGeometry(HAB_RADIUS_M, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), hull, (side * HAB_LENGTH_M) / 2, HAB_RADIUS_M + 0.5, 0);
    cap.rotation.z = -side * (Math.PI / 2);
    const band = add(new THREE.TorusGeometry(HAB_RADIUS_M + 0.02, 0.07, 8, 36), accent, side * (HAB_LENGTH_M / 2 - 0.9), HAB_RADIUS_M + 0.5, 0);
    band.rotation.y = Math.PI / 2;
    for (const depth of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 8), dark, side * (HAB_LENGTH_M / 2 - 1.2), 0.45, depth * 1.3);
    }
  }
  // Ventanas iluminadas a lo largo del módulo.
  for (let i = -2; i <= 2; i++) {
    add(new THREE.BoxGeometry(0.7, 0.45, 0.06), glow, i * 1.4, HAB_RADIUS_M + 1.0, HAB_RADIUS_M * 0.93);
  }

  // Esclusa al frente, con puerta y rampa.
  add(new THREE.BoxGeometry(2.2, 2.4, 2.4), hull, 0, 1.7, HAB_RADIUS_M + 1.2);
  add(new THREE.BoxGeometry(1.0, 1.9, 0.08), dark, 0, 1.5, HAB_RADIUS_M + 2.42);
  add(new THREE.BoxGeometry(0.5, 0.12, 0.06), glow, 0, 2.65, HAB_RADIUS_M + 2.43);
  const ramp = add(new THREE.BoxGeometry(1.4, 0.1, 2.0), dark, 0, 0.28, HAB_RADIUS_M + 3.3);
  ramp.rotation.x = 0.28;

  // Dos mástiles con paneles solares.
  for (const side of [-1, 1]) {
    const x = side * (HAB_LENGTH_M / 2 + 2.6);
    add(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), dark, x, 1.7, -1.5);
    const array = add(new THREE.BoxGeometry(3.6, 0.06, 2.0), panel, x, 3.5, -1.5);
    array.rotation.x = -0.5;
    add(new THREE.BoxGeometry(3.7, 0.08, 0.06), hull, x, 3.5, -1.5).rotation.x = -0.5;
  }

  // Antena de plato y luz de posición.
  add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), dark, -2.4, HAB_RADIUS_M * 2 + 1.5, -0.4);
  const dish = add(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), hull, -2.4, HAB_RADIUS_M * 2 + 2.7, -0.4);
  dish.rotation.x = Math.PI + 0.7;
  add(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), dark, 2.6, HAB_RADIUS_M * 2 + 1.2, 0);
  add(new THREE.SphereGeometry(0.1, 10, 8), glow, 2.6, HAB_RADIUS_M * 2 + 2.05, 0);

  group.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = shadows;
      node.receiveShadow = true;
    }
  });
  return group;
}
