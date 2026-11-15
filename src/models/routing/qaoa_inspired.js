// M15: corredor por capas, planificador INSPIRADO en QAOA.
//
// AVISO OBLIGATORIO: esto es un heurístico clásico inspirado en QAOA. No ejecuta un
// circuito cuántico ni promete ventaja cuántica. Así hay que decirlo en el código y
// en la interfaz.
//
// Referencia: Farhi, Goldstone y Gutmann (2014), "A Quantum Approximate Optimization
// Algorithm", arXiv:1411.4028. Su resumen dice que el algoritmo produce soluciones
// aproximadas de problemas de optimización combinatoria, que depende de un entero
// positivo p y que la calidad de la aproximación mejora al aumentar p.
// Los nombres de aquí siguen los de ese algoritmo:
//   p      número de rondas; aquí p = 4.
//   gamma  ángulo del paso que aplica el coste; aquí es el factor que empuja los pesos
//          hacia los candidatos de menor energía.
//   beta   ángulo del paso de mezcla; aquí es la proporción en que cada peso se reparte
//          con sus vecinos laterales.
// (p sale del resumen del artículo; el papel de gamma y beta, del cuerpo del artículo,
// que no se consultó en línea para este archivo.)
// Aquí no hay estados cuánticos ni amplitudes: son pesos reales sobre candidatos.
//
// docs/modelosydb.md, sección 4, grupo E. Código puro: sin three.js ni DOM.
import { sampleSlope_deg, riskIndex } from '../terrain/slope.js';
import { ROUTING_DEFAULTS, segmentO2Cost_l, segmentSlope_deg, safetyPenalty } from './o2_cost.js';

export const QAOA_NOTICE =
  'Algoritmo clásico inspirado en QAOA, el algoritmo cuántico de optimización aproximada. Como el original, alterna 4 rondas de un paso de coste y otro de mezcla; el original lo hace sobre cúbits y este sobre pesos reales de rutas candidatas, en un ordenador corriente.';

// Todas las constantes de M15 son [diseño].
export const MIN_LAYERS = 18;
export const MAX_LAYERS = 48;
export const CANDIDATES_PER_LAYER = 25;
// Mitad del ancho del corredor: min(max(0.42 d_AB, 400 m), 0.38 lado del mapa) sen(pi t).
const CORRIDOR_FRACTION = 0.42;
const CORRIDOR_MIN_M = 400;
const CORRIDOR_MAP_FRACTION = 0.38;
// p = 4 rondas con sus (gamma, beta): gamma crece y beta baja, primero explora y luego se concentra.
export const ROUNDS = Object.freeze([
  Object.freeze({ gamma: 0.45, beta: 0.65 }),
  Object.freeze({ gamma: 0.85, beta: 0.45 }),
  Object.freeze({ gamma: 1.35, beta: 0.28 }),
  Object.freeze({ gamma: 2.1, beta: 0.12 }),
]);

// El documento dice "de 18 a 48 capas" sin dar la regla. Supuesto [diseño]: una capa cada
// 150 m de distancia entre A y B, dentro de ese rango.
const LAYER_SPACING_M = 150;
// El documento pide tomar al final "el camino de menor energía total" con programación
// dinámica sobre las capas. Leído al pie de la letra, esa búsqueda es exacta sobre todo el
// corredor y los pesos de las rondas no cambian el camino elegido: quedan como diagnóstico
// (metrics.mean_path_weight). Con un valor mayor que 0 aquí, la programación dinámica solo
// usaría los candidatos cuyo peso final llega a esa fracción del peso uniforme; en el
// dataset sintético eso empeora el O2 hasta un 50 % frente a A*, así que queda en 0.
const SURVIVAL_FRACTION = 0;
// Entre dos candidatos el terreno se muestrea cada tantos metros.
const SAMPLE_EVERY_M = 20;

// Q(theta) de M15.
export function corridorPenalty(slope_deg, maxSafe_deg = ROUTING_DEFAULTS.max_safe_deg) {
  if (slope_deg > maxSafe_deg) return 55 + 9.5 * (slope_deg - maxSafe_deg) ** 2;
  if (slope_deg > 0.7 * maxSafe_deg) {
    return 3.8 * ((slope_deg - 0.7 * maxSafe_deg) / (0.3 * maxSafe_deg)) ** 2;
  }
  return 0;
}

