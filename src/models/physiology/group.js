// M13: ritmo sostenible y grupo. docs/modelosydb.md, sección 4, grupo C.
// Código puro: sin three.js ni DOM. Cada avance devuelve un grupo nuevo.
import { ETA_SOLO, ETA_LEAD, ETA_FOLLOW } from './defaults.js';
import { marsMetabolic_w } from './metabolic.js';
import { sustainable_w } from './cardio.js';
import { initMemberState, advanceMemberState } from './member.js';

// [diseño] M13: rango de velocidad de marcha, en m/s.
export const MIN_SPEED_MS = 0.3;
export const MAX_SPEED_MS = 1.2;
// [diseño] M13: iteraciones de la bisección.
export const BISECTION_ITERATIONS = 24;
// [diseño] M13: el líder rota cada 20 minutos.
export const LEADER_ROTATION_S = 20 * 60;
// [diseño] M13: suavizado exponencial de pendiente y velocidad.
export const SMOOTHING_ALPHA = 0.12;
// M13: tripulación de 1 a 6.
export const MAX_CREW = 6;

// Estado global, de mejor a peor (M13).
export const STATUS_ORDER = Object.freeze([
  'nominal',
  'low_o2',
  'elevated',
  'at_risk_over_sustainable',
  'critical',
]);

function metabolicAt_w(member, speed_ms, slope_deg, cfg) {
  return marsMetabolic_w({
    mass_kg: member.mass_kg,
    suit_true_mass_kg: cfg.suit.suit_true_mass_kg,
    speed_ms,
    slope_deg,
    eta: member.eta ?? cfg.eta,
    g_mars_ms2: cfg.g_mars_ms2,
    g_earth_ms2: cfg.g_earth_ms2,
    gait_factor: cfg.gait_factor,
    pressure_overhead: cfg.suit.pressure_overhead,
  }).total_w;
}

/**
 * M13: v_i = max{ v <= v_max : M_i(v, theta) <= M_sost,i }, por bisección.
 * slope_deg lleva signo (negativo = cuesta abajo).
 * El documento no dice qué pasa si ni a la velocidad mínima se cumple el límite.
 * Supuesto [diseño]: se camina a la mínima y el estado marcará over_sustainable.
 */
export function sustainableSpeed_ms(member, slope_deg, cfg) {
  const limit_w = sustainable_w(member, cfg.rer);
  if (metabolicAt_w(member, MAX_SPEED_MS, slope_deg, cfg) <= limit_w) return MAX_SPEED_MS;
  if (metabolicAt_w(member, MIN_SPEED_MS, slope_deg, cfg) > limit_w) return MIN_SPEED_MS;
  let low_ms = MIN_SPEED_MS;
  let high_ms = MAX_SPEED_MS;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid_ms = (low_ms + high_ms) / 2;
    if (metabolicAt_w(member, mid_ms, slope_deg, cfg) <= limit_w) low_ms = mid_ms;
    else high_ms = mid_ms;
  }
  return low_ms;
}

// Quien abre camino gasta más (eta 1.2), quien sigue menos (1.05); a solas, 1.1.
function withRoles(members, leader_index) {
  if (members.length === 1) return [{ ...members[0], eta: ETA_SOLO }];
  return members.map((member, i) => ({ ...member, eta: i === leader_index ? ETA_LEAD : ETA_FOLLOW }));
}

/**
 * M13: v_grupo = min_i v_i. El grupo va al paso del más lento.
 * -> { speed_ms, member_speeds_ms, slowest_index }
 */
export function groupPace(members, slope_deg, cfg, leader_index = 0) {
  const member_speeds_ms = withRoles(members, leader_index).map((member) =>
    sustainableSpeed_ms(member, slope_deg, cfg),
  );
  const speed_ms = Math.min(...member_speeds_ms);
  return { speed_ms, member_speeds_ms, slowest_index: member_speeds_ms.indexOf(speed_ms) };
}

export function createGroup(members, cfg) {
  if (!Array.isArray(members) || members.length < 1 || members.length > MAX_CREW) {
    throw new Error(`La tripulación debe tener de 1 a ${MAX_CREW} personas.`);
  }
  return {
    members: members.map((member) => ({ ...member })),
    cfg,
    states: members.map((member) => initMemberState(member, cfg)),
    leader_index: 0,
    leader_elapsed_s: 0,
    elapsed_h: 0,
    speed_ms: 0,
    // Valores suavizados; null hasta el primer tramo.
    smoothed_slope_deg: null,
    smoothed_speed_ms: null,
  };
}

