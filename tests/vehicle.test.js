import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE, stepVehicle, exitPosition } from '../src/models/locomotion/vehicle.js';
import { LOCOMOTION } from '../src/models/locomotion/kinematics.js';
import { createSimClock } from '../src/shared/sim_clock.js';
import { buildRoverContext, pickMockReply } from '../src/shared/rover_context.js';
import { MARS_FACTS } from '../src/shared/mars_facts.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const flatEnv = (over = {}) => ({
  groundAt: () => 0, resolveCollision: (x, z) => [x, z], halfWidth_m: 5000, halfDepth_m: 5000, ...over,
});
const parked = (over = {}) => ({ x_m: 0, z_m: 0, yaw_rad: 0, speed_ms: 0, ...over });
const drive = (state, input, env, seconds, dt = 1 / 60) => {
  let s = state;
  for (let t = 0; t < seconds; t += dt) s = stepVehicle(s, input, env, dt);
  return s;
};

test('camioneta: es diez veces más rápida que caminar y llega a su tope sin pasarlo', () => {
  close(VEHICLE.max_speed_ms, LOCOMOTION.walk_speed_ms * 10);
  const cruising = drive(parked(), { throttle: 1, steer: 0 }, flatEnv(), 6);
  close(cruising.speed_ms, VEHICLE.max_speed_ms);
  assert.ok(cruising.z_m > 30 && Math.abs(cruising.x_m) < 1e-9); // yaw 0 avanza hacia +Z
});

test('camioneta: se frena sola, frena más al pisar en contra y da marcha atrás despacio', () => {
  const env = flatEnv();
  const cruising = drive(parked(), { throttle: 1, steer: 0 }, env, 6);
  const coasting = drive(cruising, { throttle: 0, steer: 0 }, env, 1);
  const braking = drive(cruising, { throttle: -1, steer: 0 }, env, 1);
  assert.ok(coasting.speed_ms < cruising.speed_ms && coasting.speed_ms > 0);
  assert.ok(braking.speed_ms < coasting.speed_ms);
  close(drive(cruising, { throttle: 0, steer: 0 }, env, 10).speed_ms, 0);
  const reversing = drive(parked(), { throttle: -1, steer: 0 }, env, 4);
  close(reversing.speed_ms, -VEHICLE.reverse_speed_ms);
  assert.ok(reversing.z_m < 0);
});

test('camioneta: parada no gira; en marcha, la derecha del conductor es -X con rumbo 0', () => {
  const env = flatEnv();
  close(drive(parked(), { throttle: 0, steer: 1 }, env, 2).yaw_rad, 0);
  const right = drive(parked(), { throttle: 1, steer: 1 }, env, 2);
  assert.ok(right.yaw_rad < 0 && right.x_m < 0);
  const left = drive(parked(), { throttle: 1, steer: -1 }, env, 2);
  assert.ok(left.yaw_rad > 0 && left.x_m > 0);
});

test('camioneta: la pendiente la frena y una pared de más de 38° la detiene', () => {
  const gentle = flatEnv({ groundAt: (x, z) => z * Math.tan((20 * Math.PI) / 180) });
  const climbing = drive(parked(), { throttle: 1, steer: 0 }, gentle, 8);
  assert.ok(climbing.speed_ms > 1 && climbing.speed_ms < VEHICLE.max_speed_ms * 0.85);
  const wall = flatEnv({ groundAt: (x, z) => Math.max(0, z - 20) * Math.tan((45 * Math.PI) / 180) });
  const stopped = drive(parked(), { throttle: 1, steer: 0 }, wall, 12);
  // Llega lanzada a 12 m/s: la inercia la mete unos metros en la pared, y ahí se queda.
  assert.ok(stopped.z_m < 28, `subió hasta z = ${stopped.z_m}`);
  close(stopped.speed_ms, 0);
});

test('camioneta: respeta el borde del mapa y las colisiones', () => {
  const edge = drive(parked(), { throttle: 1, steer: 0 }, flatEnv({ halfDepth_m: 10 }), 6);
  close(edge.z_m, 10);
  assert.ok(edge.speed_ms < 1);
  const blocked = drive(parked(), { throttle: 1, steer: 0 }, flatEnv({ resolveCollision: (x, z) => [x, Math.min(z, 5)] }), 4);
  close(blocked.z_m, 5);
});

test('camioneta: el astronauta baja a la izquierda, fuera del círculo de colisión', () => {
  const [x_m, z_m] = exitPosition(parked());
  assert.ok(x_m > VEHICLE.body_radius_m + LOCOMOTION.body_radius_m);
  close(z_m, 0);
  const [x2_m, z2_m] = exitPosition(parked({ yaw_rad: Math.PI / 2 }));
  close(x2_m, 0);
  assert.ok(z2_m < -VEHICLE.body_radius_m);
});

