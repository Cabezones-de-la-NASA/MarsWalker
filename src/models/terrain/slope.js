// M1 (parte 2) y M2: pendiente e índice de riesgo. docs/modelosydb.md, sección 4.
// Código puro: sin three.js ni DOM.

// [diseño] M2: pendiente a partir de la cual el terreno se considera intransitable.
export const MAX_SAFE_SLOPE_DEG = 25;

// [diseño] M2: cortes de color del riesgo (verde < 0.45 <= amarillo < 0.85 <= rojo).
export const RISK_CUT_LOW = 0.45;
export const RISK_CUT_HIGH = 0.85;

const RAD_TO_DEG = 180 / Math.PI;

/**
 * M1: pendiente en grados en la celda más cercana al punto.
 *
 *   theta = atan( sqrt( ((z[i+1,j] - z[i-1,j]) / (2 dx))^2 + ((z[i,j+1] - z[i,j-1]) / (2 dy))^2 ) )
 *
 * En los bordes se usa la diferencia hacia un solo lado.
 */
export function sampleSlope_deg(dem, x_m, z_m) {
  const { rows, cols, resolution_m, elevations_m } = dem;
  const { row, col } = dem.cellAt(x_m, z_m);

  const west = Math.max(col - 1, 0);
  const east = Math.min(col + 1, cols - 1);
  const north = Math.max(row - 1, 0);
  const south = Math.min(row + 1, rows - 1);

  // Con una sola fila o columna no hay vecino y esa componente vale 0.
  const dEast =
    east === west
      ? 0
      : (elevations_m[row * cols + east] - elevations_m[row * cols + west]) /
        ((east - west) * resolution_m);
  const dSouth =
    south === north
      ? 0
      : (elevations_m[south * cols + col] - elevations_m[north * cols + col]) /
        ((south - north) * resolution_m);

  return Math.atan(Math.sqrt(dEast * dEast + dSouth * dSouth)) * RAD_TO_DEG;
}

/**
 * M2: R = clamp(theta / theta_seg, 0, 1).
 */
export function riskIndex(slope_deg, maxSafe_deg = MAX_SAFE_SLOPE_DEG) {
  return Math.min(Math.max(slope_deg / maxSafe_deg, 0), 1);
}

/**
 * M2: banda de color del riesgo. Verde < 0.45 <= amarillo < 0.85 <= rojo.
 * Devuelve 'low' | 'medium' | 'high'; el color lo pone quien dibuja.
 */
export function riskBand(risk) {
  if (risk < RISK_CUT_LOW) return 'low';
  if (risk < RISK_CUT_HIGH) return 'medium';
  return 'high';
}
