// Panel Plan de EVA: inicio y destino con clic en el mapa, tres algoritmos, métricas, perfil de
// elevación, comparación de la ruta clásica contra la de salud y exportación.
import './panels.css';
import { createPanelShell } from './panel_shell.js';
import { state, on, emit } from '../../shared/state.js';
import { buildElevationProfile } from '../../models/routing/profile.js';
import { QAOA_NOTICE } from '../../models/routing/qaoa_inspired.js';
import { PRESETS } from '../../models/routing/astar_health.js';
import { nearestShelter } from '../../models/environment/weather.js';
import { drawElevationProfile } from './elevation_profile.js';
import { explainRoute } from '../../shared/rover_llm.js';
import { buildRouteBrief } from '../../shared/route_brief.js';

const ALGORITHMS = [
  { id: 'astar', label: 'Ahorra oxígeno', sub: 'A* clásico: el menor gasto de O₂', title: 'Ruta clásica: menor coste de oxígeno (M3 y M4)' },
  { id: 'health', label: 'Cuida al astronauta', sub: 'Tú eliges qué pesa: pulso, calor, pendiente…', title: 'Ruta por salud: coste con las métricas elegidas (M14)' },
  { id: 'qaoa', label: 'Corredor inspirado en QAOA', sub: 'Versión clásica de un algoritmo cuántico de optimización', title: QAOA_NOTICE },
];

// Dimensiones de M14, en el orden de la ficha.
const DIMENSIONS = [
  ['slope', 'Pendiente'],
  ['metabolic', 'Gasto metabólico'],
  ['heart_rate', 'Pulso'],
  ['oxygen', 'Oxígeno'],
  ['thermal', 'Temperatura'],
  ['hydration', 'Hidratación'],
  ['radiation', 'Radiación'],
];
const PRESET_LABELS = { clasico: 'Clásico', cientifico: 'Científico', balanceado: 'Balanceado', seguridad: 'Seguridad' };

// Filas de la comparación: [clave de simulateRoute, etiqueta, unidad, decimales].
const COMPARE_ROWS = [
  ['distance_m', 'Distancia', 'm', 0],
  ['time_h', 'Tiempo', 'h', 2],
  ['o2_used_l', 'O₂', 'L', 0],
  ['peak_metabolic_w', 'Pico de gasto', 'W', 0],
  ['peak_heart_rate_bpm', 'Pico de pulso', 'lpm', 0],
  ['minutes_over_sustainable', 'Sobre el límite', 'min', 0],
];

// [diseño] Espera tras el último cambio antes de recalcular sola la ruta, en milisegundos.
const AUTO_COMPUTE_MS = 250;
// [diseño] Espera antes de pedirle al rover que explique una ruta: si se sigue moviendo
// el destino, solo se explica la última.
const EXPLAIN_GAP_MS = 900;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatPoint(point_m) {
  return point_m ? `x ${point_m[0].toFixed(0)}  z ${point_m[1].toFixed(0)} m` : 'haz clic en el mapa';
}

