// Cámara del modo a pie: tercera persona (sigue al astronauta) y primera persona (visor).
import * as THREE from 'three';

// [diseño] Parámetros de cámara, en metros y radianes.
const EYE_HEIGHT_M = 1.74; // altura del visor del astronauta
const THIRD_DISTANCE_M = 5.2;
const VEHICLE_DISTANCE_M = 11; // en la camioneta la cámara se aleja
const THIRD_TARGET_HEIGHT_M = 1.45;
const MIN_GROUND_CLEARANCE_M = 0.35;
const LOOK_SENSITIVITY = 0.0024; // radianes por píxel de ratón
const PITCH_MIN = -1.2;
const PITCH_MAX_THIRD = 0.55;
const PITCH_MAX_FIRST = 1.35;
const PITCH_FREE = 1.5; // casi vertical: mirada libre durante el aterrizaje
const FOLLOW_STIFFNESS = 9; // cuanto mayor, más pegada va la cámara

/**
 * createFollowCamera(camera, groundAt) ->
 *   update(delta_s, player, look)   player: { x_m, y_m, z_m }; look: [dx_px, dy_px]
 *   toggle(), isFirstPerson(), yaw (rumbo de la cámara, radianes), snap(player)
 * yaw = 0 mira hacia +Z (sur) y crece hacia +X (este), igual que el rumbo del astronauta.
 */
export function createFollowCamera(camera, groundAt) {
  let yaw = Math.PI; // de entrada, mirando al norte
  let pitch = 0.22;
  let firstPerson = false;
  let freeLook = false;
  let shake_m = 0;
  let distance_m = THIRD_DISTANCE_M;
  let targetHeight_m = THIRD_TARGET_HEIGHT_M;
  let eyeHeight_m = EYE_HEIGHT_M;
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let needsSnap = true;

  function compute(player) {
    const cosPitch = Math.cos(pitch);
    // Dirección hacia la que mira la cámara.
    const dirX = Math.sin(yaw) * cosPitch;
    const dirY = -Math.sin(pitch);
    const dirZ = Math.cos(yaw) * cosPitch;
    if (firstPerson) {
      desired.set(player.x_m, player.y_m + eyeHeight_m, player.z_m);
      target.set(desired.x + dirX, desired.y + dirY, desired.z + dirZ);
    } else {
      target.set(player.x_m, player.y_m + targetHeight_m, player.z_m);
      desired.set(
        target.x - dirX * distance_m,
        target.y - dirY * distance_m,
        target.z - dirZ * distance_m,
      );
      // La cámara nunca se mete en el terreno: si la ladera sube detrás, se eleva.
      const floor_m = groundAt(desired.x, desired.z) + MIN_GROUND_CLEARANCE_M;
      if (desired.y < floor_m) desired.y = floor_m;
    }
  }

  return {
    get yaw() {
      return yaw;
    },
    isFirstPerson: () => firstPerson,
    toggle() {
      firstPerson = !firstPerson;
      pitch = Math.min(pitch, firstPerson ? PITCH_MAX_FIRST : PITCH_MAX_THIRD);
      needsSnap = true;
      return firstPerson;
    },
    // Coloca la cámara sin suavizado (al entrar o al cambiar de perspectiva).
    snap() {
      needsSnap = true;
    },
    setYaw(next) {
      yaw = next;
    },
    // Mirada libre: se puede mirar en cualquier dirección, de casi el cenit a casi el
    // nadir (el giro horizontal ya es de 360°). Se usa durante el aterrizaje.
    // Sacude la cámara amount_m metros; se apaga en medio segundo.
    shake(amount_m) {
      shake_m = amount_m;
    },
    setFreeLook(on) {
      freeLook = on;
      // Al terminar, la mirada vuelve a los límites normales.
      if (!on) pitch = THREE.MathUtils.clamp(pitch, PITCH_MIN, firstPerson ? PITCH_MAX_FIRST : PITCH_MAX_THIRD);
    },
    // En la camioneta la cámara va más lejos y más alta.
    setVehicleMode(on) {
      distance_m = on ? VEHICLE_DISTANCE_M : THIRD_DISTANCE_M;
      targetHeight_m = on ? 2.1 : THIRD_TARGET_HEIGHT_M;
      eyeHeight_m = on ? 2.05 : EYE_HEIGHT_M;
    },
    update(delta_s, player, look) {
      yaw -= look[0] * LOOK_SENSITIVITY;
      pitch = freeLook
        ? THREE.MathUtils.clamp(pitch + look[1] * LOOK_SENSITIVITY, -PITCH_FREE, PITCH_FREE)
        : THREE.MathUtils.clamp(
          pitch + look[1] * LOOK_SENSITIVITY, PITCH_MIN, firstPerson ? PITCH_MAX_FIRST : PITCH_MAX_THIRD,
        );
      compute(player);
      if (needsSnap || firstPerson) {
        position.copy(desired);
        needsSnap = false;
      } else {
        // Seguimiento suave e independiente de los cuadros por segundo.
        position.lerp(desired, 1 - Math.exp(-FOLLOW_STIFFNESS * delta_s));
        const floor_m = groundAt(position.x, position.z) + MIN_GROUND_CLEARANCE_M;
        if (position.y < floor_m) position.y = floor_m;
      }
      camera.position.copy(position);
      // Sacudida que se apaga sola (el golpe del aterrizaje).
      if (shake_m > 0.002) {
        camera.position.x += (Math.random() - 0.5) * shake_m;
        camera.position.y += (Math.random() - 0.5) * shake_m;
        shake_m *= Math.exp(-6 * delta_s);
      }
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
    },
  };
}
