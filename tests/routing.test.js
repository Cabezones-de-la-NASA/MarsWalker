import test from 'node:test';
import assert from 'node:assert/strict';
import { createDem } from '../src/models/terrain/dem.js';
import {
  ROUTING_DEFAULTS,
  segmentO2Cost_l,
  slopeFactor,
  gradeFactor,
  safetyPenalty,
  flatCostPerMeter_l,
} from '../src/models/routing/o2_cost.js';
import { createMinHeap } from '../src/models/routing/binary_heap.js';
import { computeRoute, buildSearchGrid, MAX_NODES_PER_SIDE } from '../src/models/routing/astar_o2.js';

const DEG = Math.PI / 180;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

function makeDem(rows, cols, resolution_m, elevationAt) {
  const data = new Float32Array(rows * cols);
  const size_m = [cols * resolution_m, rows * resolution_m];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      data[row * cols + col] = elevationAt(
        (col + 0.5) * resolution_m - size_m[0] / 2,
        (row + 0.5) * resolution_m - size_m[1] / 2,
      );
    }
  }
  return createDem({ dataset_id: 'test', shape: [rows, cols], size_m, resolution_m }, data);
}

// Muro triangular de 40° que cruza el mapa de norte a sur en x = 0.
// gap: deja un paso llano en el extremo sur (z > gapFrom_m).
function wallDem({ gap }) {
  const half_m = 60;
  const height_m = half_m * Math.tan(40 * DEG);
  return makeDem(60, 60, 20, (x_m, z_m) => {
    if (gap && z_m > 400) return 0;
    return Math.max(0, height_m * (1 - Math.abs(x_m) / half_m));
  });
}

// ---------------------------------------------------------------- M3

test('M3: constantes de diseño', () => {
  assert.equal(ROUTING_DEFAULTS.q_base_lh, 50);
  assert.equal(ROUTING_DEFAULTS.speed_ms, 1.2);
  assert.equal(ROUTING_DEFAULTS.max_safe_deg, 25);
});

test('M3: en plano C = q_base d / (v 3600)', () => {
  const cost_l = segmentO2Cost_l({ distance_m: 1200, delta_elev_m: 0, slope_deg: 0 });
  close(cost_l, (50 * 1200) / (1.2 * 3600));
  close(flatCostPerMeter_l() * 1200, cost_l);
  close(segmentO2Cost_l({ distance_m: 0, delta_elev_m: 0 }), 0);
});

test('M3: subir cuesta más que bajar', () => {
  for (const slope_deg of [2, 7, 12, 18, 23, 30]) {
    const rise_m = 100 * Math.tan(slope_deg * DEG);
    const up_l = segmentO2Cost_l({ distance_m: 100, delta_elev_m: rise_m, slope_deg });
    const down_l = segmentO2Cost_l({ distance_m: 100, delta_elev_m: -rise_m, slope_deg });
    const flat_l = segmentO2Cost_l({ distance_m: 100, delta_elev_m: 0, slope_deg: 0 });
    assert.ok(up_l > down_l, `${slope_deg}°: ${up_l} vs ${down_l}`);
    assert.ok(up_l > flat_l);
  }
});

test('M3: por encima de 25° cuesta al menos 45 veces más', () => {
  const flat_l = segmentO2Cost_l({ distance_m: 100, delta_elev_m: 0, slope_deg: 0 });
  for (const slope_deg of [25.01, 26, 30, 40]) {
    const rise_m = 100 * Math.tan(slope_deg * DEG);
    for (const delta_elev_m of [rise_m, -rise_m, 0]) {
      const cost_l = segmentO2Cost_l({ distance_m: 100, delta_elev_m, slope_deg });
      assert.ok(cost_l >= 45 * flat_l * 0.8, `${slope_deg}°: ${cost_l / flat_l}`);
    }
    assert.ok(safetyPenalty(slope_deg) >= 45);
  }
  // En plano sobre una ladera de más de 25°: exactamente f * P veces el coste llano.
  close(segmentO2Cost_l({ distance_m: 100, delta_elev_m: 0, slope_deg: 30 }) / flat_l, 5 * (45 + 8 * 25));
});

