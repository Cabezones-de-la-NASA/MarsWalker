// Escenario de viento y visibilidad para el juego. τ describe una columna de
// atmósfera; el alcance horizontal depende también del polvo cercano al suelo.
export const NOMINAL_DUST_TAU = 0.5;
export const STORM_DUST_TAU = 4;
export const MAX_DUST_TAU = 8.5;
export const STORM_TIMING = Object.freeze({ approach_s: 8, build_s: 9, settle_s: 24 });

const DEG = Math.PI / 180;
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (n) => Math.min(Math.max(n, 0), 1);
const smooth = (n) => {
  const t = clamp01(n);
  return t * t * (3 - 2 * t);
};

export function dustAmount(tau) {
  return clamp01((tau - NOMINAL_DUST_TAU) / (STORM_DUST_TAU - NOMINAL_DUST_TAU));
}

export function sampleDust(tau, elapsed_s = 0) {
  const dust_tau = Math.min(MAX_DUST_TAU, Math.max(0, tau));
  const load = dustAmount(dust_tau);
  const dense = smooth(load);
  const extreme = clamp01((dust_tau - STORM_DUST_TAU) / (MAX_DUST_TAU - STORM_DUST_TAU));
  const pulse = clamp01(0.52 + 0.23 * Math.sin(elapsed_s * 0.9)
    + 0.16 * Math.sin(elapsed_s * 0.34 + 1.1) + 0.08 * Math.sin(elapsed_s * 2.03 + 0.4));
  const gust = pulse * dense;
  const wind_ms = mix(3.1, 17.0, dense) + (0.8 + 10.5 * dense) * pulse;
  // Acimut de procedencia: en este escenario entra del noroeste.
  const wind_from_deg = 308 + 10 * Math.sin(elapsed_s * 0.11) + 7 * Math.sin(elapsed_s * 0.28 + 1.4);
  const bearing = wind_from_deg * DEG;
  const visibility_m = Math.max(
    26,
    5550 * Math.exp(-3.77 * load - 1.5 * extreme) * (1 - 0.33 * gust),
  );
  return {
    dust_tau, load, gust, wind_ms, wind_from_deg, visibility_m,
    wind_x_ms: -Math.sin(bearing) * wind_ms,
    wind_z_ms: Math.cos(bearing) * wind_ms,
  };
}

export function stormTransition({ start_tau, target_tau, elapsed_s, active }) {
  if (!active) {
    const t = clamp01(elapsed_s / STORM_TIMING.settle_s);
    if (t === 1) return { dust_tau: target_tau, phase: 'calm', done: true };
    // Decae primero la capa cercana; el polvo fino deja una cola más lenta.
    const settled = (1 - Math.exp(-3.2 * t)) / (1 - Math.exp(-3.2));
    return { dust_tau: mix(start_tau, target_tau, settled), phase: 'settling', done: false };
  }
  const { approach_s, build_s } = STORM_TIMING;
  const front_tau = start_tau + Math.max(0, target_tau - start_tau) * 0.36;
  if (elapsed_s < approach_s) {
    return { dust_tau: mix(start_tau, front_tau, smooth(elapsed_s / approach_s)), phase: 'approaching', done: false };
  }
  const t = clamp01((elapsed_s - approach_s) / build_s);
  return { dust_tau: mix(front_tau, target_tau, smooth(t)), phase: t === 1 ? 'active' : 'crossing', done: t === 1 };
}
