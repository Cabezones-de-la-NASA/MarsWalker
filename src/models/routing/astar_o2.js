// M4: búsqueda A* del camino de menor coste de oxígeno (M3) entre dos puntos.
// docs/modelosydb.md, sección 4, grupo B. Código puro: sin three.js ni DOM.
import { sampleSlope_deg, riskIndex } from '../terrain/slope.js';
import {
  ROUTING_DEFAULTS,
  MIN_COST_FACTOR,
  flatCostPerMeter_l,
  segmentO2Cost_l,
  segmentSlope_deg,
} from './o2_cost.js';
import { aStarSearch } from './astar_core.js';

// M4: máximo de nodos por lado de la malla de búsqueda.
export const MAX_NODES_PER_SIDE = 256;

/**
 * Malla de búsqueda: el DEM submuestreado a como mucho MAX_NODES_PER_SIDE nodos por lado.
 * Cada nodo cubre un bloque de stride x stride celdas; su elevación es la del centro del
 * bloque y su pendiente es la mayor de las celdas del bloque, para no saltarse un escarpe.
 */
export function buildSearchGrid(dem, maxNodesPerSide = MAX_NODES_PER_SIDE) {
  const stride = Math.max(1, Math.ceil(Math.max(dem.rows, dem.cols) / maxNodesPerSide));
  const rows = Math.ceil(dem.rows / stride);
  const cols = Math.ceil(dem.cols / stride);
  const spacing_m = stride * dem.resolution_m;
  const [width_m, depth_m] = dem.size_m;

  const x_m = new Float64Array(cols);
  const z_m = new Float64Array(rows);
  for (let col = 0; col < cols; col++) {
    x_m[col] = Math.min((col + 0.5) * spacing_m, width_m - dem.resolution_m / 2) - width_m / 2;
  }
  for (let row = 0; row < rows; row++) {
    z_m[row] = Math.min((row + 0.5) * spacing_m, depth_m - dem.resolution_m / 2) - depth_m / 2;
  }

  const elevation_m = new Float64Array(rows * cols);
  const slope_deg = new Float64Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const node = row * cols + col;
      elevation_m[node] = dem.sampleElevation_m(x_m[col], z_m[row]);
      let steepest_deg = 0;
      for (let dr = 0; dr < stride; dr++) {
        for (let dc = 0; dc < stride; dc++) {
          const cellRow = Math.min(row * stride + dr, dem.rows - 1);
          const cellCol = Math.min(col * stride + dc, dem.cols - 1);
          const cx_m = (cellCol + 0.5) * dem.resolution_m - width_m / 2;
          const cz_m = (cellRow + 0.5) * dem.resolution_m - depth_m / 2;
          steepest_deg = Math.max(steepest_deg, sampleSlope_deg(dem, cx_m, cz_m));
        }
      }
      slope_deg[node] = steepest_deg;
    }
  }
  return { rows, cols, spacing_m, x_m, z_m, elevation_m, slope_deg };
}

export function nearestNode(grid, dem, point_m) {
  const [width_m, depth_m] = dem.size_m;
  const [px_m, pz_m] = point_m;
  if (
    !Number.isFinite(px_m) || !Number.isFinite(pz_m) ||
    Math.abs(px_m) > width_m / 2 || Math.abs(pz_m) > depth_m / 2
  ) {
    return -1;
  }
  const col = Math.min(Math.max(Math.floor((px_m + width_m / 2) / grid.spacing_m), 0), grid.cols - 1);
  const row = Math.min(Math.max(Math.floor((pz_m + depth_m / 2) / grid.spacing_m), 0), grid.rows - 1);
  return row * grid.cols + col;
}

/**
 * computeRoute({ dem, start_m, goal_m, config }) -> salida de route.json (sección 3)
 * con algorithm 'astar', o { failed: true, error } si no hay camino.
 *
 * start_m, goal_m: [x_m, z_m].
 * config (todo opcional):
 *   q_base_lh, speed_ms, max_safe_deg   constantes de M3 (ROUTING_DEFAULTS)
 *   forbid_unsafe      true = no cruzar tramos de más de max_safe_deg (por defecto false:
 *                      M3 los penaliza pero A* puede usarlos si no hay otra opción)
 *   max_nodes_per_side nodos por lado, como mucho 256
 *   heuristic_scale    1 por defecto; 0 convierte la búsqueda en Dijkstra (para pruebas)
 *   grid               malla ya construida con buildSearchGrid, para no recalcularla
 */
