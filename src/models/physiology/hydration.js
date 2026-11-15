// M11: hidratación.
import { SWEAT_RATE_LH, SWEAT_REFERENCE_W, SWEAT_PER_DEGREE, CORE_TEMP_BASE_C } from './defaults.js';

// s = 0.4 (M / 600) (1 + 0.2 max(0, T - 37)), en L/h.
export function sweatRate_lh(metabolic_w, core_temp_c) {
  return (
    SWEAT_RATE_LH *
    (metabolic_w / SWEAT_REFERENCE_W) *
    (1 + SWEAT_PER_DEGREE * Math.max(0, core_temp_c - CORE_TEMP_BASE_C))
  );
}

/**
 * D(t) = integral de (s - w) dt, nunca negativo.
 * Supuesto [diseño]: se bebe a water_intake_lh mientras quede agua en el traje.
 * -> { deficit_l, water_l } nuevos.
 */
export function advanceDeficit({ deficit_l, water_l, sweat_lh, water_intake_lh, time_h }) {
  const drunk_l = Math.min(water_intake_lh * time_h, water_l);
  return {
    deficit_l: Math.max(0, deficit_l + sweat_lh * time_h - drunk_l),
    water_l: water_l - drunk_l,
  };
}

// Déficit como % de la masa corporal. Supuesto [diseño]: 1 L de sudor = 1 kg.
export function dehydration_pct(deficit_l, mass_kg) {
  return (deficit_l / mass_kg) * 100;
}