/**
 * Avanza el grupo un tramo.
 * segment = { slope_deg, delta_elev_m, surface_distance_m, ambient_temp_c }
 * El ritmo sale de M13; walking_time_h y walk_speed_ms se calculan aquí.
 */
export function advanceGroupState(segment, group) {
  const { members, cfg } = group;
  const slope_signed_deg = Math.sign(segment.delta_elev_m || 0) * Math.abs(segment.slope_deg);

  // Suavizado exponencial de la pendiente (alfa = 0.12).
  const smoothed_slope_deg =
    group.smoothed_slope_deg === null
      ? slope_signed_deg
      : group.smoothed_slope_deg + SMOOTHING_ALPHA * (slope_signed_deg - group.smoothed_slope_deg);

  // El ritmo objetivo se calcula con la pendiente real del tramo, y la velocidad suavizada
  // nunca lo supera: el grupo no va más rápido que su miembro más lento.
  const pace = groupPace(members, slope_signed_deg, cfg, group.leader_index);
  const eased_ms =
    group.smoothed_speed_ms === null
      ? pace.speed_ms
      : group.smoothed_speed_ms + SMOOTHING_ALPHA * (pace.speed_ms - group.smoothed_speed_ms);
  const speed_ms = Math.min(eased_ms, pace.speed_ms);

  const time_s = segment.surface_distance_m / speed_ms;
  const memberSegment = {
    walking_time_h: time_s / 3600,
    slope_deg: Math.abs(segment.slope_deg),
    delta_elev_m: segment.delta_elev_m,
    surface_distance_m: segment.surface_distance_m,
    walk_speed_ms: speed_ms,
    ambient_temp_c: segment.ambient_temp_c,
  };
  const roles = withRoles(members, group.leader_index);
  const states = group.states.map((state, i) => advanceMemberState(memberSegment, state, roles[i], cfg));

  // Rotación del líder cada 20 minutos.
  let leader_index = group.leader_index;
  let leader_elapsed_s = group.leader_elapsed_s + time_s;
  while (leader_elapsed_s >= LEADER_ROTATION_S) {
    leader_elapsed_s -= LEADER_ROTATION_S;
    leader_index = (leader_index + 1) % members.length;
  }

  return {
    members,
    cfg,
    states,
    leader_index,
    leader_elapsed_s,
    elapsed_h: group.elapsed_h + time_s / 3600,
    speed_ms,
    smoothed_slope_deg,
    smoothed_speed_ms: speed_ms,
  };
}

// El documento no dice qué bandera lleva a cada estado. Asignación acordada con el equipo [diseño].
export function memberStatus(flags) {
  if (
    flags.o2_depleted || flags.thermal_critical || flags.dehydration_critical ||
    flags.career_dose_exceeded
  ) {
    return 'critical';
  }
  if (flags.over_sustainable) return 'at_risk_over_sustainable';
  if (flags.hr_above_85pct || flags.thermal_warning || flags.dehydration_warning) return 'elevated';
  if (flags.o2_low) return 'low_o2';
  return 'nominal';
}

/**
 * Estado agregado: el peor valor de cada variable y quién lo tiene, más el estado global.
 * -> { status, status_member, worst: { variable: { value, member } } }
 */
export function aggregateGroupState(group) {
  const names = group.members.map((member, i) => member.name ?? `miembro ${i + 1}`);
  const worstOf = (valueOf, isWorse) => {
    let best = null;
    group.states.forEach((state, i) => {
      const value = valueOf(state);
      if (best === null || isWorse(value, best.value)) best = { value, member: names[i] };
    });
    return best;
  };
  const higher = (a, b) => a > b;
  const lower = (a, b) => a < b;

  let status = 'nominal';
  let status_member = null;
  group.states.forEach((state, i) => {
    const memberState = memberStatus(state.flags);
    if (STATUS_ORDER.indexOf(memberState) > STATUS_ORDER.indexOf(status)) {
      status = memberState;
      status_member = names[i];
    }
  });

  return {
    status,
    status_member,
    worst: {
      o2_l: worstOf((s) => s.o2_l, lower),
      metabolic_ratio: worstOf((s) => s.metabolic_w / s.sustainable_w, higher),
      heart_rate_fraction: worstOf((s) => s.heart_rate_bpm / s.hr_max_bpm, higher),
      core_temp_c: worstOf((s) => s.core_temp_c, higher),
      dehydration_pct: worstOf((s) => s.dehydration_pct, higher),
      career_fraction: worstOf((s) => s.career_fraction, higher),
    },
  };
}