export function computeRoute({ dem, start_m, goal_m, config = {} }) {
  const settings = { ...ROUTING_DEFAULTS, forbid_unsafe: false, heuristic_scale: 1, ...config };
  const maxNodes = Math.min(settings.max_nodes_per_side ?? MAX_NODES_PER_SIDE, MAX_NODES_PER_SIDE);
  const grid = settings.grid ?? buildSearchGrid(dem, maxNodes);
  const { cols, x_m, z_m, elevation_m, slope_deg } = grid;

  const start = nearestNode(grid, dem, start_m);
  const goal = nearestNode(grid, dem, goal_m);
  if (start < 0) return { failed: true, error: 'El punto de inicio está fuera del mapa.' };
  if (goal < 0) return { failed: true, error: 'El punto de destino está fuera del mapa.' };

  // M4: h(n) = distancia recta(n, B) * q_base / (3600 v).
  // Se multiplica por 0.8 (el menor factor posible de M3, al bajar) para que h nunca
  // sobreestime; sin ese factor A* no garantiza el óptimo. Decisión del equipo: el
  // documento da la fórmula sin el 0.8.
  const hPerMeter_l = flatCostPerMeter_l(settings) * MIN_COST_FACTOR * settings.heuristic_scale;
  const goalX_m = x_m[goal % cols];
  const goalZ_m = z_m[Math.floor(goal / cols)];
  const heuristic_l = (node) =>
    Math.hypot(x_m[node % cols] - goalX_m, z_m[Math.floor(node / cols)] - goalZ_m) * hPerMeter_l;

  const search = aStarSearch({
    grid,
    start,
    goal,
    heuristic: heuristic_l,
    edgeCost(node, next, distance_m) {
      const delta_elev_m = elevation_m[next] - elevation_m[node];
      if (
        settings.forbid_unsafe &&
        segmentSlope_deg(distance_m, delta_elev_m, slope_deg[next]) > settings.max_safe_deg
      ) {
        return Infinity;
      }
      return segmentO2Cost_l({ distance_m, delta_elev_m, slope_deg: slope_deg[next], config: settings });
    },
  });

  if (!search.found) {
    return {
      failed: true,
      error: `No hay camino entre los dos puntos sin cruzar pendientes de más de ${settings.max_safe_deg}°.`,
    };
  }
  const { nodes } = search;

  const stats = pathStats(grid, nodes, settings);

  return {
    dataset_id: dem.dataset_id ?? null,
    algorithm: 'astar',
    path_m: nodesToPath(grid, nodes),
    metrics: {
      distance_m: stats.distance_m,
      oxygen_l: search.cost,
      max_slope_deg: stats.max_slope_deg,
      // M4: promedio de M2 ponderado por distancia.
      risk_score: stats.risk_score,
      // Extra (no está en la sección 3): tiempo de marcha a velocidad constante.
      time_s: stats.distance_m / settings.speed_ms,
    },
  };
}

export function nodesToPath(grid, nodes) {
  return nodes.map((node) => [grid.x_m[node % grid.cols], grid.z_m[Math.floor(node / grid.cols)]]);
}

/**
 * Métricas de un camino sobre la malla, con el criterio de M3 y M4:
 * distancia, O2 (M3), pendiente máxima y riesgo (M2 ponderado por distancia).
 */
export function pathStats(grid, nodes, config = {}) {
  const settings = { ...ROUTING_DEFAULTS, ...config };
  const { cols, x_m, z_m, elevation_m, slope_deg } = grid;
  let distance_m = 0;
  let oxygen_l = 0;
  let max_slope_deg = 0;
  let riskTimesDistance = 0;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const step_m = Math.hypot(
      x_m[b % cols] - x_m[a % cols],
      z_m[Math.floor(b / cols)] - z_m[Math.floor(a / cols)],
    );
    const delta_elev_m = elevation_m[b] - elevation_m[a];
    const theta_deg = segmentSlope_deg(step_m, delta_elev_m, slope_deg[b]);
    distance_m += step_m;
    oxygen_l += segmentO2Cost_l({ distance_m: step_m, delta_elev_m, slope_deg: slope_deg[b], config: settings });
    max_slope_deg = Math.max(max_slope_deg, theta_deg);
    riskTimesDistance += riskIndex(theta_deg, settings.max_safe_deg) * step_m;
  }
  return {
    distance_m,
    oxygen_l,
    max_slope_deg,
    risk_score: distance_m > 0 ? riskTimesDistance / distance_m : 0,
  };
}
