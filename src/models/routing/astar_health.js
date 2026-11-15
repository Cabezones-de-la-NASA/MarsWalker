// M14: ruta por salud. Es el mismo A* de M4 con un coste multidimensional.
// docs/modelosydb.md, sección 4, grupo D. Código puro: sin three.js ni DOM.
import {
  DOSE_RATE_USV_H, CORE_TEMP_BASE_C, ETA_SOLO, ETA_LEAD, ETA_FOLLOW,
} from '../physiology/defaults.js';
import { marsMetabolic_w } from '../physiology/metabolic.js';
import { vo2_lmin } from '../physiology/oxygen.js';
import {
  sustainable_w, vo2max_mlkgmin, hrMax_bpm, hrRest_bpm, heartRate_bpm,
} from '../physiology/cardio.js';
import { nominalCoreTemp_c } from '../physiology/thermal.js';
import { sweatRate_lh, dehydration_pct } from '../physiology/hydration.js';
import {
  groupPace, advanceGroupState, aggregateGroupState, memberStatus, STATUS_ORDER,
} from '../physiology/group.js';
import { ROUTING_DEFAULTS, segmentSlope_deg } from './o2_cost.js';
import { aStarSearch } from './astar_core.js';
import { buildSearchGrid, nearestNode, nodesToPath, pathStats, MAX_NODES_PER_SIDE } from './astar_o2.js';

// [diseño] M14: peso de cada dimensión.
export const DIMENSION_WEIGHTS = Object.freeze({
  slope: 0.15,
  metabolic: 0.2,
  heart_rate: 0.15,
  oxygen: 0.25,
  thermal: 0.1,
  hydration: 0.1,
  radiation: 0.05,
});

// [diseño] M14: preajustes de dimensiones activas.
export const PRESETS = Object.freeze({
  clasico: Object.freeze(['slope']),
  cientifico: Object.freeze(['slope', 'oxygen']),
  balanceado: Object.freeze(['slope', 'metabolic', 'heart_rate', 'oxygen']),
  seguridad: Object.freeze(Object.keys(DIMENSION_WEIGHTS)),
});

// [diseño] M14: margen de la ventana de búsqueda alrededor de A y B.
export const WINDOW_MARGIN = 0.4;

// Factor de pendiente: 1 + (theta / theta_seg)^2 hasta theta_seg; 5 + 0.5 (theta - theta_seg) arriba.
export function slopeDimension(slope_deg, maxSafe_deg = ROUTING_DEFAULTS.max_safe_deg) {
  return slope_deg <= maxSafe_deg
    ? 1 + (slope_deg / maxSafe_deg) ** 2
    : 5 + 0.5 * (slope_deg - maxSafe_deg);
}

/**
 * Factores fisiológicos de M14 para una pendiente con signo: el tramo se simula con M13
 * al ritmo sostenible del grupo y se toma el peor valor del grupo en cada dimensión.
 *
 * Hidratación: el documento pide "% de deshidratación / 2", que depende de lo caminado
 * antes. Para poder guardar el factor por pendiente se usa el % que se acumularía en una
 * hora a ese ritmo, descontando el agua que se bebe. Supuesto [diseño].
 */
export function physiologyFactors(group, slope_signed_deg) {
  const { members, cfg } = group;
  const pace = groupPace(members, slope_signed_deg, cfg, group.leader_index);
  const speed_ms = pace.speed_ms;
  let metabolic = 0;
  let heart_rate = 0;
  let oxygen = 0;
  let thermal = 0;
  let hydration = 0;
  members.forEach((member, i) => {
    const eta =
      members.length === 1 ? ETA_SOLO : i === group.leader_index ? ETA_LEAD : ETA_FOLLOW;
    const m_w = marsMetabolic_w({
      mass_kg: member.mass_kg,
      suit_true_mass_kg: cfg.suit.suit_true_mass_kg,
      speed_ms,
      slope_deg: slope_signed_deg,
      eta,
      g_mars_ms2: cfg.g_mars_ms2,
      g_earth_ms2: cfg.g_earth_ms2,
      gait_factor: cfg.gait_factor,
      pressure_overhead: cfg.suit.pressure_overhead,
    }).total_w;
    // metabólico: x^2 si x <= 1; 1 + 10 (x - 1) si no; x = M / M_sost del más limitado.
    const x = m_w / sustainable_w(member, cfg.rer);
    metabolic = Math.max(metabolic, x <= 1 ? x * x : 1 + 10 * (x - 1));
    // frecuencia cardíaca: (FC / FC_max)^2.
    const hr_max = hrMax_bpm(member.age);
    const hr = heartRate_bpm({
      vo2_mlkgmin: (vo2_lmin(m_w, cfg.rer) * 1000) / member.mass_kg,
      vo2max_mlkgmin: vo2max_mlkgmin(member),
      hr_rest_bpm: hrRest_bpm(member.fitness),
      hr_max_bpm: hr_max,
    });
    heart_rate = Math.max(heart_rate, (hr / hr_max) ** 2);
    // oxígeno: (M / v) / (600 / 1.2). Por metro, no por minuto.
    oxygen = Math.max(oxygen, m_w / speed_ms / (600 / 1.2));
    // térmico: max(0, (T - 37) / 1.5).
    const temp_c = nominalCoreTemp_c(m_w);
    thermal = Math.max(thermal, Math.max(0, (temp_c - CORE_TEMP_BASE_C) / 1.5));
    // hidratación: % de deshidratación / 2 (ver nota de arriba).
    const net_lh = Math.max(0, sweatRate_lh(m_w, temp_c) - cfg.water_intake_lh);
    hydration = Math.max(hydration, dehydration_pct(net_lh, member.mass_kg) / 2);
  });
  // radiación: (D_punto / 27.9) (1.2 / v).
  const radiation = (cfg.dose_rate_usv_h / DOSE_RATE_USV_H) * (1.2 / speed_ms);
  return { speed_ms, metabolic, heart_rate, oxygen, thermal, hydration, radiation };
}

