// poi.json de cada zona: las posiciones cumplen el criterio de pendiente M1 de cada tipo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDem } from '../src/models/terrain/dem.js';
import { sampleSlope_deg, MAX_SAFE_SLOPE_DEG } from '../src/models/terrain/slope.js';

// Se comprueban todas las zonas que traen poi.json.
const ZONES = ['jezero_ctx', 'hirise_jezero'];

function loadZone(zone) {
  const dir = new URL(`../public/data/${zone}/`, import.meta.url);
  const metadata = JSON.parse(readFileSync(new URL('metadata.json', dir), 'utf8'));
  const bytes = readFileSync(new URL('heightmap.f32', dir));
  const dem = createDem(metadata, new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
  const { points } = JSON.parse(readFileSync(new URL('poi.json', dir), 'utf8'));
  return { dem, points };
}

for (const zone of ZONES) {
  const { dem, points } = loadZone(zone);

  test(`${zone}: hay de 6 a 8 puntos, con un refugio, muestreos y peligros`, () => {
    assert.ok(points.length >= 6 && points.length <= 8);
    const count = (type) => points.filter((poi) => poi.type === type).length;
    assert.equal(count('shelter'), 1);
    assert.ok(count('sampling') >= 2);
    assert.ok(count('hazard') >= 2);
    assert.equal(new Set(points.map((poi) => poi.id)).size, points.length);
  });

  test(`${zone}: todos los puntos caen dentro del mapa`, () => {
    for (const poi of points) {
      assert.ok(Math.abs(poi.position_m[0]) <= dem.size_m[0] / 2, poi.id);
      assert.ok(Math.abs(poi.position_m[1]) <= dem.size_m[1] / 2, poi.id);
    }
  });

  test(`${zone}: pendiente M1 según el tipo (refugio < 4°, peligro > 25°, muestreo transitable)`, () => {
    for (const poi of points) {
      const slope_deg = sampleSlope_deg(dem, poi.position_m[0], poi.position_m[1]);
      if (poi.type === 'shelter') assert.ok(slope_deg < 4, `${poi.id}: ${slope_deg}`);
      if (poi.type === 'hazard') assert.ok(slope_deg > MAX_SAFE_SLOPE_DEG, `${poi.id}: ${slope_deg}`);
      if (poi.type === 'sampling') assert.ok(slope_deg < MAX_SAFE_SLOPE_DEG, `${poi.id}: ${slope_deg}`);
    }
  });

  test(`${zone}: cada imagen guarda la página del Photojournal y un crédito de NASA/JPL-Caltech`, () => {
    for (const poi of points) {
      assert.ok(poi.image_url.startsWith('https://science.nasa.gov/photojournal/'), poi.id);
      assert.ok(poi.image_credit.startsWith('NASA/JPL-Caltech'), poi.id);
    }
  });
}
