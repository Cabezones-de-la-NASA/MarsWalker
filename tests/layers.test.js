// Capas calculadas desde el DEM (src/dashboard/layers/rasters.js no toca el DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDem } from '../src/models/terrain/dem.js';
import {
  buildLayerRaster,
  rampColor,
} from '../src/dashboard/layers/rasters.js';
import { LAYER_DEFS, RISK_COLORS } from '../src/dashboard/layers/layer_defs.js';

const DEG = Math.PI / 180;

function planeDem(slope_deg) {
  const rows = 8;
  const cols = 8;
  const resolution_m = 20;
  const data = new Float32Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) data[row * cols + col] = col * resolution_m * Math.tan(slope_deg * DEG);
  }
  return createDem({ shape: [rows, cols], size_m: [160, 160], resolution_m }, data);
}

const pixel = (raster, i = 0) => Array.from(raster.data.slice(i * 4, i * 4 + 4));

test('las cinco capas pedidas existen y en orden', () => {
  assert.deepEqual(LAYER_DEFS.map((layer) => layer.id), ['base', 'slope', 'risk', 'crism', 'themis']);
  assert.deepEqual(LAYER_DEFS.find((layer) => layer.id === 'slope').range, [0, 45]);
});

test('rampColor interpola y recorta a los extremos', () => {
  const ramp = [[0, [0, 0, 0]], [1, [200, 100, 50]]];
  assert.deepEqual(rampColor(ramp, 0), [0, 0, 0]);
  assert.deepEqual(rampColor(ramp, 0.5), [100, 50, 25]);
  assert.deepEqual(rampColor(ramp, 1), [200, 100, 50]);
  assert.deepEqual(rampColor(ramp, 7), [200, 100, 50]);
  assert.deepEqual(rampColor(ramp, -3), [0, 0, 0]);
});

test('riesgo: verde por debajo de 0.45, amarillo hasta 0.85, rojo desde ahí', () => {
  // riesgo = pendiente / 25: 5° -> 0.2, 15° -> 0.6, 30° -> 1
  assert.deepEqual(pixel(buildLayerRaster('risk', planeDem(5))), [...RISK_COLORS.low, 255]);
  assert.deepEqual(pixel(buildLayerRaster('risk', planeDem(15))), [...RISK_COLORS.medium, 255]);
  assert.deepEqual(pixel(buildLayerRaster('risk', planeDem(30))), [...RISK_COLORS.high, 255]);
});

test('pendiente: 0° usa el inicio de la rampa y 45° o más el final', () => {
  const ramp = LAYER_DEFS.find((layer) => layer.id === 'slope').ramp;
  assert.deepEqual(pixel(buildLayerRaster('slope', planeDem(0))), [...ramp[0][1], 255]);
  assert.deepEqual(pixel(buildLayerRaster('slope', planeDem(45))), [...ramp[ramp.length - 1][1], 255]);
  assert.deepEqual(pixel(buildLayerRaster('slope', planeDem(60))), [...ramp[ramp.length - 1][1], 255]);
});

test('crism y themis no se simulan: son capas de archivo y no se calculan desde el DEM', () => {
  for (const id of ['crism', 'themis']) {
    const def = LAYER_DEFS.find((layer) => layer.id === id);
    assert.equal(def.requiresFile, true);
    assert.equal(def.kind, 'file');
    assert.throws(() => buildLayerRaster(id, planeDem(10)));
  }
  assert.throws(() => buildLayerRaster('base', planeDem(0)));
  const raster = buildLayerRaster('slope', planeDem(10));
  assert.equal(raster.width, 8);
  assert.equal(raster.data.length, 8 * 8 * 4);
});
