// Perfil de elevación de una ruta: distancia acumulada, elevación y pendiente de cada tramo.
// Código puro: sin three.js ni DOM.
import { sampleSlope_deg } from '../terrain/slope.js';
import { segmentSlope_deg } from './o2_cost.js';

/**
 * path_m: [[x_m, z_m], ...] -> [{ distance_m, elevation_m, slope_deg }, ...], uno por punto.
 * slope_deg es la pendiente del tramo que llega al punto, con el mismo criterio de M3:
 * la mayor entre la del terreno en el punto y atan(|dz| / d). El primer punto lleva 0.
 */
export function buildElevationProfile(dem, path_m) {
  const samples = [];
  let distance_m = 0;
  for (let i = 0; i < path_m.length; i++) {
    const [x_m, z_m] = path_m[i];
    const elevation_m = dem.sampleElevation_m(x_m, z_m);
    let slope_deg = 0;
    if (i > 0) {
      const step_m = Math.hypot(x_m - path_m[i - 1][0], z_m - path_m[i - 1][1]);
      distance_m += step_m;
      if (step_m > 0) {
        slope_deg = segmentSlope_deg(
          step_m,
          elevation_m - samples[i - 1].elevation_m,
          sampleSlope_deg(dem, x_m, z_m),
        );
      }
    }
    samples.push({ distance_m, elevation_m, slope_deg });
  }
  return samples;
}
