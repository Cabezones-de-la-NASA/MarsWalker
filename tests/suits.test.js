import test from 'node:test';
import assert from 'node:assert/strict';
import { SUITS, suitToConfig } from '../src/models/suits/catalog.js';
import { MARS_GRAVITY_MS2 } from '../src/shared/constants.js';

test('catálogo: xEMU con los valores de la tabla', () => {
  const suit = SUITS.xemu;
  assert.equal(suit.mass_kg, 170);
  assert.equal(suit.pressure_kpa, 29.6);
  assert.equal(suit.pressure_psi, 4.3);
  assert.equal(suit.o2_primary_l, 580);
  assert.equal(suit.o2_secondary_min, 30);
  assert.equal(suit.cooling_efficiency, 0.85);
  assert.equal(suit.drinking_water_l, 2.0);
  assert.equal(suit.pressure_overhead, 0.3);
});

test('suitToConfig escala la masa por g_M / g_T y saca el 10 % crítico de O2', () => {
  const cfg = suitToConfig(SUITS.xemu, MARS_GRAVITY_MS2, 9.81);
  assert.ok(Math.abs(cfg.suit_mass_kg - (170 * 3.71) / 9.81) < 1e-12);
  assert.equal(cfg.suit_true_mass_kg, 170);
  assert.equal(cfg.o2_capacity_l, 580);
  assert.equal(cfg.o2_critical_l, 58);
  assert.equal(cfg.pressure_overhead, 0.3);
  assert.equal(cfg.lcvg_efficiency, 0.85);
  // Con la misma gravedad la carga es la masa real.
  assert.equal(suitToConfig(SUITS.xemu, 9.81, 9.81).suit_mass_kg, 170);
});
