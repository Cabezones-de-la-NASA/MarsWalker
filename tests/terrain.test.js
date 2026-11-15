import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDem } from '../src/models/terrain/dem.js';
import {
  sampleSlope_deg,
  riskIndex,
  MAX_SAFE_SLOPE_DEG,
  RISK_CUT_LOW,
  RISK_CUT_HIGH,
} from '../src/models/terrain/slope.js';

const DEG = Math.PI / 180;

// DEM sintético: elevationAt(x_m, z_m) evaluada en el centro de cada celda.
function makeDem(rows, cols, resolution_m, elevationAt) {
  const data = new Float32Array(rows * cols);
  const size_m = [cols * resolution_m, rows * resolution_m];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x_m = (col + 0.5) * resolution_m - size_m[0] / 2;
      const z_m = (row + 0.5) * resolution_m - size_m[1] / 2;
      data[row * cols + col] = elevationAt(x_m, z_m);
    }
  }
  return createDem({ shape: [rows, cols], size_m, resolution_m }, data);
}

// Puntos repartidos por el mapa, incluidos bordes y esquinas.
function samplePoints(dem) {
  const [w, d] = dem.size_m;
  const fractions = [-0.5, -0.49, -0.2, 0, 0.13, 0.49, 0.5];
  return fractions.flatMap((fx) => fractions.map((fz) => [fx * w, fz * d]));
}

test('createDem expone el contrato pedido', () => {
  const dem = makeDem(4, 6, 20, () => 0);
  assert.equal(dem.rows, 4);
  assert.equal(dem.cols, 6);
  assert.equal(dem.resolution_m, 20);
  assert.deepEqual(dem.size_m, [120, 80]);
  assert.equal(typeof dem.sampleElevation_m, 'function');
});

test('createDem rechaza un heightmap que no mide filas x columnas', () => {
  assert.throws(() =>
    createDem({ shape: [2, 2], size_m: [40, 40], resolution_m: 20 }, new Float32Array(5)),
  );
});

test('ejes: la fila 0 es el norte (-Z) y la columna 0 es el oeste (-X)', () => {
  // 2 x 2 celdas de 10 m: [NO, NE, SO, SE]
  const dem = createDem(
    { shape: [2, 2], size_m: [20, 20], resolution_m: 10 },
    new Float32Array([1, 2, 3, 4]),
  );
  assert.equal(dem.sampleElevation_m(-5, -5), 1);
  assert.equal(dem.sampleElevation_m(5, -5), 2);
  assert.equal(dem.sampleElevation_m(-5, 5), 3);
  assert.equal(dem.sampleElevation_m(5, 5), 4);
});

test('M1: la elevación entre celdas se interpola de forma bilineal', () => {
  const dem = createDem(
    { shape: [2, 2], size_m: [20, 20], resolution_m: 10 },
    new Float32Array([1, 2, 3, 4]),
  );
  assert.equal(dem.sampleElevation_m(0, -5), 1.5);
  assert.equal(dem.sampleElevation_m(-5, 0), 2);
  assert.equal(dem.sampleElevation_m(0, 0), 2.5);
  assert.ok(Math.abs(dem.sampleElevation_m(-2.5, -5) - 1.25) < 1e-9);
});

test('M1: en un plano la interpolación devuelve la elevación exacta', () => {
  const plane = (x_m, z_m) => 100 + 0.05 * x_m - 0.02 * z_m;
  const dem = makeDem(32, 48, 20, plane);
  for (const [x_m, z_m] of [[0, 0], [133.7, -71.2], [-401, 255.5], [17, 3]]) {
    assert.ok(Math.abs(dem.sampleElevation_m(x_m, z_m) - plane(x_m, z_m)) < 1e-3);
  }
});

test('fuera del mapa se usa el valor del borde más cercano', () => {
  const dem = createDem(
    { shape: [2, 2], size_m: [20, 20], resolution_m: 10 },
    new Float32Array([1, 2, 3, 4]),
  );
  assert.equal(dem.sampleElevation_m(-1000, -1000), 1);
  assert.equal(dem.sampleElevation_m(1000, 1000), 4);
  assert.equal(dem.sampleElevation_m(-10, -10), 1);
});

