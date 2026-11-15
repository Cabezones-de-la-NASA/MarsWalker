// Lo que el rover sabe al responder: un resumen del estado de la caminata. (El personaje
// lo pone el servidor, en server/lib/rover.js.)
// Código puro (sin DOM ni red). Lo usa el chat del rover, tanto con LLM como sin él.
import { tr } from './i18n.js';

const fixed = (value, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : tr('sin dato'));
const STATUS_LABELS = {
  nominal: tr('nominal'),
  low_o2: tr('oxígeno bajo'),
  elevated: tr('elevado'),
  at_risk_over_sustainable: tr('en riesgo: sobre el ritmo sostenible'),
  critical: tr('crítico'),
};
const PHASE_LABELS = { day: tr('día'), twilight: tr('crepúsculo'), night: tr('noche') };

/**
 * buildRoverContext(snapshot, facts) -> texto para el LLM.
 * snapshot (todo opcional salvo zone):
 *   zone            { label, resolution_m }
 *   position_m      [x_m, z_m]
 *   elevation_m, slope_deg
 *   vitals          { o2_l, o2_fraction, autonomy_h, heart_rate_bpm, core_temp_c, status }
 *   environment     { ltst_h, ambient_temp_c, phase, dust_tau, storm }
 *   progress        { visited, objectives, samples, sampleSites }
 *   walked_m, driven_m, in_vehicle, time_scale
 *   nearby          [{ name, type, distance_m, description }]
 * facts: [{ text, source }]
 */
export function buildRoverContext(snapshot, facts = []) {
  const lines = [tr('CONTEXTO')];
  const { zone, position_m, vitals, environment, progress, nearby = [] } = snapshot;
  if (zone) lines.push(tr`Zona: ${zone.label} (modelo de elevación de ${fixed(zone.resolution_m, 0)} m por píxel).`);
  if (position_m) {
    lines.push(
      tr`Posición: x ${fixed(position_m[0])} m (este), z ${fixed(position_m[1])} m (sur); ` +
      tr`elevación ${fixed(snapshot.elevation_m, 1)} m; pendiente ${fixed(snapshot.slope_deg, 1)}° ` +
      tr('(más de 25° se considera inseguro).'),
    );
  }
  if (vitals) {
    lines.push(
      tr`Astronauta: oxígeno ${fixed(vitals.o2_l)} L (${fixed(vitals.o2_fraction * 100)} % del tanque), ` +
      tr`autonomía ${fixed(vitals.autonomy_h, 1)} h, pulso ${fixed(vitals.heart_rate_bpm)} lpm, ` +
      tr`temperatura corporal ${fixed(vitals.core_temp_c, 1)} °C, estado ${STATUS_LABELS[vitals.status] ?? vitals.status ?? tr('sin dato')}.`,
    );
  }
  if (environment) {
    lines.push(
      tr`Entorno: hora solar local ${fixed(environment.ltst_h, 1)} h, ${PHASE_LABELS[environment.phase] ?? environment.phase ?? tr('sin dato')}, ` +
      tr`temperatura ambiente ${fixed(environment.ambient_temp_c)} °C, polvo τ ${fixed(environment.dust_tau, 1)}` +
      `${environment.storm ? tr(', tormenta de polvo activa') : ''}.`,
    );
  }
  if (progress) {
    lines.push(
      tr`Misión: ${progress.visited} de ${progress.objectives} objetivos visitados, ` +
      tr`${progress.samples} de ${progress.sampleSites} muestras recogidas.`,
    );
  }
  if (Number.isFinite(snapshot.walked_m)) {
    lines.push(
      tr`Recorrido: ${fixed(snapshot.walked_m)} m a pie y ${fixed(snapshot.driven_m ?? 0)} m en camioneta. ` +
      tr`${snapshot.in_vehicle ? tr('Ahora va en la camioneta. ') : ''}El tiempo corre a ${fixed(snapshot.time_scale ?? 1)}×.`,
    );
  }
  if (nearby.length) {
    lines.push(tr('Puntos de interés cercanos:'));
    for (const poi of nearby) {
      lines.push(tr`- ${poi.name} (${poi.type}), a ${fixed(poi.distance_m)} m. ${poi.description ?? ''}`.trim());
    }
  }
  if (facts.length) {
    lines.push(tr('Datos de Marte verificados (cita la fuente si los usas):'));
    for (const fact of facts) lines.push(`- ${fact.text} [${fact.source}]`);
  }
  return lines.join('\n');
}

// Palabras que no ayudan a elegir un dato.
const STOP_WORDS = new Set([
  'que', 'qué', 'como', 'cómo', 'cual', 'cuál', 'cuanto', 'cuánto', 'cuanta', 'cuánta', 'cuantos', 'cuántos',
  'los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'por', 'para', 'con', 'sin', 'hay', 'tiene', 'tienen',
  'esta', 'está', 'este', 'esto', 'son', 'eres', 'marte', 'sobre', 'dime', 'cuéntame', 'cuentame', 'algo',
  'más', 'mas', 'muy', 'aquí', 'aqui', 'hace', 'the',
  // inglés
  'what', 'how', 'which', 'much', 'many', 'and', 'are', 'does', 'has', 'have', 'there', 'this', 'that', 'about', 'tell',
  'mars', 'with', 'for', 'from', 'more', 'very', 'here', 'you', 'your',
]);

function words(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Respuesta sin LLM: el dato de la lista que más palabras comparte con la pregunta; si
 * ninguno coincide, el siguiente de la lista (fallbackIndex).
 * -> { fact: { text, source }, matched: bool }
 */
export function pickMockReply(question, facts, fallbackIndex = 0) {
  const asked = new Set(words(question ?? ''));
  let best = null;
  let bestScore = 0;
  for (const fact of facts) {
    // Coincidencia por raíz: "lunas" y "luna", "temperaturas" y "temperatura".
    const factWords = words(fact.text);
    let score = 0;
    for (const word of asked) {
      const stem = word.length > 4 ? word.slice(0, -1) : word;
      if (factWords.some((candidate) => candidate.startsWith(stem))) score += 1;
    }
    if (score > bestScore) {
      best = fact;
      bestScore = score;
    }
  }
  if (best) return { fact: best, matched: true };
  return { fact: facts[((fallbackIndex % facts.length) + facts.length) % facts.length], matched: false };
}
