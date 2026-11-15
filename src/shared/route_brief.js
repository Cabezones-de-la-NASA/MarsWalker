// Resumen de una ruta (o de la comparación de dos) para que el LLM la explique.
// Código puro. Todos los números salen de los modelos; el LLM solo los redacta.
import { tr } from './i18n.js';

const ALGORITHM_NAMES = {
  astar: tr('Ahorra oxígeno (A*: el camino que menos oxígeno gasta)'),
  health: tr('Cuida al astronauta (pondera las métricas de salud elegidas)'),
  qaoa: tr('Corredor inspirado en QAOA (algoritmo clásico que explora un corredor de rutas en rondas)'),
};

const fixed = (value, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : tr('sin dato'));

/**
 * buildRouteBrief({ algorithm, metrics, unsafe_segments, o2_capacity_l, dimensions, comparison }) -> texto
 *   metrics           { distance_m, oxygen_l, max_slope_deg, risk_score, time_s }
 *   unsafe_segments   tramos de más de 25° que cruza
 *   o2_capacity_l     oxígeno del tanque, para dar proporción (opcional)
 *   dimensions        métricas activas de la ruta por salud (opcional)
 *   comparison        { clave: { classic, health, diff_pct } } de la comparación (opcional)
 */
export function buildRouteBrief({ algorithm, metrics, unsafe_segments = 0, o2_capacity_l, dimensions, comparison }) {
  const lines = [tr('RUTA CALCULADA')];
  lines.push(tr`Forma de planificar: ${ALGORITHM_NAMES[algorithm] ?? algorithm}.`);
  if (dimensions?.length) lines.push(tr`Métricas de salud activas: ${dimensions.join(', ')}.`);
  lines.push(tr`Distancia: ${fixed(metrics.distance_m)} m.`);
  if (Number.isFinite(metrics.time_s)) lines.push(tr`Tiempo caminando: ${fixed(metrics.time_s / 60)} min.`);
  const share = Number.isFinite(o2_capacity_l) && o2_capacity_l > 0
    ? tr` (${fixed((metrics.oxygen_l / o2_capacity_l) * 100)} % del tanque de ${fixed(o2_capacity_l)} L)` : '';
  lines.push(tr`Oxígeno: ${fixed(metrics.oxygen_l, 1)} L${share}.`);
  lines.push(tr`Pendiente máxima: ${fixed(metrics.max_slope_deg, 1)}° (el límite seguro es 25°).`);
  lines.push(tr`Tramos por encima de 25°: ${unsafe_segments}.`);
  lines.push(tr`Índice de riesgo medio (0 seguro, 1 en el límite): ${fixed(metrics.risk_score, 2)}.`);
  if (comparison) {
    lines.push(tr('COMPARACIÓN entre la ruta clásica (ahorra oxígeno) y la de salud:'));
    for (const [key, label, unit] of [
      ['distance_m', tr('Distancia'), 'm'], ['time_h', tr('Tiempo'), 'h'], ['o2_used_l', tr('Oxígeno'), 'L'],
      ['peak_metabolic_w', tr('Pico de esfuerzo'), 'W'], ['peak_heart_rate_bpm', tr('Pico de pulso'), tr('lpm')],
      ['minutes_over_sustainable', tr('Minutos por encima del ritmo sostenible'), 'min'],
    ]) {
      const item = comparison[key];
      if (!item) continue;
      lines.push(tr`- ${label}: clásica ${fixed(item.classic, 2)} ${unit}, salud ${fixed(item.health, 2)} ${unit}.`);
    }
  }
  return lines.join('\n');
}
