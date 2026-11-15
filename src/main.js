// Punto de entrada: crea el mundo 3D compartido y arranca el dashboard y el modo a pie.
// El dashboard y el gameplay no se conocen entre sí: aquí se decide cuál está activo.
import './styles/base.css';
import { state, on } from './shared/state.js';
import { datasetIdFromUrl, loadDataset } from './shared/dataset_loader.js';
import { createDem } from './models/terrain/dem.js';
import { pickQuality } from './world/quality.js';
import { createWorld } from './world/world.js';
import { createTerrainMaterial, createTerrainMesh, createLocalPatch } from './world/terrain.js';
import { createRocks } from './world/rocks.js';
import { createDust } from './world/dust.js';
import { startDashboard } from './dashboard/dashboard.js';

function showFatal(message) {
  const box = document.createElement('div');
  box.className = 'panel load-error';
  box.setAttribute('role', 'alert');
  box.textContent = message;
  box.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:420px;padding:16px;z-index:50';
  document.body.append(box);
}

async function start() {
  const dataset = await loadDataset(datasetIdFromUrl());
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
  const dashboard = await startDashboard(document.body, { world, dem, dataset, terrain });
  world.start();

  // Solo en desarrollo: acceso desde la consola y las pruebas de navegador.
  if (import.meta.env.DEV) {
    window.__marswalk = { ...dashboard, state, terrain, rocks, dust, on };
  }
}

start().catch((error) => {
  console.error(error);
  showFatal(error.message);
});