test('M3: tabla f(theta), bajada, c(g) y P(theta)', () => {
  assert.deepEqual(
    [0, 4.9, 5, 9.9, 10, 15, 20, 25, 25.1, 60].map((s) => slopeFactor(s)),
    [1, 1, 1.35, 1.35, 1.85, 2.6, 3.6, 3.6, 5, 5],
  );
  close(slopeFactor(12, true), 1 + 0.25 * 0.85);
  close(slopeFactor(2, true), 1);
  close(gradeFactor(0.1), 1.45);
  close(gradeFactor(0), 1);
  close(gradeFactor(-0.1), 0.92);
  close(gradeFactor(-1), 0.8);
  close(safetyPenalty(10), 1);
  close(safetyPenalty(18.75), 1);
  close(safetyPenalty(25), 3.5);
  close(safetyPenalty(27), 45 + 8 * 4);
});

test('M3: usa la mayor entre la pendiente del nodo y la del tramo', () => {
  const gentleNode_l = segmentO2Cost_l({ distance_m: 100, delta_elev_m: 0, slope_deg: 0 });
  const steepNode_l = segmentO2Cost_l({ distance_m: 100, delta_elev_m: 0, slope_deg: 12 });
  close(steepNode_l / gentleNode_l, 1.85);
});

// ------------------------------------------------------- montículo

test('montículo binario: devuelve las prioridades en orden', () => {
  const heap = createMinHeap();
  const input = [5, 3, 9, 1, 4, 1, 8, 2, 7, 6, 0, 3.5];
  input.forEach((priority, i) => heap.push(priority, i));
  assert.equal(heap.size, input.length);
  const out = [];
  while (heap.size > 0) out.push(heap.pop().priority);
  assert.deepEqual(out, [...input].sort((a, b) => a - b));
  assert.equal(heap.pop(), null);
});

// ---------------------------------------------------------------- M4

test('M4: la malla de búsqueda tiene como mucho 256 nodos por lado', () => {
  const dem = makeDem(600, 520, 20, () => 0);
  const grid = buildSearchGrid(dem);
  assert.equal(MAX_NODES_PER_SIDE, 256);
  assert.ok(grid.rows <= 256 && grid.cols <= 256);
  assert.equal(grid.spacing_m, 60);
});

test('M4: la salida tiene la forma de route.json con algorithm astar', () => {
  const dem = makeDem(40, 40, 20, () => 0);
  const route = computeRoute({ dem, start_m: [-300, -300], goal_m: [300, 300] });
  assert.equal(route.dataset_id, 'test');
  assert.equal(route.algorithm, 'astar');
  assert.ok(Array.isArray(route.path_m) && route.path_m.every((p) => p.length === 2));
  for (const key of ['distance_m', 'oxygen_l', 'max_slope_deg', 'risk_score']) {
    assert.ok(Number.isFinite(route.metrics[key]), key);
  }
});

test('M4: en plano la ruta es casi recta y cuesta lo que dice M3', () => {
  const dem = makeDem(100, 100, 20, () => -2500);
  const start_m = [-810, -610];
  const goal_m = [790, 390];
  const route = computeRoute({ dem, start_m, goal_m });
  const first = route.path_m[0];
  const last = route.path_m.at(-1);
  const straight_m = Math.hypot(last[0] - first[0], last[1] - first[1]);
  // En una malla de 8 vecinos el camino más corto mide como mucho ~8 % más que la recta.
  assert.ok(route.metrics.distance_m <= straight_m * 1.083, `${route.metrics.distance_m} vs ${straight_m}`);
  close(route.metrics.oxygen_l, route.metrics.distance_m * flatCostPerMeter_l(), 1e-9);
  assert.equal(route.metrics.max_slope_deg, 0);
  assert.equal(route.metrics.risk_score, 0);
  close(route.metrics.time_s, route.metrics.distance_m / 1.2);
  // Ningún punto se aleja de la recta más de lo que permite la malla.
  const [ux, uz] = [(last[0] - first[0]) / straight_m, (last[1] - first[1]) / straight_m];
  for (const [x_m, z_m] of route.path_m) {
    const off_m = Math.abs((x_m - first[0]) * uz - (z_m - first[1]) * ux);
    assert.ok(off_m <= straight_m * 0.25, `desvío de ${off_m} m`);
  }
});

