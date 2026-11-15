// Interacción con la tecla E: puntos de interés (inspeccionar, recoger muestra) y rocas.
import { rocksNear, BLOCKING_RADIUS_M } from '../world/rock_field.js';
import { sampleSlope_deg } from '../models/terrain/slope.js';

// [diseño] Distancias de interacción, en metros.
const POI_REACH_M = 12;
const ROCK_REACH_M = 2.6;

const POI_KIND = { shelter: 'Refugio', sampling: 'Punto de muestreo', hazard: 'Zona de peligro' };

/**
 * createInteraction({ dem, points }) ->
 *   nearest(x_m, z_m) -> { type: 'poi' | 'rock', prompt, ... } o null
 *   use(target) -> { kind, title, lines } para la tarjeta del visor
 *   samples() -> ids de los puntos de muestreo ya recogidos; sampleSites
 */
export function createInteraction({ dem, points }) {
  const collected = new Set();
  const sampleSites = points.filter((poi) => poi.type === 'sampling').length;

  return {
    sampleSites,
    samples: () => [...collected],
    nearest(x_m, z_m) {
      let best = null;
      for (const poi of points) {
        const distance_m = Math.hypot(poi.position_m[0] - x_m, poi.position_m[1] - z_m);
        if (distance_m <= POI_REACH_M && (!best || distance_m < best.distance_m)) {
          const canSample = poi.type === 'sampling' && !collected.has(poi.id);
          best = {
            type: 'poi', poi, distance_m,
            prompt: canSample ? `Recoger muestra en ${poi.name}` : `Inspeccionar ${poi.name}`,
          };
        }
      }
      if (best) return best;
      const rock = rocksNear(dem, x_m, z_m, ROCK_REACH_M).find((r) => r.radius_m >= BLOCKING_RADIUS_M);
      return rock ? { type: 'rock', rock, distance_m: rock.distance_m, prompt: 'Inspeccionar roca' } : null;
    },
    use(target) {
      if (target.type === 'poi') {
        const { poi } = target;
        const lines = [poi.description];
        if (poi.type === 'sampling') {
          if (collected.has(poi.id)) {
            lines.push('Muestra ya recogida en este punto.');
          } else {
            collected.add(poi.id);
            lines.push(`Muestra recogida. Llevas ${collected.size} de ${sampleSites}.`);
          }
        }
        lines.push(`Fuente: ${poi.source}`);
        return { kind: POI_KIND[poi.type] ?? 'Punto de interés', title: poi.name, lines };
      }
      const { rock } = target;
      const slope_deg = sampleSlope_deg(dem, rock.x_m, rock.z_m);
      return {
        kind: 'Roca',
        title: `Bloque de ${(rock.radius_m * 2).toFixed(1)} m`,
        lines: [
          `El terreno aquí tiene ${slope_deg.toFixed(1)}° de pendiente según el DEM.`,
          'Esta roca es decorativa: su posición y tamaño se generan para dar escala al paisaje y no provienen de datos de la superficie.',
        ],
      };
    },
  };
}
