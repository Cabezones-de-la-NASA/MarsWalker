import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EN, EN_PATTERNS } from '../src/shared/i18n_en.js';
import { tr, translate, trData, getLang, setLang, LANGUAGES } from '../src/shared/i18n.js';
import { MARS_FACTS } from '../src/shared/mars_facts.js';
import { QAOA_NOTICE } from '../src/models/routing/qaoa_inspired.js';
import { CREDIT_GROUPS } from '../src/dashboard/views/credits_data.js';
import { LAYER_DEFS } from '../src/dashboard/layers/layer_defs.js';
import { buildFormulaCards } from '../src/dashboard/views/formulas_data.js';
import { DEFAULT_CREW } from '../src/dashboard/default_crew.js';
import { defaultConfig } from '../src/models/physiology/defaults.js';
import { CAPSULE_FACT_RE } from '../src/gameplay/interact.js';
import { SAMPLE_FACT_RE } from '../src/gameplay/sortie.js';

const ROOT = new URL('..', import.meta.url).pathname;

// Claves de tr('…') y tr`…` en el código: lo mismo que ve la función al ejecutarse.
function keysIn(source) {
  const keys = [];
  const start = /\btr(\(\s*(['"])|`)/g;
  let match;
  while ((match = start.exec(source))) {
    let i = start.lastIndex;
    let key = '';
    if (match[1] === '`') {
      while (source[i] !== '`') {
        if (source[i] === '\\') { key += source[i + 1]; i += 2; continue; }
        if (source.startsWith('${', i)) {
          let depth = 1;
          i += 2;
          while (depth) {
            const c = source[i];
            if (c === '{') depth += 1;
            else if (c === '}') depth -= 1;
            else if (c === "'" || c === '"' || c === '`') {
              i += 1;
              while (source[i] !== c) i += source[i] === '\\' ? 2 : 1;
            }
            i += 1;
          }
          key += '{}';
          continue;
        }
        key += source[i];
        i += 1;
      }
    } else {
      const quote = match[2];
      while (source[i] !== quote) {
        if (source[i] === '\\') { key += source[i + 1] === 'n' ? '\n' : source[i + 1]; i += 2; continue; }
        key += source[i];
        i += 1;
      }
    }
    keys.push(key);
  }
  return keys;
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.js') && !/i18n(_en)?\.js$/.test(path) ? [path] : [];
  });
}

test('idiomas: inglés por defecto en el navegador, español en las pruebas', () => {
  assert.deepEqual(LANGUAGES.map(([code]) => code), ['en', 'es']); // el primero es el de por defecto
  assert.equal(getLang(), 'es'); // en Node, el idioma del código
  assert.equal(tr('Calcular'), 'Calcular');
});

test('idiomas: tr traduce textos fijos y con valores', () => {
  assert.equal(translate('Calcular', [], 'en'), 'Compute');
  assert.equal(translate('Tormenta en {} s', [12], 'en'), 'Storm in 12 s');
  assert.equal(translate('Tormenta en {} s', [12], 'es'), 'Tormenta en 12 s');
  assert.equal(translate('{} de {} muestras recogidas.', [1, 4], 'en'), '1 of 4 samples collected.');
  assert.equal(translate('Traer la camioneta (está a {})', ['8 m'], 'en'), 'Bring the truck (8 m away)');
  assert.equal(translate('texto sin traducir', [], 'en'), 'texto sin traducir'); // cae al español
  assert.equal(tr`Nivel ${2} de ${10}`, 'Nivel 2 de 10');
});

test('idiomas: no falta la traducción de ningún texto del código', () => {
  const missing = [];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    for (const key of keysIn(readFileSync(file, 'utf8'))) {
      if (!(key in EN)) missing.push(`${file.replace(ROOT, '')}: ${JSON.stringify(key)}`);
    }
  }
  assert.deepEqual(missing, []);
  // Textos que llegan por variable (no los ve el rastreo de arriba).
  for (const key of [QAOA_NOTICE, 'El punto de inicio está fuera del mapa.', 'Tú', 'Rover', 'Bajo', 'Medio', 'Alto', 'baja', 'nominal', 'buena', 'elite']) assert.ok(key in EN, key);
  // Y los marcadores {} cuadran: la traducción no pide más valores de los que hay.
  for (const [key, value] of Object.entries(EN)) {
    const slots = (text) => (text.match(/\{\d*\}/g) ?? []).length;
    assert.ok(slots(value) <= slots(key), `sobran marcadores en ${JSON.stringify(key)}`);
  }
});

test('idiomas: los datos de Marte y los puntos de interés se traducen enteros', () => {
  const spanish = /\b(el|la|los|las|del|con|por|para|una|que|está|pendiente|muestra|imagen|posición)\b/i;
  for (const fact of MARS_FACTS) {
    assert.ok(fact.text in EN && fact.source in EN, fact.text);
  }
  for (const folder of readdirSync(join(ROOT, 'public/data'))) {
    const path = join(ROOT, 'public/data', folder, 'poi.json');
    let poi;
    try {
      poi = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    for (const point of poi.points) {
      for (const field of ['name', 'description', 'source']) {
        const english = trData(point[field], 'en');
        assert.ok(!spanish.test(english), `${folder} ${point.id}.${field} quedó a medias: ${english}`);
        assert.equal(trData(point[field], 'es'), point[field]);
      }
    }
  }
  for (const zone of JSON.parse(readFileSync(join(ROOT, 'public/data/index.json'), 'utf8')).datasets ?? []) {
    assert.ok(zone.label in EN, zone.label);
  }
  assert.ok(EN_PATTERNS.length > 0);
  assert.equal(trData('Objetivo 3', 'en'), 'Objective 3');
  assert.equal(trData('Mi roca favorita', 'en'), 'Mi roca favorita'); // nombres del usuario: intactos
  assert.equal(
    trData('No hay camino entre los dos puntos sin cruzar pendientes de más de 25°.', 'en'),
    'There is no path between the two points without crossing slopes steeper than 25°.',
  );

  // Regexp de datos en cápsula y muestras: funcionan tanto en español como en inglés.
  const englishFacts = MARS_FACTS.map((fact) => ({ ...fact, text: translate(fact.text, [], 'en') }));
  assert.ok(MARS_FACTS.some((f) => CAPSULE_FACT_RE.test(f.text)));
  assert.ok(englishFacts.some((f) => CAPSULE_FACT_RE.test(f.text)));
  assert.ok(MARS_FACTS.some((f) => SAMPLE_FACT_RE.test(f.text)));
  assert.ok(englishFacts.some((f) => SAMPLE_FACT_RE.test(f.text)));

  // Capas y créditos corregidos presentes en EN.
  const riskLayer = LAYER_DEFS.find((l) => l.id === 'risk');
  assert.ok(riskLayer.label in EN);
  for (const b of riskLayer.bands) assert.ok(b.label in EN, b.label);
  for (const group of CREDIT_GROUPS) {
    assert.ok(group.title in EN, group.title);
    for (const item of group.items) {
      assert.ok(item.use in EN, item.use);
    }
  }

  // Tarjetas de fórmulas en inglés sin restos en español.
  const previousLang = getLang();
  try {
    setLang('en');
    const cfg = defaultConfig();
    const cards = DEFAULT_CREW.flatMap((_, index) => buildFormulaCards(DEFAULT_CREW, index, cfg, { slope_deg: 5, eva_hours: 4, ambient_temp_c: -60 }));
    const serialized = JSON.stringify(cards);
    for (const leaked of ['traje', 'M_Marte', 'M_reposo', 'g_T', 'D_previa', 'F_carrera', 'edad', 'condición', 'mujer', 'hombre', 'buena', 'declive', 'alertas', 'iteraciones', 'Swain y', ' L/h a ']) {
      assert.ok(!serialized.includes(leaked), `Fórmula en inglés aún contiene ${JSON.stringify(leaked)}`);
    }
  } finally {
    setLang(previousLang);
  }
});
