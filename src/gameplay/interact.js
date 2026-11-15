// Interacción con la tecla E: el rover de compañía, los puntos de interés (inspeccionar,
// recoger muestra) y las rocas.
import { rocksNear, BLOCKING_RADIUS_M } from '../world/rock_field.js';
import { sampleSlope_deg } from '../models/terrain/slope.js';

// [diseño] Distancias de interacción, en metros.
const POI_REACH_M = 12;
const ROCK_REACH_M = 2.6;

const POI_KIND = { shelter: 'Refugio', sampling: 'Punto de muestreo', hazard: 'Zona de peligro' };

/**
 * createInteraction({ dem, getPoints, companion }) ->
 *   nearest(x_m, z_m) -> { type: 'rover' | 'poi' | 'rock', prompt, ... } o null
 *   use(target) -> { kind, title, lines } para la tarjeta del visor (puntos y rocas; con el
 *                  rover se conversa: lo abre el modo a pie)
 *   progress() -> { samples, sampleSites, visited, objectives }
 * getPoints: puntos de la zona más la base y los objetivos propios (pueden cambiar).
 */
export function createInteraction({ dem, getPoints, companion }) {
  const collected = new Set();
  const visited = new Set();

  return {
    progress() {
      const points = getPoints();
      const ids = new Set(points.map((poi) => poi.id));
      const objectives = points.filter((poi) => poi.type !== 'shelter');
      return {
        samples: [...collected].filter((id) => ids.has(id)).length,
        sampleSites: points.filter((poi) => poi.type === 'sampling').length,
        visited: objectives.filter((poi) => visited.has(poi.id)).length,
        objectives: objectives.length,
      };
    },
    // Objetivo sin visitar más cercano (para el visor) -> { name, distance_m } o null.
    nearestObjective(x_m, z_m) {
      let best = null;
      for (const poi of getPoints()) {
        if (poi.type === 'shelter' || visited.has(poi.id)) continue;
        const distance_m = Math.hypot(poi.position_m[0] - x_m, poi.position_m[1] - z_m);
        if (!best || distance_m < best.distance_m) best = { name: poi.name, distance_m };
      }
      return best;
    },
    // Puntos de interés más cercanos, para el contexto del rover.
    nearby(x_m, z_m, count = 4) {
      return getPoints()
        .map((poi) => ({
          name: poi.name, type: poi.type, description: poi.description,
          distance_m: Math.hypot(poi.position_m[0] - x_m, poi.position_m[1] - z_m),
        }))
        .sort((a, b) => a.distance_m - b.distance_m)
        .slice(0, count);
    },
    nearest(x_m, z_m) {
      let best = null;
      for (const poi of getPoints()) {
        const distance_m = Math.hypot(poi.position_m[0] - x_m, poi.position_m[1] - z_m);
        if (distance_m <= POI_REACH_M && (!best || distance_m < best.distance_m)) {
          const canSample = poi.type === 'sampling' && !collected.has(poi.id);
          best = {
            type: 'poi', poi, distance_m,
            prompt: canSample ? `Recoger muestra en ${poi.name}` : `Inspeccionar ${poi.name}`,
          };
        }
      }
      // El rover tiene prioridad si está más cerca que el punto de interés.
      if (companion?.canTalk(x_m, z_m)) {
        const position = companion.position();
        const distance_m = Math.hypot(position.x_m - x_m, position.z_m - z_m);
        if (!best || distance_m < best.distance_m) {
          return { type: 'rover', distance_m, prompt: 'Hablar con el rover' };
        }
      }
      if (best) return best;
      const rock = rocksNear(dem, x_m, z_m, ROCK_REACH_M).find((r) => r.radius_m >= BLOCKING_RADIUS_M);
      return rock ? { type: 'rock', rock, distance_m: rock.distance_m, prompt: 'Inspeccionar roca' } : null;
    },
    use(target) {
      if (target.type === 'poi') {
        const { poi } = target;
        visited.add(poi.id);
        const lines = [poi.description];
        if (poi.type === 'sampling') {
          if (collected.has(poi.id)) {
            lines.push('Muestra ya recogida en este punto.');
          } else {
            collected.add(poi.id);
            lines.push('Muestra recogida.');
          }
        }
        lines.push(`Fuente: ${poi.source}`);
        // La misma imagen de referencia que muestra el mapa, con su crédito.
        const image = poi.image_src
          ? { src: poi.image_src, credit: poi.image_credit ?? null, alt: `Imagen de referencia de ${poi.name}` }
          : null;
        return { kind: POI_KIND[poi.type] ?? 'Punto de interés', title: poi.name, lines, image };
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
