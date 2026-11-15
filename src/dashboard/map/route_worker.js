// Web Worker: calcula la ruta fuera del hilo principal para no congelar la cámara.
// Mensajes de entrada:
//   { type: 'init', metadata, heights_m }          arma el DEM y la malla de búsqueda una vez
//   { type: 'route', id, algorithm, start_m, goal_m, config, crew, preset }
//     algorithm: 'astar' (M4) | 'health' (M14) | 'qaoa' (M15)
// Mensaje de salida: { type: 'route', id, result, elapsed_ms }
import { createDem } from '../../models/terrain/dem.js';
import { computeRoute, buildSearchGrid } from '../../models/routing/astar_o2.js';
import { computeHealthRoute, simulateRoute } from '../../models/routing/astar_health.js';
import { computeCorridorRoute } from '../../models/routing/qaoa_inspired.js';
import { defaultConfig } from '../../models/physiology/defaults.js';
import { createGroup } from '../../models/physiology/group.js';

let dem = null;
let grid = null;

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') {
    dem = createDem(message.metadata, message.heights_m);
    grid = buildSearchGrid(dem);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (message.type === 'route') {
    const started_ms = performance.now();
    let result;
    try {
      if (!dem) throw new Error('El worker aún no tiene el terreno.');
      const { start_m, goal_m } = message;
      if (message.algorithm === 'astar') {
        result = computeRoute({ dem, start_m, goal_m, config: { ...message.config, grid } });
      } else if (message.algorithm === 'health') {
        const group = createGroup(message.crew, defaultConfig());
        result = computeHealthRoute({
          dem, start_m, goal_m, group, dimensions: message.preset, options: { grid },
        });
        if (!result.failed) {
          // El tiempo sale de caminar la ruta con el grupo (M13), no de una velocidad fija.
          const walked = simulateRoute(result.path_m, dem, group);
          result.metrics.time_s = walked.time_h * 3600;
          result.metrics.worst_status = walked.worst_status;
        }
      } else if (message.algorithm === 'qaoa') {
        result = computeCorridorRoute({ dem, start_m, goal_m, config: message.config });
      } else {
        throw new Error('Algoritmo desconocido.');
      }
    } catch (error) {
      result = { failed: true, error: error.message };
    }
    self.postMessage({ type: 'route', id: message.id, result, elapsed_ms: performance.now() - started_ms });
  }
};
