// Paracaídas del aterrizaje, hecho con primitivas de three.js [diseño].
// El origen queda en los hombros del astronauta; la campana, arriba.
import * as THREE from 'three';

// [diseño] Medidas en metros.
const CANOPY_RADIUS_M = 3.6;
const CANOPY_HEIGHT_M = 6.4;
const GORES = 16;

export function createParachute() {
  const group = new THREE.Group();
  group.name = 'parachute';

  // Campana: casquete esférico con gajos naranjas y blancos, como los de las misiones a Marte.
  const geometry = new THREE.SphereGeometry(CANOPY_RADIUS_M, GORES, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const colors = [];
  const position = geometry.attributes.position;
  const orange = new THREE.Color(0xd9622b);
  const white = new THREE.Color(0xf2ead9);
  for (let i = 0; i < position.count; i++) {
    const angle = Math.atan2(position.getZ(i), position.getX(i)) + Math.PI;
    const gore = Math.floor((angle / (Math.PI * 2)) * GORES - 1e-6);
    const color = gore % 2 === 0 ? orange : white;
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const canopy = new THREE.Mesh(
    geometry.toNonIndexed(),
    new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, flatShading: true }),
  );
  canopy.position.y = CANOPY_HEIGHT_M - CANOPY_RADIUS_M * 0.75;
  group.add(canopy);

  // Cuerdas: del borde de la campana a los hombros.
  const rim_m = CANOPY_RADIUS_M * Math.sin(Math.PI * 0.42);
  const rimY_m = canopy.position.y + CANOPY_RADIUS_M * Math.cos(Math.PI * 0.42);
  const points = [];
  for (let i = 0; i < GORES; i++) {
    const angle = (i / GORES) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * rim_m, rimY_m, Math.sin(angle) * rim_m), new THREE.Vector3(0, 0, 0));
  }
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xe8dcc6, transparent: true, opacity: 0.7 }),
  ));
  return group;
}
