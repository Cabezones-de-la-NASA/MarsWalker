// Genera los píxeles RGBA de las capas calculadas desde el DEM.
// Sin DOM: devuelve arreglos, y el compositor los pasa a un canvas.
import {
  sampleSlope_deg,
  riskIndex,
  riskBand,
  MAX_SAFE_SLOPE_DEG,
} from '../../models/terrain/slope.js';
import { LAYER_DEFS, RISK_COLORS } from './layer_defs.js';

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
