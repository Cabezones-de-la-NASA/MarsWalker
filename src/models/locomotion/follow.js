// Seguimiento: un vehículo que acompaña a un objetivo que se mueve. Código puro.
// Lo usa el rover que sigue al astronauta en el modo a pie.

export const FOLLOW = Object.freeze({
  // [diseño] El rover real avanza a centímetros por segundo; aquí acompaña el paso del
  // astronauta. Es una licencia del juego, no un dato del vehículo.
  max_speed_ms: 2.4,
  // [diseño] Se queda a esta distancia y arranca de nuevo al alejarse un poco más.
  keep_distance_m: 4.2,
  resume_distance_m: 5.4,
  acceleration_ms2: 1.6,
  turn_rate_deg_s: 110,
  // [diseño] Si el astronauta se aleja más que esto (un salto de zona), reaparece cerca.
  teleport_distance_m: 60,
});

function turnToward(angle, target, maxStep) {
  let diff = (target - angle) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= maxStep ? target : angle + Math.sign(diff) * maxStep;
}

/**
 * Avanza al seguidor un paso de tiempo. Devuelve un estado nuevo.
 * follower: { x_m, z_m, yaw_rad, speed_ms, moving }   yaw 0 mira a +Z y crece hacia +X
 * target:   { x_m, z_m }
 */
export function stepFollower(follower, target, dt_s, cfg = FOLLOW) {
  const dx = target.x_m - follower.x_m;
  const dz = target.z_m - follower.z_m;
  const distance_m = Math.hypot(dx, dz);

  if (distance_m > cfg.teleport_distance_m) {
    // Reaparece a la distancia de acompañamiento, del lado del que venía.
    const k = cfg.keep_distance_m / distance_m;
    return {
      x_m: target.x_m - dx * k,
      z_m: target.z_m - dz * k,
      yaw_rad: Math.atan2(dx, dz),
      speed_ms: 0,
      moving: false,
    };
  }

  // Histéresis: para al llegar a keep_distance y no arranca hasta resume_distance.
  const moving = follower.moving ? distance_m > cfg.keep_distance_m : distance_m > cfg.resume_distance_m;
  // Al acercarse reduce la velocidad para no pasarse.
  const wanted_ms = moving ? Math.min(cfg.max_speed_ms, (distance_m - cfg.keep_distance_m) * 1.5 + 0.3) : 0;
  const delta = cfg.acceleration_ms2 * dt_s;
  const speed_ms =
    wanted_ms > follower.speed_ms
      ? Math.min(wanted_ms, follower.speed_ms + delta)
      : Math.max(wanted_ms, follower.speed_ms - delta * 2);

  let yaw_rad = follower.yaw_rad;
  if (distance_m > 1e-6 && (moving || speed_ms > 0)) {
    yaw_rad = turnToward(yaw_rad, Math.atan2(dx, dz), ((cfg.turn_rate_deg_s * Math.PI) / 180) * dt_s);
  }
  // Avanza hacia donde mira, sin entrar en la distancia de acompañamiento.
  const step_m = Math.min(speed_ms * dt_s, Math.max(0, distance_m - cfg.keep_distance_m));
  return {
    x_m: follower.x_m + Math.sin(yaw_rad) * step_m,
    z_m: follower.z_m + Math.cos(yaw_rad) * step_m,
    yaw_rad,
    speed_ms,
    moving,
  };
}