/**
 * computeHealthRoute({ dem, start_m, goal_m, group, dimensions, options })
 *   group       createGroup(...) de src/models/physiology/group.js
 *   dimensions  lista de dimensiones activas o nombre de un preajuste (por defecto 'seguridad')
 *   options     { grid, max_safe_deg, window_margin, full_window }
 * -> salida de route.json con algorithm 'health', o { failed: true, error }.
 *
 * C_arista = d (1 + sum(w_k f_k) / sum(w_k)) sobre las dimensiones activas.
 */
export function computeHealthRoute({
  dem, start_m, goal_m, group, dimensions = 'seguridad', options = {},
}) {
  const active = typeof dimensions === 'string' ? PRESETS[dimensions] : dimensions;
  if (!active || active.length === 0 || active.some((key) => !(key in DIMENSION_WEIGHTS))) {
    return { failed: true, error: 'Dimensiones de coste no válidas.' };
  }
  const maxSafe_deg = options.max_safe_deg ?? ROUTING_DEFAULTS.max_safe_deg;
  const grid = options.grid ?? buildSearchGrid(dem, MAX_NODES_PER_SIDE);
  const { rows, cols, x_m, z_m, elevation_m, slope_deg, spacing_m } = grid;

  const start = nearestNode(grid, dem, start_m);
  const goal = nearestNode(grid, dem, goal_m);
  if (start < 0) return { failed: true, error: 'El punto de inicio está fuera del mapa.' };
  if (goal < 0) return { failed: true, error: 'El punto de destino está fuera del mapa.' };

  // Optimización: ventana alrededor de A y B con 40 % de margen.
  let bounds;
  if (!options.full_window) {
    const margin = options.window_margin ?? WINDOW_MARGIN;
    const [r0, r1] = [Math.floor(start / cols), Math.floor(goal / cols)].sort((a, b) => a - b);
    const [c0, c1] = [start % cols, goal % cols].sort((a, b) => a - b);
    const pad = Math.ceil(margin * Math.max(r1 - r0, c1 - c0, 400 / spacing_m));
    bounds = {
      rowMin: Math.max(0, r0 - pad),
      rowMax: Math.min(rows - 1, r1 + pad),
      colMin: Math.max(0, c0 - pad),
      colMax: Math.min(cols - 1, c1 + pad),
    };
  }

  // Optimización: los factores fisiológicos se guardan por grado entero de pendiente con signo.
  const weightSum = active.reduce((sum, key) => sum + DIMENSION_WEIGHTS[key], 0);
  const physiologyKeys = active.filter((key) => key !== 'slope');
  const cache = new Map();
  function physiologyPenalty(slope_signed_deg) {
    if (physiologyKeys.length === 0) return 0;
    const key = Math.round(slope_signed_deg);
    if (!cache.has(key)) {
      const factors = physiologyFactors(group, key);
      cache.set(key, physiologyKeys.reduce((sum, k) => sum + DIMENSION_WEIGHTS[k] * factors[k], 0));
    }
    return cache.get(key);
  }
  const slopeWeight = active.includes('slope') ? DIMENSION_WEIGHTS.slope : 0;

  const goalX_m = x_m[goal % cols];
  const goalZ_m = z_m[Math.floor(goal / cols)];
  const search = aStarSearch({
    grid,
    start,
    goal,
    bounds,
    // Todos los factores son >= 0, así que C >= d y la distancia recta nunca sobreestima.
    heuristic: (node) => Math.hypot(x_m[node % cols] - goalX_m, z_m[Math.floor(node / cols)] - goalZ_m),
    edgeCost(node, next, distance_m) {
      const delta_elev_m = elevation_m[next] - elevation_m[node];
      const theta_deg = segmentSlope_deg(distance_m, delta_elev_m, slope_deg[next]);
      const along_deg = (Math.atan2(delta_elev_m, distance_m) * 180) / Math.PI;
      const weighted =
        slopeWeight * slopeDimension(theta_deg, maxSafe_deg) + physiologyPenalty(along_deg);
      return distance_m * (1 + weighted / weightSum);
    },
  });
  if (!search.found) {
    return { failed: true, error: 'No hay camino entre los dos puntos dentro de la ventana de búsqueda.' };
  }

  const stats = pathStats(grid, search.nodes, { max_safe_deg: maxSafe_deg });
  return {
    dataset_id: dem.dataset_id ?? null,
    algorithm: 'health',
    path_m: nodesToPath(grid, search.nodes),
    metrics: {
      distance_m: stats.distance_m,
      // O2 con el criterio de M3, para poder compararlo con la ruta clásica.
      oxygen_l: stats.oxygen_l,
      max_slope_deg: stats.max_slope_deg,
      risk_score: stats.risk_score,
      // Extras (no están en la sección 3).
      health_cost: search.cost,
      dimensions: [...active],
    },
  };
}

