// M5 (Pandolf) y M6 (corrección a Marte y al traje presurizado).
import { METABOLIC_FLOOR_FRACTION, MARS_GAIT_FACTOR } from './defaults.js';

const DEG = Math.PI / 180;

// G = 100 tan(theta): pendiente en %, con signo.
function grade_pct(slope_deg) {
  return 100 * Math.tan(slope_deg * DEG);
}

/**
 * M5: M = 1.5 W + 2.0 (W + L) (L / W)^2 + eta (W + L) (1.5 V^2 + 0.35 V G), en watts.
 * slope_deg lleva signo (negativo = cuesta abajo). Piso: M >= 0.5 * (dos primeros términos).
 */
export function pandolf_w({ mass_kg, load_kg, speed_ms, slope_deg, eta }) {
  const base_w = 1.5 * mass_kg + 2.0 * (mass_kg + load_kg) * (load_kg / mass_kg) ** 2;
  const move_w =
    eta * (mass_kg + load_kg) * (1.5 * speed_ms ** 2 + 0.35 * speed_ms * grade_pct(slope_deg));
  return Math.max(base_w + move_w, METABOLIC_FLOOR_FRACTION * base_w);
}

/**
 * M6:
 *   L        = m_traje g_M / g_T
 *   M_Marte  = M_reposo + 0.80 eta (W + L) 1.5 V^2 + eta (W + m_traje) 0.35 V G g_M / g_T
 *   M_total  = M_Marte (1 + f_p)
 *
 * M_reposo no está definido en el documento. Supuesto [diseño]: son los dos primeros
 * términos de M5 con la carga L ya escalada, y se aplica el mismo piso de M5. Con
 * g_M = g_T, f_p = 0 y factor de marcha 1 el resultado es exactamente M5.
 *
 * -> { load_kg, rest_w, mars_w, total_w }
 */
export function marsMetabolic_w({
  mass_kg,
  suit_true_mass_kg,
  speed_ms,
  slope_deg,
  eta,
  g_mars_ms2,
  g_earth_ms2,
  gait_factor = MARS_GAIT_FACTOR,
  pressure_overhead,
}) {
  const gravity_ratio = g_mars_ms2 / g_earth_ms2;
  const load_kg = suit_true_mass_kg * gravity_ratio;
  const rest_w = 1.5 * mass_kg + 2.0 * (mass_kg + load_kg) * (load_kg / mass_kg) ** 2;
  const flat_w = gait_factor * eta * (mass_kg + load_kg) * 1.5 * speed_ms ** 2;
  const climb_w =
    eta * (mass_kg + suit_true_mass_kg) * 0.35 * speed_ms * grade_pct(slope_deg) * gravity_ratio;
  const mars_w = Math.max(rest_w + flat_w + climb_w, METABOLIC_FLOOR_FRACTION * rest_w);
  return { load_kg, rest_w, mars_w, total_w: mars_w * (1 + pressure_overhead) };
}
