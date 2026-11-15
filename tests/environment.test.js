import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solarState, sunDistance_au, sunDirection, MARS_SEMI_MAJOR_AXIS_AU, MARS_ECCENTRICITY,
  PERIHELION_LS_DEG, MARS_OBLIQUITY_DEG, SOLAR_CONSTANT_W_M2, JEZERO_LAT_DEG,
} from '../src/models/environment/solar.js';
import {
  ambientTemp_c, weatherState, weatherParams, nearestShelter,
} from '../src/models/environment/weather.js';
import { MARS_SURFACE_TEMP_MAX_C, MARS_SURFACE_TEMP_MIN_C } from '../src/shared/constants.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// ---------------------------------------------------------------- M16

test('M16: constantes', () => {
  assert.equal(MARS_SEMI_MAJOR_AXIS_AU, 1.52368);
  assert.equal(MARS_ECCENTRICITY, 0.0934);
  assert.equal(PERIHELION_LS_DEG, 251);
  assert.equal(MARS_OBLIQUITY_DEG, 25.19);
  assert.equal(SOLAR_CONSTANT_W_M2, 1361);
  assert.equal(JEZERO_LAT_DEG, 18.4);
});

test('M16: mediodía, equinoccio, latitud 0 -> alfa = 90°', () => {
  for (const ls_deg of [0, 180]) {
    const sun = solarState({ ls_deg, ltst_h: 12, lat_deg: 0, dust_tau: 0 });
    close(sun.elevation_deg, 90, 1e-6);
    assert.equal(sun.phase, 'day');
    close(sun.air_mass, 1);
    // Sin polvo, toda la irradiancia del tope llega directa.
    close(sun.direct_w_m2, sun.irradiance_top_w_m2, 1e-9);
    close(sun.diffuse_w_m2, 0);
  }
});

test('M16: perihelio > afelio', () => {
  const perihelion = solarState({ ls_deg: 251, ltst_h: 12, lat_deg: 0, dust_tau: 0.5 });
  const aphelion = solarState({ ls_deg: 71, ltst_h: 12, lat_deg: 0, dust_tau: 0.5 });
  assert.ok(perihelion.irradiance_top_w_m2 > aphelion.irradiance_top_w_m2);
  assert.ok(perihelion.sun_distance_au < aphelion.sun_distance_au);
  close(sunDistance_au(251), 1.52368 * (1 - 0.0934), 1e-12);
  close(sunDistance_au(71), 1.52368 * (1 + 0.0934), 1e-12);
  close(perihelion.irradiance_top_w_m2, 1361 / (1.52368 * (1 - 0.0934)) ** 2, 1e-9);
});

test('M16: de noche, irradiancia 0', () => {
  for (const ltst_h of [0, 2, 22, 23.5]) {
    const sun = solarState({ ls_deg: 90, ltst_h, lat_deg: 18.4, dust_tau: 0.5 });
    assert.ok(sun.elevation_deg < 0);
    assert.equal(sun.direct_w_m2, 0);
    assert.equal(sun.diffuse_w_m2, 0);
    assert.equal(sun.surface_w_m2, 0);
    assert.equal(sun.air_mass, null);
  }
  assert.equal(solarState({ ls_deg: 0, ltst_h: 0, lat_deg: 18.4 }).phase, 'night');
});

test('M16: fases por altura del Sol', () => {
  const phaseAt = (ltst_h) => solarState({ ls_deg: 0, ltst_h, lat_deg: 0 });
  // En el ecuador y en equinoccio el Sol sube 15° por hora desde las 6.
  close(phaseAt(7).elevation_deg, 15, 1e-6);
  assert.equal(phaseAt(7).phase, 'day');
  assert.equal(phaseAt(6.4).phase, 'twilight'); // 6°
  assert.equal(phaseAt(6.2).phase, 'twilight');
  assert.equal(phaseAt(5.8).phase, 'twilight'); // -3°
  assert.equal(phaseAt(5.5).phase, 'night'); // -7.5°
});

test('M16: el polvo atenúa la luz directa y devuelve parte como difusa', () => {
  const clear = solarState({ ls_deg: 0, ltst_h: 12, lat_deg: 18.4, dust_tau: 0 });
  const dusty = solarState({ ls_deg: 0, ltst_h: 12, lat_deg: 18.4, dust_tau: 1 });
  const storm = solarState({ ls_deg: 0, ltst_h: 12, lat_deg: 18.4, dust_tau: 4 });
  assert.ok(dusty.direct_w_m2 < clear.direct_w_m2);
  assert.ok(dusty.diffuse_w_m2 > 0);
  assert.ok(storm.surface_w_m2 < dusty.surface_w_m2 && dusty.surface_w_m2 < clear.surface_w_m2);
  // Fórmulas en un caso concreto.
  const sinElev = Math.sin((dusty.elevation_deg * Math.PI) / 180);
  const m = Math.max(1, 1 / (sinElev + 0.095 * (dusty.elevation_deg + 3.2) ** -1.22));
  close(dusty.air_mass, m, 1e-12);
  close(dusty.direct_w_m2, dusty.irradiance_top_w_m2 * sinElev * Math.exp(-0.68 * m), 1e-9);
  close(dusty.diffuse_w_m2,
    0.34 * dusty.irradiance_top_w_m2 * sinElev * (1 - Math.exp(-0.68 * m)) * Math.exp(-0.18), 1e-9);
});

