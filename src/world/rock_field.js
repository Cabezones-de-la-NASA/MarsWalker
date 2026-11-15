// Dónde hay rocas. Sin three.js ni DOM: lo usan el dibujo (rocks.js) y las colisiones.
//
// Las rocas son DECORATIVAS: su posición sale de una función determinista, no de datos
// reales del terreno. Hay más donde el DEM tiene más pendiente, por plausibilidad geológica.
import { sampleSlope_deg } from '../models/terrain/slope.js';

// [diseño] Tamaño de la celda de reparto y rocas candidatas por celda.
export const ROCK_CELL_M = 12;
const CANDIDATES_PER_CELL = 3;
// [diseño] Radio de las rocas, en metros: la mayoría pequeñas y unas pocas grandes.
const MIN_RADIUS_M = 0.12;
const MAX_RADIUS_M = 1.9;
// [diseño] A partir de este radio una roca detiene al astronauta.
export const BLOCKING_RADIUS_M = 0.45;

function hash3(ix, iz, n) {
  let h = Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ Math.imul(n + 1, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Rocas de una celda de ROCK_CELL_M metros. -> [{ x_m, z_m, radius_m, kind, yaw, tilt, squash }]
 * kind es el índice de la forma (0..3).
 */
export function rocksInCell(dem, cellX, cellZ) {
  const rocks = [];
  const baseX_m = cellX * ROCK_CELL_M;
  const baseZ_m = cellZ * ROCK_CELL_M;
  const [width_m, depth_m] = dem.size_m;
  for (let n = 0; n < CANDIDATES_PER_CELL; n++) {
    const x_m = baseX_m + hash3(cellX, cellZ, n * 7) * ROCK_CELL_M;
    const z_m = baseZ_m + hash3(cellX, cellZ, n * 7 + 1) * ROCK_CELL_M;
    if (Math.abs(x_m) > width_m / 2 || Math.abs(z_m) > depth_m / 2) continue;
    // Más rocas en ladera: 12 % de las candidatas en llano, hasta 85 % a 20° o más.
    const slope_deg = sampleSlope_deg(dem, x_m, z_m);
    const density = 0.12 + 0.73 * Math.min(slope_deg / 20, 1);
    if (hash3(cellX, cellZ, n * 7 + 2) > density) continue;
    // Distribución sesgada hacia tamaños pequeños.
    const size = hash3(cellX, cellZ, n * 7 + 3) ** 3.2;
    rocks.push({
      x_m,
      z_m,
      radius_m: MIN_RADIUS_M + (MAX_RADIUS_M - MIN_RADIUS_M) * size,
      kind: Math.floor(hash3(cellX, cellZ, n * 7 + 4) * 4),
      yaw: hash3(cellX, cellZ, n * 7 + 5) * Math.PI * 2,
      tilt: (hash3(cellX, cellZ, n * 7 + 6) - 0.5) * 0.5,
      squash: 0.55 + hash3(cellX, cellZ, n * 7 + 7) * 0.4,
    });
  }
  return rocks;
}

// Rocas dentro de un radio, de la más cercana a la más lejana. Tope: maxCount.
export function rocksNear(dem, x_m, z_m, radius_m, maxCount = Infinity) {
  const found = [];
  const c0x = Math.floor((x_m - radius_m) / ROCK_CELL_M);
  const c1x = Math.floor((x_m + radius_m) / ROCK_CELL_M);
  const c0z = Math.floor((z_m - radius_m) / ROCK_CELL_M);
  const c1z = Math.floor((z_m + radius_m) / ROCK_CELL_M);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      for (const rock of rocksInCell(dem, cx, cz)) {
        const distance_m = Math.hypot(rock.x_m - x_m, rock.z_m - z_m);
        if (distance_m <= radius_m) found.push({ ...rock, distance_m });
      }
    }
  }
  found.sort((a, b) => a.distance_m - b.distance_m);
  return found.length > maxCount ? found.slice(0, maxCount) : found;
}

/**
 * Colisión del astronauta con las rocas grandes: devuelve la posición corregida.
 * bodyRadius_m es el radio del cilindro de colisión del astronauta.
 */
export function resolveRockCollision(dem, x_m, z_m, bodyRadius_m) {
  let px = x_m;
  let pz = z_m;
  for (const rock of rocksNear(dem, x_m, z_m, MAX_RADIUS_M + bodyRadius_m + 0.5)) {
    if (rock.radius_m < BLOCKING_RADIUS_M) continue;
    const reach_m = rock.radius_m * 0.85 + bodyRadius_m;
    const dx = px - rock.x_m;
    const dz = pz - rock.z_m;
    const distance_m = Math.hypot(dx, dz);
    if (distance_m >= reach_m) continue;
    if (distance_m < 1e-6) {
      px += reach_m;
      continue;
    }
    px = rock.x_m + (dx / distance_m) * reach_m;
    pz = rock.z_m + (dz / distance_m) * reach_m;
  }
  return [px, pz];
}
