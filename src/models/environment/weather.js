// M17: temperatura ambiente y tormenta. docs/modelosydb.md, sección 4, grupo F.
// Código puro: sin three.js ni DOM.
import { MARS_SURFACE_TEMP_MAX_C, MARS_SURFACE_TEMP_MIN_C } from '../../shared/constants.js';
import { MARS_SEMI_MAJOR_AXIS_AU, sunDistance_au } from './solar.js';
import { NOMINAL_DUST_TAU, STORM_DUST_TAU, dustAmount } from './dust_storm.js';

export { NOMINAL_DUST_TAU, STORM_DUST_TAU };

// [diseño] Día nominal: media -56 °C y amplitud 31 °C. Tormenta de polvo: -68 °C y 14 °C.
export const NOMINAL_MEAN_C = -56;
export const NOMINAL_AMPLITUDE_C = 31;
export const STORM_MEAN_C = -68;
export const STORM_AMPLITUDE_C = 14;
// [diseño] El máximo diario cae hacia las 14:12 hora local (14.2 h).
export const PEAK_LTST_H = 14.2;
// Coeficiente del término orbital, 95 (a / r - 1). Viene de la ficha M17, sin etiqueta.
export const ORBITAL_TEMP_COEFFICIENT_C = 95;

// Parámetros del ajuste diario; el script de MEDA (D6) puede sustituir media y amplitud.
export function weatherParams(storm = false, overrides = {}) {
  return {
    mean_c: storm ? STORM_MEAN_C : NOMINAL_MEAN_C,
    amplitude_c: storm ? STORM_AMPLITUDE_C : NOMINAL_AMPLITUDE_C,
    ...overrides,
  };
}

// T_amb = T_media + 95 (a / r - 1) + A cos(2 pi (LTST - 14.2) / 24)
export function ambientTemp_c({ ls_deg, ltst_h, storm = false, params }) {
  const { mean_c, amplitude_c } = params ?? weatherParams(storm);
  return (
    mean_c +
    ORBITAL_TEMP_COEFFICIENT_C * (MARS_SEMI_MAJOR_AXIS_AU / sunDistance_au(ls_deg) - 1) +
    amplitude_c * Math.cos((2 * Math.PI * (ltst_h - PEAK_LTST_H)) / 24)
  );
}

/**
 * weatherState({ ls_deg, ltst_h, storm }) -> { ambient_temp_c, storm, dust_tau, in_published_range }
 * in_published_range: la temperatura cae en el rango de superficie de la tabla 2.3
 * (de 20 °C a -153 °C, F2).
 */
export function weatherState({
  ls_deg, ltst_h, storm = false, params, dust_tau = storm ? STORM_DUST_TAU : NOMINAL_DUST_TAU,
}) {
  const amount = dustAmount(dust_tau);
  const fitted = params ?? {
    mean_c: NOMINAL_MEAN_C + (STORM_MEAN_C - NOMINAL_MEAN_C) * amount,
    amplitude_c: NOMINAL_AMPLITUDE_C + (STORM_AMPLITUDE_C - NOMINAL_AMPLITUDE_C) * amount,
  };
  const ambient_temp_c = ambientTemp_c({ ls_deg, ltst_h, params: fitted });
  return {
    ambient_temp_c,
    storm,
    dust_tau,
    in_published_range:
      ambient_temp_c <= MARS_SURFACE_TEMP_MAX_C && ambient_temp_c >= MARS_SURFACE_TEMP_MIN_C,
  };
}

/**
 * Refugio más cercano a un punto, en línea recta. points: lista "points" de poi.json.
 * La ruta de evacuación se traza después con M4 hasta ese punto.
 * -> el POI de tipo 'shelter' más cercano, o null si no hay ninguno.
 */
export function nearestShelter(points, from_m) {
  let best = null;
  let best_m = Infinity;
  for (const poi of points ?? []) {
    if (poi.type !== 'shelter') continue;
    const d_m = Math.hypot(poi.position_m[0] - from_m[0], poi.position_m[1] - from_m[1]);
    if (d_m < best_m) {
      best = poi;
      best_m = d_m;
    }
  }
  return best;
}
