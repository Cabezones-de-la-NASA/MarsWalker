import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDem } from '../src/models/terrain/dem.js';
import { computeRoute } from '../src/models/routing/astar_o2.js';
import {
  computeCorridorRoute, corridorPenalty, QAOA_NOTICE, ROUNDS, CANDIDATES_PER_LAYER,
  MIN_LAYERS, MAX_LAYERS,
} from '../src/models/routing/qaoa_inspired.js';

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

function syntheticDem() {
  const dir = new URL('../public/data/synthetic_crater/', import.meta.url);
  const metadata = JSON.parse(readFileSync(new URL('metadata.json', dir), 'utf8'));
  const bytes = readFileSync(new URL('heightmap.f32', dir));
  return createDem(metadata, new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
}

test('M15: aviso obligatorio y constantes de diseño', () => {
  assert.match(QAOA_NOTICE, /inspirado en QAOA/);
  // El aviso dice lo que es: un algoritmo clásico, y en qué se parece y se distingue del original.
  assert.match(QAOA_NOTICE, /Algoritmo clásico/);
  assert.match(QAOA_NOTICE, /el original lo hace sobre cúbits y este sobre pesos reales/);
  const header = readFileSync(new URL('../src/models/routing/qaoa_inspired.js', import.meta.url), 'utf8')
    .split('\n').slice(0, 8).join('\n');
  assert.match(header, /heurístico clásico inspirado en QAOA/);
  assert.match(header, /No ejecuta un\s*\n?\/\/\s*circuito cuántico/);
  assert.equal(ROUNDS.length, 4); // p = 4
  assert.deepEqual(ROUNDS.map((r) => [r.gamma, r.beta]), [[0.45, 0.65], [0.85, 0.45], [1.35, 0.28], [2.1, 0.12]]);
  assert.equal(CANDIDATES_PER_LAYER, 25);
  assert.deepEqual([MIN_LAYERS, MAX_LAYERS], [18, 48]);
});

test('M15: Q(theta)', () => {
  close(corridorPenalty(10), 0);
  close(corridorPenalty(17.5), 0);
  close(corridorPenalty(25), 3.8);
  close(corridorPenalty(27), 55 + 9.5 * 4);
});

test('M15: en plano da casi la recta', () => {
  const dem = makeDem(100, 100, 20, () => 0);
  const start_m = [-700, -400];
  const goal_m = [650, 500];
  const route = computeCorridorRoute({ dem, start_m, goal_m });
  assert.equal(route.algorithm, 'qaoa');
  assert.equal(route.dataset_id, 'test');
  const straight_m = Math.hypot(goal_m[0] - start_m[0], goal_m[1] - start_m[1]);
  assert.ok(route.metrics.distance_m <= straight_m * 1.01, `${route.metrics.distance_m} vs ${straight_m}`);
  assert.deepEqual(route.path_m[0], start_m);
  assert.deepEqual(route.path_m.at(-1), goal_m);
  assert.equal(route.metrics.max_slope_deg, 0);
  assert.ok(route.metrics.layers >= 18 && route.metrics.layers <= 48);
});

test('M15: rodea un obstáculo de 40°', () => {
  // Loma alargada de norte a sur con laderas de 40°, de 500 m de largo, entre A y B.
  const height_m = 60 * Math.tan(40 * DEG);
  const dem = makeDem(100, 100, 20, (x_m, z_m) =>
    Math.abs(z_m) > 250 ? 0 : Math.max(0, height_m * (1 - Math.abs(x_m) / 60)),
  );
  const route = computeCorridorRoute({ dem, start_m: [-800, 0], goal_m: [800, 0] });
  assert.ok(!route.failed);
  assert.ok(route.metrics.max_slope_deg <= 25, `pendiente máxima ${route.metrics.max_slope_deg}`);
  assert.ok(route.path_m.some(([, z_m]) => Math.abs(z_m) > 250));
});

test('M15: O2 total a menos de 15 % del de M4 en el dataset sintético', () => {
  const dem = syntheticDem();
  for (const [start_m, goal_m] of [
    [[-4200, -3800], [4000, 3600]], // cruza la zona del cráter
    [[-4500, 2500], [4300, 2900]],
    [[-1500, -600], [1700, 900]], // dentro del cráter
  ]) {
    const astar = computeRoute({ dem, start_m, goal_m });
    const corridor = computeCorridorRoute({ dem, start_m, goal_m });
    assert.ok(!astar.failed && !corridor.failed);
    const ratio = corridor.metrics.oxygen_l / astar.metrics.oxygen_l;
    assert.ok(Math.abs(ratio - 1) < 0.15, `O2 corredor / A* = ${ratio}`);
  }
});

test('M15: resultado determinista', () => {
  const dem = syntheticDem();
  const args = { dem, start_m: [-4200, -3800], goal_m: [4000, 3600] };
  assert.deepEqual(computeCorridorRoute(args), computeCorridorRoute(args));
});

test('M15: puntos fuera del mapa o iguales', () => {
  const dem = makeDem(20, 20, 20, () => 0);
  assert.equal(computeCorridorRoute({ dem, start_m: [900, 0], goal_m: [0, 0] }).failed, true);
  assert.equal(computeCorridorRoute({ dem, start_m: [0, 0], goal_m: [0, 900] }).failed, true);
  const same = computeCorridorRoute({ dem, start_m: [5, 5], goal_m: [5, 5] });
  assert.equal(same.metrics.distance_m, 0);
});
