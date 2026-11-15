import test from 'node:test';
import assert from 'node:assert/strict';
import { createDem } from '../src/models/terrain/dem.js';
import { defaultConfig } from '../src/models/physiology/defaults.js';
import { createGroup } from '../src/models/physiology/group.js';
import { computeRoute, buildSearchGrid } from '../src/models/routing/astar_o2.js';
import {
  computeHealthRoute, simulateRoute, compareRoutes, slopeDimension, physiologyFactors,
  DIMENSION_WEIGHTS, PRESETS,
} from '../src/models/routing/astar_health.js';

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

const cfg = defaultConfig();
const CREW = [
  { name: 'Ana', age: 30, sex: 'female', mass_kg: 62, fitness: 'elite', prior_dose_msv: 0 },
  { name: 'Luis', age: 45, sex: 'male', mass_kg: 80, fitness: 'buena', prior_dose_msv: 0 },
];
const group = () => createGroup(CREW, cfg);

// Colina suave en el centro (hasta ~14°) entre A (oeste) y B (este).
const hillDem = (height_m = 140) => makeDem(80, 80, 20, (x_m, z_m) => height_m * Math.exp(-(x_m * x_m + z_m * z_m) / (2 * 260 * 260)));
// Muro de 40° con un paso al sur.
const wallDem = () => makeDem(60, 60, 20, (x_m, z_m) => (z_m > 400 ? 0 : Math.max(0, 60 * Math.tan(40 * DEG) * (1 - Math.abs(x_m) / 60))));

test('M14: pesos y preajustes de diseño', () => {
  assert.deepEqual(DIMENSION_WEIGHTS, {
    slope: 0.15, metabolic: 0.2, heart_rate: 0.15, oxygen: 0.25, thermal: 0.1, hydration: 0.1, radiation: 0.05,
  });
  close(Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0), 1);
  assert.deepEqual(PRESETS.clasico, ['slope']);
  assert.deepEqual(PRESETS.cientifico, ['slope', 'oxygen']);
  assert.deepEqual(PRESETS.balanceado, ['slope', 'metabolic', 'heart_rate', 'oxygen']);
  assert.equal(PRESETS.seguridad.length, 7);
});

test('M14: factor de pendiente', () => {
  close(slopeDimension(0), 1);
  close(slopeDimension(12.5), 1.25);
  close(slopeDimension(25), 2);
  close(slopeDimension(35), 10);
});

test('M14: los factores fisiológicos empeoran al subir', () => {
  const flat = physiologyFactors(group(), 0);
  const up = physiologyFactors(group(), 10);
  assert.ok(up.speed_ms < flat.speed_ms);
  assert.ok(up.oxygen > flat.oxygen); // más aire por metro
  assert.ok(up.radiation > flat.radiation); // más tiempo expuesto por metro
  for (const value of Object.values(flat)) assert.ok(Number.isFinite(value) && value >= 0);
});

test('M14: en plano, C = d (1 + f) y la salida tiene la forma de route.json', () => {
  const dem = makeDem(40, 40, 20, () => 0);
  const route = computeHealthRoute({ dem, start_m: [-300, 10], goal_m: [300, 10], group: group(), dimensions: 'clasico' });
  assert.equal(route.algorithm, 'health');
  assert.equal(route.dataset_id, 'test');
  // Solo pendiente, en plano: f = 1, así que el coste es 2 d.
  close(route.metrics.health_cost, 2 * route.metrics.distance_m, 1e-9);
  for (const key of ['distance_m', 'oxygen_l', 'max_slope_deg', 'risk_score']) {
    assert.ok(Number.isFinite(route.metrics[key]));
  }
  assert.equal(computeHealthRoute({ dem, start_m: [9999, 0], goal_m: [0, 0], group: group() }).failed, true);
  assert.equal(computeHealthRoute({ dem, start_m: [0, 0], goal_m: [100, 0], group: group(), dimensions: ['otra'] }).failed, true);
});

test('M14: con solo «pendiente» activa se parece a M4', () => {
  // En plano las dos dan la misma distancia.
  const flat = makeDem(60, 60, 20, () => 0);
  const args = { dem: flat, start_m: [-500, -300], goal_m: [450, 350] };
  const classicFlat = computeRoute(args);
  const healthFlat = computeHealthRoute({ ...args, group: group(), dimensions: 'clasico' });
  close(healthFlat.metrics.distance_m, classicFlat.metrics.distance_m, 1e-6);

  // Con un muro de 40° y un paso cercano, las dos lo rodean sin pasar de 25°.
  // (Si el rodeo es largo, M14 prefiere cruzar: su factor de pendiente por encima de
  // 25° es mucho más suave que la penalización P de M3. Ver pendientes del paso 11.)
  const dem = wallDem();
  const wallArgs = { dem, start_m: [-200, 300], goal_m: [200, 300] };
  const classic = computeRoute(wallArgs);
  const health = computeHealthRoute({ ...wallArgs, group: group(), dimensions: 'clasico', options: { full_window: true } });
  assert.ok(classic.metrics.max_slope_deg <= 25);
  assert.ok(health.metrics.max_slope_deg <= 25, `pendiente máxima ${health.metrics.max_slope_deg}`);
  assert.ok(health.path_m.some(([, z_m]) => z_m > 400));
  const ratio = health.metrics.distance_m / classic.metrics.distance_m;
  assert.ok(ratio > 0.9 && ratio < 1.1, `distancias ${health.metrics.distance_m} y ${classic.metrics.distance_m}`);
});

