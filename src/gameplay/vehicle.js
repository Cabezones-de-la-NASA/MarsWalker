// La camioneta en el modo a pie: se conduce con el modelo puro
// src/models/locomotion/vehicle.js y se apoya en el terreno según sus ruedas.
import * as THREE from 'three';
import { createTruck, TRUCK_LENGTH_M, TRUCK_WIDTH_M } from '../models3d/truck.js';
import { stepVehicle, exitPosition, VEHICLE } from '../models/locomotion/vehicle.js';

const DRAW_DISTANCE_M = 1500;

/**
 * createVehicle({ world, groundAt }) ->
 *   place(x_m, z_m, yaw_rad), update(delta_s, input | null, env, camera)
 *   state() -> { x_m, z_m, yaw_rad, speed_ms } o null, height_m()
 *   canBoard(x_m, z_m), exitPosition() -> [x_m, z_m]
 *   resolveCollision(x_m, z_m, bodyRadius_m) -> [x_m, z_m]   (para quien va a pie)
 */
export function createVehicle({ world, groundAt }) {
  const truck = createTruck({ shadows: world.quality.shadows });
  const { object } = truck;
  object.visible = false;
  world.scene.add(object);
  let vehicle = null;

  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const targetQuaternion = new THREE.Quaternion();
  const halfLength_m = TRUCK_LENGTH_M * 0.35;
  const halfWidth_m = TRUCK_WIDTH_M * 0.4;

  // Apoya la camioneta en el suelo y la inclina según el terreno bajo sus ruedas.
  function settle(blend) {
    const { x_m, z_m, yaw_rad } = vehicle;
    const fx = Math.sin(yaw_rad);
    const fz = Math.cos(yaw_rad);
    const front = groundAt(x_m + fx * halfLength_m, z_m + fz * halfLength_m);
    const back = groundAt(x_m - fx * halfLength_m, z_m - fz * halfLength_m);
    const left = groundAt(x_m + fz * halfWidth_m, z_m - fx * halfWidth_m);
    const right = groundAt(x_m - fz * halfWidth_m, z_m + fx * halfWidth_m);
    object.position.set(x_m, (front + back + left + right) / 4, z_m);
    forward.set(fx * halfLength_m * 2, front - back, fz * halfLength_m * 2).normalize();
    side.set(fz * halfWidth_m * 2, left - right, -fx * halfWidth_m * 2).normalize();
    up.crossVectors(forward, side).normalize();
    side.crossVectors(up, forward).normalize();
    basis.makeBasis(side, up, forward);
    targetQuaternion.setFromRotationMatrix(basis);
    object.quaternion.slerp(targetQuaternion, blend);
  }

  return {
    object,
    ready: truck.ready,
    get driverEye() { return truck.driverEye; },
    setCabinLight(on) { truck.setCabinLight(on); },
    place(x_m, z_m, yaw_rad = 0) {
      vehicle = { x_m, z_m, yaw_rad, speed_ms: 0 };
      object.visible = true;
      settle(1);
    },
    // Quita la camioneta del mundo (modo realista). place() la devuelve.
    remove() {
      vehicle = null;
      object.visible = false;
    },
    state: () => vehicle,
    height_m: () => object.position.y,
    // input null: aparcada (se frena sola). env: el del modelo, con colisiones y límites.
    update(delta_s, input, env, camera) {
      if (!vehicle) return;
      const before = vehicle;
      vehicle = stepVehicle(vehicle, input ?? { throttle: 0, steer: 0 }, env, delta_s);
      const rolled_m = Math.hypot(vehicle.x_m - before.x_m, vehicle.z_m - before.z_m) * Math.sign(vehicle.speed_ms || 1);
      for (const wheel of truck.wheels) wheel.rotation.x += rolled_m / truck.wheel_radius_m;
      truck.setLights(Boolean(input));
      truck.setSteering(input?.steer ?? 0, delta_s);
      object.visible = camera.position.distanceTo(object.position) < DRAW_DISTANCE_M;
      settle(1 - Math.exp(-8 * delta_s));
    },
    canBoard(x_m, z_m) {
      return Boolean(vehicle && truck.driverEye) && Math.hypot(vehicle.x_m - x_m, vehicle.z_m - z_m) <= VEHICLE.board_reach_m;
    },
    exitPosition: () => exitPosition(vehicle),
    resolveCollision(x_m, z_m, bodyRadius_m) {
      if (!vehicle) return [x_m, z_m];
      const dx = x_m - vehicle.x_m;
      const dz = z_m - vehicle.z_m;
      const distance_m = Math.hypot(dx, dz);
      // Para quien camina, la camioneta es un círculo algo menor que su largo.
      const reach_m = VEHICLE.body_radius_m * 0.8 + bodyRadius_m;
      if (distance_m >= reach_m || distance_m < 1e-6) return [x_m, z_m];
      return [vehicle.x_m + (dx / distance_m) * reach_m, vehicle.z_m + (dz / distance_m) * reach_m];
    },
  };
}
