// Astronauta, escalado a metros y con el origen en los pies.
// Modelo: NASA 3D Resources, "Astronaut", crédito NASA (public/models3d/CREDITS.md).
import { loadModel, normalizeModel } from './loader.js';

// [diseño] Altura de una persona con el traje puesto. El documento no la da.
export const ASTRONAUT_HEIGHT_M = 1.9;

export async function createAstronaut() {
  const model = await loadModel('/models3d/astronaut.glb');
  const astronaut = normalizeModel(model, { size_m: ASTRONAUT_HEIGHT_M, axis: 'height' });
  astronaut.name = 'astronaut';
  return astronaut;
}
