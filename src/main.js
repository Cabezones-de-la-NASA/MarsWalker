// Punto de entrada: crea el mundo 3D compartido y arranca el dashboard y el modo a pie.
// El dashboard y el gameplay no se conocen entre sí: aquí se decide cuál está activo.
import './styles/base.css';
import { state, on } from './shared/state.js';
import { datasetIdFromUrl, loadDataset, loadDatasetIndex } from './shared/dataset_loader.js';
import { createDem } from './models/terrain/dem.js';
import { pickQuality } from './world/quality.js';
import { createWorld } from './world/world.js';
import { createTerrainMaterial, createTerrainMesh, createLocalPatch } from './world/terrain.js';
import { createRocks } from './world/rocks.js';
import { createDust } from './world/dust.js';
import { startDashboard } from './dashboard/dashboard.js';
import { createGameplay } from './gameplay/gameplay.js';

// [diseño] Duración del fundido entre el mapa y la superficie, en milisegundos.
const FADE_MS = 320;

function showFatal(message) {
  const box = document.createElement('div');
  box.className = 'panel load-error';
  box.setAttribute('role', 'alert');
  box.textContent = message;
  box.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:420px;padding:16px;z-index:50';
  document.body.append(box);
}

async function start() {
  const [dataset, zones] = await Promise.all([loadDataset(datasetIdFromUrl()), loadDatasetIndex()]);
  const dem = createDem(dataset.metadata, dataset.heights_m);

  const quality = pickQuality();
  const world = createWorld(document.body, quality);
  const material = createTerrainMaterial(null, quality);
  const mesh = createTerrainMesh(dem, material);
  world.scene.add(mesh);
  const patch = createLocalPatch(dem, material, mesh, quality);
  world.scene.add(patch.mesh);
  const terrain = { mesh, material, patch };
  const rocks = createRocks(world.scene, dem, quality);
  const dust = createDust(world.scene, quality);

  state.mode = 'dashboard';
  const dashboard = await startDashboard(document.body, { world, dem, dataset, terrain, zones });
  const gameplay = createGameplay(document.body, { world, dem, dataset, terrain, rocks, dust });

  // Cambio de modo. La posición del astronauta viaja en state.astronaut_position_m.
  // El cambio se hace detrás de un fundido a negro, como un corte de cámara.
  const fade = document.createElement('div');
  fade.className = 'mode-fade';
  document.body.append(fade);
  let switching = false;
  on('mode:request', (mode) => {
    if (switching || mode === state.mode || !['gameplay', 'dashboard'].includes(mode)) return;
    switching = true;
    fade.classList.add('is-on');
    window.setTimeout(() => {
      if (mode === 'gameplay') {
        dashboard.setActive(false);
        gameplay.enter();
      } else {
        gameplay.exit();
        dashboard.setActive(true);
      }
      state.mode = mode;
      fade.classList.remove('is-on');
      switching = false;
    }, FADE_MS);
  });
  world.start();

  // Solo en desarrollo: acceso desde la consola y las pruebas de navegador.
  if (import.meta.env.DEV) {
    window.__marswalk = { ...dashboard, state, terrain, rocks, dust, gameplay, on };
  }
}

start().catch((error) => {
  console.error(error);
  showFatal(error.message);
});
