// Camioneta de superficie: conducción tipo coche sobre el terreno. Código puro.
// Es una licencia del juego para recorrer el mapa deprisa; no modela un vehículo real.
import { slopeSpeedFactor } from './kinematics.js';

export const VEHICLE = Object.freeze({
  // [diseño] Velocidad máxima: diez veces el paso del astronauta (1.2 m/s).
  max_speed_ms: 12,
  // [diseño] Marcha atrás, lenta.
  reverse_speed_ms: 3,
  acceleration_ms2: 4,
  brake_ms2: 9,
  // [diseño] Sin pisar nada, la camioneta se frena sola.
  coast_ms2: 2.2,
  // [diseño] Giro máximo, en grados por segundo, a partir de steer_full_speed_ms.
  turn_rate_deg_s: 75,
  steer_full_speed_ms: 3,
  // [diseño] Sube más que una persona: frena desde 12° y no pasa de 38°.
  slow_from_deg: 12,
  max_climb_deg: 38,
  min_climb_factor: 0.3,
  // [diseño] Radio del círculo de colisión y distancia para subirse, en metros.
  body_radius_m: 2.1,
  board_reach_m: 4.5,
});

/**
 * Avanza la camioneta un paso de tiempo. Devuelve un estado nuevo.
 *
 * state  { x_m, z_m, yaw_rad, speed_ms }   yaw 0 mira a +Z (sur) y crece hacia +X (este);
 *        speed_ms con signo: negativa en marcha atrás.
 * input  { throttle, steer }   de -1 a 1; steer > 0 gira a la derecha del conductor
 * env    { groundAt(x_m, z_m), resolveCollision(x_m, z_m) -> [x_m, z_m], halfWidth_m, halfDepth_m }
 */
export function stepVehicle(state, input, env, dt_s, cfg = VEHICLE) {
  let { speed_ms, yaw_rad } = state;
  const fx = Math.sin(yaw_rad);
  const fz = Math.cos(yaw_rad);

  // Pendiente en el sentido de la marcha, medida a lo largo de la camioneta.
  const probe_m = 1.5;
  const direction = speed_ms < 0 || (speed_ms === 0 && input.throttle < 0) ? -1 : 1;
  const ahead_m = env.groundAt(state.x_m + fx * probe_m * direction, state.z_m + fz * probe_m * direction);
  const here_m = env.groundAt(state.x_m, state.z_m);
  const along_deg = (Math.atan2(ahead_m - here_m, probe_m) * 180) / Math.PI;
  const slope = slopeSpeedFactor(along_deg, cfg);

  const wanted_ms = input.throttle >= 0
    ? input.throttle * cfg.max_speed_ms * slope
    : input.throttle * cfg.reverse_speed_ms * slope;
  let rate_ms2 = cfg.coast_ms2;
  if (input.throttle !== 0) {
    // Pisar en contra del movimiento es frenar.
    rate_ms2 = Math.sign(input.throttle) === Math.sign(speed_ms) || speed_ms === 0 ? cfg.acceleration_ms2 : cfg.brake_ms2;
  }
  // Una cuesta que ya no se puede subir frena con fuerza.
  if (Math.abs(speed_ms) > Math.abs(wanted_ms)) rate_ms2 = Math.max(rate_ms2, cfg.coast_ms2 + (1 - slope) * cfg.brake_ms2);
  const gap_ms = wanted_ms - speed_ms;
  speed_ms += Math.sign(gap_ms) * Math.min(Math.abs(gap_ms), rate_ms2 * dt_s);

  // Solo gira si se mueve; en marcha atrás el giro se invierte, como en un coche.
  const grip = Math.min(Math.abs(speed_ms) / cfg.steer_full_speed_ms, 1);
  yaw_rad -= input.steer * grip * Math.sign(speed_ms) * ((cfg.turn_rate_deg_s * Math.PI) / 180) * dt_s;

  const wantX_m = state.x_m + Math.sin(yaw_rad) * speed_ms * dt_s;
  const wantZ_m = state.z_m + Math.cos(yaw_rad) * speed_ms * dt_s;
  let [x_m, z_m] = env.resolveCollision(wantX_m, wantZ_m);
  x_m = Math.min(Math.max(x_m, -env.halfWidth_m), env.halfWidth_m);
  z_m = Math.min(Math.max(z_m, -env.halfDepth_m), env.halfDepth_m);
  // Un choque o el borde del mapa se llevan la velocidad.
  const wanted_m = Math.hypot(wantX_m - state.x_m, wantZ_m - state.z_m);
  const done_m = Math.hypot(x_m - state.x_m, z_m - state.z_m);
  if (wanted_m > 1e-9 && done_m < wanted_m * 0.5) speed_ms *= 0.5;

  return { x_m, z_m, yaw_rad, speed_ms };
}

// Dónde queda el astronauta al bajarse: a la izquierda de la camioneta.
export function exitPosition(state, cfg = VEHICLE) {
  const offset_m = cfg.body_radius_m + 0.9;
  return [state.x_m + Math.cos(state.yaw_rad) * offset_m, state.z_m - Math.sin(state.yaw_rad) * offset_m];
}
