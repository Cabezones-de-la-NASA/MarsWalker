import test from 'node:test';
import assert from 'node:assert/strict';
import { MARS_GRAVITY_MS2 } from '../src/shared/constants.js';
import * as d from '../src/models/physiology/defaults.js';
import { pandolf_w, marsMetabolic_w } from '../src/models/physiology/metabolic.js';
import {
  o2Energy_kj_l, vo2_lmin, vco2_lmin, consumeO2_l, autonomy_h, tankPressureFraction,
} from '../src/models/physiology/oxygen.js';
import {
  vo2max_mlkgmin, vo2max_lmin, sustainable_w, hrMax_bpm, hrRest_bpm, heartRate_bpm,
} from '../src/models/physiology/cardio.js';
import { coreTempDelta_c, nominalCoreTemp_c } from '../src/models/physiology/thermal.js';
import { sweatRate_lh, advanceDeficit, dehydration_pct } from '../src/models/physiology/hydration.js';
import { dose_usv, careerFraction } from '../src/models/physiology/radiation.js';
import { initMemberState, advanceMemberState } from '../src/models/physiology/member.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

const MEMBER = { name: 'A', age: 45, sex: 'male', mass_kg: 75, fitness: 'buena', prior_dose_msv: 0 };
const segment = (over = {}) => ({
  walking_time_h: 0.1,
  slope_deg: 0,
  delta_elev_m: 0,
  surface_distance_m: 360,
  walk_speed_ms: 1.0,
  ambient_temp_c: -56,
  ...over,
});

// ---------------------------------------------------------------- M5

test('M5: fórmula de Pandolf en un caso calculado a mano', () => {
  // W 70, L 20, V 1, plano, eta 1.1: 105 + 2*90*(20/70)^2 + 1.1*90*1.5
  close(pandolf_w({ mass_kg: 70, load_kg: 20, speed_ms: 1, slope_deg: 0, eta: 1.1 }),
    105 + 180 * (20 / 70) ** 2 + 1.1 * 90 * 1.5);
});

test('M5: subir > plano > bajar', () => {
  const at = (slope_deg) => pandolf_w({ mass_kg: 75, load_kg: 30, speed_ms: 1, slope_deg, eta: 1.1 });
  for (const slope_deg of [2, 5, 10, 20]) {
    assert.ok(at(slope_deg) > at(0));
    assert.ok(at(0) > at(-slope_deg));
  }
});

test('M5: M crece con V', () => {
  let previous_w = 0;
  for (const speed_ms of [0.3, 0.6, 0.9, 1.2, 1.5]) {
    const m_w = pandolf_w({ mass_kg: 75, load_kg: 30, speed_ms, slope_deg: 3, eta: 1.1 });
    assert.ok(m_w > previous_w);
    previous_w = m_w;
  }
});

test('M5: el piso evita valores absurdos cuesta abajo', () => {
  const base_w = 1.5 * 75 + 2 * 105 * (30 / 75) ** 2;
  close(pandolf_w({ mass_kg: 75, load_kg: 30, speed_ms: 1.2, slope_deg: -30, eta: 1.1 }), 0.5 * base_w);
  assert.equal(d.ETA_SOLO, 1.1);
  assert.equal(d.ETA_LEAD, 1.2);
  assert.equal(d.ETA_FOLLOW, 1.05);
});

// ---------------------------------------------------------------- M6

test('M6: con g_M = g_T, f_p = 0 y factor 1 da M5', () => {
  for (const slope_deg of [-8, 0, 6, 15]) {
    for (const speed_ms of [0.5, 1.2]) {
      const mars = marsMetabolic_w({
        mass_kg: 75, suit_true_mass_kg: 170, speed_ms, slope_deg, eta: 1.1,
        g_mars_ms2: 9.81, g_earth_ms2: 9.81, gait_factor: 1, pressure_overhead: 0,
      });
      close(mars.total_w, pandolf_w({ mass_kg: 75, load_kg: 170, speed_ms, slope_deg, eta: 1.1 }), 1e-9);
    }
  }
});

