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
import { createMinHeap } from './binary_heap.js';

// M4: máximo de nodos por lado de la malla de búsqueda.
export const MAX_NODES_PER_SIDE = 256;

// 8 vecinos: [dfila, dcolumna].
const NEIGHBORS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

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

function nearestNode(grid, dem, point_m) {
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
  const { rows, cols, x_m, z_m, elevation_m, slope_deg } = grid;

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

  const cost_l = new Float64Array(rows * cols).fill(Infinity);
  const parent = new Int32Array(rows * cols).fill(-1);
  const closed = new Uint8Array(rows * cols);
  const open = createMinHeap();
  cost_l[start] = 0;
  open.push(heuristic_l(start), start);

  let found = false;
  while (open.size > 0) {
    const node = open.pop().value;
    if (closed[node]) continue;
    closed[node] = 1;
    if (node === goal) {
      found = true;
      break;
    }
    const row = Math.floor(node / cols);
    const col = node % cols;
    for (const [dRow, dCol] of NEIGHBORS) {
      const nRow = row + dRow;
      const nCol = col + dCol;
      if (nRow < 0 || nRow >= rows || nCol < 0 || nCol >= cols) continue;
      const next = nRow * cols + nCol;
      if (closed[next]) continue;
      const distance_m = Math.hypot(x_m[nCol] - x_m[col], z_m[nRow] - z_m[row]);
      const delta_elev_m = elevation_m[next] - elevation_m[node];
      if (
        settings.forbid_unsafe &&
        segmentSlope_deg(distance_m, delta_elev_m, slope_deg[next]) > settings.max_safe_deg
      ) {
        continue;
      }
      const candidate_l =
        cost_l[node] +
        segmentO2Cost_l({ distance_m, delta_elev_m, slope_deg: slope_deg[next], config: settings });
      if (candidate_l < cost_l[next]) {
        cost_l[next] = candidate_l;
        parent[next] = node;
        open.push(candidate_l + heuristic_l(next), next);
      }
    }
  }

  if (!found) {
    return {
      failed: true,
      error: `No hay camino entre los dos puntos sin cruzar pendientes de más de ${settings.max_safe_deg}°.`,
    };
  }

  const nodes = [];
  for (let node = goal; node !== -1; node = parent[node]) nodes.push(node);
  nodes.reverse();

  let distance_m = 0;
  let max_slope_deg = 0;
  let riskTimesDistance = 0;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const step_m = Math.hypot(
      x_m[b % cols] - x_m[a % cols],
      z_m[Math.floor(b / cols)] - z_m[Math.floor(a / cols)],
    );
    const theta_deg = segmentSlope_deg(step_m, elevation_m[b] - elevation_m[a], slope_deg[b]);
    distance_m += step_m;
    max_slope_deg = Math.max(max_slope_deg, theta_deg);
    riskTimesDistance += riskIndex(theta_deg, settings.max_safe_deg) * step_m;
  }

  return {
    dataset_id: dem.dataset_id ?? null,
    algorithm: 'astar',
    path_m: nodes.map((node) => [x_m[node % cols], z_m[Math.floor(node / cols)]]),
    metrics: {
      distance_m,
      oxygen_l: cost_l[goal],
      max_slope_deg,
      // M4: promedio de M2 ponderado por distancia.
      risk_score: distance_m > 0 ? riskTimesDistance / distance_m : 0,
      // Extra (no está en la sección 3): tiempo de marcha a velocidad constante.
      time_s: distance_m / settings.speed_ms,
    },
  };
}
