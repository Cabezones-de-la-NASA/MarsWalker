// Partes del mundo 3D que no tocan three.js ni el DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDem } from '../src/models/terrain/dem.js';
import { atmosphereLook } from '../src/world/atmosphere_look.js';
import { PALETTE, hexToRgb, mixHex } from '../src/world/palette.js';
import { surfaceDetail_m, visualGround_m, DETAIL_AMPLITUDE_M } from '../src/world/surface_detail.js';
import { rocksInCell, rocksNear, resolveRockCollision, BLOCKING_RADIUS_M, ROCK_CELL_M } from '../src/world/rock_field.js';
import { QUALITY_PROFILES } from '../src/world/quality.js';
import { tintBaseRaster } from '../src/dashboard/layers/rasters.js';

function makeDem(rows, cols, resolution_m, elevationAt) {
  const data = new Float32Array(rows * cols);
  const size_m = [cols * resolution_m, rows * resolution_m];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      data[row * cols + col] = elevationAt((col + 0.5) * resolution_m - size_m[0] / 2, (row + 0.5) * resolution_m - size_m[1] / 2);
    }
  }
  return createDem({ shape: [rows, cols], size_m, resolution_m }, data);
}
const luminance = (hex) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

test('paleta: los doce colores de la dirección artística', () => {
  assert.equal(PALETTE.marsOrange, 0xc65b27);
  assert.equal(PALETTE.rustRed, 0x87351f);
  assert.equal(PALETTE.dustyPeach, 0xd98a61);
  assert.equal(PALETTE.hudAmber, 0xffb45c);
  assert.equal(Object.keys(PALETTE).length, 12);
  assert.deepEqual(hexToRgb(0xc65b27), [198, 91, 39]);
  assert.equal(mixHex(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(mixHex(0x102030, 0xffffff, 0), 0x102030);
  assert.equal(mixHex(0x102030, 0xa0b0c0, 2), 0xa0b0c0);
});

test('atmósfera: de día el cielo es claro, de noche oscuro, y el polvo lo apaga', () => {
  const day = atmosphereLook({ elevation_deg: 60, phase: 'day', dust_tau: 0.5, surface: true });
  const dusk = atmosphereLook({ elevation_deg: 2, phase: 'twilight', dust_tau: 0.5, surface: true });
  const night = atmosphereLook({ elevation_deg: -40, phase: 'night', dust_tau: 0.5, surface: true });
  const storm = atmosphereLook({ elevation_deg: 60, phase: 'day', dust_tau: 4, storm: true, surface: true });
  assert.ok(luminance(day.skyHorizon) > luminance(dusk.skyHorizon));
  assert.ok(luminance(dusk.skyHorizon) > luminance(night.skyHorizon));
  assert.ok(day.sunIntensity > dusk.sunIntensity && dusk.sunIntensity > night.sunIntensity);
  assert.ok(day.daylight > dusk.daylight && dusk.daylight > night.daylight);
  // Tormenta: menos luz directa y bruma mucho más cercana.
  assert.ok(storm.sunIntensity < day.sunIntensity);
  assert.ok(storm.fogFar_m < day.fogFar_m / 5);
  assert.equal(storm.storm, true);
  // Estrellas, Fobos y linterna: solo sin Sol.
  assert.equal(day.starOpacity, 0);
  assert.equal(day.headlamp, 0);
  assert.ok(night.starOpacity > 0.8 && night.moonOpacity > 0.8);
  assert.equal(night.headlamp, 1);
  // La linterna del casco no se enciende en la vista orbital.
  assert.equal(atmosphereLook({ elevation_deg: -40, phase: 'night', surface: false }).headlamp, 0);
});

test('atmósfera: todos los valores son finitos en todo el ciclo', () => {
  for (const [phase, elevations] of [['day', [8, 30, 90]], ['twilight', [-6, 0, 7]], ['night', [-7, -90]]]) {
    for (const elevation_deg of elevations) {
      for (const dust_tau of [0, 0.5, 2, 5]) {
        const look = atmosphereLook({ elevation_deg, phase, dust_tau, surface: true });
        for (const [key, value] of Object.entries(look)) {
          if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0, `${phase} ${key}`);
        }
        assert.ok(look.fogFar_m > look.fogNear_m);
      }
    }
  }
});

test('microrrelieve: acotado, determinista y solo visual', () => {
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 0; i < 4000; i++) {
    const value = surfaceDetail_m(i * 0.37 - 600, i * 0.91 + 120);
    lowest = Math.min(lowest, value);
    highest = Math.max(highest, value);
  }
  assert.ok(lowest >= -DETAIL_AMPLITUDE_M && highest <= DETAIL_AMPLITUDE_M);
  assert.ok(highest - lowest > DETAIL_AMPLITUDE_M * 0.5); // no es plano
  assert.equal(surfaceDetail_m(12.3, -45.6), surfaceDetail_m(12.3, -45.6));
  const dem = makeDem(20, 20, 20, (x_m) => 0.1 * x_m);
  const offset = visualGround_m(dem, 30, 40) - dem.sampleElevation_m(30, 40);
  assert.ok(Math.abs(offset) <= DETAIL_AMPLITUDE_M);
});

