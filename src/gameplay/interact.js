// Interacción con la tecla E: el rover de compañía, los puntos de interés (inspeccionar,
// recoger muestra) y las rocas.
import { rocksNear, BLOCKING_RADIUS_M } from '../world/rock_field.js';
import { sampleSlope_deg } from '../models/terrain/slope.js';
import { MARS_FACTS } from '../shared/mars_facts.js';

// [diseño] Distancias de interacción, en metros.
const POI_REACH_M = 12;
const ROCK_REACH_M = 2.6;
const CAPSULE_REACH_M = 5.5;
// Datos (con fuente) que vienen a cuento junto a la cápsula: atmósfera y gravedad.
const CAPSULE_FACTS = MARS_FACTS.filter((fact) => /atmósfera|gravedad en la superficie/.test(fact.text));

const POI_KIND = { shelter: 'Refugio', sampling: 'Punto de muestreo', hazard: 'Zona de peligro' };

/**
 * createInteraction({ dem, getPoints, companion, getCapsule }) ->
 *   getCapsule() -> { x_m, z_m } de la cápsula del aterrizaje, o null si no hay
 *   nearest(x_m, z_m) -> { type: 'rover' | 'poi' | 'capsule' | 'rock', prompt, ... } o null
 *   use(target) -> { kind, title, lines } para la tarjeta del visor (puntos y rocas; con el
 *                  rover se conversa: lo abre el modo a pie)
 *   progress() -> { samples, sampleSites, visited, objectives }
 * getPoints: puntos de la zona más la base y los objetivos propios (pueden cambiar).
 */
export function createInteraction({ dem, getPoints, companion, getCapsule = () => null }) {
  let capsuleFact = 0;
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
    // Solo la cápsula, sin competir con el rover ni los puntos (tutorial de la misión).
    capsuleTarget(x_m, z_m) {
      const capsule = getCapsule();
      if (!capsule) return null;
      const distance_m = Math.hypot(capsule.x_m - x_m, capsule.z_m - z_m);
      return distance_m <= CAPSULE_REACH_M ? { type: 'capsule', distance_m, prompt: 'Inspeccionar la cápsula' } : null;
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
      // Entre el punto de interés, el rover y la cápsula gana lo que esté más cerca.
      if (companion?.canTalk(x_m, z_m)) {
        const position = companion.position();
        const distance_m = Math.hypot(position.x_m - x_m, position.z_m - z_m);
        if (!best || distance_m < best.distance_m) best = { type: 'rover', distance_m, prompt: 'Pedirle un dato al rover' };
      }
      const capsule = getCapsule();
      if (capsule) {
        const distance_m = Math.hypot(capsule.x_m - x_m, capsule.z_m - z_m);
        if (distance_m <= CAPSULE_REACH_M && (!best || distance_m < best.distance_m)) {
          best = { type: 'capsule', distance_m, prompt: 'Inspeccionar la cápsula' };
        }
      }
      if (best) return best;
      const rock = rocksNear(dem, x_m, z_m, ROCK_REACH_M).find((r) => r.radius_m >= BLOCKING_RADIUS_M);
      return rock ? { type: 'rock', rock, distance_m: rock.distance_m, prompt: 'Inspeccionar roca' } : null;
    },
    use(target) {
      if (target.type === 'capsule') {
        const fact = CAPSULE_FACTS[capsuleFact % CAPSULE_FACTS.length];
        capsuleFact += 1;
        return {
          kind: 'Cápsula de descenso',
          title: 'Así llegaste hasta aquí',
          lines: [
            fact.text,
            'Tu bajada lenta en paracaídas es una licencia del juego: la cápsula y su descenso no reproducen una misión real.',
            `Fuente del dato: ${fact.source}`,
          ],
        };
      }
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
