// Datos de la vista "Fórmulas": M5 a M13 con los valores actuales sustituidos.
// Sin DOM: devuelve texto y números; la vista los pinta.
//
// Etiquetas de las constantes:
//   'publicado'     cifra de una fuente pública citada en el documento
//   'diseño'        supuesto del proyecto, ajustable; no es un dato científico
//   'sin etiqueta'  el documento da el valor sin decir de dónde sale
import * as d from '../../models/physiology/defaults.js';
import { marsMetabolic_w, pandolf_w } from '../../models/physiology/metabolic.js';
import { o2Energy_kj_l, vo2_lmin, vco2_lmin, autonomy_h } from '../../models/physiology/oxygen.js';
import {
  vo2max_mlkgmin, sustainable_w, hrMax_bpm, hrRest_bpm, heartRate_bpm,
} from '../../models/physiology/cardio.js';
import { nominalCoreTemp_c, coreTempDelta_c } from '../../models/physiology/thermal.js';
import { sweatRate_lh } from '../../models/physiology/hydration.js';
import { dose_usv, careerFraction } from '../../models/physiology/radiation.js';
import {
  sustainableSpeed_ms, groupPace, MIN_SPEED_MS, MAX_SPEED_MS, BISECTION_ITERATIONS,
  LEADER_ROTATION_S, SMOOTHING_ALPHA,
} from '../../models/physiology/group.js';

const f = (value, digits = 1) => Number(value).toFixed(digits);
const c = (name, value, tag, source = '') => ({ name, value, tag, source });

/**
 * crew: tripulación; index: persona mostrada; cfg: defaultConfig();
 * conditions: { slope_deg, ambient_temp_c, eva_hours }
 * -> [{ id, title, formula, substitution, result, source, constants: [{ name, value, tag, source }] }]
 */