test('M1: plano horizontal -> 0 grados', () => {
  const dem = makeDem(16, 16, 20, () => -2500);
  for (const [x_m, z_m] of samplePoints(dem)) {
    assert.equal(sampleSlope_deg(dem, x_m, z_m), 0);
  }
});

test('M1: plano con inclinación conocida -> ese ángulo con error < 0.1 grados', () => {
  const cases = [
    { name: 'sube al este 10°', a: Math.tan(10 * DEG), b: 0, expected_deg: 10 },
    { name: 'sube al sur 25°', a: 0, b: Math.tan(25 * DEG), expected_deg: 25 },
    { name: 'sube al norte 40°', a: 0, b: -Math.tan(40 * DEG), expected_deg: 40 },
    {
      name: 'diagonal',
      a: 0.3,
      b: -0.4,
      expected_deg: Math.atan(0.5) / DEG,
    },
  ];
  for (const { name, a, b, expected_deg } of cases) {
    const dem = makeDem(24, 30, 20, (x_m, z_m) => a * x_m + b * z_m);
    for (const [x_m, z_m] of samplePoints(dem)) {
      const slope_deg = sampleSlope_deg(dem, x_m, z_m);
      assert.ok(
        Math.abs(slope_deg - expected_deg) < 0.1,
        `${name} en (${x_m}, ${z_m}): ${slope_deg} vs ${expected_deg}`,
      );
    }
  }
});

test('M1: en los bordes usa la diferencia hacia un solo lado', () => {
  // Una fila: 0, 10, 40 m con celdas de 10 m.
  const dem = createDem(
    { shape: [1, 3], size_m: [30, 10], resolution_m: 10 },
    new Float32Array([0, 10, 40]),
  );
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  close(sampleSlope_deg(dem, -10, 0), Math.atan(10 / 10) / DEG); // borde oeste
  close(sampleSlope_deg(dem, 0, 0), Math.atan(40 / 20) / DEG); // centro
  close(sampleSlope_deg(dem, 10, 0), Math.atan(30 / 10) / DEG); // borde este
});

test('M2: constantes de diseño', () => {
  assert.equal(MAX_SAFE_SLOPE_DEG, 25);
  assert.equal(RISK_CUT_LOW, 0.45);
  assert.equal(RISK_CUT_HIGH, 0.85);
});

test('M2: el riesgo siempre está en [0, 1]', () => {
  for (let slope_deg = -10; slope_deg <= 90; slope_deg += 0.5) {
    const risk = riskIndex(slope_deg, 25);
    assert.ok(risk >= 0 && risk <= 1, `riesgo ${risk} con ${slope_deg} grados`);
  }
});

test('M2: 0 grados -> 0; 25 grados o más -> 1', () => {
  assert.equal(riskIndex(0, 25), 0);
  assert.equal(riskIndex(12.5, 25), 0.5);
  assert.equal(riskIndex(25, 25), 1);
  assert.equal(riskIndex(40, 25), 1);
  assert.equal(riskIndex(90, 25), 1);
  assert.equal(riskIndex(25), 1); // límite por defecto
});

test('dataset sintético del paso 2: fondo del cráter bajo el borde y pendientes finitas', () => {
  const dir = new URL('../public/data/synthetic_crater/', import.meta.url);
  const metadata = JSON.parse(readFileSync(new URL('metadata.json', dir), 'utf8'));
  const bytes = readFileSync(new URL('heightmap.f32', dir));
  const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const dem = createDem(metadata, data);

  const rim_m = 0.3 * dem.size_m[0];
  assert.ok(dem.sampleElevation_m(0, 0) < dem.sampleElevation_m(rim_m, 0) - 300);
  for (const [x_m, z_m] of samplePoints(dem)) {
    const slope_deg = sampleSlope_deg(dem, x_m, z_m);
    assert.ok(Number.isFinite(slope_deg) && slope_deg >= 0 && slope_deg < 90);
  }
});
