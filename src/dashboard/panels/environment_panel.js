// Panel Entorno: Sol, hora local, temperatura, viento y polvo (M16 y M17),
// y el botón "Simular tormenta" que traza la evacuación al refugio más cercano con M4.
import './panels.css';
import { createPanelShell } from './panel_shell.js';
import { state, on, emit } from '../../shared/state.js';
import { createSimClock } from '../../shared/sim_clock.js';
import { solarState, sunDirection, JEZERO_LAT_DEG } from '../../models/environment/solar.js';
import { tr } from '../../shared/i18n.js';
import {
  weatherState, nearestShelter, NOMINAL_DUST_TAU, STORM_DUST_TAU,
} from '../../models/environment/weather.js';

const PHASE_LABELS = { day: tr('día'), twilight: tr('crepúsculo'), night: tr('noche') };
// [diseño] Segundos simulados por tick del reloj.
const CLOCK_DT_S = 20;
// [diseño] Ticks por cuadro al pulsar "Reproducir tiempo" en el mapa (120 s simulados).
const PLAY_TICKS_PER_FRAME = 6;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatHour(ltst_h) {
  const hours = Math.floor(ltst_h);
  const minutes = Math.floor((ltst_h - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// deps: { world, routePanel, getPoints }
export function createEnvironmentPanel(container, { world, routePanel, getPoints }) {
  const shell = createPanelShell(tr('Entorno'), 'environment-panel');
  const panel = shell.body;

  // --- Controles
  const env = { ls_deg: 0, ltst_h: 12, dust_tau: NOMINAL_DUST_TAU, storm: false };
  const sliders = {};
  function addSlider(key, label, min, max, step, format) {
    const row = el('label', 'env-row');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(env[key]);
    input.dataset.env = key;
    const value = el('span', 'env-value', format(env[key]));
    input.addEventListener('input', () => {
      env[key] = Number(input.value);
      if (key !== 'dust_tau') clock.setStart({ ls_deg: env.ls_deg, ltst_h: env.ltst_h });
      update();
    });
    row.append(el('span', null, label), input, value);
    panel.append(row);
    sliders[key] = { input, value, format };
  }
  addSlider('ltst_h', tr('Hora local'), 0, 23.75, 0.25, formatHour);
  addSlider('ls_deg', tr('Estación (Ls)'), 0, 359, 1, (v) => `${v.toFixed(0)}°`);
  addSlider('dust_tau', 'Polvo (τ)', 0, 5, 0.1, (v) => v.toFixed(1));

  // --- Lecturas
  const readings = el('dl', 'env-readings');
  const values = {};
  for (const [key, label] of [
    ['sun', tr('Sol')],
    ['phase', tr('Fase')],
    ['irradiance', tr('Irradiancia en superficie')],
    ['distance', tr('Distancia al Sol')],
    ['temperature', tr('Temperatura')],
    ['wind', tr('Viento')],
  ]) {
    const value = el('dd');
    value.dataset.reading = key;
    values[key] = value;
    readings.append(el('dt', null, label), value);
  }
  panel.append(readings);

  // --- Acciones
  const actions = el('div', 'env-actions');
  const playButton = el('button', 'env-play', tr('Reproducir tiempo'));
  playButton.type = 'button';
  const stormButton = el('button', 'env-storm', tr('Simular tormenta'));
  stormButton.type = 'button';
  actions.append(playButton, stormButton);
  const status = el('div', 'env-note');
  status.setAttribute('role', 'status');
  panel.append(
    actions,
    status,
    el('div', 'env-note', tr('Viento: ningún modelo del proyecto lo calcula todavía. Temperatura: modelo de diseño (M17), sin ajustar con datos de MEDA.')),
  );
  container.append(shell.root);

  // --- Reloj de simulación: el Sol se actualiza antes que el clima, y el clima antes que
  // quien lo consuma (la salud, cuando exista el modo a pie).
  const clock = createSimClock({ dt_s: CLOCK_DT_S, ls_deg: env.ls_deg, ltst_h: env.ltst_h });
  let sun = null;
  let weather = null;
  clock.subscribe((time) => {
    env.ltst_h = time.ltst_h;
    env.ls_deg = time.ls_deg;
    sun = solarState({ ...env, lat_deg: JEZERO_LAT_DEG });
  });
  clock.subscribe(() => {
    weather = weatherState(env);
  });
  clock.subscribe(() => render());

  function update() {
    sun = solarState({ ...env, lat_deg: JEZERO_LAT_DEG });
    weather = weatherState(env);
    render();
  }

  function render() {
    for (const [key, { input, value, format }] of Object.entries(sliders)) {
      input.value = String(env[key]);
      value.textContent = format(env[key]);
    }
    values.sun.textContent = tr`altura ${sun.elevation_deg.toFixed(1)}°, acimut ${sun.azimuth_deg.toFixed(0)}°`;
    values.phase.textContent = PHASE_LABELS[sun.phase];
    values.irradiance.textContent = `${sun.surface_w_m2.toFixed(0)} W/m²`;
    values.distance.textContent = tr`${sun.sun_distance_au.toFixed(3)} UA`;
    values.temperature.textContent = `${weather.ambient_temp_c.toFixed(1)} °C`;
    values.wind.textContent = tr('sin dato');

    // Luz, cielo y bruma de la escena: dirección del Sol de M16 y polvo de M17.
    world.setEnvironment({
      sunDirection: sunDirection(sun.elevation_deg, sun.azimuth_deg),
      sun,
      weather: { dust_tau: env.dust_tau, storm: env.storm },
    });
    state.environment = { ...env, sun, weather };
    emit('environment:change', state.environment);
  }

  let playing = false;
  world.onFrame(() => {
    if (playing) clock.tick(PLAY_TICKS_PER_FRAME);
  });
  // La misión "Primer contacto" trae su propia tormenta, poco a poco.
  on('environment:dust', ({ dust_tau, storm }) => {
    env.dust_tau = dust_tau;
    env.storm = storm;
    stormButton.classList.toggle('is-active', storm);
    stormButton.textContent = storm ? tr('Terminar tormenta') : tr('Simular tormenta');
    update();
  });
  // En la superficie el tiempo corre solo: el modo a pie avisa de cuántos segundos
  // simulados pasan en cada cuadro (su velocidad se elige allí).
  on('time:advance', (seconds) => {
    if (!playing) clock.advance(seconds);
  });
  playButton.addEventListener('click', () => {
    playing = !playing;
    playButton.classList.toggle('is-active', playing);
    playButton.textContent = playing ? tr('Pausar tiempo') : tr('Reproducir tiempo');
  });

  stormButton.addEventListener('click', () => {
    env.storm = !env.storm;
    env.dust_tau = env.storm ? STORM_DUST_TAU : NOMINAL_DUST_TAU;
    stormButton.classList.toggle('is-active', env.storm);
    stormButton.textContent = env.storm ? tr('Terminar tormenta') : tr('Simular tormenta');
    update();
    if (!env.storm) {
      status.textContent = '';
      return;
    }
    // Evacuación con M4 al refugio más cercano, desde el inicio de la ruta si hay uno
    // y si no desde la posición del astronauta.
    const points = getPoints();
    const from_m = routePanel.getStart() ?? state.astronaut_position_m;
    const shelter = from_m ? nearestShelter(points, from_m) : null;
    if (!shelter) {
      status.textContent = tr('Tormenta activa. Esta zona no tiene refugio: coloca una base en el panel Misión.');
      return;
    }
    if (Math.hypot(shelter.position_m[0] - from_m[0], shelter.position_m[1] - from_m[1]) < 1) {
      status.textContent =
        tr`Tormenta activa. El astronauta ya está en ${shelter.name}. Para trazar una evacuación, elige un inicio en el panel Ruta.`;
      return;
    }
    routePanel.setAlgorithm('astar');
    routePanel.setPoints([...from_m], [...shelter.position_m]);
    routePanel.compute();
    status.textContent = tr`Tormenta activa. Ruta de evacuación a ${shelter.name} trazada con A* O2.`;
  });

  update();
  return { panel: shell.root, getEnvironment: () => ({ ...env, sun, weather }) };
}
