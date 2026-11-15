import test from 'node:test';
import assert from 'node:assert/strict';
import { MARS_GRAVITY_MS2 } from '../src/shared/constants.js';
import {
  LOCOMOTION, slopeSpeedFactor, approachVelocity, turnToward, stepPlayer, horizontalSpeed_ms,
} from '../src/models/locomotion/kinematics.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const flatEnv = (over = {}) => ({
  groundAt: () => 0, resolveCollision: (x, z) => [x, z], halfWidth_m: 1000, halfDepth_m: 1000, ...over,
});
const still = (over = {}) => ({ x_m: 0, y_m: 0, z_m: 0, vx_ms: 0, vy_ms: 0, vz_ms: 0, yaw_rad: 0, grounded: true, ...over });
const run = (state, input, env, seconds, dt = 1 / 60) => {
  let s = state;
  for (let t = 0; t < seconds; t += dt) s = stepPlayer(s, input, env, dt);
  return s;
};
const FORWARD = { dirX: 0, dirZ: 1, run: false, jump: false };
const IDLE = { dirX: 0, dirZ: 0, run: false, jump: false };

test('locomoción: constantes de diseño', () => {
  assert.equal(LOCOMOTION.walk_speed_ms, 1.2);
  assert.ok(LOCOMOTION.run_speed_ms > LOCOMOTION.walk_speed_ms);
  assert.equal(MARS_GRAVITY_MS2, 3.71);
});

test('locomoción: acelera hasta la velocidad de marcha y no la supera', () => {
  const env = flatEnv();
  const early = run(still(), FORWARD, env, 0.3);
  assert.ok(horizontalSpeed_ms(early) > 0 && horizontalSpeed_ms(early) < 1.2); // tarda en arrancar
  close(horizontalSpeed_ms(early), LOCOMOTION.acceleration_ms2 * 0.3, 0.05);
  const cruising = run(still(), FORWARD, env, 3);
  close(horizontalSpeed_ms(cruising), 1.2, 1e-9);
  const running = run(still(), { ...FORWARD, run: true }, env, 4);
  close(horizontalSpeed_ms(running), LOCOMOTION.run_speed_ms, 1e-9);
});

test('locomoción: al soltar, frena hasta parar sin invertir el sentido', () => {
  const env = flatEnv();
  const cruising = run(still(), FORWARD, env, 3);
  const braking = run(cruising, IDLE, env, 0.2);
  assert.ok(braking.vz_ms > 0 && braking.vz_ms < 1.2);
  const stopped = run(cruising, IDLE, env, 2);
  assert.equal(horizontalSpeed_ms(stopped), 0);
  assert.ok(stopped.z_m > cruising.z_m);
});

test('locomoción: salto con gravedad marciana', () => {
  const env = flatEnv();
  let s = stepPlayer(still(), { ...IDLE, jump: true }, env, 1 / 240);
  assert.equal(s.grounded, false);
  let peak_m = 0;
  let airtime_s = 0;
  while (!s.grounded && airtime_s < 5) {
    s = stepPlayer(s, IDLE, env, 1 / 240);
    peak_m = Math.max(peak_m, s.y_m);
    airtime_s += 1 / 240;
  }
  // Altura v² / (2 g) y tiempo de vuelo 2 v / g, con g = 3.71 m/s².
  close(peak_m, LOCOMOTION.jump_speed_ms ** 2 / (2 * 3.71), 0.02);
  close(airtime_s, (2 * LOCOMOTION.jump_speed_ms) / 3.71, 0.03);
  assert.equal(s.y_m, 0);
  // En la Tierra el mismo impulso sube mucho menos.
  let earth = stepPlayer(still(), { ...IDLE, jump: true }, flatEnv({ gravity_ms2: 9.81 }), 1 / 240);
  let earthPeak_m = 0;
  while (!earth.grounded) {
    earth = stepPlayer(earth, IDLE, flatEnv({ gravity_ms2: 9.81 }), 1 / 240);
    earthPeak_m = Math.max(earthPeak_m, earth.y_m);
  }
  assert.ok(peak_m > earthPeak_m * 2.4);
});

