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
import { createRouteRibbon } from './map/route_ribbon.js';
import { createRoutePanel } from './panels/route_panel.js';
import { createEnvironmentPanel } from './panels/environment_panel.js';
import { createMissionPanel } from './panels/mission_panel.js';
import { createOnboarding } from './onboarding.js';
import { DEFAULT_CREW } from './default_crew.js';
import { createCrewPanel } from './panels/crew_panel.js';
import { createTabs } from './views/tabs.js';
import { createFormulasView } from './views/formulas_view.js';
import { createCreditsView } from './views/credits_view.js';
import { QUALITY_PROFILES, saveQuality } from '../world/quality.js';
import './panels/panels.css';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// [diseño] El astronauta empieza a unos metros del refugio o de la base, fuera de su
// círculo de colisión.
const ASTRONAUT_START_OFFSET_M = 9;

/**
 * startDashboard(container, { world, dem, dataset, terrain, mission, zones }) ->
 *   setActive(bool)   muestra u oculta el dashboard (al bajar a la superficie se oculta)
 *   y referencias para las pruebas de navegador.
 */
export async function startDashboard(container, { world, dem, dataset, terrain, mission, zones = [] }) {
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

  // Puntos de interés: los de la zona más la base y los objetivos propios de la misión.
  const { markers, group: poiGroup, setPoints: setMarkerPoints } = createPoiMarkers(world.scene, dem, mission.getPoints());
  mission.onChange(() => setMarkerPoints(mission.getPoints()));
  // El astronauta empieza junto a la base si la hay; si no, junto al refugio de la zona;
  // sin ninguno de los dos, en el centro del mapa.
  const home = mission.getBase() ?? mission.getPoints().find((poi) => poi.type === 'shelter');
  state.astronaut_position_m = home
    ? [home.position_m[0] + ASTRONAUT_START_OFFSET_M, home.position_m[1] + ASTRONAUT_START_OFFSET_M]
    : [0, 0];

  // El rover ya no se aparca aquí: acompaña al astronauta y lo gestiona el modo a pie.
  const models = {};
  const modelsReady = Promise.resolve();

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

  const routeLine = createRouteRibbon(world.scene, dem);
  world.onFrame((delta_s) => routeLine.update(world.camera, delta_s));
  state.crew = DEFAULT_CREW.map((member) => ({ ...member }));
  const popupHost = el('div');
  dockRight.append(popupHost);
  const routePanel = createRoutePanel(dockRight, {
    dem, dataset, routeLine, getCrew: () => state.crew.map((member) => ({ ...member })),
    getPoints: () => mission.getPoints(),
  });
  createMissionPanel(dockRight, { mission });
  const environmentPanel = createEnvironmentPanel(dockLeft, {
    world, routePanel, getPoints: () => mission.getPoints(),
  });

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
        try {
          window.sessionStorage.setItem('marswalk_skip_intro', '1');
        } catch {
          // Ignorar si sessionStorage está restringido.
        }
        const url = new URL(window.location.href);
        url.searchParams.set('dataset', id);
        window.location.href = url.toString();
      },
      qualityOptions: Object.values(QUALITY_PROFILES).map((profile) => [profile.id, profile.label]),
      quality: world.quality.id,
      // El perfil gráfico se aplica al recargar: cambia el renderer y las mallas.
      onQuality(id) {
        saveQuality(id);
        try {
          window.sessionStorage.setItem('marswalk_skip_intro', '1');
        } catch {
          // Ignorar si sessionStorage está restringido.
        }
        window.location.reload();
      },
      onExplore: () => emit('mode:request', 'gameplay'),
      onHelp: () => onboarding.start(true),
    },
  );

  // Primeros pasos: salen solos la primera vez que el dashboard queda a la vista.
  const onboarding = createOnboarding(ui, { orbitControls: orbit.controls });

  // Vista orbital inicial.
  let savedCamera = null;

  return {
    world, dem, dataset, compositor, mesh: terrain.mesh, orbit, routePanel, environmentPanel,
    models, modelsReady, tabs, picking, ui,
    getRoute: () => routePanel.getRoute(),
    onboarding,
    setUiVisible(visible) {
      ui.classList.toggle('is-intro-hidden', !visible);
      orbit.controls.enabled = active && visible;
      if (visible) onboarding.start();
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      ui.hidden = !active;
      orbit.controls.enabled = active;
      // La cinta de la ruta cambia de medidas: ancha desde la órbita, estrecha a pie.
      routeLine.setView(active ? 'orbit' : 'surface');
      // Al salir del mapa, un clic pendiente de colocar base u objetivo se cancela.
      state.clickMode = 'route';
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
