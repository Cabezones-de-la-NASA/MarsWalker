import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimClock } from '../src/shared/sim_clock.js';
import { MARS_DAY_H, MARS_YEAR_SOLS } from '../src/shared/constants.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('reloj: el tiempo se deriva de la cuenta de ticks', () => {
  const clock = createSimClock({ dt_s: 60, ls_deg: 100, ltst_h: 6 });
  assert.deepEqual(clock.getTime().ticks, 0);
  const time = clock.tick(90);
  assert.equal(time.ticks, 90);
  assert.equal(time.elapsed_s, 5400);
  close(time.ltst_h, 6 + (5400 / (MARS_DAY_H * 3600)) * 24);
  close(time.ls_deg, 100 + ((5400 / (MARS_DAY_H * 3600)) * 360) / MARS_YEAR_SOLS);
});

test('reloj: un sol completo devuelve la misma hora local y avanza L_s', () => {
  const dt_s = 36;
  const ticksPerSol = (MARS_DAY_H * 3600) / dt_s;
  const clock = createSimClock({ dt_s, ls_deg: 359.9, ltst_h: 15 });
  const time = clock.tick(ticksPerSol);
  close(time.ltst_h, 15, 1e-9);
  assert.equal(time.sol, 1);
  close(time.ls_deg, (359.9 + 360 / MARS_YEAR_SOLS) % 360, 1e-9);
});

test('reloj: los suscriptores reciben cada tick en orden de registro', () => {
  const clock = createSimClock({ dt_s: 10 });
  const calls = [];
  clock.subscribe((time) => calls.push(['sol', time.ticks]));
  const unsubscribe = clock.subscribe((time) => calls.push(['clima', time.ticks]));
  clock.subscribe((time) => calls.push(['salud', time.ticks]));
  clock.tick(2);
  assert.deepEqual(calls, [
    ['sol', 1], ['clima', 1], ['salud', 1],
    ['sol', 2], ['clima', 2], ['salud', 2],
  ]);
  unsubscribe();
  calls.length = 0;
  clock.tick();
  assert.deepEqual(calls, [['sol', 3], ['salud', 3]]);
});

test('reloj: setStart y reset ponen la cuenta a cero', () => {
  const clock = createSimClock({ dt_s: 60, ls_deg: 10, ltst_h: 8 });
  clock.tick(30);
  clock.setStart({ ltst_h: 20 });
  assert.equal(clock.getTime().ticks, 0);
  assert.equal(clock.getTime().ltst_h, 20);
  assert.equal(clock.getTime().ls_deg, 10);
  clock.tick(5);
  clock.reset();
  assert.equal(clock.getTime().elapsed_s, 0);
});
