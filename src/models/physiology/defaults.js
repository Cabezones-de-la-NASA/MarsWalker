// Constantes de los modelos de fisiología M5 a M12. docs/modelosydb.md, sección 4, grupo C.
// Código puro: sin three.js ni DOM.
import { MARS_GRAVITY_MS2 } from '../../shared/constants.js';
import { SUITS, suitToConfig } from '../suits/catalog.js';

// ---- M5 · Pandolf
// [diseño] factor de terreno eta: solo, quien abre camino y quien sigue.
export const ETA_SOLO = 1.1;
export const ETA_LEAD = 1.2;
export const ETA_FOLLOW = 1.05;
// [diseño] piso: M >= 0.5 * (los dos primeros términos).
export const METABOLIC_FLOOR_FRACTION = 0.5;

// ---- M6 · Marte y traje
// Gravedad terrestre g_T = 9.81 m/s². El documento da el valor sin etiqueta ni fuente.
export const EARTH_GRAVITY_MS2 = 9.81;
// [diseño] la marcha en plano se reduce un 20 %.
export const MARS_GAIT_FACTOR = 0.8;

// ---- M7 · Oxígeno
// [diseño] cociente respiratorio.
export const RER = 0.82;
// Equivalente calórico del O2: 19.6 kJ/L con RER 0.7 y +1.5 kJ/L hasta RER 1.0.
// Fuente del documento: tabla de Lusk (sección 2.5); los coeficientes vienen de la ficha M7.
export const O2_ENERGY_AT_RER_07_KJ_L = 19.6;
export const O2_ENERGY_SPAN_KJ_L = 1.5;

// ---- M8 · Capacidad aeróbica
// [publicado] ACSM: declive de 1 % por año a partir de los 25.
export const VO2MAX_DECLINE_PER_YEAR = 0.01;
export const VO2MAX_REFERENCE_AGE = 25;
// [diseño] fracción del VO2máx sostenible durante horas.
export const SUSTAINABLE_FRACTION = 0.6;
// [diseño, inspirada en normas ACSM] VO2máx a los 25 años, en mL/kg/min, y FC en reposo, en lpm.
export const FITNESS_TABLE = Object.freeze({
  baja: Object.freeze({ vo2max_male: 38, vo2max_female: 32, hr_rest_bpm: 76 }),
  nominal: Object.freeze({ vo2max_male: 45, vo2max_female: 38, hr_rest_bpm: 68 }),
  buena: Object.freeze({ vo2max_male: 52, vo2max_female: 44, hr_rest_bpm: 60 }),
  elite: Object.freeze({ vo2max_male: 60, vo2max_female: 51, hr_rest_bpm: 52 }),
});
// FC máx = 220 - edad. El documento la da en la ficha M8 sin etiqueta.
export const HR_MAX_BASE_BPM = 220;

// ---- M9 · Frecuencia cardíaca
// VO2 en reposo, 3.5 mL/kg/min. El documento lo da en la ficha M9 sin etiqueta.
export const VO2_REST_MLKGMIN = 3.5;
// [diseño] alerta si FC > 85 % del máximo.
export const HR_ALERT_FRACTION = 0.85;

// ---- M10 · Temperatura corporal
// [diseño] conductancia de pérdida de calor, W/K.
export const HEAT_LOSS_W_PER_K = 0.5;
// Calor específico del cuerpo, J/(kg K). El documento lo da sin etiqueta.
export const BODY_SPECIFIC_HEAT_J_KGK = 3500;
// [diseño] alertas de temperatura corporal.
export const CORE_TEMP_WARNING_C = 38.5;
export const CORE_TEMP_CRITICAL_C = 39.5;
// Modo nominal: T = 37 + min(0.4, 0.4 max(0, (M - 300) / 1500)). Coeficientes de la ficha M10.
export const CORE_TEMP_BASE_C = 37;
export const CORE_TEMP_NOMINAL_RISE_C = 0.4;
export const CORE_TEMP_NOMINAL_FROM_W = 300;
export const CORE_TEMP_NOMINAL_SPAN_W = 1500;

// ---- M11 · Hidratación
// [diseño] 0.4 L/h de sudor a 600 W.
export const SWEAT_RATE_LH = 0.4;
export const SWEAT_REFERENCE_W = 600;
// Aumento del sudor por grado sobre 37 °C (0.2). Coeficiente de la ficha M11.
export const SWEAT_PER_DEGREE = 0.2;
// [diseño] agua disponible para beber, L/h.
export const WATER_INTAKE_LH = 0.24;
// [publicado] Sawka et al. (2007), ACSM Position Stand: alerta 2 % y crítico 4 % de la masa.
export const DEHYDRATION_WARNING_PCT = 2;
export const DEHYDRATION_CRITICAL_PCT = 4;

// ---- M12 · Radiación
// [publicado] Hassler et al. (2014), Science 343: 0.67 mSv/día / 24 = 27.9 µSv/h.
export const DOSE_RATE_USV_H = 27.9;
// [publicado] NASA-STD-3001: límite de carrera, 600 mSv.
export const CAREER_LIMIT_MSV = 600;

// Configuración por defecto que reciben initMemberState y advanceMemberState.
export function defaultConfig(suit = SUITS.xemu) {
  return {
    suit: suitToConfig(suit, MARS_GRAVITY_MS2, EARTH_GRAVITY_MS2),
    g_mars_ms2: MARS_GRAVITY_MS2,
    g_earth_ms2: EARTH_GRAVITY_MS2,
    gait_factor: MARS_GAIT_FACTOR,
    rer: RER,
    eta: ETA_SOLO,
    water_intake_lh: WATER_INTAKE_LH,
    dose_rate_usv_h: DOSE_RATE_USV_H,
    // true = falla la prenda de enfriamiento y la temperatura sigue el balance de calor de M10.
    cooling_failed: false,
  };
}