test('M6: en Marte la carga se escala por la gravedad y la presión añade un 30 %', () => {
  const mars = marsMetabolic_w({
    mass_kg: 75, suit_true_mass_kg: 170, speed_ms: 1, slope_deg: 5, eta: 1.1,
    g_mars_ms2: MARS_GRAVITY_MS2, g_earth_ms2: 9.81, pressure_overhead: 0.3,
  });
  const ratio = 3.71 / 9.81;
  const load_kg = 170 * ratio;
  const rest_w = 1.5 * 75 + 2 * (75 + load_kg) * (load_kg / 75) ** 2;
  const g_pct = 100 * Math.tan((5 * Math.PI) / 180);
  const expected_w = rest_w + 0.8 * 1.1 * (75 + load_kg) * 1.5 + 1.1 * (75 + 170) * 0.35 * g_pct * ratio;
  close(mars.load_kg, load_kg);
  close(mars.mars_w, expected_w, 1e-9);
  close(mars.total_w, expected_w * 1.3, 1e-9);
});

// ---------------------------------------------------------------- M7

test('M7: RER 0.82 -> E_O2 = 20.2 kJ/L', () => {
  close(o2Energy_kj_l(0.82), 20.2, 1e-9);
  close(o2Energy_kj_l(0.7), 19.6);
  close(o2Energy_kj_l(1.0), 21.1);
  assert.equal(d.RER, 0.82);
});

test('M7: consumo, CO2, tanque y autonomía', () => {
  close(vo2_lmin(250, 0.82), (60 * 250) / (1000 * 20.2));
  close(vco2_lmin(250, 0.82), 0.82 * vo2_lmin(250, 0.82));
  close(consumeO2_l(580, 1, 2), 460);
  assert.equal(consumeO2_l(10, 1, 2), 0);
  close(autonomy_h(580, 1), 580 / 60);
  assert.equal(autonomy_h(580, 0), Infinity);
  close(tankPressureFraction(290, 580), 0.5);
});

// ---------------------------------------------------------------- M8

test('M8: 45 años, condición buena -> 41.6 mL/kg/min y FC máx 175', () => {
  close(vo2max_mlkgmin({ age: 45, sex: 'male', fitness: 'buena' }), 41.6, 1e-9);
  assert.equal(hrMax_bpm(45), 175);
});

test('M8: tabla por sexo y condición, sin declive antes de los 25', () => {
  assert.equal(vo2max_mlkgmin({ age: 25, sex: 'male', fitness: 'nominal' }), 45);
  assert.equal(vo2max_mlkgmin({ age: 20, sex: 'female', fitness: 'elite' }), 51);
  assert.equal(vo2max_mlkgmin({ age: 25, sex: 'female', fitness: 'baja' }), 32);
  assert.deepEqual(['baja', 'nominal', 'buena', 'elite'].map(hrRest_bpm), [76, 68, 60, 52]);
  assert.throws(() => vo2max_mlkgmin({ age: 30, sex: 'male', fitness: 'otra' }));
});

test('M8: M_sost = 0.60 VO2máx (1000 E_O2 / 60)', () => {
  close(vo2max_lmin(MEMBER), (41.6 * 75) / 1000);
  close(sustainable_w(MEMBER, 0.82), (0.6 * 3.12 * 1000 * 20.2) / 60, 1e-9);
});

// ---------------------------------------------------------------- M9

test('M9: en reposo da FC_rep, en VO2máx da FC_max y se recorta al rango', () => {
  const base = { vo2max_mlkgmin: 41.6, hr_rest_bpm: 60, hr_max_bpm: 175 };
  close(heartRate_bpm({ ...base, vo2_mlkgmin: 3.5 }), 60);
  close(heartRate_bpm({ ...base, vo2_mlkgmin: 41.6 }), 175);
  close(heartRate_bpm({ ...base, vo2_mlkgmin: (3.5 + 41.6) / 2 }), (60 + 175) / 2);
  assert.equal(heartRate_bpm({ ...base, vo2_mlkgmin: 0 }), 60);
  assert.equal(heartRate_bpm({ ...base, vo2_mlkgmin: 90 }), 175);
});

// --------------------------------------------------------------- M10

test('M10: con epsilon = 1 y T = T_amb, dT = 0', () => {
  assert.equal(coreTempDelta_c({
    metabolic_w: 500, efficiency: 1, core_temp_c: 37, ambient_temp_c: 37, mass_kg: 75, dt_s: 600,
  }), 0);
});

