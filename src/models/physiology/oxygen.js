// M7: oxígeno, CO2 y tanque.
import { RER, O2_ENERGY_AT_RER_07_KJ_L, O2_ENERGY_SPAN_KJ_L } from './defaults.js';

// E_O2 = 19.6 + (RER - 0.7) / 0.3 * 1.5, en kJ por litro de O2.
export function o2Energy_kj_l(rer = RER) {
  return O2_ENERGY_AT_RER_07_KJ_L + ((rer - 0.7) / 0.3) * O2_ENERGY_SPAN_KJ_L;
}

// VO2 = 60 M / (1000 E_O2), en L/min.
export function vo2_lmin(metabolic_w, rer = RER) {
  return (60 * metabolic_w) / (1000 * o2Energy_kj_l(rer));
}

// VCO2 = RER * VO2, en L/min.
export function vco2_lmin(metabolic_w, rer = RER) {
  return rer * vo2_lmin(metabolic_w, rer);
}

// O2(t) = O2_0 - integral de VO2 dt; nunca baja de cero.
export function consumeO2_l(o2_l, vo2_rate_lmin, time_h) {
  return Math.max(0, o2_l - vo2_rate_lmin * 60 * time_h);
}

// t_aut = O2 / VO2, en horas. Infinito si no hay consumo.
export function autonomy_h(o2_l, vo2_rate_lmin) {
  return vo2_rate_lmin > 0 ? o2_l / vo2_rate_lmin / 60 : Infinity;
}

// P_tanque / P_lleno = O2 / O2_0 (gas ideal a temperatura constante).
// El documento no da P_lleno, así que se devuelve la fracción.
export function tankPressureFraction(o2_l, o2_capacity_l) {
  return o2_l / o2_capacity_l;
}