test('M16: masa de aire recortada a [1, 14] y acimut desde el norte', () => {
  const low = solarState({ ls_deg: 0, ltst_h: 6.05, lat_deg: 0, dust_tau: 0.5 });
  assert.ok(low.elevation_deg > 0 && low.elevation_deg < 1);
  assert.ok(low.air_mass <= 14 && low.air_mass >= 1);
  // Por la mañana el Sol está al este; por la tarde, al oeste.
  const morning = solarState({ ls_deg: 0, ltst_h: 8, lat_deg: 18.4 });
  const evening = solarState({ ls_deg: 0, ltst_h: 16, lat_deg: 18.4 });
  assert.ok(morning.azimuth_deg > 0 && morning.azimuth_deg < 180);
  assert.ok(evening.azimuth_deg > 180 && evening.azimuth_deg < 360);
  // A mediodía en Jezero (18.4° N) en equinoccio el Sol está al sur.
  close(solarState({ ls_deg: 0, ltst_h: 12, lat_deg: 18.4 }).azimuth_deg, 180, 1e-6);
  close(solarState({ ls_deg: 0, ltst_h: 12, lat_deg: 18.4 }).elevation_deg, 90 - 18.4, 1e-6);
});

test('M16: dirección del Sol en los ejes de la escena (+X este, +Y arriba, -Z norte)', () => {
  const near = (v, w) => v.forEach((x, i) => close(x, w[i], 1e-12));
  near(sunDirection(90, 0), [0, 1, 0]);
  near(sunDirection(0, 90), [1, 0, 0]); // este
  near(sunDirection(0, 0), [0, 0, -1]); // norte
  near(sunDirection(0, 180), [0, 0, 1]); // sur
});

// ---------------------------------------------------------------- M17

test('M17: onda diaria con máximo a las 14.2 h y más fría en el afelio', () => {
  const at = (ltst_h, ls_deg = 0, storm = false) => ambientTemp_c({ ls_deg, ltst_h, storm });
  assert.ok(at(14.2) > at(13) && at(14.2) > at(16));
  close(at(14.2) - at(2.2), 62, 1e-9); // dos veces la amplitud nominal
  assert.ok(at(12, 251) > at(12, 71));
  // En r = a el término orbital se anula y queda la media más la amplitud.
  const lsAtMeanDistance = 251 + (Math.acos(-0.0934) * 180) / Math.PI;
  close(at(14.2, lsAtMeanDistance), -56 + 31, 1e-9);
  // Con tormenta: más frío y con menos oscilación.
  close(at(14.2, 0, true) - at(2.2, 0, true), 28, 1e-9);
  assert.ok(at(14.2, 0, true) < at(14.2, 0, false));
  assert.deepEqual(weatherParams(true), { mean_c: -68, amplitude_c: 14 });
  assert.deepEqual(weatherParams(false, { mean_c: -60 }), { mean_c: -60, amplitude_c: 31 });
});

test('M17: el resultado cae dentro del rango de temperatura de la tabla 2.3', () => {
  assert.equal(MARS_SURFACE_TEMP_MAX_C, 20);
  assert.equal(MARS_SURFACE_TEMP_MIN_C, -153);
  let lowest = Infinity;
  let highest = -Infinity;
  for (const storm of [false, true]) {
    for (let ls_deg = 0; ls_deg < 360; ls_deg += 3) {
      for (let ltst_h = 0; ltst_h < 24; ltst_h += 0.25) {
        const weather = weatherState({ ls_deg, ltst_h, storm });
        assert.ok(weather.in_published_range, `${weather.ambient_temp_c} °C en Ls ${ls_deg}, ${ltst_h} h`);
        lowest = Math.min(lowest, weather.ambient_temp_c);
        highest = Math.max(highest, weather.ambient_temp_c);
      }
    }
  }
  assert.ok(lowest >= -153 && highest <= 20, `rango ${lowest} a ${highest}`);
});

test('M17: modo tormenta y refugio más cercano', () => {
  assert.equal(weatherState({ ls_deg: 0, ltst_h: 12 }).storm, false);
  const storm = weatherState({ ls_deg: 0, ltst_h: 12, storm: true });
  assert.equal(storm.storm, true);
  assert.ok(storm.dust_tau > weatherState({ ls_deg: 0, ltst_h: 12 }).dust_tau);
  const points = [
    { id: 'a', type: 'shelter', position_m: [1000, 0] },
    { id: 'b', type: 'hazard', position_m: [10, 0] },
    { id: 'c', type: 'shelter', position_m: [-300, 400] },
  ];
  assert.equal(nearestShelter(points, [0, 0]).id, 'c');
  assert.equal(nearestShelter(points, [900, 0]).id, 'a');
  assert.equal(nearestShelter([{ id: 'b', type: 'hazard', position_m: [0, 0] }], [0, 0]), null);
  assert.equal(nearestShelter(undefined, [0, 0]), null);
});
