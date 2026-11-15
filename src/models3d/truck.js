// El GLB conserva sus pivotes de rueda y el punto de vista del conductor.
import * as THREE from 'three';
import { BASE_URL } from '../shared/base_url.js';
import { loadModel } from './loader.js';

export const TRUCK_LENGTH_M = 4.72;
export const TRUCK_WIDTH_M = 2.39;
const WHEEL_RADIUS_M = 0.586;
const MODEL_URL = `${BASE_URL}models3d/camioneta-marciana-6x6/camioneta-marciana-6x6.glb`;

export function createTruck({ shadows = false } = {}) {
  const object = new THREE.Group();
  object.name = 'truck';
  const wheels = [];
  const frontAxle = [];
  const lights = [];
  const cabinLight = new THREE.PointLight(0xffead0, 0.33, 1.5);
  cabinLight.name = 'Luz de cabina';
  cabinLight.position.set(0, 2.035, 0.14);
  cabinLight.visible = false;
  object.add(cabinLight);
  let driverEye = null;
  let lightsOn = false;

  const ready = loadModel(MODEL_URL).then((model) => {
    model.name = 'camioneta-marciana-6x6';
    const eye = model.getObjectByName('DriverEye');
    for (const row of [1, 2, 3]) {
      for (const side of ['L', 'R']) {
        const wheel = model.getObjectByName(`Wheel_${row}_${side}`);
        if (!wheel) throw new Error(`Falta el pivote de rueda ${row}-${side}`);
        wheels.push(wheel);
        if (row === 1) frontAxle.push(wheel.parent);
      }
    }
    if (!eye) throw new Error('El modelo no trae la posición del conductor');
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = shadows && !node.material.transparent;
      node.receiveShadow = shadows;
    });
    model.getObjectByName('Headlights')?.traverse((node) => {
      if (!node.isMesh) return;
      node.material = node.material.clone();
      lights.push(node.material);
      node.material.emissiveIntensity = lightsOn ? 3.0 : 0.18;
    });
    object.add(model);
    driverEye = eye;
  }).catch((error) => {
    console.error('No se pudo cargar la camioneta marciana 6×6:', error);
  });

  return {
    object, wheels, ready,
    wheel_radius_m: WHEEL_RADIUS_M,
    get driverEye() { return driverEye; },
    setLights(on) {
      lightsOn = on;
      for (const material of lights) material.emissiveIntensity = on ? 3.0 : 0.18;
    },
    setSteering(steer, delta_s) {
      for (const pivot of frontAxle) {
        pivot.rotation.y = THREE.MathUtils.damp(pivot.rotation.y, -0.36 * steer, 10, delta_s);
      }
    },
    setCabinLight(on) { cabinLight.visible = on; },
  };
}