function formatTime(time_s) {
  const minutes = Math.round(time_s / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

// deps: { dem, dataset, routeLine, getCrew, getPoints }
//   getCrew: tripulación actual, para la ruta por salud
//   getPoints: puntos de interés de la zona más la base y los objetivos propios
export function createRoutePanel(container, { dem, dataset, routeLine, getCrew, getPoints }) {
  // Plegado de entrada: se abre solo al marcar el primer punto en el mapa.
  const shell = createPanelShell('Plan de EVA', 'route-panel', { open: false });
  shell.body.append(el('div', 'route-section', '1 · Marca inicio y destino en el mapa'));
  const panel = shell.body;

  // --- Inicio y destino: el clic en el mapa fija el punto resaltado.
  const points = { start: null, goal: null };
  let target = 'start';
  const pointRows = {};
  const pointLabels = {};
  for (const [key, label] of [['start', 'Inicio'], ['goal', 'Destino']]) {
    const rowEl = el('button', `route-point-row route-point-${key}`);
    rowEl.type = 'button';
    rowEl.dataset.pick = key;
    rowEl.title = `Fijar el ${label.toLowerCase()} con el próximo clic en el mapa`;
    pointLabels[key] = el('span', 'route-point', formatPoint(null));
    rowEl.append(el('i', 'route-dot'), el('span', 'route-point-name', label), pointLabels[key]);
    rowEl.addEventListener('click', () => setTarget(key));
    pointRows[key] = rowEl;
    panel.append(rowEl);
  }
  const quick = el('div', 'route-row route-quick');
  const fromAstronaut = el('button', 'route-from-astronaut', 'Astronauta');
  fromAstronaut.type = 'button';
  fromAstronaut.title = 'Usar la posición del astronauta como inicio';
  const toShelter = el('button', 'route-to-shelter', 'Refugio');
  toShelter.type = 'button';
  toShelter.title = 'Usar el refugio más cercano como destino';
  const clearButton = el('button', 'route-clear', 'Borrar');
  clearButton.type = 'button';
  quick.append(fromAstronaut, toShelter, clearButton);
  const hint = el('div', 'route-hint');
  panel.append(quick, hint);

  // --- Algoritmo
  panel.append(el('div', 'route-section', '2 · Elige cómo planificar'));
  const segmented = el('div', 'route-cards');
  segmented.setAttribute('role', 'radiogroup');
  let algorithm = 'astar';
  const algoButtons = {};
  for (const item of ALGORITHMS) {
    const button = el('button', 'route-card');
    button.append(el('strong', null, item.label), el('small', null, item.sub));
    button.type = 'button';
    button.dataset.algorithm = item.id;
    button.title = item.title;
    button.setAttribute('role', 'radio');
    button.addEventListener('click', () => setAlgorithm(item.id));
    algoButtons[item.id] = button;
    segmented.append(button);
  }
  const notice = el('div', 'route-notice', QAOA_NOTICE);
  notice.hidden = true;
  panel.append(segmented, notice);

  // --- Métricas de la ruta por salud (M14): casillas y preajustes.
  const healthBox = el('div', 'route-health');
  healthBox.hidden = true;
  healthBox.append(el('div', 'route-section', 'Métricas que cuentan'));
  const chips = el('div', 'route-chips');
  for (const key of Object.keys(PRESETS)) {
    const chip = el('button', 'chip', PRESET_LABELS[key]);
    chip.type = 'button';
    chip.dataset.preset = key;
    chip.addEventListener('click', () => {
      for (const [dimension, box] of Object.entries(dimensionBoxes)) box.checked = PRESETS[key].includes(dimension);
      onDimensionsChange();
    });
    chips.append(chip);
  }
  healthBox.append(chips);
  const dimensionBoxes = {};
  const grid = el('div', 'route-dimensions');
  for (const [key, label] of DIMENSIONS) {
    const item = el('label', 'route-dimension');
    const box = el('input');
    box.type = 'checkbox';
    box.dataset.dimension = key;
    box.checked = PRESETS.seguridad.includes(key);
    box.addEventListener('change', onDimensionsChange);
    dimensionBoxes[key] = box;
    item.append(box, el('span', null, label));
    grid.append(item);
  }
  healthBox.append(grid);
  panel.append(healthBox);

  // --- Acciones
  const actions = el('div', 'route-row route-actions');
  const computeButton = el('button', 'route-compute btn-primary', 'Calcular');
  computeButton.type = 'button';
  const compareButton = el('button', 'route-compare', 'Comparar');
  compareButton.type = 'button';
  const exportButton = el('button', 'route-export', 'Exportar');
  exportButton.type = 'button';
  actions.append(computeButton, compareButton, exportButton);
  const status = el('div', 'route-status');
  status.setAttribute('role', 'status');
  const verdict = el('div', 'route-verdict');
  panel.append(el('div', 'route-section', '3 · Tu ruta'), actions, status, verdict);

  // --- Métricas
  const metrics = el('dl', 'route-metrics');
  const metricValues = {};
  for (const [key, label] of [
    ['distance', 'Distancia'], ['oxygen', 'O₂'], ['slope', 'Pendiente máxima'], ['risk', 'Riesgo'], ['time', 'Tiempo'],
  ]) {
    const value = el('dd', null, '—');
    value.dataset.metric = key;
    metricValues[key] = value;
    metrics.append(el('dt', null, label), value);
  }
  const detail = el('details', 'route-detail');
  detail.append(el('summary', null, 'Ver los números y el perfil'), metrics);
  panel.append(detail);

  // --- Comparación: las dos rutas a la vez en el mapa y sus cifras lado a lado.
  const compareBox = el('div', 'route-compare-box');
  compareBox.hidden = true;
  const legend = el('div', 'route-legend');
  legend.append(
    el('i', 'route-swatch route-swatch-classic'), el('span', null, 'Clásica'),
    el('i', 'route-swatch route-swatch-health'), el('span', null, 'Salud'),
  );
  const compareTable = el('table', 'route-compare-table');
  compareBox.append(legend, compareTable);
  panel.append(compareBox);

  // --- Perfil de elevación
  const profile = el('canvas', 'route-profile');
  detail.append(profile, el('div', 'route-hint', 'Perfil de elevación. En rojo, tramos de más de 25°.'));
  // El perfil se dibuja al abrir el detalle: plegado, el lienzo no tiene tamaño.
  detail.addEventListener('toggle', () => {
    if (detail.open) drawElevationProfile(profile, route ? buildElevationProfile(dem, route.path_m) : null);
  });
  container.append(shell.root);
  drawElevationProfile(profile, null);

  // --- Worker
  const worker = new Worker(new URL('../map/route_worker.js', import.meta.url), { type: 'module' });
  // Copia de las alturas: el hilo principal sigue usando las suyas.
  worker.postMessage({ type: 'init', metadata: dataset.metadata, heights_m: dataset.heights_m.slice() });
  let requestId = 0;
  let compareId = 0;
  let route = null;
  let autoTimer = null;

  const activeDimensionLabels = () =>
    DIMENSIONS.filter(([key]) => dimensionBoxes[key].checked).map(([, label]) => label.toLowerCase());

  // El rover explica la ruta en lenguaje llano a partir de los números de los modelos.
  // Si no hay servidor o falla, se queda el resumen fijo. Solo se aplica la respuesta de
  // la última ruta pedida, y no se pide más de una cada EXPLAIN_GAP_MS.
  let explainId = 0;
  let explainTimer = null;
  function explain(input) {
    const id = ++explainId;
    verdict.classList.remove('is-rover');
    window.clearTimeout(explainTimer);
    explainTimer = window.setTimeout(async () => {
      const text = await explainRoute(buildRouteBrief(input));
      if (text && id === explainId) {
        verdict.textContent = text;
        verdict.classList.add('is-rover');
      }
    }, EXPLAIN_GAP_MS);
  }

  const activeDimensions = () =>
    DIMENSIONS.map(([key]) => key).filter((key) => dimensionBoxes[key].checked);

  function setTarget(key) {
    target = key;
    for (const [name, rowEl] of Object.entries(pointRows)) rowEl.classList.toggle('is-target', name === key);
    hint.textContent = `El próximo clic en el mapa fija el ${key === 'start' ? 'inicio' : 'destino'}.`;
  }

  function refresh() {
    pointLabels.start.textContent = formatPoint(points.start);
    pointLabels.goal.textContent = formatPoint(points.goal);
    pointRows.start.classList.toggle('is-set', Boolean(points.start));
    pointRows.goal.classList.toggle('is-set', Boolean(points.goal));
    const ready = Boolean(points.start && points.goal);
    computeButton.disabled = !ready;
    compareButton.disabled = !ready;
    exportButton.disabled = !route;
  }

  function clearRoute() {
    route = null;
    routeLine.clear();
    compareBox.hidden = true;
    for (const value of Object.values(metricValues)) value.textContent = '—';
    verdict.textContent = '';
    verdict.classList.remove('is-rover');
    explainId += 1; // descarta una explicación en camino
    window.clearTimeout(explainTimer);
    drawElevationProfile(profile, null);
    refresh();
  }

  function setPoint(key, point_m) {
    points[key] = point_m ? [point_m[0], point_m[1]] : null;
    if (key === 'start') routeLine.setStart(points.start);
    else routeLine.setGoal(points.goal);
    status.textContent = '';
    clearRoute();
    scheduleCompute();
  }

  // La ruta se recalcula sola en cuanto hay inicio y destino.
  function scheduleCompute() {
    window.clearTimeout(autoTimer);
    if (points.start && points.goal) autoTimer = window.setTimeout(compute, AUTO_COMPUTE_MS);
  }

  function compute() {
    window.clearTimeout(autoTimer);
    if (!points.start || !points.goal) return;
    if (algorithm === 'health' && activeDimensions().length === 0) {
      clearRoute();
      status.textContent = 'Marca al menos una métrica para la ruta por salud.';
      return;
    }
    requestId += 1;
    status.textContent = 'Calculando…';
    worker.postMessage({
      type: 'route', id: requestId, algorithm, dimensions: activeDimensions(), crew: getCrew(),
      start_m: points.start, goal_m: points.goal, config: {},
    });
  }

  function setAlgorithm(id) {
    algorithm = id;
    for (const [name, button] of Object.entries(algoButtons)) {
      button.classList.toggle('is-active', name === id);
      button.setAttribute('aria-checked', String(name === id));
    }
    healthBox.hidden = id !== 'health';
    notice.hidden = id !== 'qaoa';
    compareButton.title = id === 'health'
      ? 'Dibuja también la ruta clásica y compara las dos'
      : 'Dibuja también la ruta por salud y compara las dos';
    status.textContent = '';
    clearRoute();
    scheduleCompute();
  }

  function onDimensionsChange() {
    const current = activeDimensions();
    for (const chip of chips.children) {
      const preset = PRESETS[chip.dataset.preset];
      chip.classList.toggle('is-active', preset.length === current.length && preset.every((key) => current.includes(key)));
    }
    status.textContent = '';
    clearRoute();
    scheduleCompute();
  }

  on('terrain:click', ({ x_m, z_m }) => {
    // Mientras se coloca la base o un objetivo, el clic no es para la ruta.
    if (state.clickMode !== 'route') return;
    shell.root.open = true;
    setPoint(target, [x_m, z_m]);
    // Tras el inicio toca el destino; después, cada clic mueve el destino.
    setTarget('goal');
  });
  // Desde el popup de un punto de interés: "Ruta hasta aquí".
  on('route:goal', (point_m) => {
    if (!points.start && state.astronaut_position_m) setPoint('start', state.astronaut_position_m);
    setPoint('goal', point_m);
    setTarget('goal');
    shell.root.open = true;
  });

  fromAstronaut.addEventListener('click', () => {
    if (state.astronaut_position_m) setPoint('start', state.astronaut_position_m);
    setTarget('goal');
  });
  toShelter.addEventListener('click', () => {
    const from_m = points.start ?? state.astronaut_position_m ?? [0, 0];
    const shelter = nearestShelter(getPoints(), from_m);
    if (!shelter) {
      status.textContent = 'Esta zona no tiene ningún refugio.';
      return;
    }
    setPoint('goal', shelter.position_m);
  });
  clearButton.addEventListener('click', () => {
    window.clearTimeout(autoTimer);
    points.start = points.goal = null;
    routeLine.setStart(null);
    routeLine.setGoal(null);
    status.textContent = '';
    clearRoute();
    setTarget('start');
  });
  computeButton.addEventListener('click', compute);

  worker.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type !== 'route' || message.id !== requestId) return; // respuesta vieja
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
    routeLine.setComparePath(null);
    compareBox.hidden = true;
    routeLine.setPath(route.path_m);
    emit('route:computed', route);
    const unsafe = drawElevationProfile(profile, buildElevationProfile(dem, route.path_m));
    status.textContent =
      `Ruta calculada en ${message.elapsed_ms.toFixed(0)} ms.` +
      (unsafe > 0 ? ` Cruza ${unsafe} tramo(s) de más de 25°.` : '');
    // Veredicto en una frase; los números completos quedan en el detalle.
    verdict.textContent =
      `${metricValues.distance.textContent}${Number.isFinite(m.time_s) ? ` en ${formatTime(m.time_s)}` : ''}, ` +
      `${m.oxygen_l.toFixed(0)} L de oxígeno. ` +
      (m.max_slope_deg > 25
        ? `Ojo: hay pendientes de hasta ${m.max_slope_deg.toFixed(0)}°, por encima del límite seguro de 25°.`
        : `Pendiente máxima de ${m.max_slope_deg.toFixed(0)}°: dentro del límite seguro.`);
    explain({ algorithm, metrics: m, unsafe_segments: unsafe, dimensions: algorithm === 'health' ? activeDimensionLabels() : null });
    refresh();
  });

  // Clásica contra salud entre el inicio y el destino actuales.
  // -> Promise<{ classic, health, comparison } | { failed: true, error }>
  function compare() {
    if (!points.start || !points.goal) {
      return Promise.resolve({
        failed: true,
        error: 'Elige primero un inicio y un destino en el panel Ruta (pestaña Mapa).',
      });
    }
    const dimensions = activeDimensions();
    if (dimensions.length === 0) {
      return Promise.resolve({ failed: true, error: 'Marca al menos una métrica para la ruta por salud.' });
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
        type: 'compare', id, start_m: points.start, goal_m: points.goal, crew: getCrew(), dimensions,
      });
    });
  }

  compareButton.addEventListener('click', async () => {
    status.textContent = 'Comparando…';
    const result = await compare();
    if (result.failed) {
      status.textContent = result.error;
      return;
    }
    // La ruta del algoritmo elegido queda como principal y la otra como referencia.
    const healthIsPrimary = algorithm === 'health';
    routeLine.setPath((healthIsPrimary ? result.health : result.classic).path_m);
    routeLine.setComparePath((healthIsPrimary ? result.classic : result.health).path_m);
    legend.classList.toggle('health-primary', healthIsPrimary);
    compareTable.replaceChildren();
    const head = el('tr');
    for (const text of ['', 'Clásica', 'Salud', 'Dif.']) head.append(el('th', null, text));
    compareTable.append(head);
    for (const [key, label, unit, digits] of COMPARE_ROWS) {
      const item = result.comparison[key];
      const rowEl = el('tr');
      rowEl.dataset.metric = key;
      const better = item.diff < 0 ? 'is-better' : item.diff > 0 ? 'is-worse' : '';
      rowEl.append(
        el('td', null, `${label} (${unit})`),
        el('td', 'num', item.classic.toFixed(digits)),
        el('td', 'num', item.health.toFixed(digits)),
        el('td', `num ${better}`, item.diff_pct === null ? '—' : `${item.diff_pct > 0 ? '+' : ''}${item.diff_pct.toFixed(0)} %`),
      );
      compareTable.append(rowEl);
    }
    compareBox.hidden = false;
    status.textContent = 'Las dos rutas están en el mapa. La diferencia es salud menos clásica.';
    // Con las dos rutas delante, el rover dice cuál conviene.
    if (route) {
      explain({
        algorithm, metrics: route.metrics, comparison: result.comparison,
        dimensions: activeDimensionLabels(),
      });
    }
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

  setAlgorithm('astar');
  setTarget('start');
  onDimensionsChange();

  return {
    panel: shell.root,
    getRoute: () => route,
    getStart: () => points.start,
    getGoal: () => points.goal,
    getAlgorithm: () => algorithm,
    getDimensions: activeDimensions,
    setAlgorithm,
    compare,
    // Para otros paneles (por ejemplo, la evacuación): fija los puntos y calcula.
    setPoints(start_m, goal_m) {
      points.start = [start_m[0], start_m[1]];
      points.goal = [goal_m[0], goal_m[1]];
      routeLine.setStart(points.start);
      routeLine.setGoal(points.goal);
      setTarget('goal');
      clearRoute();
    },
    compute,
  };
}
