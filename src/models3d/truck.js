// Camioneta de superficie, hecha con primitivas de three.js (no hay modelo de la NASA
// para esto: es un vehículo inventado para el juego [diseño]).
// El frente mira a +Z y el origen queda en el suelo, en el centro del vehículo.
import * as THREE from 'three';

// [diseño] Medidas en metros.
export const TRUCK_LENGTH_M = 4.6;
export const TRUCK_WIDTH_M = 2.3;
const WHEEL_RADIUS_M = 0.52;
const WHEEL_WIDTH_M = 0.42;
const AXLES_Z_M = [1.55, 0, -1.55];

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * createTruck({ shadows }) -> { object, wheels, setLights(on) }
 * wheels: mallas que giran sobre su eje X al rodar.
 */
export function createTruck({ shadows = false } = {}) {
  const object = new THREE.Group();
  object.name = 'truck';

  const body = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.55, metalness: 0.15 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd9722e, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2523, roughness: 0.85, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8d8a86, roughness: 0.4, metalness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x16242e, roughness: 0.12, metalness: 0.6 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.3, metalness: 0.5 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd9a0, emissiveIntensity: 1.4 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x7a1510, emissive: 0xff3b24, emissiveIntensity: 0.8 });

  const floor_m = WHEEL_RADIUS_M + 0.18;
  // Chasis y franja de color.
  object.add(box(2.0, 0.28, 4.5, dark, 0, floor_m, 0));
  object.add(box(2.06, 0.5, 4.56, body, 0, floor_m + 0.38, 0));
  object.add(box(2.1, 0.1, 4.6, accent, 0, floor_m + 0.2, 0));
  // Morro y cabina presurizada.
  object.add(box(1.9, 0.34, 1.0, body, 0, floor_m + 0.78, 1.72));
  object.add(box(1.96, 1.05, 1.75, body, 0, floor_m + 1.15, 0.45));
  object.add(box(1.7, 0.58, 0.06, glass, 0, floor_m + 1.3, 1.34));       // parabrisas
  object.add(box(0.06, 0.5, 1.3, glass, 0.99, floor_m + 1.32, 0.45));    // ventanas
  object.add(box(0.06, 0.5, 1.3, glass, -0.99, floor_m + 1.32, 0.45));
  object.add(box(1.5, 0.4, 0.06, glass, 0, floor_m + 1.34, -0.44));
  // Panel solar sobre el techo.
  object.add(box(1.8, 0.05, 1.6, panel, 0, floor_m + 1.72, 0.45));
  // Caja de carga con barandillas y un par de contenedores de muestras.
  object.add(box(1.96, 0.42, 0.08, body, 0, floor_m + 0.84, -2.22));
  object.add(box(0.08, 0.42, 1.8, body, 0.94, floor_m + 0.84, -1.34));
  object.add(box(0.08, 0.42, 1.8, body, -0.94, floor_m + 0.84, -1.34));
  object.add(box(0.7, 0.45, 0.6, accent, -0.45, floor_m + 0.86, -1.1));
  object.add(box(0.6, 0.35, 0.9, metal, 0.45, floor_m + 0.8, -1.5));
  // Arco antivuelco y antena.
  object.add(box(0.08, 0.95, 0.08, metal, 0.9, floor_m + 1.2, -0.52));
  object.add(box(0.08, 0.95, 0.08, metal, -0.9, floor_m + 1.2, -0.52));
  object.add(box(1.88, 0.08, 0.08, metal, 0, floor_m + 1.68, -0.52));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), metal);
  mast.position.set(-0.8, floor_m + 2.4, -0.52);
  object.add(mast);
  // Parachoques.
  object.add(box(2.1, 0.16, 0.14, dark, 0, floor_m + 0.2, 2.33));
  object.add(box(2.1, 0.16, 0.14, dark, 0, floor_m + 0.2, -2.33));

  // Luces.
  const lights = [];
  for (const side of [-1, 1]) {
    lights.push(box(0.34, 0.16, 0.06, lamp, side * 0.66, floor_m + 0.72, 2.24));
    object.add(box(0.28, 0.12, 0.05, tail, side * 0.7, floor_m + 0.5, -2.29));
  }
  object.add(...lights);

  // Seis ruedas, como los rovers de Marte.
  const tire = new THREE.CylinderGeometry(WHEEL_RADIUS_M, WHEEL_RADIUS_M, WHEEL_WIDTH_M, 18);
  tire.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(WHEEL_RADIUS_M * 0.5, WHEEL_RADIUS_M * 0.5, WHEEL_WIDTH_M + 0.04, 6);
  hub.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const z of AXLES_Z_M) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(tire, dark), new THREE.Mesh(hub, metal));
      wheel.position.set(side * (TRUCK_WIDTH_M / 2 - WHEEL_WIDTH_M / 2), WHEEL_RADIUS_M, z);
      wheels.push(wheel);
      object.add(wheel);
    }
    object.add(box(TRUCK_WIDTH_M - WHEEL_WIDTH_M, 0.1, 0.1, metal, 0, WHEEL_RADIUS_M, z));
  }

  object.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = shadows;
      node.receiveShadow = shadows;
    }
  });

  return {
    object,
    wheels,
    wheel_radius_m: WHEEL_RADIUS_M,
    setLights(on) {
      lamp.emissiveIntensity = on ? 1.4 : 0.15;
    },
  };
}
