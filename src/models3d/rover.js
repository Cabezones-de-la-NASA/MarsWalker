// Rover Perseverance, escalado a metros reales y con el origen en las ruedas.
// Modelo: NASA 3D Resources, crédito NASA/JPL-Caltech (public/models3d/CREDITS.md).
import { loadModel, normalizeModel } from './loader.js';

// [publicado] Largo del rover: "Length 10 feet (3 meters)", sin contar el brazo.
// Fuente: https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/
// (la misma ficha da 2.7 m de ancho y 2.2 m de alto).
export const PERSEVERANCE_LENGTH_M = 3;

export async function createPerseverance() {
  const model = await loadModel('/models3d/perseverance.glb');
  const rover = normalizeModel(model, { size_m: PERSEVERANCE_LENGTH_M, axis: 'longest_horizontal' });
  rover.name = 'perseverance';
  return rover;
}