// Recorre el tramo entre dos puntos en pasos cortos y acumula lo que M3 y M15 necesitan.
function measureSegment(dem, a, b, settings) {
  const length_m = Math.hypot(b.x_m - a.x_m, b.z_m - a.z_m);
  const steps = Math.max(1, Math.ceil(length_m / SAMPLE_EVERY_M));
  let oxygen_l = 0;
  let base_l = 0; // C_O2 / P: el coste de M3 sin su penalización de seguridad
  let max_slope_deg = 0;
  let riskTimesDistance = 0;
  let prevElev = dem.sampleElevation_m(a.x_m, a.z_m);
  for (let i = 1; i <= steps; i++) {
    const x_m = a.x_m + ((b.x_m - a.x_m) * i) / steps;
    const z_m = a.z_m + ((b.z_m - a.z_m) * i) / steps;
    const elev_m = dem.sampleElevation_m(x_m, z_m);
    const step_m = length_m / steps;
    const delta_elev_m = elev_m - prevElev;
    const node_deg = sampleSlope_deg(dem, x_m, z_m);
    const theta_deg = segmentSlope_deg(step_m, delta_elev_m, node_deg);
    const cost_l = segmentO2Cost_l({ distance_m: step_m, delta_elev_m, slope_deg: node_deg, config: settings });
    oxygen_l += cost_l;
    base_l += cost_l / safetyPenalty(theta_deg, settings.max_safe_deg);
    max_slope_deg = Math.max(max_slope_deg, theta_deg);
    riskTimesDistance += riskIndex(theta_deg, settings.max_safe_deg) * step_m;
    prevElev = elev_m;
  }
  return { length_m, oxygen_l, base_l, max_slope_deg, riskTimesDistance };
}

/**
 * computeCorridorRoute({ dem, start_m, goal_m, config }) -> misma salida que computeRoute
 * (route.json, sección 3) con algorithm 'qaoa', o { failed: true, error }.
 */
