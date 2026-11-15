// Dashboard: la vista orbital del mapa, sus capas, paneles y pestañas.
// El mundo 3D (escena, cielo, terreno) llega ya creado desde main.js.
import * as THREE from 'three';
import { state, on, emit } from '../shared/state.js';
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
import { QUALITY_PROFILES, saveQuality } from '../world/quality.js';
import './panels/panels.css';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// [diseño] El astronauta empieza a 6 m al este del rover, para que no se solapen.
const ASTRONAUT_START_OFFSET_M = 6;

/**
 * startDashboard(container, { world, dem, dataset, terrain, zones }) ->
 *   setActive(bool)   muestra u oculta el dashboard (al bajar a la superficie se oculta)
 *   y referencias para las pruebas de navegador.
 */
export async function startDashboard(container, { world, dem, dataset, terrain, zones = [] }) {
  const ui = el('div', 'dashboard-ui');
  container.append(ui);
  const dockLeft = el('div', 'dock dock-left');
  const dockRight = el('div', 'dock dock-right');
  ui.append(dockLeft, dockRight);

  // Capas: el compositor pinta un canvas que es la textura del terreno.
  const compositor = await createCompositor(dem, dataset);
  const texture = new THREE.CanvasTexture(compositor.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(world.quality.anisotropy, world.renderer.capabilities.getMaxAnisotropy());
  terrain.material.map = texture;
  terrain.material.needsUpdate = true;
  compositor.onChange(() => {
    texture.needsUpdate = true;
  });

  const orbit = createOrbitControls(world.camera, world.renderer.domElement, dem);
  let active = true;
  world.onFrame(() => {
    if (active) orbit.update();
  });

  // Puntos de interés (poi.json es opcional).
  const points = dataset.poi && Array.isArray(dataset.poi.points) ? dataset.poi.points : [];
  const { markers, group: poiGroup } = createPoiMarkers(world.scene, dem, points);
  const shelter = points.find((poi) => poi.type === 'shelter');
  // El astronauta empieza junto al refugio; sin refugio, en el centro del mapa.
  state.astronaut_position_m = shelter
    ? [shelter.position_m[0] + ASTRONAUT_START_OFFSET_M, shelter.position_m[1]]
    : [0, 0];

  // Rover a escala real sobre el refugio, apoyado en el suelo con sampleElevation_m.
  const models = {};
  const modelsReady = shelter
    ? createPerseverance()
        .then((rover) => {
          const [x_m, z_m] = shelter.position_m;
          rover.position.set(x_m, dem.sampleElevation_m(x_m, z_m), z_m);
          rover.traverse((node) => {
            if (node.isMesh) node.castShadow = world.quality.shadows;
          });
          world.scene.add(rover);
          models.rover = rover;
        })
        .catch((error) => {
          console.error('No se pudo cargar el modelo del rover:', error);
        })
    : Promise.resolve();

  // El rover mide 3 m: desde la órbita no se ve y cuesta cientos de llamadas de dibujo,
  // así que solo se dibuja con la cámara cerca. [diseño] Distancia de corte en metros.
  const ROVER_DRAW_DISTANCE_M = 700;
  world.onFrame(() => {
    if (models.rover) {
      models.rover.visible =
        world.camera.position.distanceTo(models.rover.position) < ROVER_DRAW_DISTANCE_M;
    }
  });

  const picking = createPicking({
    camera: world.camera, domElement: world.renderer.domElement, mesh: terrain.mesh, dem, markers,
    isEnabled: () => active,
  });

  createLayersPanel(dockLeft, compositor);

  const readout = el('div', 'panel readout', 'Haz clic sobre el terreno');
  ui.append(readout);
  on('terrain:click', ({ x_m, z_m, elevation_m, slope_deg }) => {
    readout.textContent =
      `x ${x_m.toFixed(1)} m · z ${z_m.toFixed(1)} m · ` +
      `elevación ${elevation_m.toFixed(1)} m · pendiente ${slope_deg.toFixed(2)}°`;
  });

  const routeLine = createRouteLine(world.scene, dem, world.renderer);
  world.onFrame((delta_s) => routeLine.update(world.camera, delta_s));
  state.crew = DEFAULT_CREW.map((member) => ({ ...member }));
  const popupHost = el('div');
  dockRight.append(popupHost);
  const routePanel = createRoutePanel(dockRight, {
    dem, dataset, routeLine, getCrew: () => state.crew.map((member) => ({ ...member })),
  });
  const environmentPanel = createEnvironmentPanel(dockLeft, { world, dataset, routePanel });

  const popup = createPoiPopup(popupHost);
  on('poi:click', (poi) => {
    if (active) popup.show(poi, state.astronaut_position_m);
  });

  // Barra superior: pestañas, perfil gráfico y bajada a la superficie.
  const crewPanel = createCrewPanel({ routePanel });
  const formulasView = createFormulasView();
  const creditsView = createCreditsView();
  const tabs = createTabs(
    ui,
    [
      { id: 'map', label: 'Mapa' },
      { id: 'crew', label: 'Tripulación', element: crewPanel.element, onShow: crewPanel.render },
      { id: 'formulas', label: 'Fórmulas', element: formulasView.element, onShow: formulasView.render },
      { id: 'credits', label: 'Créditos', element: creditsView.element },
    ],
    {
      zones,
      zone: dataset.metadata.dataset_id,
      // Cambiar de zona recarga la página con ?dataset=: se rehacen el terreno y los modelos.
      onZone(id) {
        const url = new URL(window.location.href);
        url.searchParams.set('dataset', id);
        window.location.href = url.toString();
      },
      qualityOptions: Object.values(QUALITY_PROFILES).map((profile) => [profile.id, profile.label]),
      quality: world.quality.id,
      // El perfil gráfico se aplica al recargar: cambia el renderer y las mallas.
      onQuality(id) {
        saveQuality(id);
        window.location.reload();
      },
      onExplore: () => emit('mode:request', 'gameplay'),
    },
  );

  // Vista orbital inicial.
  let savedCamera = null;

  return {
    world, dem, dataset, compositor, mesh: terrain.mesh, orbit, routePanel, environmentPanel,
    models, modelsReady, tabs, picking,
    getRoute: () => routePanel.getRoute(),
    setActive(next) {
      if (next === active) return;
      active = next;
      ui.hidden = !active;
      orbit.controls.enabled = active;
      poiGroup.visible = true; // los marcadores también sirven de referencia a pie
      if (!active) {
        savedCamera = {
          position: world.camera.position.clone(),
          target: orbit.controls.target.clone(),
        };
        popup.hide();
      } else if (savedCamera) {
        world.camera.position.copy(savedCamera.position);
        orbit.controls.target.copy(savedCamera.target);
        world.camera.up.set(0, 1, 0);
        orbit.controls.update();
      }
    },
  };
}