test('locomoción: sigue la elevación del terreno y nunca lo atraviesa', () => {
  const env = flatEnv({ groundAt: (x, z) => 5 * Math.sin(z / 7) + 0.05 * x });
  let s = still({ y_m: env.groundAt(0, 0) });
  for (let i = 0; i < 1200; i++) {
    s = stepPlayer(s, { dirX: 0.6, dirZ: 0.8, run: i % 400 > 200, jump: i % 300 === 0 }, env, 1 / 60);
    assert.ok(s.y_m >= env.groundAt(s.x_m, s.z_m) - 1e-9, `paso ${i}`);
    if (s.grounded) close(s.y_m, env.groundAt(s.x_m, s.z_m));
  }
});

test('locomoción: la pendiente frena la subida y una ladera de más de 32° detiene', () => {
  assert.equal(slopeSpeedFactor(0), 1);
  assert.equal(slopeSpeedFactor(8), 1);
  assert.ok(slopeSpeedFactor(20) < 1 && slopeSpeedFactor(20) > slopeSpeedFactor(28));
  assert.equal(slopeSpeedFactor(32), 0);
  assert.equal(slopeSpeedFactor(45), 0);
  assert.ok(slopeSpeedFactor(-20) < 1 && slopeSpeedFactor(-20) > 0); // bajar también exige cuidado
  assert.ok(slopeSpeedFactor(-45) > 0); // cuesta abajo no se bloquea
  const tan = (deg) => Math.tan((deg * Math.PI) / 180);
  const speedOn = (deg) => horizontalSpeed_ms(run(still(), FORWARD, flatEnv({ groundAt: (x, z) => z * tan(deg) }), 3));
  assert.ok(speedOn(20) < speedOn(0));
  assert.equal(speedOn(40), 0);
});

test('locomoción: las colisiones y los límites del mapa detienen el avance', () => {
  // Pared en z = 3.
  const wall = flatEnv({ resolveCollision: (x, z) => [x, Math.min(z, 3)] });
  const blocked = run(still(), FORWARD, wall, 6);
  close(blocked.z_m, 3);
  assert.equal(blocked.vz_ms, 0);
  const edge = run(still({ z_m: 9 }), FORWARD, flatEnv({ halfDepth_m: 10 }), 4);
  close(edge.z_m, 10);
});

test('locomoción: el cuerpo gira hacia la dirección de marcha por el camino corto', () => {
  const s = run(still(), { dirX: 1, dirZ: 0, run: false, jump: false }, flatEnv(), 2);
  close(s.yaw_rad, Math.PI / 2, 1e-9); // mirando al este
  close(turnToward(3, -3, 0.1), 3.1, 1e-12); // cruza por pi, no da la vuelta larga
  close(turnToward(0, 1, 5), 1);
  assert.deepEqual(approachVelocity(0, 0, 3, 4, 10), [3, 4]);
  const [vx, vz] = approachVelocity(0, 0, 3, 4, 1);
  close(Math.hypot(vx, vz), 1);
});

test('locomoción: en el aire casi no se corrige la trayectoria', () => {
  const env = flatEnv();
  const airborne = stepPlayer(still(), { ...IDLE, jump: true }, env, 1 / 60);
  const steered = run(airborne, FORWARD, env, 0.3);
  const grounded = run(still(), FORWARD, env, 0.3);
  assert.ok(horizontalSpeed_ms(steered) < horizontalSpeed_ms(grounded) * 0.5);
});

test('locomoción: stepPlayer no modifica el estado de entrada', () => {
  const before = still();
  const copy = { ...before };
  stepPlayer(before, { ...FORWARD, jump: true }, flatEnv(), 0.1);
  assert.deepEqual(before, copy);
});