test('M14: con las siete, el pico metabólico no supera al de la ruta clásica', () => {
  // Loma suave (hasta ~3°). En terreno más empinado esta propiedad NO se cumple con las
  // fórmulas del documento: M3 evita las cuestas con más fuerza que M14 (ver la prueba siguiente).
  const dem = hillDem(28);
  const grid = buildSearchGrid(dem);
  const args = { dem, start_m: [-650, 0], goal_m: [650, 0] };
  const classic = computeRoute({ ...args, config: { grid } });
  const health = computeHealthRoute({ ...args, group: group(), dimensions: 'seguridad', options: { grid } });
  assert.ok(!classic.failed && !health.failed);
  const walkedClassic = simulateRoute(classic.path_m, dem, group());
  const walkedHealth = simulateRoute(health.path_m, dem, group());
  assert.ok(
    walkedHealth.peak_metabolic_w <= walkedClassic.peak_metabolic_w + 1e-6,
    `${walkedHealth.peak_metabolic_w} vs ${walkedClassic.peak_metabolic_w}`,
  );
});

test('M14: contraejemplo documentado, en una colina de 14° la ruta por salud sube más que la clásica', () => {
  // Deja constancia del comportamiento real de las fórmulas: aquí la propiedad de la ficha
  // M14 falla. Si el equipo cambia pesos o factores, esta prueba debe revisarse.
  const dem = hillDem(140);
  const args = { dem, start_m: [-650, 0], goal_m: [650, 0] };
  const classic = computeRoute(args);
  const health = computeHealthRoute({ ...args, group: group(), dimensions: 'seguridad' });
  assert.ok(health.metrics.max_slope_deg > classic.metrics.max_slope_deg);
  assert.ok(health.metrics.distance_m < classic.metrics.distance_m);
  const walkedClassic = simulateRoute(classic.path_m, dem, group());
  const walkedHealth = simulateRoute(health.path_m, dem, group());
  assert.ok(walkedHealth.peak_metabolic_w > walkedClassic.peak_metabolic_w);
});

test('simulateRoute: acumula tiempo, O2, picos y peor estado sin tocar el grupo', () => {
  const dem = hillDem(140);
  const start = group();
  const snapshot = structuredClone(start);
  const walked = simulateRoute([[-600, 0], [-300, 0], [0, 0], [300, 0], [600, 0]], dem, start);
  assert.deepEqual(start, snapshot);
  close(walked.distance_m, 1200);
  assert.ok(walked.time_h > 1200 / 1.2 / 3600 - 1e-9); // nunca más rápido que 1.2 m/s
  assert.ok(walked.o2_used_l > 0 && walked.o2_used_l < 580);
  assert.ok(walked.peak_metabolic_w > 0 && walked.peak_heart_rate_bpm > 50);
  assert.ok(walked.peak_core_temp_c >= 37);
  assert.equal(typeof walked.worst_status, 'string');
  close(walked.final_group.elapsed_h, walked.time_h);
  const still = simulateRoute([[0, 0]], dem, start);
  assert.equal(still.time_h, 0);
  assert.equal(still.o2_used_l, 0);
});

test('compareRoutes: diferencias absolutas y en %', () => {
  const a = { time_h: 2, distance_m: 1000, o2_used_l: 80, peak_metabolic_w: 500, peak_heart_rate_bpm: 150, peak_core_temp_c: 37.2, minutes_over_sustainable: 0, worst_status: 'elevated' };
  const b = { ...a, time_h: 2.5, distance_m: 1100, o2_used_l: 72, minutes_over_sustainable: 3, worst_status: 'nominal' };
  const cmp = compareRoutes(a, b);
  close(cmp.time_h.diff, 0.5);
  close(cmp.time_h.diff_pct, 25);
  close(cmp.distance_m.diff_pct, 10);
  close(cmp.o2_used_l.diff, -8);
  close(cmp.o2_used_l.diff_pct, -10);
  assert.equal(cmp.minutes_over_sustainable.diff_pct, null); // no se divide entre cero
  assert.deepEqual(cmp.worst_status, { classic: 'elevated', health: 'nominal' });
});