test('M10: balance de calor y modo nominal', () => {
  // (400 * 0.15 - 0.5 * (37 - 17)) / (75 * 3500) * 3600
  close(coreTempDelta_c({
    metabolic_w: 400, efficiency: 0.85, core_temp_c: 37, ambient_temp_c: 17, mass_kg: 75, dt_s: 3600,
  }), ((60 - 10) / (75 * 3500)) * 3600, 1e-12);
  assert.equal(nominalCoreTemp_c(200), 37);
  close(nominalCoreTemp_c(1050), 37.2);
  close(nominalCoreTemp_c(5000), 37.4);
});

// --------------------------------------------------------------- M11

test('M11: a 0 W el déficit no crece', () => {
  assert.equal(sweatRate_lh(0, 37), 0);
  const after = advanceDeficit({ deficit_l: 0.3, water_l: 2, sweat_lh: 0, water_intake_lh: 0.24, time_h: 1 });
  assert.ok(after.deficit_l <= 0.3);
  const fromZero = advanceDeficit({ deficit_l: 0, water_l: 2, sweat_lh: 0, water_intake_lh: 0.24, time_h: 5 });
  assert.equal(fromZero.deficit_l, 0);
});

test('M11: sudor, agua disponible y porcentaje de masa', () => {
  close(sweatRate_lh(600, 37), 0.4);
  close(sweatRate_lh(600, 38), 0.48);
  close(sweatRate_lh(300, 36), 0.2);
  const after = advanceDeficit({ deficit_l: 0, water_l: 2, sweat_lh: 0.4, water_intake_lh: 0.24, time_h: 2 });
  close(after.deficit_l, 0.32);
  close(after.water_l, 1.52);
  // Sin agua en el traje ya no se compensa nada.
  const dry = advanceDeficit({ deficit_l: 0, water_l: 0.1, sweat_lh: 0.4, water_intake_lh: 0.24, time_h: 1 });
  close(dry.deficit_l, 0.3);
  close(dry.water_l, 0);
  close(dehydration_pct(1.5, 75), 2);
});

// --------------------------------------------------------------- M12

test('M12: 8 h -> 223 µSv', () => {
  assert.equal(Math.round(dose_usv(8)), 223);
  close(dose_usv(8), 223.2);
  close(d.DOSE_RATE_USV_H, 0.67 * 1000 / 24, 0.02);
  close(careerFraction(300, 0), 0.5);
  close(careerFraction(599.9, 100), 1);
});

// ---------------------------------------------------------- miembro

test('miembro: estado inicial con tanque lleno y sin banderas', () => {
  const cfg = d.defaultConfig();
  const state = initMemberState(MEMBER, cfg);
  assert.equal(state.o2_l, 580);
  assert.equal(state.heart_rate_bpm, 60);
  assert.equal(state.core_temp_c, 37);
  assert.equal(state.water_l, 2);
  assert.ok(Object.values(state.flags).every((flag) => flag === false));
  assert.equal(cfg.g_mars_ms2, MARS_GRAVITY_MS2);
});

test('miembro: un tramo devuelve un estado nuevo y no modifica el anterior', () => {
  const cfg = d.defaultConfig();
  const before = initMemberState(MEMBER, cfg);
  const snapshot = structuredClone(before);
  const after = advanceMemberState(segment(), before, MEMBER, cfg);
  assert.deepEqual(before, snapshot);
  assert.notEqual(after, before);
  assert.notEqual(after.flags, before.flags);
  close(after.elapsed_h, 0.1);
  close(after.distance_m, 360);
});

test('miembro: sigue el orden M5 -> M6 -> M7 -> M8/M9 -> M10 -> M11 -> M12', () => {
  const cfg = d.defaultConfig();
  const seg = segment({ slope_deg: 6, delta_elev_m: 30, walking_time_h: 0.25 });
  const state = advanceMemberState(seg, initMemberState(MEMBER, cfg), MEMBER, cfg);
  const m_w = marsMetabolic_w({
    mass_kg: 75, suit_true_mass_kg: 170, speed_ms: 1, slope_deg: 6, eta: 1.1,
    g_mars_ms2: MARS_GRAVITY_MS2, g_earth_ms2: 9.81, pressure_overhead: 0.3,
  }).total_w;
  close(state.metabolic_w, m_w);
  close(state.vo2_lmin, vo2_lmin(m_w));
  close(state.o2_l, 580 - vo2_lmin(m_w) * 60 * 0.25);
  close(state.heart_rate_bpm, heartRate_bpm({
    vo2_mlkgmin: (vo2_lmin(m_w) * 1000) / 75, vo2max_mlkgmin: 41.6, hr_rest_bpm: 60, hr_max_bpm: 175,
  }));
  close(state.core_temp_c, nominalCoreTemp_c(m_w));
  close(state.sweat_lh, sweatRate_lh(m_w, state.core_temp_c));
  close(state.dose_usv, 27.9 * 0.25);
});