test('reloj: advance() acumula segundos sueltos en ticks enteros', () => {
  const clock = createSimClock({ dt_s: 10, ltst_h: 12 });
  let calls = 0;
  clock.subscribe(() => { calls += 1; });
  assert.equal(clock.advance(4), 0);
  assert.equal(clock.advance(4), 0);
  assert.equal(clock.advance(4), 1); // 12 s: un tick y sobran 2
  assert.equal(clock.advance(28), 3);
  assert.equal(clock.getTime().elapsed_s, 40);
  assert.equal(calls, 4);
  assert.equal(clock.advance(1e9), 600); // tope por llamada
  clock.setStart({ ltst_h: 6 });
  assert.equal(clock.advance(9), 0); // setStart descarta lo pendiente
});

test('rover: el contexto incluye el estado de la caminata y los datos con su fuente', () => {
  const text = buildRoverContext({
    zone: { label: 'Jezero CTX', resolution_m: 20 },
    position_m: [120, -340], elevation_m: -2500.4, slope_deg: 7.25,
    vitals: { o2_l: 800, o2_fraction: 0.8, autonomy_h: 5.5, heart_rate_bpm: 96, core_temp_c: 37.1, status: 'nominal' },
    environment: { ltst_h: 13.5, ambient_temp_c: -20, phase: 'day', dust_tau: 0.5, storm: true },
    progress: { visited: 1, objectives: 7, samples: 0, sampleSites: 4 },
    walked_m: 300, driven_m: 1200, in_vehicle: true, time_scale: 4,
    nearby: [{ name: 'Delta', type: 'sampling', distance_m: 80, description: 'Borde del delta.' }],
  }, MARS_FACTS.slice(0, 2));
  for (const piece of ['Jezero CTX', 'x 120 m', 'pendiente 7.3°', 'oxígeno 800 L (80 %', 'tormenta de polvo activa',
    '1 de 7 objetivos', '1200 m en camioneta', 'Ahora va en la camioneta', '4×', 'Delta (sampling), a 80 m',
    `[${MARS_FACTS[0].source}]`]) {
    assert.ok(text.includes(piece), `falta "${piece}" en:\n${text}`);
  }
  assert.ok(buildRoverContext({ zone: { label: 'Z', resolution_m: 1 } }).includes('Zona: Z'));
});

test('rover sin LLM: elige el dato que responde a la pregunta o sigue la lista', () => {
  const moons = pickMockReply('¿Cuántas lunas tiene Marte?', MARS_FACTS);
  assert.ok(moons.matched && moons.fact.text.includes('Fobos'));
  const gravity = pickMockReply('¿Cuánta gravedad hay en la superficie?', MARS_FACTS);
  assert.ok(gravity.matched && gravity.fact.text.includes('3.71'));
  const none = pickMockReply('xyzzy', MARS_FACTS, MARS_FACTS.length + 2);
  assert.equal(none.matched, false);
  assert.equal(none.fact, MARS_FACTS[2]);
  assert.equal(pickMockReply('', MARS_FACTS, 0).fact, MARS_FACTS[0]);
});

test('descenso: dura 12.5 min, baja sin parar y llega al suelo a su hora', async () => {
  const { DESCENT, descentState } = await import('../src/models/locomotion/descent.js');
  assert.equal(DESCENT.duration_s, 750);
  close(DESCENT.duration_s / Math.max(...DESCENT.time_scales), 7.5); // a 100× dura 7.5 s
  const start = descentState(0);
  close(start.altitude_m, DESCENT.start_altitude_m);
  let previous = start.altitude_m;
  for (let t = 5; t <= DESCENT.duration_s; t += 5) {
    const now = descentState(t);
    assert.ok(now.altitude_m < previous, `no baja en t = ${t}`);
    assert.ok(Math.abs(now.sway_rad) <= (DESCENT.sway_deg * Math.PI) / 180 + 1e-9);
    previous = now.altitude_m;
  }
  const flare = descentState(DESCENT.duration_s - DESCENT.flare_s);
  close(flare.altitude_m, DESCENT.flare_altitude_m);
  assert.ok(descentState(DESCENT.duration_s - 1).speed_ms < descentState(10).speed_ms); // frena al final
  const end = descentState(DESCENT.duration_s);
  close(end.altitude_m, 0);
  assert.ok(end.landed && end.speed_ms === 0 && end.sway_rad === 0);
  assert.ok(descentState(1e6).landed && !descentState(DESCENT.duration_s - 0.01).landed);
});
