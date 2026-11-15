// Cápsula de descenso, hecha con primitivas de three.js. Es un vehículo inventado para
// el juego [diseño]; no reproduce ninguna cápsula real.
// El origen queda en la base (el escudo térmico); el eje va hacia +Y.
import * as THREE from 'three';

// [diseño] Medidas en metros.
export const CAPSULE_RADIUS_M = 1.7;
export const CAPSULE_HEIGHT_M = 2.7;

export function createCapsule({ shadows = false } = {}) {
  const group = new THREE.Group();
  group.name = 'capsule';
  const hull = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.6, metalness: 0.2 });
  const shield = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.95 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd9722e, roughness: 0.5, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x16242e, roughness: 0.12, metalness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8d8a86, roughness: 0.4, metalness: 0.8 });

  // Escudo térmico: un casquete chato y chamuscado.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(CAPSULE_RADIUS_M, CAPSULE_RADIUS_M * 0.8, 0.35, 28), shield);
  base.position.y = 0.175;
  // Cuerpo cónico y franja de color.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, CAPSULE_RADIUS_M * 0.97, 2.0, 28), hull);
  body.position.y = 1.35;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(CAPSULE_RADIUS_M * 0.99, CAPSULE_RADIUS_M, 0.16, 28), accent);
  band.position.y = 0.43;
  // Remate con el anclaje del paracaídas.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, 0.3, 20), metal);
  cap.position.y = 2.5;
  group.add(base, body, band, cap);
  // Escotilla y dos ventanillas sobre el cono.
  const slope_rad = Math.atan2(CAPSULE_RADIUS_M * 0.97 - 0.62, 2.0);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.05, 0.06), metal);
  hatch.position.set(0, 1.2, 1.2);
  hatch.rotation.x = -slope_rad;
  group.add(hatch);
  for (const side of [-1, 1]) {
    const porthole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), glass);
    porthole.rotation.set(Math.PI / 2 - slope_rad, 0, 0);
    const holder = new THREE.Group();
    porthole.position.set(0, 1.55, 1.08);
    holder.rotation.y = side * 0.75;
    holder.add(porthole);
    group.add(holder);
  }
  group.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = shadows;
      node.receiveShadow = shadows;
    }
  });
  return group;
}
