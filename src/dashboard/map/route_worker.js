// Web Worker: calcula la ruta fuera del hilo principal para no congelar la cámara.
// Mensajes de entrada:
//   { type: 'init', metadata, heights_m }          arma el DEM y la malla de búsqueda una vez
//   { type: 'route', id, algorithm, start_m, goal_m, config }
// Mensaje de salida: { type: 'route', id, result, elapsed_ms }
import { createDem } from '../../models/terrain/dem.js';
import { computeRoute, buildSearchGrid } from '../../models/routing/astar_o2.js';

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
      if (message.algorithm !== 'astar') {
        throw new Error('Ese algoritmo todavía no está implementado.');
      }
      result = computeRoute({
        dem,
        start_m: message.start_m,
        goal_m: message.goal_m,
        config: { ...message.config, grid },
      });
    } catch (error) {
      result = { failed: true, error: error.message };
    }
    self.postMessage({ type: 'route', id: message.id, result, elapsed_ms: performance.now() - started_ms });
  }
};