export function computeCorridorRoute({ dem, start_m, goal_m, config = {} }) {
  const settings = { ...ROUTING_DEFAULTS, survival_fraction: SURVIVAL_FRACTION, ...config };
  const [width_m, depth_m] = dem.size_m;
  const inside = ([x_m, z_m]) =>
    Number.isFinite(x_m) && Number.isFinite(z_m) &&
    Math.abs(x_m) <= width_m / 2 && Math.abs(z_m) <= depth_m / 2;
  if (!inside(start_m)) return { failed: true, error: 'El punto de inicio está fuera del mapa.' };
  if (!inside(goal_m)) return { failed: true, error: 'El punto de destino está fuera del mapa.' };

  const dx_m = goal_m[0] - start_m[0];
  const dz_m = goal_m[1] - start_m[1];
  const distance_ab_m = Math.hypot(dx_m, dz_m);
  if (distance_ab_m < 1e-6) {
    return {
      dataset_id: dem.dataset_id ?? null,
      algorithm: 'qaoa',
      path_m: [[start_m[0], start_m[1]]],
      metrics: { distance_m: 0, oxygen_l: 0, max_slope_deg: 0, risk_score: 0, time_s: 0 },
    };
  }

  // ---- Construcción: S capas transversales con K candidatos; las capas 0 y S tienen un nodo.
  const S = Math.min(Math.max(Math.ceil(distance_ab_m / LAYER_SPACING_M), MIN_LAYERS), MAX_LAYERS);
  const K = CANDIDATES_PER_LAYER;
  const halfWidthMax_m = Math.min(
    Math.max(CORRIDOR_FRACTION * distance_ab_m, CORRIDOR_MIN_M),
    CORRIDOR_MAP_FRACTION * Math.min(width_m, depth_m),
  );
  // Vector unitario perpendicular a AB.
  const nx = -dz_m / distance_ab_m;
  const nz = dx_m / distance_ab_m;

  const layers = [];
  for (let s = 0; s <= S; s++) {
    const t = s / S;
    const cx_m = start_m[0] + dx_m * t;
    const cz_m = start_m[1] + dz_m * t;
    if (s === 0 || s === S) {
      layers.push([{ x_m: cx_m, z_m: cz_m, u: 0, valid: true }]);
      continue;
    }
    const half_m = halfWidthMax_m * Math.sin(Math.PI * t);
    const layer = [];
    for (let k = 0; k < K; k++) {
      const u = -1 + (2 * k) / (K - 1); // posición lateral normalizada, de -1 a 1
      const x_m = cx_m + nx * u * half_m;
      const z_m = cz_m + nz * u * half_m;
      layer.push({ x_m, z_m, u, valid: inside([x_m, z_m]) });
    }
    layers.push(layer);
  }

  // ---- Energías H_ab entre candidatos de capas consecutivas.
  // H_ab = (C_O2 / P) [1 + 1.35 (theta / theta_seg)^2 + Q(theta)] (1 + 0.45 du^2)
  // du es el salto lateral normalizado a [-1, 1]: (u_b - u_a) / 2.
  const H = []; // H[s][j][k]: del candidato j de la capa s al k de la capa s + 1
  const segments = [];
  for (let s = 0; s < S; s++) {
    const from = layers[s];
    const to = layers[s + 1];
    const energies = [];
    const measured = [];
    for (let j = 0; j < from.length; j++) {
      const row = new Float64Array(to.length);
      const rowSegments = new Array(to.length);
      for (let k = 0; k < to.length; k++) {
        if (!from[j].valid || !to[k].valid) {
          row[k] = Infinity;
          continue;
        }
        const m = measureSegment(dem, from[j], to[k], settings);
        const du = (to[k].u - from[j].u) / 2;
        row[k] =
          m.base_l *
          (1 + 1.35 * (m.max_slope_deg / settings.max_safe_deg) ** 2 +
            corridorPenalty(m.max_slope_deg, settings.max_safe_deg)) *
          (1 + 0.45 * du * du);
        rowSegments[k] = m;
      }
      energies.push(row);
      measured.push(rowSegments);
    }
    H.push(energies);
    segments.push(measured);
  }

  // ---- Iteración: pesos uniformes y p rondas de (gamma, beta).
  let weights = layers.map((layer) => {
    const valid = layer.filter((c) => c.valid).length || 1;
    return Float64Array.from(layer, (c) => (c.valid ? 1 / valid : 0));
  });
  for (const { gamma, beta } of ROUNDS) {
    const next = weights.map((w) => Float64Array.from(w));
    for (let s = 1; s < S; s++) {
      const layer = layers[s];
      // E_k = sum_j w_j^(s-1) H_jk + sum_m w_m^(s+1) H_km
      const energy = new Float64Array(layer.length).fill(Infinity);
      let lowest = Infinity;
      for (let k = 0; k < layer.length; k++) {
        if (!layer[k].valid) continue;
        let e = 0;
        for (let j = 0; j < layers[s - 1].length; j++) {
          if (weights[s - 1][j] > 0) e += weights[s - 1][j] * H[s - 1][j][k];
        }
        for (let m = 0; m < layers[s + 1].length; m++) {
          if (weights[s + 1][m] > 0) e += weights[s + 1][m] * H[s][k][m];
        }
        energy[k] = e;
        lowest = Math.min(lowest, e);
      }
      // Paso de coste: w_k <- w_k exp(-gamma (E_k - E_min) / max(E_min, 0.5))
      const scaled = new Float64Array(layer.length);
      for (let k = 0; k < layer.length; k++) {
        scaled[k] = Number.isFinite(energy[k])
          ? weights[s][k] * Math.exp((-gamma * (energy[k] - lowest)) / Math.max(lowest, 0.5))
          : 0;
      }
      // Paso de mezcla: cada peso se reparte con sus vecinos laterales en proporción beta.
      let total = 0;
      for (let k = 0; k < layer.length; k++) {
        if (!layer[k].valid) {
          next[s][k] = 0;
          continue;
        }
        const left = k > 0 ? scaled[k - 1] : scaled[k];
        const right = k < layer.length - 1 ? scaled[k + 1] : scaled[k];
        next[s][k] = (1 - beta) * scaled[k] + (beta * (left + right)) / 2;
        total += next[s][k];
      }
      // Normalizar.
      if (total > 0) for (let k = 0; k < layer.length; k++) next[s][k] /= total;
    }
    weights = next;
  }

  // ---- Programación dinámica sobre las capas: camino de menor energía total.
  const alive = layers.map((layer, s) =>
    layer.map((c, k) => c.valid && weights[s][k] >= settings.survival_fraction / layer.length),
  );
  const best = layers.map((layer) => new Float64Array(layer.length).fill(Infinity));
  const back = layers.map((layer) => new Int32Array(layer.length).fill(-1));
  best[0][0] = 0;
  for (let s = 0; s < S; s++) {
    for (let j = 0; j < layers[s].length; j++) {
      if (!Number.isFinite(best[s][j])) continue;
      for (let k = 0; k < layers[s + 1].length; k++) {
        if (!alive[s + 1][k]) continue;
        const candidate = best[s][j] + H[s][j][k];
        if (candidate < best[s + 1][k]) {
          best[s + 1][k] = candidate;
          back[s + 1][k] = j;
        }
      }
    }
  }
  if (!Number.isFinite(best[S][0])) {
    return { failed: true, error: 'El corredor no encontró un camino entre los dos puntos.' };
  }

  const picks = new Array(S + 1);
  picks[S] = 0;
  for (let s = S; s > 0; s--) picks[s - 1] = back[s][picks[s]];

  // ---- Métricas con el criterio de M3 y M4 (incluida la penalización P), para comparar.
  let distance_m = 0;
  let oxygen_l = 0;
  let max_slope_deg = 0;
  let riskTimesDistance = 0;
  for (let s = 0; s < S; s++) {
    const m = segments[s][picks[s]][picks[s + 1]];
    distance_m += m.length_m;
    oxygen_l += m.oxygen_l;
    max_slope_deg = Math.max(max_slope_deg, m.max_slope_deg);
    riskTimesDistance += m.riskTimesDistance;
  }

  return {
    dataset_id: dem.dataset_id ?? null,
    algorithm: 'qaoa',
    path_m: picks.map((k, s) => [layers[s][k].x_m, layers[s][k].z_m]),
    metrics: {
      distance_m,
      oxygen_l,
      max_slope_deg,
      risk_score: distance_m > 0 ? riskTimesDistance / distance_m : 0,
      // Extras (no están en la sección 3).
      time_s: distance_m / settings.speed_ms,
      energy: best[S][0],
      layers: S,
      // Peso medio que las rondas dejaron en los candidatos del camino, relativo al uniforme.
      mean_path_weight:
        picks.slice(1, S).reduce((sum, k, i) => sum + weights[i + 1][k] * layers[i + 1].length, 0) /
        Math.max(1, S - 1),
    },
  };
}
