// Dashboard: arma la vista orbital, las capas y sus paneles.
import * as THREE from 'three';
import { state, on } from '../shared/state.js';
import { datasetIdFromUrl, loadDataset } from '../shared/dataset_loader.js';
import { createDem } from '../models/terrain/dem.js';
import { createScene } from './map/scene.js';
import { createTerrainMesh } from './map/terrain_mesh.js';
import { createOrbitControls } from './map/orbit_controls.js';
import { createPicking } from './map/picking.js';
import { createPoiMarkers } from './map/poi_markers.js';
import { createPoiPopup } from './map/poi_popup.js';
import { createCompositor } from './layers/compositor.js';
import { createLayersPanel } from './panels/layers_panel.js';
import { createRouteLine } from './map/route_line.js';
import { createRoutePanel } from './panels/route_panel.js';
import { createEnvironmentPanel } from './panels/environment_panel.js';
import { DEFAULT_CREW } from './default_crew.js';
import { createCrewPanel } from './panels/crew_panel.js';
import { createTabs } from './views/tabs.js';
import { createFormulasView } from './views/formulas_view.js';
import { createCreditsView } from './views/credits_view.js';
import { createPerseverance } from '../models3d/rover.js';
import { createAstronaut } from '../models3d/astronaut.js';
import './panels/panels.css';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function startDashboard(container) {
  const ui = el('div', 'dashboard-ui');
  container.append(ui);

  const dataset_id = datasetIdFromUrl();
  let dataset;
  try {
    dataset = await loadDataset(dataset_id);
  } catch (error) {
    ui.append(el('div', 'panel load-error', error.message));
    throw error;
  }
  const dem = createDem(dataset.metadata, dataset.heights_m);

  const view = createScene(container);
  const compositor = await createCompositor(dem, dataset);
  const texture = new THREE.CanvasTexture(compositor.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = view.renderer.capabilities.getMaxAnisotropy();
  compositor.onChange(() => {
    texture.needsUpdate = true;
  });

  const mesh = createTerrainMesh(dem, texture);
  view.scene.add(mesh);

  const orbit = createOrbitControls(view.camera, view.renderer.domElement, dem);
  view.onFrame(() => orbit.update());

  // Puntos de interés (poi.json es opcional).
  const points = dataset.poi && Array.isArray(dataset.poi.points) ? dataset.poi.points : [];
  const { markers } = createPoiMarkers(view.scene, dem, points);
  // Mientras no exista el modo a pie, el astronauta se coloca en el refugio.
  const shelter = points.find((poi) => poi.type === 'shelter');
  state.astronaut_position_m = shelter ? [...shelter.position_m] : null;

  // Modelos 3D a escala real: el rover sobre el refugio y el astronauta a su lado,
  // los dos apoyados en el suelo con sampleElevation_m.
  // [diseño] El astronauta se dibuja a 5 m al este del rover para que no se solapen.
  const ASTRONAUT_OFFSET_M = 5;
  const models = {};
  function placeOnGround(object, x_m, z_m) {
    object.position.set(x_m, dem.sampleElevation_m(x_m, z_m), z_m);
    view.scene.add(object);
  }
  const modelsReady = shelter
    ? Promise.all([
        createPerseverance().then((rover) => {
          placeOnGround(rover, shelter.position_m[0], shelter.position_m[1]);
          models.rover = rover;
        }),
        createAstronaut().then((astronaut) => {
          placeOnGround(astronaut, shelter.position_m[0] + ASTRONAUT_OFFSET_M, shelter.position_m[1]);
          models.astronaut = astronaut;
        }),
      ]).catch((error) => {
        console.error('No se pudieron cargar los modelos 3D:', error);
      })
    : Promise.resolve();

  createPicking({ camera: view.camera, domElement: view.renderer.domElement, mesh, dem, markers });

  ui.append(el('div', 'panel title-chip', `MarsWalk · ${dataset.metadata.label}`));
  createLayersPanel(ui, compositor);

  const readout = el('div', 'panel readout', 'Haz clic sobre el terreno');
  ui.append(readout);
  on('terrain:click', ({ x_m, z_m, elevation_m, slope_deg }) => {
    readout.textContent =
      `x ${x_m.toFixed(1)} m · z ${z_m.toFixed(1)} m · ` +
      `elevación ${elevation_m.toFixed(1)} m · pendiente ${slope_deg.toFixed(2)}°`;
  });

  const routeLine = createRouteLine(view.scene, dem, view.renderer);
  view.onFrame(() => routeLine.update(view.camera));
  state.crew = DEFAULT_CREW.map((member) => ({ ...member }));
  const routePanel = createRoutePanel(ui, {
    dem, dataset, routeLine, getCrew: () => state.crew.map((member) => ({ ...member })),
  });
  const environmentPanel = createEnvironmentPanel(ui, { view, dataset, routePanel });

  const popup = createPoiPopup(ui);
  on('poi:click', (poi) => popup.show(poi, state.astronaut_position_m));

  // Pestañas: el mapa y tres vistas a pantalla completa.
  const crewPanel = createCrewPanel({ routePanel });
  const formulasView = createFormulasView();
  const creditsView = createCreditsView();
  const tabs = createTabs(ui, [
    { id: 'map', label: 'Mapa' },
    { id: 'crew', label: 'Tripulación', element: crewPanel.element, onShow: crewPanel.render },
    { id: 'formulas', label: 'Fórmulas', element: formulasView.element, onShow: formulasView.render },
    { id: 'credits', label: 'Créditos', element: creditsView.element },
  ]);

  view.start();
  return { view, dem, dataset, compositor, mesh, orbit, routePanel, environmentPanel, models, modelsReady, tabs };
}
