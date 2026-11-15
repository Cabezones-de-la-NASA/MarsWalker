// Locomoción del astronauta a pie. Código puro: sin three.js ni DOM.
// Trabaja en metros y segundos, con los ejes de la escena (+X este, -Z norte, +Y arriba).
import { MARS_GRAVITY_MS2 } from '../../shared/constants.js';

export const LOCOMOTION = Object.freeze({
  // [diseño] Velocidad de marcha: la misma de M3 y el tope de M13 (1.2 m/s).
  walk_speed_ms: 1.2,
  // [diseño] Velocidad de carrera con traje. El documento del proyecto no la define.
  run_speed_ms: 2.2,
  // [diseño] El traje pesa: se tarda en arrancar y en frenar.
  acceleration_ms2: 2.0,
  deceleration_ms2: 3.0,
  // [diseño] Giro del cuerpo hacia la dirección de marcha, en grados por segundo.
  turn_rate_deg_s: 200,
  // [diseño] Impulso del salto. Con g = 3.71 m/s² sube v² / (2 g) ≈ 0.49 m.
  jump_speed_ms: 1.9,
  // [diseño] En el aire apenas se puede corregir la trayectoria.
  air_control: 0.25,
  // [diseño] Cuesta arriba la velocidad baja desde slow_from_deg hasta pararse en
  // max_climb_deg. El límite seguro de M2 (25°) queda en medio: se puede pasar, despacio.
  slow_from_deg: 8,
  max_climb_deg: 32,
  min_climb_factor: 0.25,
  // [diseño] Radio del cilindro de colisión del astronauta.
  body_radius_m: 0.35,
});

// Factor de velocidad por la pendiente en la dirección de marcha (con signo, en grados).
// Cuesta abajo no se acelera: el traje obliga a bajar con cuidado.
export function slopeSpeedFactor(alongSlope_deg, cfg = LOCOMOTION) {
  const climb_deg = Math.abs(alongSlope_deg);
  if (alongSlope_deg >= cfg.max_climb_deg) return 0;
  if (climb_deg <= cfg.slow_from_deg) return 1;
  const t = Math.min((climb_deg - cfg.slow_from_deg) / (cfg.max_climb_deg - cfg.slow_from_deg), 1);
  return 1 - (1 - cfg.min_climb_factor) * t;
}

// Acerca la velocidad horizontal actual a la deseada sin superar la aceleración permitida.
export function approachVelocity(vx, vz, targetX, targetZ, maxDelta) {
  const dx = targetX - vx;
  const dz = targetZ - vz;
  const gap = Math.hypot(dx, dz);
  if (gap <= maxDelta || gap === 0) return [targetX, targetZ];
  return [vx + (dx / gap) * maxDelta, vz + (dz / gap) * maxDelta];
}

// Gira un ángulo hacia otro por el camino corto, sin pasar de maxStep. Ángulos en radianes.
export function turnToward(angle, target, maxStep) {
  let diff = (target - angle) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return angle + Math.sign(diff) * maxStep;
}

/**
 * Avanza al astronauta un paso de tiempo. Devuelve un estado nuevo.
 *
 * state  { x_m, y_m, z_m, vx_ms, vy_ms, vz_ms, yaw_rad, grounded }
 *        yaw_rad: rumbo del cuerpo; 0 mira a +Z (sur) y crece hacia +X (este).
 * input  { dirX, dirZ, run, jump }   dirección deseada en el mundo (vector unitario o 0)
 * env    { groundAt(x_m, z_m), resolveCollision(x_m, z_m) -> [x_m, z_m], halfWidth_m, halfDepth_m,
 *          gravity_ms2 (opcional) }
 *        groundAt es la altura del suelo que se pisa.
 */
export function stepPlayer(state, input, env, dt_s, cfg = LOCOMOTION) {
  const gravity_ms2 = env.gravity_ms2 ?? MARS_GRAVITY_MS2;
  const moving = Math.hypot(input.dirX, input.dirZ) > 1e-6;
  let { vx_ms, vz_ms, vy_ms, yaw_rad } = state;

  // Velocidad deseada, frenada por la pendiente en la dirección de marcha.
  let targetX = 0;
  let targetZ = 0;
  if (moving) {
    const probe_m = 0.6;
    const ahead_m = env.groundAt(state.x_m + input.dirX * probe_m, state.z_m + input.dirZ * probe_m);
    const here_m = env.groundAt(state.x_m, state.z_m);
    const along_deg = (Math.atan2(ahead_m - here_m, probe_m) * 180) / Math.PI;
    const speed_ms = (input.run ? cfg.run_speed_ms : cfg.walk_speed_ms) * slopeSpeedFactor(along_deg, cfg);
    targetX = input.dirX * speed_ms;
    targetZ = input.dirZ * speed_ms;
  }
  const rate = moving ? cfg.acceleration_ms2 : cfg.deceleration_ms2;
  const control = state.grounded ? 1 : cfg.air_control;
  [vx_ms, vz_ms] = approachVelocity(vx_ms, vz_ms, targetX, targetZ, rate * control * dt_s);

  // El cuerpo gira hacia donde camina.
  if (moving) {
    yaw_rad = turnToward(yaw_rad, Math.atan2(input.dirX, input.dirZ), ((cfg.turn_rate_deg_s * Math.PI) / 180) * dt_s);
  }

  // Salto y gravedad marciana.
  let grounded = state.grounded;
  if (grounded && input.jump) {
    vy_ms = cfg.jump_speed_ms;
    grounded = false;
  }

  // Desplazamiento horizontal, colisiones y límites del mapa.
  let x_m = state.x_m + vx_ms * dt_s;
  let z_m = state.z_m + vz_ms * dt_s;
  [x_m, z_m] = env.resolveCollision(x_m, z_m);
  x_m = Math.min(Math.max(x_m, -env.halfWidth_m), env.halfWidth_m);
  z_m = Math.min(Math.max(z_m, -env.halfDepth_m), env.halfDepth_m);
  // Si algo lo frenó, la velocidad real es la del desplazamiento conseguido.
  if (dt_s > 0) {
    vx_ms = (x_m - state.x_m) / dt_s;
    vz_ms = (z_m - state.z_m) / dt_s;
  }

  const ground_m = env.groundAt(x_m, z_m);
  let y_m = state.y_m;
  if (grounded) {
    // Pegado al suelo: sigue la elevación sin atravesarla.
    y_m = ground_m;
    vy_ms = 0;
  } else {
    vy_ms -= gravity_ms2 * dt_s;
    y_m += vy_ms * dt_s;
    if (y_m <= ground_m) {
      y_m = ground_m;
      vy_ms = 0;
      grounded = true;
    }
  }

  return { x_m, y_m, z_m, vx_ms, vy_ms, vz_ms, yaw_rad, grounded };
}

export function horizontalSpeed_ms(state) {
  return Math.hypot(state.vx_ms, state.vz_ms);
}
