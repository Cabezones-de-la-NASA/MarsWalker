// M10: temperatura corporal.
import {
  HEAT_LOSS_W_PER_K,
  BODY_SPECIFIC_HEAT_J_KGK,
  CORE_TEMP_BASE_C,
  CORE_TEMP_NOMINAL_RISE_C,
  CORE_TEMP_NOMINAL_FROM_W,
  CORE_TEMP_NOMINAL_SPAN_W,
} from './defaults.js';

/**
 * M10: dT = (M (1 - epsilon) - k (T - T_amb)) / (m c_p) * dt. Aplica cuando falla el enfriamiento.
 * El documento no define m ni T_amb. Supuesto [diseño]: m es la masa corporal y T_amb es
 * la temperatura ambiente del tramo.
 */
export function coreTempDelta_c({
  metabolic_w,
  efficiency,
  core_temp_c,
  ambient_temp_c,
  mass_kg,
  dt_s,
  k_w_per_k = HEAT_LOSS_W_PER_K,
  cp_j_kgk = BODY_SPECIFIC_HEAT_J_KGK,
}) {
  const stored_w = metabolic_w * (1 - efficiency) - k_w_per_k * (core_temp_c - ambient_temp_c);
  return (stored_w / (mass_kg * cp_j_kgk)) * dt_s;
}

// Modo nominal: la temperatura tiende a 37 + min(0.4, 0.4 max(0, (M - 300) / 1500)).
export function nominalCoreTemp_c(metabolic_w) {
  const excess = Math.max(0, (metabolic_w - CORE_TEMP_NOMINAL_FROM_W) / CORE_TEMP_NOMINAL_SPAN_W);
  return CORE_TEMP_BASE_C + Math.min(CORE_TEMP_NOMINAL_RISE_C, CORE_TEMP_NOMINAL_RISE_C * excess);
}
