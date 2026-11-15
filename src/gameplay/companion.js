// Rover de compañía: sigue al astronauta por el terreno y cuenta datos de Marte.
// El movimiento sale del modelo puro src/models/locomotion/follow.js.
import * as THREE from 'three';
import { createPerseverance, PERSEVERANCE_LENGTH_M } from '../models3d/rover.js';
import { stepFollower } from '../models/locomotion/follow.js';
import { MARS_FACTS } from './mars_facts.js';

// [diseño] Radio de colisión del rover y distancia para hablarle, en metros.
export const COMPANION_RADIUS_M = 1.9;
const TALK_REACH_M = 6.5;
// [diseño] Distancia entre los puntos donde se mide el suelo para inclinar el rover.
const WHEELBASE_M = PERSEVERANCE_LENGTH_M * 0.7;
// A partir de esta distancia a la cámara el rover no se dibuja (mide 3 m).
const DRAW_DISTANCE_M = 700;

/**
 * createCompanion({ world, groundAt }) ->
 *   ready (promesa), place(x_m, z_m), update(delta_s, target, camera)
 *   position() -> { x_m, z_m } o null, canTalk(x_m, z_m), nextFact() -> { text, source }
 *   resolveCollision(x_m, z_m, bodyRadius_m) -> [x_m, z_m]
 */
export function createCompanion({ world, groundAt }) {
  let object = null;
  let follower = null;
  let factIndex = 0;
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const targetQuaternion = new THREE.Quaternion();

  const ready = createPerseverance()
    .then((rover) => {
      rover.traverse((node) => {
        if (node.isMesh) node.castShadow = world.quality.shadows;
      });
      object = rover;
      object.name = 'companion';
      object.visible = Boolean(follower);
      world.scene.add(object);
      if (follower) settle(1);
    })
    .catch((error) => {
      console.error('No se pudo cargar el modelo del rover:', error);
    });

  // Apoya el rover en el suelo y lo inclina según el terreno bajo sus ruedas.
  function settle(blend) {
    if (!object) return;
    const { x_m, z_m, yaw_rad } = follower;
    const fx = Math.sin(yaw_rad);
    const fz = Math.cos(yaw_rad);
    const half = WHEELBASE_M / 2;
    const front = groundAt(x_m + fx * half, z_m + fz * half);
    const back = groundAt(x_m - fx * half, z_m - fz * half);
    const left = groundAt(x_m + fz * half, z_m - fx * half);
    const right = groundAt(x_m - fz * half, z_m + fx * half);
    object.position.set(x_m, (front + back + left + right) / 4, z_m);
    forward.set(fx * WHEELBASE_M, front - back, fz * WHEELBASE_M).normalize();
    side.set(fz * WHEELBASE_M, left - right, -fx * WHEELBASE_M).normalize();
    up.crossVectors(forward, side).normalize();
    side.crossVectors(up, forward).normalize();
    basis.makeBasis(side, up, forward);
    targetQuaternion.setFromRotationMatrix(basis);
    object.quaternion.slerp(targetQuaternion, blend);
  }

  return {
    ready,
    get object() {
      return object;
    },
    // Coloca el rover sin animación (al empezar o al cambiar de zona).
    place(x_m, z_m, yaw_rad = 0) {
      follower = { x_m, z_m, yaw_rad, speed_ms: 0, moving: false };
      if (object) {
        object.visible = true;
        settle(1);
      }
    },
    position: () => (follower ? { x_m: follower.x_m, z_m: follower.z_m } : null),
    update(delta_s, target, camera) {
      if (!follower) return;
      if (target) follower = stepFollower(follower, target, delta_s);
      if (!object) return;
      object.visible = camera.position.distanceTo(object.position) < DRAW_DISTANCE_M;
      // La inclinación se suaviza para que no dé saltos entre celdas del terreno.
      settle(1 - Math.exp(-6 * delta_s));
    },
    canTalk(x_m, z_m) {
      return Boolean(follower) && Math.hypot(follower.x_m - x_m, follower.z_m - z_m) <= TALK_REACH_M;
    },
    // Los datos salen en orden y, al terminar la lista, vuelven a empezar.
    nextFact() {
      const fact = MARS_FACTS[factIndex % MARS_FACTS.length];
      factIndex += 1;
      return fact;
    },
    resolveCollision(x_m, z_m, bodyRadius_m) {
      if (!follower) return [x_m, z_m];
      const dx = x_m - follower.x_m;
      const dz = z_m - follower.z_m;
      const distance_m = Math.hypot(dx, dz);
      const reach_m = COMPANION_RADIUS_M + bodyRadius_m;
      if (distance_m >= reach_m || distance_m < 1e-6) return [x_m, z_m];
      return [follower.x_m + (dx / distance_m) * reach_m, follower.z_m + (dz / distance_m) * reach_m];
    },
  };
}
