import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DUST_TAU, NOMINAL_DUST_TAU, STORM_DUST_TAU, STORM_TIMING, sampleDust, stormTransition,
} from '../src/models/environment/dust_storm.js';
import { weatherState } from '../src/models/environment/weather.js';
import { atmosphereLook } from '../src/world/atmosphere_look.js';

test('tormenta manual: el frente crece sin saltos hasta alcanzar su máxima opacidad', () => {
  const state = { start_tau: NOMINAL_DUST_TAU, target_tau: STORM_DUST_TAU, active: true };
  const at = (elapsed_s) => stormTransition({ ...state, elapsed_s });
  assert.equal(at(0).dust_tau, NOMINAL_DUST_TAU);
  assert.equal(at(5).phase, 'approaching');
  assert.equal(at(STORM_TIMING.approach_s).phase, 'crossing');
  assert.ok(Math.abs(at(8.001).dust_tau - at(7.999).dust_tau) < .001);
  assert.deepEqual(at(17), { dust_tau: STORM_DUST_TAU, phase: 'active', done: true });
});

test('tormenta manual: interrumpir el frente vuelve al polvo configurado sin discontinuidad', () => {
  const interrupted = stormTransition({ start_tau: .9, target_tau: 4, elapsed_s: 11, active: true });
  const setting = { start_tau: interrupted.dust_tau, target_tau: .9, active: false };
  const at = (elapsed_s) => stormTransition({ ...setting, elapsed_s });
  assert.equal(at(0).dust_tau, interrupted.dust_tau);
  assert.equal(at(2).phase, 'settling');
  assert.ok(at(8).dust_tau < at(3).dust_tau);
  assert.deepEqual(at(STORM_TIMING.settle_s), { dust_tau: .9, phase: 'calm', done: true });
});

test('el viento transporta el polvo y la luz y el alcance caen al aumentar la carga', () => {
  const calm = sampleDust(.5, 3);
  const storm = sampleDust(4, 3);
  const extreme = sampleDust(MAX_DUST_TAU, 3);
  assert.ok(extreme.visibility_m < storm.visibility_m && storm.visibility_m < calm.visibility_m / 20);
  assert.ok(storm.wind_ms > calm.wind_ms && storm.wind_x_ms > 0 && storm.wind_z_ms > 0);
  assert.ok(Math.abs(Math.hypot(storm.wind_x_ms, storm.wind_z_ms) - storm.wind_ms) < 1e-10);
  assert.notEqual(storm.gust, sampleDust(4, 4).gust);
  const at = (dust_tau) => atmosphereLook({ dust_tau, elevation_deg: 64, phase: 'day', surface: true });
  assert.ok(at(4).sunIntensity < at(.5).sunIntensity / 8);
  assert.ok(at(4).fogFar_m < 210 && at(MAX_DUST_TAU).fogFar_m < at(4).fogFar_m);
});

test('la temperatura cambia con el polvo levantado durante la transición', () => {
  const t = (dust_tau) => weatherState({ ls_deg: 0, ltst_h: 12, dust_tau }).ambient_temp_c;
  assert.ok(t(.5) > t(2) && t(2) > t(4));
});