export function buildFormulaCards(crew, index, cfg, conditions = {}) {
  const member = crew[index];
  const slope_deg = conditions.slope_deg ?? 0;
  const ambient_temp_c = conditions.ambient_temp_c ?? -56;
  const eva_hours = conditions.eva_hours ?? 8;
  const eta = cfg.eta;
  const W = member.mass_kg;
  const suit_kg = cfg.suit.suit_true_mass_kg;
  const ratio = cfg.g_mars_ms2 / cfg.g_earth_ms2;
  const speed_ms = sustainableSpeed_ms({ ...member, eta }, slope_deg, cfg);
  const G = 100 * Math.tan((slope_deg * Math.PI) / 180);

  const mars = marsMetabolic_w({
    mass_kg: W, suit_true_mass_kg: suit_kg, speed_ms, slope_deg, eta,
    g_mars_ms2: cfg.g_mars_ms2, g_earth_ms2: cfg.g_earth_ms2, gait_factor: cfg.gait_factor,
    pressure_overhead: cfg.suit.pressure_overhead,
  });
  const L = mars.load_kg;
  const earth_w = pandolf_w({ mass_kg: W, load_kg: suit_kg, speed_ms, slope_deg, eta });
  const M = mars.total_w;
  const E = o2Energy_kj_l(cfg.rer);
  const vo2 = vo2_lmin(M, cfg.rer);
  const vo2max = vo2max_mlkgmin(member);
  const sost_w = sustainable_w(member, cfg.rer);
  const hrMax = hrMax_bpm(member.age);
  const hrRest = hrRest_bpm(member.fitness);
  const vo2_kg = (vo2 * 1000) / W;
  const hr = heartRate_bpm({ vo2_mlkgmin: vo2_kg, vo2max_mlkgmin: vo2max, hr_rest_bpm: hrRest, hr_max_bpm: hrMax });
  const temp_c = nominalCoreTemp_c(M);
  const failRate_c_h = coreTempDelta_c({
    metabolic_w: M, efficiency: cfg.suit.lcvg_efficiency, core_temp_c: temp_c,
    ambient_temp_c, mass_kg: W, dt_s: 3600,
  });
  const sweat = sweatRate_lh(M, temp_c);
  const dose = dose_usv(eva_hours, cfg.dose_rate_usv_h);
  const pace = groupPace(crew, slope_deg, cfg);

  return [
    {
      id: 'M5',
      title: 'Tasa metabólica (Pandolf), en la Tierra',
      formula: 'M = 1.5·W + 2.0·(W + L)·(L/W)² + η·(W + L)·(1.5·V² + 0.35·V·G),  G = 100·tan θ',
      substitution: `W = ${f(W)} kg, L = ${f(suit_kg)} kg (traje), V = ${f(speed_ms, 2)} m/s, θ = ${f(slope_deg)}° → G = ${f(G)} %, η = ${eta}`,
      result: `M = ${f(earth_w, 0)} W`,
      source: 'Pandolf, Givoni y Goldman (1977), J. Appl. Physiol. 43(4)',
      constants: [
        c('coeficientes 1.5, 2.0, 1.5 y 0.35', 'ecuación de Pandolf', 'publicado', 'Pandolf et al. (1977)'),
        c('η solo / abre camino / sigue', `${d.ETA_SOLO} / ${d.ETA_LEAD} / ${d.ETA_FOLLOW}`, 'diseño'),
        c('piso de M', `${d.METABOLIC_FLOOR_FRACTION} × (dos primeros términos)`, 'diseño'),
      ],
    },
    {
      id: 'M6',
      title: 'Corrección a Marte y al traje presurizado',
      formula: 'L = m_traje·g_M/g_T;  M_Marte = M_reposo + 0.80·η·(W + L)·1.5·V² + η·(W + m_traje)·0.35·V·G·g_M/g_T;  M_total = M_Marte·(1 + f_p)',
      substitution: `m_traje = ${f(suit_kg, 0)} kg, g_M/g_T = ${f(ratio, 3)} → L = ${f(L)} kg; M_reposo = ${f(mars.rest_w, 0)} W; f_p = ${cfg.suit.pressure_overhead}`,
      result: `M_Marte = ${f(mars.mars_w, 0)} W, M_total = ${f(M, 0)} W`,
      source: 'Gravedad: NASA Mars Fact Sheet. Traje xEMU: NASA NTRS 20240007384',
      constants: [
        c('g_M', `${cfg.g_mars_ms2} m/s²`, 'publicado', 'NASA Mars Fact Sheet'),
        c('g_T', `${cfg.g_earth_ms2} m/s²`, 'sin etiqueta'),
        c('masa del xEMU', `${suit_kg} kg`, 'publicado', 'NASA NTRS, xEMU Testing Overview'),
        c('factor de marcha', `${cfg.gait_factor}`, 'diseño'),
        c('f_p, sobrecoste por presión', `${cfg.suit.pressure_overhead}`, 'diseño'),
        c('M_reposo = dos primeros términos de M5', 'supuesto', 'diseño'),
      ],
    },
    {
      id: 'M7',
      title: 'Oxígeno, CO₂ y tanque',
      formula: 'E_O₂ = 19.6 + (RER − 0.7)/0.3·1.5;  V̇O₂ = 60·M/(1000·E_O₂);  V̇CO₂ = RER·V̇O₂;  t_aut = O₂/V̇O₂',
      substitution: `RER = ${cfg.rer} → E_O₂ = ${f(E, 2)} kJ/L; M = ${f(M, 0)} W; O₂ = ${cfg.suit.o2_capacity_l} L`,
      result: `V̇O₂ = ${f(vo2, 2)} L/min, V̇CO₂ = ${f(vco2_lmin(M, cfg.rer), 2)} L/min, autonomía = ${f(autonomy_h(cfg.suit.o2_capacity_l, vo2), 1)} h`,
      source: 'Equivalente calórico del oxígeno según el cociente respiratorio (tabla de Lusk)',
      constants: [
        c('19.6 kJ/L y 1.5 kJ/L', 'equivalente calórico', 'publicado', 'tabla de Lusk'),
        c('RER', `${cfg.rer}`, 'diseño'),
        c('O₂ primario del xEMU', `${cfg.suit.o2_capacity_l} L`, 'diseño'),
        c('alerta de tanque', '10 %', 'diseño'),
      ],
    },
    {
      id: 'M8',
      title: 'Capacidad aeróbica',
      formula: 'V̇O₂máx(a) = V̇O₂máx(25)·(1 − 0.01·max(0, a − 25));  M_sost = 0.60·V̇O₂máx·1000·E_O₂/60;  FC_máx = 220 − a',
      substitution: `edad = ${member.age}, sexo = ${member.sex === 'female' ? 'mujer' : 'hombre'}, condición = ${member.fitness}, masa = ${f(W)} kg`,
      result: `V̇O₂máx = ${f(vo2max)} mL/kg/min, M_sost = ${f(sost_w, 0)} W, FC_máx = ${hrMax} lpm`,
      source: 'ACSM, Guidelines for Exercise Testing and Prescription',
      constants: [
        c('declive', '1 % por año desde los 25', 'publicado', 'ACSM'),
        c('fracción sostenible', `${d.SUSTAINABLE_FRACTION}`, 'diseño'),
        c('tabla de V̇O₂máx y FC en reposo', 'por condición y sexo', 'diseño', 'inspirada en normas ACSM'),
        c('FC_máx = 220 − edad', '220', 'sin etiqueta'),
      ],
    },
    {
      id: 'M9',
      title: 'Frecuencia cardíaca',
      formula: 'FC = FC_rep + (FC_máx − FC_rep)·(V̇O₂ − 3.5)/(V̇O₂máx − 3.5), en mL/kg/min',
      substitution: `FC_rep = ${hrRest} lpm, FC_máx = ${hrMax} lpm, V̇O₂ = ${f(vo2_kg)} mL/kg/min, V̇O₂máx = ${f(vo2max)} mL/kg/min`,
      result: `FC = ${f(hr, 0)} lpm (${f((hr / hrMax) * 100, 0)} % del máximo)`,
      source: 'Swain y Leutholtz (1997), Med. Sci. Sports Exerc. 29(3)',
      constants: [
        c('relación lineal %FCR = %V̇O₂R', 'pendiente 1.00', 'publicado', 'Swain y Leutholtz (1997)'),
        c('V̇O₂ en reposo', `${d.VO2_REST_MLKGMIN} mL/kg/min`, 'sin etiqueta'),
        c('alerta de pulso', `${d.HR_ALERT_FRACTION * 100} % del máximo`, 'diseño'),
      ],
    },
    {
      id: 'M10',
      title: 'Temperatura corporal',
      formula: 'ΔT = (M·(1 − ε) − k·(T − T_amb))/(m·c_p)·Δt  (si falla el enfriamiento);  nominal: T = 37 + min(0.4, 0.4·max(0, (M − 300)/1500))',
      substitution: `M = ${f(M, 0)} W, ε = ${cfg.suit.lcvg_efficiency}, k = ${d.HEAT_LOSS_W_PER_K} W/K, T_amb = ${f(ambient_temp_c)} °C, m = ${f(W)} kg, c_p = ${d.BODY_SPECIFIC_HEAT_J_KGK} J/(kg·K)`,
      result: `nominal: T = ${f(temp_c, 2)} °C; con fallo de enfriamiento: ${failRate_c_h >= 0 ? '+' : ''}${f(failRate_c_h, 2)} °C por hora`,
      source: 'Balance de calor de Gagge, simplificado',
      constants: [
        c('ε, eficiencia del enfriamiento', `${cfg.suit.lcvg_efficiency}`, 'diseño'),
        c('k', `${d.HEAT_LOSS_W_PER_K} W/K`, 'diseño'),
        c('c_p', `${d.BODY_SPECIFIC_HEAT_J_KGK} J/(kg·K)`, 'sin etiqueta'),
        c('alertas', `${d.CORE_TEMP_WARNING_C} °C y ${d.CORE_TEMP_CRITICAL_C} °C`, 'diseño'),
        c('m = masa corporal, T_amb = ambiente del tramo', 'supuesto', 'diseño'),
      ],
    },
    {
      id: 'M11',
      title: 'Hidratación',
      formula: 'ṡ = 0.4·(M/600)·(1 + 0.2·max(0, T − 37)) L/h;  D(t) = ∫(ṡ − ẇ) dt',
      substitution: `M = ${f(M, 0)} W, T = ${f(temp_c, 2)} °C, ẇ = ${cfg.water_intake_lh} L/h`,
      result: `ṡ = ${f(sweat, 2)} L/h; déficit neto = ${f(Math.max(0, sweat - cfg.water_intake_lh), 2)} L/h`,
      source: 'Sawka et al. (2007), ACSM Position Stand, Med. Sci. Sports Exerc. 39(2)',
      constants: [
        c('sudor de referencia', `${d.SWEAT_RATE_LH} L/h a ${d.SWEAT_REFERENCE_W} W`, 'diseño'),
        c('agua disponible', `${cfg.water_intake_lh} L/h`, 'diseño'),
        c('alerta y crítico', `${d.DEHYDRATION_WARNING_PCT} % y ${d.DEHYDRATION_CRITICAL_PCT} % de la masa`, 'publicado', 'Sawka et al. (2007)'),
        c('aumento por grado sobre 37 °C', `${d.SWEAT_PER_DEGREE}`, 'sin etiqueta'),
      ],
    },
    {
      id: 'M12',
      title: 'Radiación',
      formula: 'D = Ḋ·t;  F_carrera = (D_previa + D)/600 mSv',
      substitution: `Ḋ = ${cfg.dose_rate_usv_h} µSv/h, t = ${f(eva_hours)} h, D_previa = ${f(member.prior_dose_msv ?? 0)} mSv`,
      result: `D = ${f(dose, 0)} µSv; F_carrera = ${f(careerFraction(member.prior_dose_msv ?? 0, dose) * 100, 2)} %`,
      source: 'Hassler et al. (2014), Science 343; límite de NASA-STD-3001. Solo rayos cósmicos de fondo: las tormentas solares no están modeladas.',
      constants: [
        c('Ḋ', `${d.DOSE_RATE_USV_H} µSv/h (0.67 mSv/día ÷ 24)`, 'publicado', 'Hassler et al. (2014)'),
        c('límite de carrera', `${d.CAREER_LIMIT_MSV} mSv`, 'publicado', 'NASA-STD-3001'),
      ],
    },
    {
      id: 'M13',
      title: 'Ritmo sostenible y grupo',
      formula: 'v_i = max{ v ≤ v_máx : M_i(v, θ) ≤ M_sost,i };  v_grupo = min_i v_i',
      substitution: `θ = ${f(slope_deg)}°; ritmos individuales: ${pace.member_speeds_ms.map((v, i) => `${crew[i].name} ${f(v, 2)}`).join(', ')} m/s`,
      result: `v_grupo = ${f(pace.speed_ms, 2)} m/s (marca el paso ${crew[pace.slowest_index].name})`,
      source: 'Modelo del proyecto sobre M5 a M12',
      constants: [
        c('rango de velocidad', `${MIN_SPEED_MS} a ${MAX_SPEED_MS} m/s`, 'diseño'),
        c('bisección', `${BISECTION_ITERATIONS} iteraciones`, 'diseño'),
        c('rotación del líder', `cada ${LEADER_ROTATION_S / 60} min`, 'diseño'),
        c('suavizado exponencial α', `${SMOOTHING_ALPHA}`, 'diseño'),
      ],
    },
  ];
}
