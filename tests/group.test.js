import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../src/models/physiology/defaults.js';
import { marsMetabolic_w } from '../src/models/physiology/metabolic.js';
import { sustainable_w } from '../src/models/physiology/cardio.js';
import {
  sustainableSpeed_ms, groupPace, createGroup, advanceGroupState, aggregateGroupState,
  memberStatus, MIN_SPEED_MS, MAX_SPEED_MS, STATUS_ORDER,
} from '../src/models/physiology/group.js';

const cfg = defaultConfig();
const STRONG = { name: 'Ana', age: 30, sex: 'female', mass_kg: 62, fitness: 'elite', prior_dose_msv: 0 };
const AVERAGE = { name: 'Luis', age: 45, sex: 'male', mass_kg: 80, fitness: 'nominal', prior_dose_msv: 0 };
const WEAK = { name: 'Eva', age: 58, sex: 'female', mass_kg: 70, fitness: 'baja', prior_dose_msv: 0 };
const CREW = [STRONG, AVERAGE, WEAK];
const seg = (over = {}) => ({ slope_deg: 0, delta_elev_m: 0, surface_distance_m: 60, ambient_temp_c: -56, ...over });

const metabolic_w = (member, speed_ms, slope_deg) => marsMetabolic_w({
  mass_kg: member.mass_kg, suit_true_mass_kg: cfg.suit.suit_true_mass_kg, speed_ms, slope_deg,
  eta: member.eta ?? cfg.eta, g_mars_ms2: cfg.g_mars_ms2, g_earth_ms2: cfg.g_earth_ms2,
  gait_factor: cfg.gait_factor, pressure_overhead: cfg.suit.pressure_overhead,
}).total_w;

test('M13: la velocidad sostenible queda en [0.3, 1.2] y respeta M <= M_sost', () => {
  for (const member of CREW) {
    for (const slope_deg of [-10, 0, 3, 6, 10, 15]) {
      const speed_ms = sustainableSpeed_ms(member, slope_deg, cfg);
      assert.ok(speed_ms >= MIN_SPEED_MS && speed_ms <= MAX_SPEED_MS);
      if (speed_ms > MIN_SPEED_MS) {
        assert.ok(metabolic_w(member, speed_ms, slope_deg) <= sustainable_w(member, cfg.rer) + 1e-6);
      }
      // Es la máxima: un poco más rápido ya se pasa (salvo en el tope de 1.2).
      if (speed_ms > MIN_SPEED_MS && speed_ms < MAX_SPEED_MS) {
        assert.ok(metabolic_w(member, speed_ms + 1e-3, slope_deg) > sustainable_w(member, cfg.rer));
      }
    }
  }
});

test('M13: más pendiente -> menor ritmo', () => {
  let previous_ms = Infinity;
  for (const slope_deg of [0, 2, 4, 6, 8, 10, 14]) {
    const { speed_ms } = groupPace(CREW, slope_deg, cfg);
    assert.ok(speed_ms <= previous_ms, `${slope_deg}°: ${speed_ms} > ${previous_ms}`);
    previous_ms = speed_ms;
  }
  // Con una tripulación que sí puede sostener el paso en llano, la cuesta lo baja de verdad.
  const fit = [STRONG, AVERAGE];
  assert.ok(groupPace(fit, 4, cfg).speed_ms < groupPace(fit, 0, cfg).speed_ms);
  assert.ok(groupPace(fit, 0, cfg).speed_ms > MIN_SPEED_MS);
});

test('M13: el grupo nunca va más rápido que su miembro más lento', () => {
  for (const slope_deg of [-5, 0, 3, 7, 12]) {
    const pace = groupPace(CREW, slope_deg, cfg);
    assert.equal(pace.speed_ms, Math.min(...pace.member_speeds_ms));
    assert.equal(pace.member_speeds_ms[pace.slowest_index], pace.speed_ms);
  }
  // También con el suavizado: al llegar una cuesta el ritmo baja de inmediato.
  let group = createGroup(CREW, cfg);
  const slopes = [0, 0, 0, 12, 12, 0, 8, -6, 15, 0];
  for (const slope_deg of slopes) {
    const leader = group.leader_index;
    const delta_elev_m = 60 * Math.tan((slope_deg * Math.PI) / 180);
    group = advanceGroupState(seg({ slope_deg: Math.abs(slope_deg), delta_elev_m }), group);
    const limit_ms = groupPace(CREW, slope_deg, cfg, leader).speed_ms;
    assert.ok(group.speed_ms <= limit_ms + 1e-12, `${slope_deg}°: ${group.speed_ms} > ${limit_ms}`);
  }
});

