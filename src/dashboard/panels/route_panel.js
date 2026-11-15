// Panel Ruta: inicio y destino con clic en el mapa, cálculo, métricas, perfil y exportación.
import './panels.css';
import { on } from '../../shared/state.js';
import { buildElevationProfile } from '../../models/routing/profile.js';
import { drawElevationProfile } from './elevation_profile.js';

import { QAOA_NOTICE } from '../../models/routing/qaoa_inspired.js';
import { PRESETS } from '../../models/routing/astar_health.js';

const ALGORITHMS = [
  { id: 'astar', label: 'A* O2' },
  { id: 'health', label: 'Salud' },
  // El aviso de M15 va en la propia opción y debajo del selector.
  { id: 'qaoa', label: 'Inspirado en QAOA (heurístico clásico)' },
];

const PRESET_LABELS = {
  clasico: 'Clásico',
  cientifico: 'Científico',
  balanceado: 'Balanceado',
  seguridad: 'Seguridad',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatPoint(point_m) {
  return point_m ? `x ${point_m[0].toFixed(0)} m, z ${point_m[1].toFixed(0)} m` : 'sin elegir';
}

function formatTime(time_s) {
  const minutes = Math.round(time_s / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

// deps: { dem, dataset, routeLine, getCrew }  (getCrew: tripulación actual, para la ruta por salud)
export function createRoutePanel(container, { dem, dataset, routeLine, getCrew }) {
  const panel = el('section', 'panel route-panel');
  panel.append(el('h2', null, 'Ruta'));

  // --- Selector de algoritmo
  const algoRow = el('label', 'route-row');
  const select = el('select');
  for (const algorithm of ALGORITHMS) {
    const option = el('option', null, algorithm.label);
    option.value = algorithm.id;
    select.append(option);
  }
  algoRow.append(el('span', null, 'Algoritmo'), select);
  const notice = el('div', 'route-notice', `Sobre la opción "Inspirado en QAOA": ${QAOA_NOTICE}`);

  // Preajuste de dimensiones de M14; solo se usa con el algoritmo "Salud".
  const presetRow = el('label', 'route-row route-preset');
  const presetSelect = el('select');
  for (const key of Object.keys(PRESETS)) {
    const option = el('option', null, PRESET_LABELS[key] ?? key);
    option.value = key;
    presetSelect.append(option);
  }
  presetSelect.value = 'seguridad';
  presetRow.append(el('span', null, 'Preajuste'), presetSelect);
  presetRow.hidden = true;
  panel.append(algoRow, notice, presetRow);

  // --- Inicio y destino
  const points = { start: null, goal: null };
  let picking = null; // 'start' | 'goal' | null
  const pickButtons = {};
  const pointLabels = {};
  for (const [key, label] of [['start', 'Inicio'], ['goal', 'Destino']]) {
    const row = el('div', 'route-row');
    const button = el('button', 'route-pick', `Elegir ${label.toLowerCase()}`);
    button.type = 'button';
    button.dataset.pick = key;
    button.addEventListener('click', () => setPicking(picking === key ? null : key));
    pickButtons[key] = button;
    pointLabels[key] = el('span', 'route-point', formatPoint(null));
    row.append(button, pointLabels[key]);
    panel.append(row);
  }
  const hint = el('div', 'route-hint', 'Pulsa "Elegir inicio" y haz clic en el mapa.');
  panel.append(hint);

  // --- Acciones
  const actions = el('div', 'route-row');
  const computeButton = el('button', 'route-compute', 'Calcular');
  computeButton.type = 'button';
  computeButton.disabled = true;
  const exportButton = el('button', 'route-export', 'Exportar');
  exportButton.type = 'button';
  exportButton.disabled = true;
  actions.append(computeButton, exportButton);
  panel.append(actions);

  const status = el('div', 'route-status');
  status.setAttribute('role', 'status');
  panel.append(status);

  // --- Métricas
  const metrics = el('dl', 'route-metrics');
  const metricValues = {};
  for (const [key, label] of [
    ['distance', 'Distancia'],
    ['oxygen', 'O2'],
    ['slope', 'Pendiente máxima'],
    ['risk', 'Riesgo'],
    ['time', 'Tiempo'],
  ]) {
    const value = el('dd', null, '—');
    value.dataset.metric = key;
    metricValues[key] = value;
    metrics.append(el('dt', null, label), value);
  }
  panel.append(metrics);

  // --- Perfil de elevación
  const profile = el('canvas', 'route-profile');
  const profileNote = el('div', 'route-hint', 'Perfil de elevación. En rojo, tramos de más de 25°.');
  panel.append(profile, profileNote);
  container.append(panel);
  drawElevationProfile(profile, null);

  // --- Worker
  const worker = new Worker(new URL('../map/route_worker.js', import.meta.url), { type: 'module' });
  // Copia de las alturas: el hilo principal sigue usando las suyas.
  worker.postMessage({ type: 'init', metadata: dataset.metadata, heights_m: dataset.heights_m.slice() });
  let requestId = 0;
  let compareId = 0;
  let route = null;

  function setPicking(key) {
    picking = key;
    for (const [name, button] of Object.entries(pickButtons)) {
      button.classList.toggle('is-active', name === key);
    }
    hint.textContent = key
      ? `Haz clic en el mapa para fijar el ${key === 'start' ? 'inicio' : 'destino'}.`
      : 'Elige inicio y destino, y pulsa Calcular.';
  }

  function refresh() {
    pointLabels.start.textContent = formatPoint(points.start);
    pointLabels.goal.textContent = formatPoint(points.goal);
    computeButton.disabled = !(points.start && points.goal);
    exportButton.disabled = !route;
  }

  function clearRoute() {
    route = null;
    routeLine.clear();
    for (const value of Object.values(metricValues)) value.textContent = '—';
    drawElevationProfile(profile, null);
    refresh();
  }

  on('terrain:click', ({ x_m, z_m }) => {
    if (!picking) return;
    points[picking] = [x_m, z_m];
    if (picking === 'start') routeLine.setStart(points.start);
    else routeLine.setGoal(points.goal);
    status.textContent = '';
    clearRoute();
    setPicking(picking === 'start' && !points.goal ? 'goal' : null);
  });

  computeButton.addEventListener('click', () => {
    if (!points.start || !points.goal) return;
    requestId += 1;
    status.textContent = 'Calculando…';
    computeButton.disabled = true;
    worker.postMessage({
      type: 'route',
      id: requestId,
      algorithm: select.value,
      preset: presetSelect.value,
      crew: getCrew(),
      start_m: points.start,
      goal_m: points.goal,
      config: {},
    });
  });

  function onAlgorithmChange() {
    presetRow.hidden = select.value !== 'health';
    status.textContent = '';
    clearRoute();
  }
  select.addEventListener('change', onAlgorithmChange);
  presetSelect.addEventListener('change', onAlgorithmChange);

  worker.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type !== 'route' || message.id !== requestId) return; // respuesta vieja
    computeButton.disabled = false;
    if (message.result.failed) {
      clearRoute();
      status.textContent = `No se pudo calcular la ruta. ${message.result.error}`;
      return;
    }
    route = message.result;
    const m = route.metrics;
    metricValues.distance.textContent =
      m.distance_m >= 1000 ? `${(m.distance_m / 1000).toFixed(2)} km` : `${m.distance_m.toFixed(0)} m`;
    metricValues.oxygen.textContent = `${m.oxygen_l.toFixed(1)} L`;
    metricValues.slope.textContent = `${m.max_slope_deg.toFixed(1)}°`;
    metricValues.risk.textContent = m.risk_score.toFixed(2);
    metricValues.time.textContent = Number.isFinite(m.time_s) ? formatTime(m.time_s) : '—';
    routeLine.setPath(route.path_m);
    const unsafe = drawElevationProfile(profile, buildElevationProfile(dem, route.path_m));
    status.textContent =
      `Ruta calculada en ${message.elapsed_ms.toFixed(0)} ms.` +
      (unsafe > 0 ? ` Cruza ${unsafe} tramo(s) de más de 25°.` : '');
    refresh();
  });

  exportButton.addEventListener('click', () => {
    if (!route) return;
    const blob = new Blob([`${JSON.stringify(route, null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'route.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  window.addEventListener('resize', () => {
    drawElevationProfile(profile, route ? buildElevationProfile(dem, route.path_m) : null);
  });

  return {
    panel,
    getRoute: () => route,
    getStart: () => points.start,
    // Clásica contra salud entre el inicio y el destino actuales.
    // -> Promise<{ classic, health, comparison } | { failed: true, error }>
    compare() {
      if (!points.start || !points.goal) {
        return Promise.resolve({
          failed: true,
          error: 'Elige primero un inicio y un destino en el panel Ruta (pestaña Mapa).',
        });
      }
      compareId += 1;
      const id = compareId;
      return new Promise((resolve) => {
        const onMessage = (event) => {
          if (event.data.type !== 'compare' || event.data.id !== id) return;
          worker.removeEventListener('message', onMessage);
          resolve(event.data.result);
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({
          type: 'compare', id, start_m: points.start, goal_m: points.goal,
          crew: getCrew(), preset: presetSelect.value,
        });
      });
    },
    setAlgorithm(id) {
      select.value = id;
      onAlgorithmChange();
    },
    // Para otros paneles (por ejemplo, la evacuación): fija los puntos y calcula.
    setPoints(start_m, goal_m) {
      points.start = start_m;
      points.goal = goal_m;
      routeLine.setStart(start_m);
      routeLine.setGoal(goal_m);
      setPicking(null);
      clearRoute();
    },
    compute: () => computeButton.click(),
  };
}
