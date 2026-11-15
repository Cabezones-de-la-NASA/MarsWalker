// Microrrelieve visual del suelo. Sin three.js ni DOM.
//
// El DEM tiene una celda cada 20 m: de cerca se vería como rampas lisas. Esta función añade
// ondulaciones de pocos centímetros SOLO para dibujar el suelo y apoyar los pies encima.
// No es un dato: la elevación y la pendiente que usan los modelos y el HUD salen del DEM.

// [diseño] Amplitud máxima del microrrelieve, en metros.
export const DETAIL_AMPLITUDE_M = 0.14;

// Ruido de valor determinista en 2D, de 0 a 1.
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// Desplazamiento vertical en metros, entre -DETAIL_AMPLITUDE_M y +DETAIL_AMPLITUDE_M.
export function surfaceDetail_m(x_m, z_m) {
  const broad = valueNoise2(x_m / 9, z_m / 9) - 0.5; // ondulaciones de ~9 m
  const medium = valueNoise2(x_m / 2.6 + 31.7, z_m / 2.6 - 12.3) - 0.5; // montículos de ~2.6 m
  const fine = valueNoise2(x_m / 0.7 - 5.1, z_m / 0.7 + 8.9) - 0.5; // regolito de ~0.7 m
  return DETAIL_AMPLITUDE_M * 2 * (0.6 * broad + 0.3 * medium + 0.1 * fine);
}

// Altura del suelo que se dibuja y se pisa: DEM más microrrelieve.
export function visualGround_m(dem, x_m, z_m) {
  return dem.sampleElevation_m(x_m, z_m) + surfaceDetail_m(x_m, z_m);
}
