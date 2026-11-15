// Genera los píxeles RGBA de las capas calculadas desde el DEM.
// Sin DOM: devuelve arreglos, y el compositor los pasa a un canvas.
import {
  sampleSlope_deg,
  riskIndex,
  riskBand,
  MAX_SAFE_SLOPE_DEG,
} from '../../models/terrain/slope.js';
import { LAYER_DEFS, RISK_COLORS } from './layer_defs.js';
import { PALETTE, hexToRgb } from '../../world/palette.js';
import { valueNoise2 } from '../../world/surface_detail.js';

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

// Color de una rampa [[t, [r, g, b]], ...] en la posición t (0..1), con interpolación lineal.
export function rampColor(ramp, t) {
  const x = clamp01(t);
  for (let i = 1; i < ramp.length; i++) {
    if (x <= ramp[i][0]) {
      const [t0, c0] = ramp[i - 1];
      const [t1, c1] = ramp[i];
      const k = (x - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k));
    }
  }
  return ramp[ramp.length - 1][1];
}

// APROXIMACIONES, NO DATOS REALES. Solo sirven para probar la interfaz de capas mientras
// no haya productos CRISM o THEMIS convertidos. Coeficientes [diseño], sin base publicada.
// elevation01: elevación normalizada al rango del dataset (0 = punto más bajo).
export function simulatedCrismIndex(elevation01, slope_deg) {
  return clamp01(0.6 * (1 - elevation01) + 0.4 * clamp01(slope_deg / 20));
}
export function simulatedThemisIndex(elevation01, slope_deg) {
  return clamp01(0.15 + 0.7 * clamp01(slope_deg / 15) + 0.15 * elevation01);
}

// -> { width, height, data: Uint8ClampedArray RGBA }, una celda del DEM por píxel.
export function buildLayerRaster(layerId, dem) {
  const def = LAYER_DEFS.find((layer) => layer.id === layerId);
  if (!def || def.kind === 'image') throw new Error(`La capa ${layerId} no se calcula desde el DEM`);

  const { rows, cols, resolution_m, size_m, elevations_m } = dem;
  const data = new Uint8ClampedArray(rows * cols * 4);

  let min_m = Infinity;
  let max_m = -Infinity;
  for (const elevation_m of elevations_m) {
    if (elevation_m < min_m) min_m = elevation_m;
    if (elevation_m > max_m) max_m = elevation_m;
  }
  const relief_m = max_m - min_m || 1;

  for (let row = 0; row < rows; row++) {
    const z_m = (row + 0.5) * resolution_m - size_m[1] / 2;
    for (let col = 0; col < cols; col++) {
      const x_m = (col + 0.5) * resolution_m - size_m[0] / 2;
      const slope_deg = sampleSlope_deg(dem, x_m, z_m);
      let color;
      if (layerId === 'slope') {
        color = rampColor(def.ramp, slope_deg / def.range[1]);
      } else if (layerId === 'risk') {
        color = RISK_COLORS[riskBand(riskIndex(slope_deg, MAX_SAFE_SLOPE_DEG))];
      } else {
        const elevation01 = (elevations_m[row * cols + col] - min_m) / relief_m;
        const index =
          layerId === 'crism'
            ? simulatedCrismIndex(elevation01, slope_deg)
            : simulatedThemisIndex(elevation01, slope_deg);
        color = rampColor(def.ramp, index);
      }
      const i = (row * cols + col) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return { width: cols, height: rows, data };
}

// Colores del terreno, de la paleta de Marte.
const TINT = Object.fromEntries(Object.entries(PALETTE).map(([key, hex]) => [key, hexToRgb(hex)]));
const mix3 = (a, b, t) => [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * t);
const smooth = (lo, hi, v) => {
  const t = clamp01((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};

/**
 * Tiñe la textura base con la paleta de Marte. El sombreado de la imagen original se
 * conserva como luz; el color sale del relieve: regolito naranja en llano, roca óxido en
 * ladera y tonos más oscuros en las zonas bajas.
 *
 * Es color ARTÍSTICO [diseño]: no es el color real de la superficie ni un ortomosaico.
 *
 * rgba: píxeles de la imagen base, una celda del DEM por píxel. -> Uint8ClampedArray RGBA.
 */
export function tintBaseRaster(rgba, dem) {
  const { rows, cols, resolution_m, size_m, elevations_m } = dem;
  const out = new Uint8ClampedArray(rows * cols * 4);
  let min_m = Infinity;
  let max_m = -Infinity;
  let lumSum = 0;
  for (let i = 0; i < rows * cols; i++) {
    if (elevations_m[i] < min_m) min_m = elevations_m[i];
    if (elevations_m[i] > max_m) max_m = elevations_m[i];
    lumSum += (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 765;
  }
  const relief_m = max_m - min_m || 1;
  const meanLum = lumSum / (rows * cols) || 1;

  for (let row = 0; row < rows; row++) {
    const z_m = (row + 0.5) * resolution_m - size_m[1] / 2;
    for (let col = 0; col < cols; col++) {
      const x_m = (col + 0.5) * resolution_m - size_m[0] / 2;
      const i = row * cols + col;
      const slope_deg = sampleSlope_deg(dem, x_m, z_m);
      const low = 1 - (elevations_m[i] - min_m) / relief_m;
      const broad = valueNoise2(x_m / 900, z_m / 900);
      const fine = valueNoise2(x_m / 140 + 17, z_m / 140 - 9);

      let color = mix3(TINT.oxideOrange, TINT.marsOrange, broad);
      color = mix3(color, TINT.terracotta, fine * 0.45);
      color = mix3(color, TINT.rustRed, smooth(6, 16, slope_deg) * 0.8);
      color = mix3(color, TINT.burntSienna, smooth(16, 30, slope_deg) * 0.7);
      color = mix3(color, TINT.dustBrown, low * low * 0.35);
      // Se aclara hacia el ocre para que el conjunto no quede saturado de rojo.
      color = mix3(color, TINT.paleOchre, 0.2);

      // La luz del sombreado original, normalizada a su media.
      const lum = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 765;
      const shade = Math.min(Math.max(lum / meanLum, 0.42), 1.32);
      out[i * 4] = color[0] * shade;
      out[i * 4 + 1] = color[1] * shade;
      out[i * 4 + 2] = color[2] * shade;
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}
