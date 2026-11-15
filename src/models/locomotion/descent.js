// Descenso en paracaídas hasta la superficie. Código puro: sin three.js ni DOM.
// Es una puesta en escena del juego [diseño]: un descenso real en Marte es mucho más
// rápido y termina con retrocohetes; aquí se baja despacio para mirar el paisaje.

export const DESCENT = Object.freeze({
  // [diseño] Altura de inicio sobre el suelo y duración total a tiempo real (12.5 min).
  start_altitude_m: 900,
  duration_s: 750,
  // [diseño] Tramo final: los últimos flare_altitude_m se bajan en flare_s, más despacio.
  flare_altitude_m: 12,
  flare_s: 20,
  // [diseño] Balanceo bajo el paracaídas: amplitud en grados y periodo en segundos.
  sway_deg: 5,
  sway_period_s: 7,
  // [diseño] Giro lento sobre el eje vertical, en grados por segundo.
  spin_deg_s: 1.5,
  // [diseño] Velocidades disponibles con la tecla T: a 100× el descenso dura 7.5 s.
  time_scales: Object.freeze([1, 4, 16, 60, 100]),
});

/**
 * Estado del descenso a los t_s segundos (tiempo simulado).
 * -> { altitude_m, speed_ms (hacia abajo), sway_rad, spin_rad, remaining_s, progress, landed }
 */
export function descentState(t_s, cfg = DESCENT) {
  const t = Math.min(Math.max(t_s, 0), cfg.duration_s);
  const cruise_s = cfg.duration_s - cfg.flare_s;
  const cruise_ms = (cfg.start_altitude_m - cfg.flare_altitude_m) / cruise_s;
  const flare_ms = cfg.flare_altitude_m / cfg.flare_s;
  const altitude_m = t <= cruise_s
    ? cfg.start_altitude_m - cruise_ms * t
    : cfg.flare_altitude_m - flare_ms * (t - cruise_s);
  const landed = t_s >= cfg.duration_s;
  // El balanceo se apaga al acercarse al suelo.
  const calm = Math.min(altitude_m / cfg.flare_altitude_m, 1);
  return {
    altitude_m: Math.max(altitude_m, 0),
    speed_ms: landed ? 0 : t <= cruise_s ? cruise_ms : flare_ms,
    sway_rad: ((cfg.sway_deg * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / cfg.sway_period_s) * calm,
    spin_rad: ((cfg.spin_deg_s * Math.PI) / 180) * t,
    remaining_s: cfg.duration_s - t,
    progress: t / cfg.duration_s,
    landed,
  };
}
