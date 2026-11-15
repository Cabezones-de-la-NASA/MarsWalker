import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, PERSONAS, validateRequest, toGeminiRequest, fromGeminiResponse, createRateLimiter, originAllowed,
} from '../server/lib/rover.js';
import { buildRouteBrief } from '../src/shared/route_brief.js';

const good = { kind: 'chat', context: 'CONTEXTO\nZona: Jezero.', messages: [{ role: 'user', content: '¿Cuánto oxígeno me queda?' }] };

test('servidor del rover: acepta una petición correcta y rechaza las demás', () => {
  assert.equal(validateRequest(good).ok, true);
  for (const bad of [
    null, 'texto', { ...good, kind: 'otro' }, { ...good, kind: 'constructor' }, { ...good, context: 5 },
    { ...good, context: 'x'.repeat(LIMITS.context_chars + 1) }, { ...good, messages: [] },
    { ...good, messages: Array(LIMITS.messages + 1).fill(good.messages[0]) },
    { ...good, messages: [{ role: 'system', content: 'hola' }] },
    { ...good, messages: [{ role: 'user', content: 'x'.repeat(LIMITS.message_chars + 1) }] },
    { ...good, messages: [{ role: 'user', content: '   ' }] },
    { ...good, messages: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'dime' }] },
  ]) {
    assert.equal(validateRequest(bad).ok, false, JSON.stringify(bad)?.slice(0, 80));
  }
});

test('servidor del rover: el personaje lo pone el servidor y la conversación va en el formato de Gemini', () => {
  const request = toGeminiRequest({
    kind: 'route', context: 'RUTA CALCULADA',
    messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }],
  });
  assert.ok(request.system_instruction.parts[0].text.startsWith(PERSONAS.route));
  assert.match(request.system_instruction.parts[0].text, /Always answer in English/); // inglés por defecto
  assert.match(toGeminiRequest({ kind: 'chat', context: 'c', lang: 'es', messages: [{ role: 'user', content: 'a' }] }).system_instruction.parts[0].text, /Responde siempre en español/);
  assert.equal(validateRequest({ ...good, lang: 'es' }).lang, 'es');
  assert.equal(validateRequest({ ...good, lang: 'fr' }).lang, 'en');
  assert.ok(request.system_instruction.parts[0].text.endsWith('RUTA CALCULADA'));
  assert.deepEqual(request.contents.map((item) => item.role), ['user', 'model', 'user']);
  assert.equal(request.contents[1].parts[0].text, 'b');
  assert.equal(request.generationConfig.maxOutputTokens, LIMITS.output_tokens);
  for (const persona of Object.values(PERSONAS)) assert.match(persona, /no inventes cifras/);
});

test('servidor del rover: saca el texto de la respuesta o null si no hay', () => {
  assert.equal(fromGeminiResponse({ candidates: [{ content: { parts: [{ text: 'Hola, ' }, { text: 'astronauta.' }] } }] }), 'Hola, astronauta.');
  for (const empty of [null, {}, { candidates: [] }, { candidates: [{ finishReason: 'SAFETY' }] }, { candidates: [{ content: { parts: [{ text: '  ' }] } }] }]) {
    assert.equal(fromGeminiResponse(empty), null);
  }
});

test('servidor del rover: límite por visitante y orígenes permitidos', () => {
  const allow = createRateLimiter({ max: 3, window_ms: 1000 });
  assert.deepEqual([allow('a', 0), allow('a', 10), allow('a', 20), allow('a', 30)], [true, true, true, false]);
  assert.equal(allow('b', 30), true); // otro visitante no se ve afectado
  assert.equal(allow('a', 1500), true); // pasada la ventana, vuelve a poder
  const list = 'https://cabezones-de-la-nasa.github.io, http://localhost:5173';
  assert.equal(originAllowed('https://cabezones-de-la-nasa.github.io', list), true);
  assert.equal(originAllowed('http://localhost:5173', list), true);
  assert.equal(originAllowed('https://otro.example', list), false);
  assert.equal(originAllowed(undefined, list), false);
});

test('rutas: el resumen para el rover lleva los números de los modelos', () => {
  const brief = buildRouteBrief({
    algorithm: 'health', dimensions: ['pendiente', 'pulso'], unsafe_segments: 2, o2_capacity_l: 580,
    metrics: { distance_m: 2250.4, oxygen_l: 58, max_slope_deg: 27.35, risk_score: 0.31, time_s: 1860 },
    comparison: { distance_m: { classic: 2100, health: 2250, diff_pct: 7 }, o2_used_l: { classic: 50, health: 58, diff_pct: 16 } },
  });
  for (const piece of ['Cuida al astronauta', 'pendiente, pulso', 'Distancia: 2250 m', '31 min', '58.0 L (10 % del tanque de 580 L)',
    '27.4°', 'Tramos por encima de 25°: 2', '0.31', 'COMPARACIÓN', 'clásica 50.00 L, salud 58.00 L']) {
    assert.ok(brief.includes(piece), `falta "${piece}" en:\n${brief}`);
  }
  const plain = buildRouteBrief({ algorithm: 'astar', metrics: { distance_m: 100, oxygen_l: 3, max_slope_deg: 4, risk_score: 0.1, time_s: NaN } });
  assert.ok(!plain.includes('Tiempo') && !plain.includes('COMPARACIÓN') && plain.includes('Ahorra oxígeno'));
});
