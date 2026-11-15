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
import { visualGround_m } from './world/surface_detail.js';
import { startDashboard } from './dashboard/dashboard.js';
import { createGameplay } from './gameplay/gameplay.js';
import { startIntro } from './intro/intro.js';
import { createMissionStore } from './shared/missions.js';

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

function animateCameraDescent(world, dashboard, fromPos, toPos, durationMs) {
  const startTime = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = 1 - Math.pow(1 - t, 4);
    world.camera.position.lerpVectors(fromPos, toPos, eased);
    dashboard.orbit.controls.update();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      dashboard.orbit.controls.enabled = true;
    }
  }
  requestAnimationFrame(step);
}

async function initScene() {
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
  const dust = createDust(world.scene, quality, (x_m, z_m) => visualGround_m(dem, x_m, z_m));

  // Misión del usuario en esta zona: base y objetivos propios, guardados en el navegador.
  const mission = createMissionStore({
    dataset_id: dataset.metadata.dataset_id,
    datasetPoints: dataset.poi?.points ?? [],
    halfWidth_m: dem.size_m[0] / 2,
    halfDepth_m: dem.size_m[1] / 2,
  });

  const dashboard = await startDashboard(document.body, { world, dem, dataset, terrain, mission, zones });
  const gameplay = createGameplay(document.body, { world, dem, dataset, terrain, rocks, dust, mission });

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

  // Solo en desarrollo: acceso desde la consola y las pruebas de navegador.
  if (import.meta.env.DEV) {
    window.__marswalk = { ...dashboard, state, terrain, rocks, dust, gameplay, mission, on };
  }

  return { world, dashboard };
}

function consumeSkipIntroFlag() {
  if (new URLSearchParams(window.location.search).has('skipIntro')) return true;
  try {
    if (window.sessionStorage.getItem('marswalk_skip_intro') === '1') {
      window.sessionStorage.removeItem('marswalk_skip_intro');
      return true;
    }
  } catch {
    // Ignorar si sessionStorage está restringido.
  }
  return false;
}

async function start() {
  const skipIntro = consumeSkipIntroFlag();

  if (skipIntro) {
    const { world, dashboard } = await initScene();
    state.mode = 'dashboard';
    world.start();
    dashboard.setUiVisible(true);
    return;
  }

  state.mode = 'intro';
  const scenePromise = initScene().then(({ world, dashboard }) => {
    dashboard.setUiVisible(false);
    const targetCamPos = world.camera.position.clone();
    const highCamPos = targetCamPos.clone().multiplyScalar(2.6);
    world.camera.position.copy(highCamPos);
    dashboard.orbit.controls.update();
    return { world, dashboard, highCamPos, targetCamPos };
  });

  startIntro(document.body, {
    waitReady: () => scenePromise.then(() => undefined),
    onRevealStart: async () => {
      const { world, dashboard, highCamPos, targetCamPos } = await scenePromise;
      world.start();
      animateCameraDescent(world, dashboard, highCamPos, targetCamPos, 2400);
      window.setTimeout(() => {
        dashboard.setUiVisible(true);
      }, 900);
    },
    onComplete: () => {
      state.mode = 'dashboard';
    },
  });

  await scenePromise;
}

start().catch((error) => {
  console.error(error);
  showFatal(error.message);
});