/**
 * Camina la ruta con advanceGroupState y acumula lo que le pasa al grupo.
 * options: { ambient_temp_c }  (por defecto -56 °C, la media nominal de M17)
 * -> { time_h, distance_m, o2_used_l, peak_metabolic_w, peak_heart_rate_bpm,
 *      peak_core_temp_c, minutes_over_sustainable, worst_status, final_group, summary }
 */
export function simulateRoute(path_m, dem, group, options = {}) {
  const ambient_temp_c = options.ambient_temp_c ?? -56;
  let current = group;
  let distance_m = 0;
  let peak_metabolic_w = 0;
  let peak_heart_rate_bpm = 0;
  let peak_core_temp_c = -Infinity;
  let minutes_over_sustainable = 0;
  let worst_status = 'nominal';

  for (let i = 1; i < path_m.length; i++) {
    const [ax, az] = path_m[i - 1];
    const [bx, bz] = path_m[i];
    const step_m = Math.hypot(bx - ax, bz - az);
    if (step_m === 0) continue;
    const delta_elev_m = dem.sampleElevation_m(bx, bz) - dem.sampleElevation_m(ax, az);
    const before_h = current.elapsed_h;
    current = advanceGroupState(
      {
        // Pendiente a lo largo del camino: es la que hace trabajar al cuerpo.
        slope_deg: (Math.atan(Math.abs(delta_elev_m) / step_m) * 180) / Math.PI,
        delta_elev_m,
        surface_distance_m: step_m,
        ambient_temp_c,
      },
      current,
    );
    distance_m += step_m;
    const minutes = (current.elapsed_h - before_h) * 60;
    let anyOver = false;
    for (const state of current.states) {
      peak_metabolic_w = Math.max(peak_metabolic_w, state.metabolic_w);
      peak_heart_rate_bpm = Math.max(peak_heart_rate_bpm, state.heart_rate_bpm);
      peak_core_temp_c = Math.max(peak_core_temp_c, state.core_temp_c);
      anyOver ||= state.flags.over_sustainable;
      const status = memberStatus(state.flags);
      if (STATUS_ORDER.indexOf(status) > STATUS_ORDER.indexOf(worst_status)) worst_status = status;
    }
    if (anyOver) minutes_over_sustainable += minutes;
  }

  const o2_capacity_l = group.cfg.suit.o2_capacity_l;
  return {
    time_h: current.elapsed_h - group.elapsed_h,
    distance_m,
    // O2 del miembro que más consumió.
    o2_used_l: Math.max(...current.states.map((state, i) => (group.states[i]?.o2_l ?? o2_capacity_l) - state.o2_l)),
    peak_metabolic_w,
    peak_heart_rate_bpm,
    peak_core_temp_c: Number.isFinite(peak_core_temp_c) ? peak_core_temp_c : CORE_TEMP_BASE_C,
    minutes_over_sustainable,
    worst_status,
    summary: aggregateGroupState(current),
    final_group: current,
  };
}

const COMPARED = [
  'time_h', 'distance_m', 'o2_used_l', 'peak_metabolic_w', 'peak_heart_rate_bpm',
  'peak_core_temp_c', 'minutes_over_sustainable',
];

/**
 * Compara dos resultados de simulateRoute (ruta clásica y ruta por salud).
 * -> { metrica: { classic, health, diff, diff_pct } }, con diff = health - classic.
 */
export function compareRoutes(classic, health) {
  const out = {};
  for (const key of COMPARED) {
    const a = classic[key];
    const b = health[key];
    out[key] = { classic: a, health: b, diff: b - a, diff_pct: a !== 0 ? ((b - a) / a) * 100 : null };
  }
  out.worst_status = { classic: classic.worst_status, health: health.worst_status };
  return out;
}
