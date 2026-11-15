// Misión "Primer contacto": dos muestras cerca de la cápsula, una tormenta que llega a
// los 20 s de recoger la primera y refugio en la base, que queda detrás de la cápsula. Código puro: sin three.js ni DOM.
// Todo aquí es diseño del juego [diseño]; ningún valor es un dato de Marte.
import { sampleSlope_deg } from '../terrain/slope.js';

export const SORTIE = Object.freeze({
  // [diseño] Cápsula -> muestra 1 -> muestra 2, y de ahí a la base. return_leg_m es el
  // lado muestra 2 -> cápsula del triángulo; con la base detrás, el recorrido total es
  // de unos 120 m: algo más de minuto y medio a 1.2 m/s.
  first_leg_m: 30,
  second_leg_m: 35,
  return_leg_m: 35,
  // [diseño] La tormenta llega este tiempo después de recoger la primera muestra.
  storm_delay_s: 20,
  // [diseño] Segundos manteniendo E para recoger una muestra, y a qué distancia.
  collect_hold_s: 2,
  collect_reach_m: 4,
  // [diseño] A esta distancia de la primera roca el tutorial pide saltar.
  jump_hint_m: 14,
  // [diseño] La base queda detrás de la cápsula, en el lado opuesto a las rocas, a esta
  // distancia de ella. Desde la segunda roca son unos 55 m.
  base_behind_m: 25,
  // [diseño] Distancia a la base que cuenta como haber llegado.
  home_reach_m: 10,
  // [diseño] Las muestras se buscan en terreno de menos de esta pendiente (M1).
  max_slope_deg: 15,
});

/**
 * Coloca las dos muestras alrededor del punto de aterrizaje.
 * Prueba rumbos de 30° en 30° y se queda con el primero en que las dos caen dentro del
 * mapa y en pendiente suave; si ninguno cumple, con el de menor pendiente máxima.
 * home_m: [x_m, z_m]; bounds: { halfWidth_m, halfDepth_m }
 * -> { samples_m: [[x, z], [x, z]], base_m: [x, z], bearing_rad, worst_slope_deg }
 */
export function planFirstSortie(dem, home_m, bounds, cfg = SORTIE) {
  // Ángulo en la cápsula para que el tercer lado mida second_leg_m (teorema del coseno).
  const cosApex = (cfg.first_leg_m ** 2 + cfg.return_leg_m ** 2 - cfg.second_leg_m ** 2)
    / (2 * cfg.first_leg_m * cfg.return_leg_m);
  const apex_rad = Math.acos(Math.min(Math.max(cosApex, -1), 1));
  const inside = ([x_m, z_m]) => Math.abs(x_m) <= bounds.halfWidth_m && Math.abs(z_m) <= bounds.halfDepth_m;
  const clamp = ([x_m, z_m]) => [
    Math.min(Math.max(x_m, -bounds.halfWidth_m), bounds.halfWidth_m),
    Math.min(Math.max(z_m, -bounds.halfDepth_m), bounds.halfDepth_m),
  ];
  let best = null;
  // Segunda vuelta (pegado al borde del mapa, donde nada cabe entero): los puntos que se
  // salen se arriman al borde en vez de descartar el rumbo.
  for (let step = 0; step < 24 && !(step === 12 && best); step++) {
    const squeeze = step >= 12;
    const bearing_rad = (step * Math.PI) / 6;
    let first = [
      home_m[0] + Math.sin(bearing_rad) * cfg.first_leg_m,
      home_m[1] + Math.cos(bearing_rad) * cfg.first_leg_m,
    ];
    let second = [
      home_m[0] + Math.sin(bearing_rad + apex_rad) * cfg.return_leg_m,
      home_m[1] + Math.cos(bearing_rad + apex_rad) * cfg.return_leg_m,
    ];
    // La base, al otro lado de la cápsula respecto al punto medio de las dos rocas.
    const away_rad = bearing_rad + apex_rad / 2 + Math.PI;
    let base = [
      home_m[0] + Math.sin(away_rad) * cfg.base_behind_m,
      home_m[1] + Math.cos(away_rad) * cfg.base_behind_m,
    ];
    if (squeeze) [first, second, base] = [clamp(first), clamp(second), clamp(base)];
    else if (!inside(first) || !inside(second) || !inside(base)) continue;
    const worst_slope_deg = Math.max(
      sampleSlope_deg(dem, first[0], first[1]), sampleSlope_deg(dem, second[0], second[1]),
      sampleSlope_deg(dem, base[0], base[1]),
    );
    const plan = { samples_m: [first, second], base_m: base, bearing_rad, worst_slope_deg };
    if (worst_slope_deg <= cfg.max_slope_deg) return plan;
    if (!best || worst_slope_deg < best.worst_slope_deg) best = plan;
  }
  return best;
}

/**
 * Estado de la misión.
 *   phase       'intro' | 'to_first' | 'to_second' | 'return' | 'done'
 *               ('intro' es el tutorial: inspeccionar la cápsula)
 *   jumped      si ya se saltó de camino a la primera roca (parte del tutorial)
 *   collected   muestras recogidas (0 a 2)
 *   storm_in_s  segundos hasta la tormenta; null antes del aviso; 0 cuando ya llegó
 *   storm       true cuando la tormenta está encima
 *   elapsed_s   tiempo de misión
 *   beat_storm  al terminar: true si se volvió antes de que llegara
 */
export function createSortieState() {
  return { phase: 'intro', jumped: false, collected: 0, storm_in_s: null, storm: false, elapsed_s: 0, beat_storm: null };
}

// Avanza el reloj de la misión y la cuenta atrás de la tormenta.
export function stepSortie(state, dt_s) {
  if (state.phase === 'done') return state;
  let { storm_in_s, storm } = state;
  if (storm_in_s !== null && !storm) {
    storm_in_s = Math.max(0, storm_in_s - dt_s);
    storm = storm_in_s === 0;
  }
  return { ...state, elapsed_s: state.elapsed_s + dt_s, storm_in_s, storm };
}

// Tutorial, paso 1: inspeccionar la cápsula abre el camino a la primera roca.
export function inspectCapsule(state) {
  return state.phase === 'intro' ? { ...state, phase: 'to_first' } : state;
}

// Tutorial, paso 2: hay que saltar una vez de camino a la primera roca.
export function registerJump(state) {
  return state.phase === 'to_first' && !state.jumped ? { ...state, jumped: true } : state;
}

// La primera muestra solo se puede tomar después de haber saltado.
export const canCollect = (state) => state.phase === 'to_second' || (state.phase === 'to_first' && state.jumped);

// Recoger una muestra: la primera dispara el aviso de tormenta; la segunda manda a casa.
export function collectSample(state, cfg = SORTIE) {
  if (!canCollect(state)) return state;
  if (state.phase === 'to_first') {
    return { ...state, phase: 'to_second', collected: 1, storm_in_s: cfg.storm_delay_s };
  }
  if (state.phase === 'to_second') return { ...state, phase: 'return', collected: 2 };
  return state;
}

// Llegar a la base: solo termina la misión si ya se tienen las dos muestras.
export function arriveHome(state) {
  if (state.phase !== 'return') return state;
  return { ...state, phase: 'done', beat_storm: !state.storm };
}

// A dónde hay que ir ahora: 'capsule' (tutorial), índice de muestra (0 o 1), 'home' (la
// base) o null al terminar.
export function sortieTarget(state) {
  return { intro: 'capsule', to_first: 0, to_second: 1, return: 'home', done: null }[state.phase];
}
