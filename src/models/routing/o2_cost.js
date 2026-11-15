// M3: coste de oxígeno por tramo. docs/modelosydb.md, sección 4, grupo B.
// Código puro: sin three.js ni DOM.

export const ROUTING_DEFAULTS = Object.freeze({
  // [diseño] M3: consumo base de O2, 50 L/h (≈ 0.83 L/min a ~250 W).
  q_base_lh: 50,
  // [diseño] M3: velocidad de marcha.
  speed_ms: 1.2,
  // [diseño] M2/M3: pendiente límite segura, theta_seg.
  max_safe_deg: 25,
});

// [diseño] M3: tabla f(theta) subiendo. Cada fila es [límite inferior en grados, factor];
// el límite inferior pertenece al tramo (5° exactos -> 1.35). El documento no define los bordes.
const SLOPE_FACTOR_TABLE = [
  [25, 5.0],
  [20, 3.6],
  [15, 2.6],
  [10, 1.85],
  [5, 1.35],
  [0, 1.0],
];

// [diseño] M3: el último tramo de la tabla es "> 25°": 25° exactos aún son el tramo 20–25°.
function uphillSlopeFactor(slope_deg) {
  if (slope_deg > 25) return 5.0;
  for (const [from_deg, factor] of SLOPE_FACTOR_TABLE) {
    if (from_deg < 25 && slope_deg >= from_deg) return factor;
  }
  return 1.0;
}

// f(theta): tabla subiendo; bajando f = max(0.85, 1 + 0.25 (f - 1)) [diseño].
export function slopeFactor(slope_deg, descending = false) {
  const f = uphillSlopeFactor(slope_deg);
  return descending ? Math.max(0.85, 1 + 0.25 * (f - 1)) : f;
}

// c(g): g = dz / d. Subiendo 1 + 4.5 g; bajando max(0.8, 1 + 0.8 g) [diseño].
export function gradeFactor(grade) {
  return grade > 0 ? 1 + 4.5 * grade : Math.max(0.8, 1 + 0.8 * grade);
}

// P(theta): penalización por acercarse o pasar del límite seguro [diseño].
export function safetyPenalty(slope_deg, maxSafe_deg = ROUTING_DEFAULTS.max_safe_deg) {
  if (slope_deg > maxSafe_deg) {
    return 45 + 8 * (slope_deg - maxSafe_deg) ** 2;
  }
  if (slope_deg > 0.75 * maxSafe_deg) {
    return 1 + 2.5 * ((slope_deg - 0.75 * maxSafe_deg) / (0.25 * maxSafe_deg)) ** 2;
  }
  return 1;
}

// Menor valor posible de f * c * P: f >= 1, c >= 0.8, P >= 1.
// Lo usa la heurística de A* (M4) para no sobreestimar.
export const MIN_COST_FACTOR = 0.8;

// Coste base en plano por metro: q_base / (3600 v), en litros por metro.
export function flatCostPerMeter_l(config = {}) {
  const { q_base_lh, speed_ms } = { ...ROUTING_DEFAULTS, ...config };
  return q_base_lh / (3600 * speed_ms);
}

/**
 * M3: C = (q_base / 3600) f(theta) c(g) (d / v) P(theta), en litros de O2.
 *
 * distance_m    distancia horizontal del tramo
 * delta_elev_m  desnivel con signo (positivo = sube)
 * slope_deg     pendiente del nodo de llegada; se usa la mayor entre esa y atan(|dz| / d)
 */
export function segmentO2Cost_l({ distance_m, delta_elev_m, slope_deg = 0, config = {} }) {
  if (distance_m <= 0) return 0;
  const { max_safe_deg } = { ...ROUTING_DEFAULTS, ...config };
  const theta_deg = segmentSlope_deg(distance_m, delta_elev_m, slope_deg);
  const grade = delta_elev_m / distance_m;
  return (
    flatCostPerMeter_l(config) *
    distance_m *
    slopeFactor(theta_deg, delta_elev_m < 0) *
    gradeFactor(grade) *
    safetyPenalty(theta_deg, max_safe_deg)
  );
}

// Pendiente que M3 aplica a un tramo: la mayor entre la del nodo y atan(|dz| / d).
export function segmentSlope_deg(distance_m, delta_elev_m, nodeSlope_deg = 0) {
  const along_deg = (Math.atan(Math.abs(delta_elev_m) / distance_m) * 180) / Math.PI;
  return Math.max(nodeSlope_deg, along_deg);
}
