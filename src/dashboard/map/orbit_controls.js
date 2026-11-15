// Controles orbitales: rotar, acercar y desplazar, sin cruzar el suelo.
// Envuelve los OrbitControls de three.js y añade el límite contra el terreno.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// [diseño] Altura mínima de la cámara sobre el terreno.
const MIN_CLEARANCE_M = 25;

// -> { controls, update() }; update() se llama una vez por cuadro.
export function createOrbitControls(camera, domElement, dem) {
  const [width_m, depth_m] = dem.size_m;
  const span_m = Math.max(width_m, depth_m);

  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false; // desplazar sobre el plano del suelo
  controls.minDistance = 150;
  controls.maxDistance = span_m * 2.5;
  controls.maxPolarAngle = Math.PI / 2 - 0.03; // nunca por debajo del horizonte

  controls.target.set(0, dem.sampleElevation_m(0, 0), 0);
  camera.position.set(0, controls.target.y + span_m * 0.55, span_m * 0.75);
  controls.update();

  function update() {
    // El punto de mira se queda dentro del mapa y pegado al terreno.
    const target = controls.target;
    target.x = Math.min(Math.max(target.x, -width_m / 2), width_m / 2);
    target.z = Math.min(Math.max(target.z, -depth_m / 2), depth_m / 2);
    target.y = dem.sampleElevation_m(target.x, target.z);
    controls.update();

    // La cámara nunca baja del terreno que tiene debajo.
    const floor_m = dem.sampleElevation_m(camera.position.x, camera.position.z) + MIN_CLEARANCE_M;
    if (camera.position.y < floor_m) camera.position.y = floor_m;
  }

  return { controls, update };
}
