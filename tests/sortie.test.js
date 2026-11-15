import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SORTIE, planFirstSortie, createSortieState, stepSortie, collectSample, arriveHome, sortieTarget,
} from '../src/models/missions/first_sortie.js';
import { createDem } from '../src/models/terrain/dem.js';
import { LOCOMOTION } from '../src/models/locomotion/kinematics.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// DEM de 400 x 400 m a 2 m/px. slopeAt(x, z) da la altura.
function makeDem(heightAt) {
  const n = 200;
  const heights = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = heightAt((c + 0.5) * 2 - 200, (r + 0.5) * 2 - 200);
  return createDem({ shape: [n, n], resolution_m: 2, size_m: [400, 400] }, heights);
}
const bounds = { halfWidth_m: 196, halfDepth_m: 196 };

test('primer contacto: el recorrido es de minuto y medio caminando', () => {
  const total_m = SORTIE.first_leg_m + SORTIE.second_leg_m + SORTIE.return_leg_m;
  const walk_s = total_m / LOCOMOTION.walk_speed_ms;
  assert.ok(walk_s > 75 && walk_s < 95, `${walk_s} s`);
  assert.equal(SORTIE.storm_delay_s, 20);
});

test('primer contacto: las muestras forman el triángulo pedido alrededor de la cápsula', () => {
  const plan = planFirstSortie(makeDem(() => 0), [10, -20], bounds);
  const [first, second] = plan.samples_m;
  close(dist([10, -20], first), SORTIE.first_leg_m);
  close(dist([10, -20], second), SORTIE.return_leg_m);
  close(dist(first, second), SORTIE.second_leg_m, 1e-6);
  assert.ok(plan.worst_slope_deg <= SORTIE.max_slope_deg);
});

test('primer contacto: evita la ladera y el borde del mapa', () => {
  // Pared empinada al sur (z > 10): con rumbo 0 (hacia +Z) la primera muestra caería en ella.
  const wall = makeDem((x, z) => (z > 10 ? (z - 10) * 1.2 : 0));
  const plan = planFirstSortie(wall, [0, 0], bounds);
  assert.ok(plan.worst_slope_deg <= SORTIE.max_slope_deg, `pendiente ${plan.worst_slope_deg}`);
  assert.ok(plan.samples_m.every(([, z]) => z < 12));
  // Pegado a la esquina: las dos muestras quedan dentro del mapa.
  const corner = planFirstSortie(makeDem(() => 0), [190, 190], bounds);
  assert.ok(corner.samples_m.every(([x, z]) => Math.abs(x) <= 196 && Math.abs(z) <= 196));
  // Si todo es empinado, devuelve el rumbo menos malo en vez de nada.
  const steep = planFirstSortie(makeDem((x, z) => x * 0.6 + z * 0.6), [0, 0], bounds);
  assert.ok(steep && steep.worst_slope_deg > SORTIE.max_slope_deg);
});

test('primer contacto: fases, aviso de tormenta a los 20 s y vuelta', () => {
  let s = createSortieState();
  assert.equal(sortieTarget(s), 0);
  s = stepSortie(s, 30);
  assert.equal(s.storm_in_s, null); // sin aviso hasta la primera muestra
  assert.equal(arriveHome(s), s); // volver sin muestras no termina nada
  s = collectSample(s);
  assert.deepEqual([s.phase, s.collected, s.storm_in_s, sortieTarget(s)], ['to_second', 1, 20, 1]);
  s = stepSortie(s, 12);
  close(s.storm_in_s, 8);
  assert.equal(s.storm, false);
  s = collectSample(s);
  assert.deepEqual([s.phase, s.collected, sortieTarget(s)], ['return', 2, 'home']);
  assert.equal(collectSample(s), s); // no hay tercera muestra
  const early = arriveHome(stepSortie(s, 5));
  assert.deepEqual([early.phase, early.beat_storm, sortieTarget(early)], ['done', true, null]);
  const late = arriveHome(stepSortie(s, 9));
  assert.equal(late.storm, true);
  assert.equal(late.beat_storm, false);
  close(late.elapsed_s, 51);
  assert.equal(stepSortie(late, 10), late); // terminada, el reloj se para
});