test('rocas: deterministas, dentro del mapa y más densas en ladera', () => {
  const flat = makeDem(100, 100, 20, () => 0);
  const steep = makeDem(100, 100, 20, (x_m) => x_m * Math.tan((22 * Math.PI) / 180));
  assert.deepEqual(rocksInCell(flat, 3, -7), rocksInCell(flat, 3, -7));
  const count = (dem) => rocksNear(dem, 0, 0, 300).length;
  assert.ok(count(steep) > count(flat) * 2, `${count(steep)} vs ${count(flat)}`);
  for (const rock of rocksNear(flat, 0, 0, 300)) {
    assert.ok(Math.abs(rock.x_m) <= 1000 && Math.abs(rock.z_m) <= 1000);
    assert.ok(rock.radius_m >= 0.12 && rock.radius_m <= 1.9);
    assert.ok(rock.kind >= 0 && rock.kind <= 3);
  }
  // Fuera del mapa no hay rocas.
  assert.equal(rocksInCell(flat, Math.ceil(2000 / ROCK_CELL_M), 0).length, 0);
  // Las más cercanas primero y con tope.
  const near = rocksNear(steep, 0, 0, 200, 25);
  assert.equal(near.length, 25);
  for (let i = 1; i < near.length; i++) assert.ok(near[i].distance_m >= near[i - 1].distance_m);
});

test('rocas: una roca grande detiene al astronauta y una pequeña no', () => {
  const steep = makeDem(100, 100, 20, (x_m) => x_m * Math.tan((22 * Math.PI) / 180));
  const rocks = rocksNear(steep, 0, 0, 400);
  const big = rocks.find((rock) => rock.radius_m > 1);
  const small = rocks.find((rock) => rock.radius_m < BLOCKING_RADIUS_M &&
    rocks.every((other) => other === rock || Math.hypot(other.x_m - rock.x_m, other.z_m - rock.z_m) > 3));
  assert.ok(big && small);
  const [x_m, z_m] = resolveRockCollision(steep, big.x_m + 0.1, big.z_m, 0.35);
  assert.ok(Math.hypot(x_m - big.x_m, z_m - big.z_m) >= big.radius_m * 0.85 + 0.35 - 1e-9);
  assert.deepEqual(resolveRockCollision(steep, small.x_m + 0.05, small.z_m, 0.35), [small.x_m + 0.05, small.z_m]);
});

test('perfiles gráficos: bajo, medio y alto, de menos a más coste', () => {
  const { low, medium, high } = QUALITY_PROFILES;
  assert.ok(low.rockCount < medium.rockCount && medium.rockCount < high.rockCount);
  assert.ok(low.patchSegments < medium.patchSegments && medium.patchSegments < high.patchSegments);
  assert.equal(low.shadows, false);
  assert.equal(low.dustCount, 0);
  assert.ok(high.shadowMapSize > medium.shadowMapSize);
});

test('textura base: se tiñe con tonos óxido y conserva el sombreado', () => {
  const dem = makeDem(8, 8, 20, (x_m) => (x_m > 0 ? x_m * 0.6 : 0));
  const gray = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) gray.set([i < 32 ? 90 : 200, i < 32 ? 90 : 200, i < 32 ? 90 : 200, 255], i * 4);
  const out = tintBaseRaster(gray, dem);
  assert.equal(out.length, gray.length);
  for (let i = 0; i < 64; i++) {
    const [r, g, b, a] = out.slice(i * 4, i * 4 + 4);
    assert.ok(r > g && g > b, `píxel ${i}: ${r}, ${g}, ${b}`); // naranja-rojizo
    assert.equal(a, 255);
  }
  // La mitad con sombreado oscuro sigue siendo más oscura.
  const mean = (from) => { let sum = 0; for (let i = from; i < from + 32; i++) sum += out[i * 4]; return sum / 32; };
  assert.ok(mean(0) < mean(32));
});