test('M4: con una pared de 40° entre A y B la rodea y max_slope_deg <= 25', () => {
  const dem = wallDem({ gap: true });
  const route = computeRoute({ dem, start_m: [-400, -300], goal_m: [400, -300] });
  assert.ok(!route.failed);
  assert.ok(route.metrics.max_slope_deg <= 25, `pendiente máxima ${route.metrics.max_slope_deg}`);
  // Para rodearla tiene que bajar hasta el paso del sur (z > 400 m).
  assert.ok(route.path_m.some(([, z_m]) => z_m > 400));
  assert.ok(route.metrics.distance_m > 1400);
});

test('M4: sin paso, cruza la pared solo si no está prohibido', () => {
  const dem = wallDem({ gap: false });
  const args = { dem, start_m: [-400, 0], goal_m: [400, 0] };
  const crossing = computeRoute(args);
  assert.ok(!crossing.failed);
  assert.ok(crossing.metrics.max_slope_deg > 25);
  const forbidden = computeRoute({ ...args, config: { forbid_unsafe: true } });
  assert.equal(forbidden.failed, true);
  assert.equal(typeof forbidden.error, 'string');
});

test('M4: puntos fuera del mapa -> { failed: true, error }', () => {
  const dem = makeDem(20, 20, 20, () => 0);
  for (const bad of [[5000, 0], [0, -5000], [NaN, 0]]) {
    assert.equal(computeRoute({ dem, start_m: bad, goal_m: [0, 0] }).failed, true);
    assert.equal(computeRoute({ dem, start_m: [0, 0], goal_m: bad }).failed, true);
  }
});

test('M4: inicio y destino en el mismo nodo -> ruta de un punto con coste 0', () => {
  const dem = makeDem(20, 20, 20, () => 0);
  const route = computeRoute({ dem, start_m: [3, 3], goal_m: [4, 4] });
  assert.equal(route.path_m.length, 1);
  assert.equal(route.metrics.oxygen_l, 0);
});

test('M4: con la heurística por 0.8, A* da el mismo coste que Dijkstra', () => {
  // Terreno ondulado con subidas y bajadas, donde bajar cuesta menos que el plano.
  const dem = makeDem(80, 80, 20, (x_m, z_m) =>
    60 * Math.sin(x_m / 260) * Math.cos(z_m / 190) + 0.06 * x_m - 0.04 * z_m,
  );
  const grid = buildSearchGrid(dem);
  for (const [start_m, goal_m] of [
    [[-700, -700], [700, 700]],
    [[700, -500], [-600, 650]],
    [[-750, 100], [750, -100]],
  ]) {
    const astar = computeRoute({ dem, start_m, goal_m, config: { grid } });
    const dijkstra = computeRoute({ dem, start_m, goal_m, config: { grid, heuristic_scale: 0 } });
    close(astar.metrics.oxygen_l, dijkstra.metrics.oxygen_l, 1e-9);
  }
});

test('perfil de elevación: distancia acumulada, elevación y pendiente por tramo', async () => {
  const { buildElevationProfile } = await import('../src/models/routing/profile.js');
  // Rampa de 30° hacia el este.
  const dem = makeDem(40, 40, 20, (x_m) => x_m * Math.tan(30 * DEG));
  const profile = buildElevationProfile(dem, [[-200, 0], [-100, 0], [0, 0], [0, 100]]);
  assert.equal(profile.length, 4);
  assert.deepEqual(profile.map((s) => Math.round(s.distance_m)), [0, 100, 200, 300]);
  assert.equal(profile[0].slope_deg, 0);
  close(profile[1].slope_deg, 30, 0.05);
  // De lado sobre la ladera: el tramo no sube, pero el terreno sigue a 30°.
  close(profile[3].slope_deg, 30, 0.05);
  close(profile[2].elevation_m - profile[1].elevation_m, 100 * Math.tan(30 * DEG), 0.01);
  const flat = buildElevationProfile(makeDem(10, 10, 20, () => 5), [[0, 0], [40, 0]]);
  assert.deepEqual(flat.map((s) => s.slope_deg), [0, 0]);
});
