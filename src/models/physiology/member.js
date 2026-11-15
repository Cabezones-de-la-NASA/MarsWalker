// Estado de un miembro de la tripulación a lo largo de la caminata.
// Orden de cálculo por tramo (sección 4): M5 -> M6 -> M7 -> M8/M9 -> M10 -> M11 -> M12.
// Cada tramo devuelve un estado nuevo y no modifica el anterior.
//
// member = { name, age, sex: 'male' | 'female', mass_kg,
//            fitness: 'baja' | 'nominal' | 'buena' | 'elite',
//            prior_dose_msv, eta (opcional) }
// El documento no define los campos de member; son un supuesto [diseño].
import {
  HR_ALERT_FRACTION,
  CORE_TEMP_BASE_C,
  CORE_TEMP_WARNING_C,
  CORE_TEMP_CRITICAL_C,
  DEHYDRATION_WARNING_PCT,
  DEHYDRATION_CRITICAL_PCT,
} from './defaults.js';
import { marsMetabolic_w } from './metabolic.js';
import { vo2_lmin, vco2_lmin, consumeO2_l, autonomy_h, tankPressureFraction } from './oxygen.js';
import { vo2max_mlkgmin, sustainable_w, hrMax_bpm, hrRest_bpm, heartRate_bpm } from './cardio.js';
import { coreTempDelta_c, nominalCoreTemp_c } from './thermal.js';
import { sweatRate_lh, advanceDeficit, dehydration_pct } from './hydration.js';
import { dose_usv, careerFraction } from './radiation.js';

const NO_FLAGS = Object.freeze({
  o2_low: false,
  o2_depleted: false,
  over_sustainable: false,
  hr_above_85pct: false,
  thermal_warning: false,
  thermal_critical: false,
  dehydration_warning: false,
  dehydration_critical: false,
  career_dose_exceeded: false,
});

export function initMemberState(member, cfg) {
  const prior_dose_msv = member.prior_dose_msv ?? 0;
  const career_fraction = careerFraction(prior_dose_msv, 0);
  return {
    elapsed_h: 0,
    distance_m: 0,
    metabolic_w: 0,
    sustainable_w: sustainable_w(member, cfg.rer),
    vo2_lmin: 0,
    vco2_lmin: 0,
    o2_l: cfg.suit.o2_capacity_l,
    o2_fraction: 1,
    autonomy_h: Infinity,
    heart_rate_bpm: hrRest_bpm(member.fitness),
    hr_max_bpm: hrMax_bpm(member.age),
    core_temp_c: CORE_TEMP_BASE_C,
    sweat_lh: 0,
    dehydration_l: 0,
    dehydration_pct: 0,
    water_l: cfg.suit.drinking_water_l,
    dose_usv: 0,
    career_fraction,
    flags: { ...NO_FLAGS, career_dose_exceeded: career_fraction >= 1 },
  };
}

/**
 * segment = { walking_time_h, slope_deg, delta_elev_m, surface_distance_m,
 *             walk_speed_ms, ambient_temp_c }
 * La pendiente toma el signo del desnivel: delta_elev_m < 0 es cuesta abajo.
 */
export function advanceMemberState(segment, prevState, member, cfg) {
  const time_h = segment.walking_time_h;
  const slope_signed_deg = Math.sign(segment.delta_elev_m || 0) * Math.abs(segment.slope_deg);

  // M5 + M6: tasa metabólica en Marte con traje.
  const metabolic = marsMetabolic_w({
    mass_kg: member.mass_kg,
    suit_true_mass_kg: cfg.suit.suit_true_mass_kg,
    speed_ms: segment.walk_speed_ms,
    slope_deg: slope_signed_deg,
    eta: member.eta ?? cfg.eta,
    g_mars_ms2: cfg.g_mars_ms2,
    g_earth_ms2: cfg.g_earth_ms2,
    gait_factor: cfg.gait_factor,
    pressure_overhead: cfg.suit.pressure_overhead,
  });
  const metabolic_w = metabolic.total_w;

  // M7: oxígeno y tanque.
  const vo2_rate_lmin = vo2_lmin(metabolic_w, cfg.rer);
  const o2_l = consumeO2_l(prevState.o2_l, vo2_rate_lmin, time_h);

  // M8 / M9: capacidad aeróbica y frecuencia cardíaca.
  const max_mlkgmin = vo2max_mlkgmin(member);
  const member_sustainable_w = sustainable_w(member, cfg.rer);
  const hr_max_bpm = hrMax_bpm(member.age);
  const heart_rate_bpm = heartRate_bpm({
    vo2_mlkgmin: (vo2_rate_lmin * 1000) / member.mass_kg,
    vo2max_mlkgmin: max_mlkgmin,
    hr_rest_bpm: hrRest_bpm(member.fitness),
    hr_max_bpm,
  });

  // M10: temperatura corporal. El balance de calor solo aplica si falla el enfriamiento.
  const core_temp_c = cfg.cooling_failed
    ? prevState.core_temp_c +
      coreTempDelta_c({
        metabolic_w,
        efficiency: cfg.suit.lcvg_efficiency,
        core_temp_c: prevState.core_temp_c,
        ambient_temp_c: segment.ambient_temp_c,
        mass_kg: member.mass_kg,
        dt_s: time_h * 3600,
      })
    : nominalCoreTemp_c(metabolic_w);

  // M11: hidratación.
  const sweat_lh = sweatRate_lh(metabolic_w, core_temp_c);
  const water = advanceDeficit({
    deficit_l: prevState.dehydration_l,
    water_l: prevState.water_l,
    sweat_lh,
    water_intake_lh: cfg.water_intake_lh,
    time_h,
  });
  const dehydration = dehydration_pct(water.deficit_l, member.mass_kg);

  // M12: radiación.
  const total_dose_usv = prevState.dose_usv + dose_usv(time_h, cfg.dose_rate_usv_h);
  const career_fraction = careerFraction(member.prior_dose_msv ?? 0, total_dose_usv);

  return {
    elapsed_h: prevState.elapsed_h + time_h,
    distance_m: prevState.distance_m + segment.surface_distance_m,
    metabolic_w,
    sustainable_w: member_sustainable_w,
    vo2_lmin: vo2_rate_lmin,
    vco2_lmin: vco2_lmin(metabolic_w, cfg.rer),
    o2_l,
    o2_fraction: tankPressureFraction(o2_l, cfg.suit.o2_capacity_l),
    autonomy_h: autonomy_h(o2_l, vo2_rate_lmin),
    heart_rate_bpm,
    hr_max_bpm,
    core_temp_c,
    sweat_lh,
    dehydration_l: water.deficit_l,
    dehydration_pct: dehydration,
    water_l: water.water_l,
    dose_usv: total_dose_usv,
    career_fraction,
    flags: {
      o2_low: o2_l <= cfg.suit.o2_critical_l,
      o2_depleted: o2_l <= 0,
      over_sustainable: metabolic_w > member_sustainable_w,
      hr_above_85pct: heart_rate_bpm > HR_ALERT_FRACTION * hr_max_bpm,
      thermal_warning: core_temp_c >= CORE_TEMP_WARNING_C,
      thermal_critical: core_temp_c >= CORE_TEMP_CRITICAL_C,
      dehydration_warning: dehydration >= DEHYDRATION_WARNING_PCT,
      dehydration_critical: dehydration >= DEHYDRATION_CRITICAL_PCT,
      career_dose_exceeded: career_fraction >= 1,
    },
  };
}
