import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/shared/constants.js';

test('constantes planetarias de la tabla 2.3', () => {
  assert.equal(c.MARS_RADIUS_M, 3_390_000);
  assert.equal(c.MARS_DAY_H, 24.6);
  assert.equal(c.MARS_YEAR_SOLS, 669.6);
  assert.equal(c.MARS_YEAR_EARTH_DAYS, 687);
  assert.equal(c.MARS_AXIAL_TILT_DEG, 25);
  assert.equal(c.MARS_SUN_DISTANCE_AU, 1.5);
  assert.equal(c.MARS_SURFACE_TEMP_MAX_C, 20);
  assert.equal(c.MARS_SURFACE_TEMP_MIN_C, -153);
  assert.deepEqual(c.MARS_MOONS, ['Phobos', 'Deimos']);
  assert.equal(c.MARS_GRAVITY_MS2, 3.71);
});

test('el año en soles y en días terrestres es coherente con el día', () => {
  const year_h = c.MARS_YEAR_EARTH_DAYS * 24;
  const sol_h = year_h / c.MARS_YEAR_SOLS;
  // Un sol dura ~24.66 h; F2 redondea el día sideral a 24.6 h.
  assert.ok(Math.abs(sol_h - c.MARS_DAY_H) < 0.1);
});