test('M13: a los 20 min cambia el líder', () => {
  let group = createGroup(CREW, cfg);
  assert.equal(group.leader_index, 0);
  let elapsed_s = 0;
  const leaders = [];
  while (elapsed_s < 61 * 60) {
    group = advanceGroupState(seg(), group);
    elapsed_s = group.elapsed_h * 3600;
    leaders.push([elapsed_s, group.leader_index]);
  }
  for (const [time_s, leader] of leaders) {
    assert.equal(leader, Math.floor(time_s / 1200) % 3, `a los ${time_s} s`);
  }
  assert.ok(leaders.some(([, leader]) => leader === 1) && leaders.some(([, leader]) => leader === 2));
});

test('M13: quien abre camino gasta más que quien sigue', () => {
  const twins = [{ ...AVERAGE, name: 'A' }, { ...AVERAGE, name: 'B' }];
  const group = advanceGroupState(seg(), createGroup(twins, cfg));
  assert.ok(group.states[0].metabolic_w > group.states[1].metabolic_w);
  // A solas se usa eta = 1.1, entre los dos valores.
  const solo = advanceGroupState(seg(), createGroup([AVERAGE], cfg));
  assert.equal(solo.leader_index, 0);
});

test('M13: tripulación de 1 a 6 y avance sin modificar el grupo anterior', () => {
  assert.throws(() => createGroup([], cfg));
  assert.throws(() => createGroup(new Array(7).fill(AVERAGE), cfg));
  const before = createGroup(CREW, cfg);
  const snapshot = structuredClone(before);
  const after = advanceGroupState(seg({ slope_deg: 5, delta_elev_m: 5 }), before);
  assert.deepEqual(before, snapshot);
  assert.notEqual(after.states, before.states);
  assert.ok(after.elapsed_h > 0);
});

test('M13: estado agregado con el peor valor de cada variable y quién lo tiene', () => {
  let group = createGroup(CREW, cfg);
  for (let i = 0; i < 20; i++) group = advanceGroupState(seg({ slope_deg: 6, delta_elev_m: 6 }), group);
  const summary = aggregateGroupState(group);
  assert.ok(STATUS_ORDER.includes(summary.status));
  const lowestO2 = Math.min(...group.states.map((s) => s.o2_l));
  assert.equal(summary.worst.o2_l.value, lowestO2);
  assert.ok(['Ana', 'Luis', 'Eva'].includes(summary.worst.o2_l.member));
  const worstRatio = Math.max(...group.states.map((s) => s.metabolic_w / s.sustainable_w));
  assert.equal(summary.worst.metabolic_ratio.value, worstRatio);
  assert.equal(aggregateGroupState(createGroup(CREW, cfg)).status, 'nominal');
});

test('M13: orden de los estados, de mejor a peor', () => {
  assert.deepEqual(STATUS_ORDER, ['nominal', 'low_o2', 'elevated', 'at_risk_over_sustainable', 'critical']);
  const none = {
    o2_low: false, o2_depleted: false, over_sustainable: false, hr_above_85pct: false,
    thermal_warning: false, thermal_critical: false, dehydration_warning: false,
    dehydration_critical: false, career_dose_exceeded: false,
  };
  assert.equal(memberStatus(none), 'nominal');
  assert.equal(memberStatus({ ...none, o2_low: true }), 'low_o2');
  assert.equal(memberStatus({ ...none, o2_low: true, hr_above_85pct: true }), 'elevated');
  assert.equal(memberStatus({ ...none, hr_above_85pct: true, over_sustainable: true }), 'at_risk_over_sustainable');
  assert.equal(memberStatus({ ...none, over_sustainable: true, o2_depleted: true }), 'critical');
});

test('M13: quien no puede sostener ni el paso mínimo camina a 0.3 m/s y queda marcado', () => {
  // Con las fórmulas del documento, estar de pie con el traje ya supera el límite
  // sostenible de una persona de 58 años en condición baja.
  assert.equal(sustainableSpeed_ms(WEAK, 0, cfg), MIN_SPEED_MS);
  const group = advanceGroupState(seg(), createGroup([WEAK], cfg));
  assert.equal(group.speed_ms, MIN_SPEED_MS);
  assert.equal(group.states[0].flags.over_sustainable, true);
  assert.equal(aggregateGroupState(group).status, 'at_risk_over_sustainable');
});