test('miembro: la pendiente toma el signo del desnivel', () => {
  const cfg = d.defaultConfig();
  const start = initMemberState(MEMBER, cfg);
  const up = advanceMemberState(segment({ slope_deg: 8, delta_elev_m: 20 }), start, MEMBER, cfg);
  const flat = advanceMemberState(segment(), start, MEMBER, cfg);
  const down = advanceMemberState(segment({ slope_deg: 8, delta_elev_m: -20 }), start, MEMBER, cfg);
  assert.ok(up.metabolic_w > flat.metabolic_w && flat.metabolic_w > down.metabolic_w);
});

test('miembro: banderas de oxígeno, ritmo y pulso', () => {
  const cfg = d.defaultConfig();
  let state = initMemberState(MEMBER, cfg);
  const steep = segment({ slope_deg: 20, delta_elev_m: 100, walk_speed_ms: 1.2, walking_time_h: 0.5 });
  state = advanceMemberState(steep, state, MEMBER, cfg);
  assert.equal(state.flags.over_sustainable, true);
  assert.equal(state.flags.hr_above_85pct, true);
  assert.equal(state.flags.o2_low, false);
  for (let i = 0; i < 40 && !state.flags.o2_depleted; i++) {
    state = advanceMemberState(steep, state, MEMBER, cfg);
  }
  assert.equal(state.o2_l, 0);
  assert.equal(state.flags.o2_low, true);
  assert.equal(state.flags.o2_depleted, true);
  // Una caminata suave no levanta esas banderas.
  const easy = advanceMemberState(segment({ walk_speed_ms: 0.5 }), initMemberState(MEMBER, cfg), MEMBER, cfg);
  assert.equal(easy.flags.over_sustainable, false);
  assert.equal(easy.flags.hr_above_85pct, false);
});

test('miembro: banderas térmicas, de hidratación y de dosis de carrera', () => {
  const failed = { ...d.defaultConfig(), cooling_failed: true };
  let state = initMemberState(MEMBER, failed);
  // Sin enfriamiento, en un ambiente cálido (dentro de un hábitat) y a ritmo alto.
  const hot = segment({ ambient_temp_c: 37, slope_deg: 10, delta_elev_m: 50, walking_time_h: 0.5 });
  let sawWarning = false;
  for (let i = 0; i < 60 && !state.flags.thermal_critical; i++) {
    state = advanceMemberState(hot, state, MEMBER, failed);
    sawWarning ||= state.flags.thermal_warning;
  }
  assert.ok(sawWarning);
  assert.equal(state.flags.thermal_critical, true);
  assert.ok(state.core_temp_c >= 39.5);

  const cfg = d.defaultConfig();
  let dry = initMemberState(MEMBER, cfg);
  const long = segment({ walking_time_h: 1 });
  for (let i = 0; i < 40 && !dry.flags.dehydration_critical; i++) {
    dry = advanceMemberState(long, dry, MEMBER, cfg);
  }
  assert.equal(dry.flags.dehydration_warning, true);
  assert.equal(dry.flags.dehydration_critical, true);
  assert.ok(dry.dehydration_pct >= 4);
  assert.equal(dry.water_l, 0);

  const veteran = { ...MEMBER, prior_dose_msv: 599.99 };
  const dosed = advanceMemberState(long, initMemberState(veteran, cfg), veteran, cfg);
  assert.equal(dosed.flags.career_dose_exceeded, true);
  assert.equal(advanceMemberState(long, initMemberState(MEMBER, cfg), MEMBER, cfg).flags.career_dose_exceeded, false);
});
