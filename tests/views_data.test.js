// Datos de las vistas Fórmulas y Créditos (sin DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { defaultConfig } from '../src/models/physiology/defaults.js';
import { buildFormulaCards } from '../src/dashboard/views/formulas_data.js';
import { CREDIT_GROUPS, NASA_DISCLAIMER } from '../src/dashboard/views/credits_data.js';

const CREW = [
  { name: 'Ana', age: 34, sex: 'female', mass_kg: 62, fitness: 'buena', prior_dose_msv: 0 },
  { name: 'Luis', age: 45, sex: 'male', mass_kg: 80, fitness: 'buena', prior_dose_msv: 0 },
];

test('Fórmulas: lista M5 a M13, cada una con fuente y constantes etiquetadas', () => {
  const cards = buildFormulaCards(CREW, 1, defaultConfig(), { slope_deg: 3 });
  assert.deepEqual(cards.map((card) => card.id), ['M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13']);
  for (const card of cards) {
    for (const key of ['title', 'formula', 'substitution', 'result', 'source']) {
      assert.ok(card[key].length > 0, `${card.id}.${key}`);
      assert.ok(!/NaN|undefined|Infinity/.test(card[key]), `${card.id}.${key}: ${card[key]}`);
    }
    assert.ok(card.constants.length > 0, card.id);
    for (const constant of card.constants) {
      assert.ok(['publicado', 'diseño', 'sin etiqueta'].includes(constant.tag), `${card.id}: ${constant.name}`);
    }
  }
});

test('Fórmulas: los valores sustituidos son los de los modelos', () => {
  const cards = Object.fromEntries(
    buildFormulaCards(CREW, 1, defaultConfig(), { slope_deg: 0 }).map((card) => [card.id, card]),
  );
  assert.match(cards.M7.substitution, /E_O₂ = 20\.20 kJ\/L/);
  assert.match(cards.M8.result, /V̇O₂máx = 41\.6 mL\/kg\/min/); // 45 años, condición buena
  assert.match(cards.M8.result, /FC_máx = 175 lpm/);
  assert.match(cards.M12.result, /D = 223 µSv/); // 8 h
  assert.match(cards.M13.result, /marca el paso (Ana|Luis)/);
});

test('Créditos: están todas las fuentes de la sección 2', () => {
  const ids = CREDIT_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'G1', 'G2', 'G3', 'G4']) {
    assert.ok(ids.includes(id), id);
  }
  for (const model of ['M1', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M15', 'M16', 'M17']) {
    assert.ok(ids.includes(model), model);
  }
  for (const group of CREDIT_GROUPS) {
    for (const item of group.items) {
      assert.ok(item.name && item.use);
      if (item.url) assert.ok(item.url.startsWith('https://'), item.url);
    }
  }
  assert.match(NASA_DISCLAIMER, /No está respaldado ni patrocinado por NASA/);
});

test('revisión final: ningún archivo de src/models/ importa three.js ni toca el DOM', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.js')) files.push(path);
    }
  };
  walk(new URL('../src/models', import.meta.url).pathname);
  assert.ok(files.length > 15);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/from\s+['"]three/.test(source), `${file} importa three.js`);
    assert.ok(!/\b(document|window)\./.test(source), `${file} toca el DOM`);
    // src/models/ solo importa de src/models/ y de src/shared/.
    for (const [, target] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(
        target.startsWith('./') || target.startsWith('../') && !/dashboard|gameplay|intro|models3d/.test(target),
        `${file} importa ${target}`,
      );
    }
  }
});
