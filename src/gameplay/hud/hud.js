// Visor EVA. Solo muestra: cada lectura llega ya calculada por los modelos científicos
// (fisiología M5 a M12, terreno M1, entorno M16 y M17). Lo que ningún modelo calcula
// aparece como "sin dato".
import './hud.css';

const STATUS = {
  nominal: ['Nominal', 'is-ok'],
  low_o2: ['Oxígeno bajo', 'is-warn'],
  elevated: ['Esfuerzo elevado', 'is-warn'],
  at_risk_over_sustainable: ['Sobre el ritmo sostenible', 'is-warn'],
  critical: ['Crítico', 'is-danger'],
};

// Aviso de cada bandera de member.js.
const ALERTS = {
  o2_depleted: 'Oxígeno agotado',
  o2_low: 'Oxígeno por debajo del 10 %',
  over_sustainable: 'Gasto por encima del ritmo sostenible',
  hr_above_85pct: 'Pulso por encima del 85 % del máximo',
  thermal_critical: 'Temperatura corporal crítica',
  thermal_warning: 'Temperatura corporal alta',
  dehydration_critical: 'Deshidratación crítica',
  dehydration_warning: 'Deshidratación',
  career_dose_exceeded: 'Dosis de carrera superada',
};

const PHASES = { day: 'día', twilight: 'crepúsculo', night: 'noche' };
const COMPASS_PX_PER_DEG = 3;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(parent, label) {
  const line = el('div', 'hud-row');
  const value = el('span', 'value', '—');
  line.append(el('span', 'label', label), value);
  parent.append(line);
  return { line, value };
}

function setLevel(node, level) {
  node.classList.toggle('is-warn', level === 'warn');
  node.classList.toggle('is-danger', level === 'danger');
}

function formatDuration(hours) {
  if (!Number.isFinite(hours)) return '—';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * createHud(container, { onResume, onExit, onTimeScale, timeScales }) ->
 *   setVisible(bool), update(data), setPrompts([[tecla, texto]]), showCard({ kind, title, lines }),
 *   hideCard(), setMenu(bool), isMenuOpen(), setTimeScale(n), toggleDetails()
 */
export function createHud(container, { onResume, onExit, onTimeScale, timeScales = [1] }) {
  const hud = el('div', 'hud');
  hud.hidden = true;

  // ---- Constantes vitales
  const vitals = el('section', 'hud-block hud-vitals');
  vitals.append(el('h2', 'hud-title', 'Soporte vital'));
  const o2 = el('div', 'hud-o2');
  const o2Big = el('div', 'hud-o2-big');
  const o2Value = el('span', null, '—');
  o2Big.append(o2Value, el('small', null, 'L O₂'));
  const o2Bar = el('div', 'hud-bar');
  const o2Fill = el('i');
  o2Bar.append(o2Fill);
  o2.append(o2Big, o2Bar);
  vitals.append(o2);
  const fields = {
    autonomy: row(vitals, 'Autonomía'),
  };
  // Lo que sigue es telemetría para curiosos: se despliega con Tab.
  const vitalsMore = el('div', 'hud-more');
  vitals.append(vitalsMore);
  Object.assign(fields, {
    heart: row(vitalsMore, 'Pulso'),
    temp: row(vitalsMore, 'Temp. corporal'),
    hydration: row(vitalsMore, 'Deshidratación'),
    radiation: row(vitalsMore, 'Radiación'),
    metabolic: row(vitalsMore, 'Gasto'),
  });
  const vitalsNote = el('div', 'hud-note');
  vitalsMore.append(vitalsNote);
  const moreHint = el('div', 'hud-more-hint');
  moreHint.append(el('kbd', null, 'Tab'), 'telemetría completa');
  vitals.append(moreHint);

  // ---- Navegación (telemetría: solo con Tab)
  const nav = el('section', 'hud-block hud-nav hud-detail-only');
  nav.append(el('h2', 'hud-title', 'Navegación'));
  Object.assign(fields, {
    coords: row(nav, 'Posición'),
    elevation: row(nav, 'Elevación'),
    slope: row(nav, 'Pendiente'),
    speed: row(nav, 'Velocidad'),
    distance: row(nav, 'Recorrido'),
    ambient: row(nav, 'Ambiente'),
    wind: row(nav, 'Viento'),
  });
  fields.wind.value.textContent = 'sin dato';

  // ---- Brújula
  const compass = el('div', 'hud-compass');
  const strip = el('div', 'hud-compass-strip');
  const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' };
  for (let deg = -360; deg <= 720; deg += 15) {
    const norm = ((deg % 360) + 360) % 360;
    const mark = el('span', names[norm] ? 'cardinal' : null, names[norm] ?? String(norm));
    mark.style.left = `${deg * COMPASS_PX_PER_DEG}px`;
    strip.append(mark);
  }
  compass.append(strip);
  const heading = el('div', 'hud-heading', '—');

  // ---- Reloj de Marte y velocidad del tiempo
  const clock = el('div', 'hud-clock');
  const clockHour = el('span', 'hud-clock-hour', '—');
  const clockScale = el('span', 'hud-clock-scale', '—');
  const clockKey = el('kbd', null, 'T');
  clock.append(clockHour, clockScale, clockKey);

  // ---- Aviso de vehículo
  const vehicleBadge = el('div', 'hud-vehicle');
  vehicleBadge.hidden = true;
  const vehicleSpeed = el('strong', null, '0');
  vehicleBadge.append(el('span', 'hud-vehicle-title', 'En camioneta'), vehicleSpeed, el('small', null, 'km/h'),
    el('span', 'hud-vehicle-note', 'Estos kilómetros no cuentan como caminata'));

  // ---- Misión
  const mission = el('section', 'hud-block hud-mission');
  mission.append(el('h2', 'hud-title', 'Estado de misión'));
  const status = el('div', 'hud-status', '—');
  const alerts = el('ul', 'hud-alerts');
  const objective = el('div', 'hud-objective');
  const objectiveName = el('span', 'hud-objective-name', '—');
  const objectiveDistance = el('strong', null, '');
  objective.append(el('small', null, 'Objetivo más cercano'), objectiveName, objectiveDistance);
  mission.append(objective);
  const objectives = row(mission, 'Objetivos');
  const walked = row(mission, 'A pie');
  const driven = row(mission, 'En camioneta');
  const samples = row(mission, 'Muestras');
  const elapsed = row(mission, 'Tiempo de EVA');
  mission.append(status, alerts);

  // ---- Ayuda
  const help = el('section', 'hud-block hud-help');
  const helpLine = (keys, text) => {
    const line = el('div');
    for (const key of keys) line.append(el('kbd', null, key));
    line.append(text);
    help.append(line);
  };
  helpLine(['W', 'A', 'S', 'D'], 'moverse');
  helpLine(['Shift'], 'correr');
  helpLine(['Space'], 'saltar');
  helpLine(['E'], 'interactuar · hablar con el rover');
  helpLine(['F'], 'subir o bajar de la camioneta');
  helpLine(['G'], 'traer la camioneta');
  helpLine(['T'], 'velocidad del tiempo');
  helpLine(['V'], 'cambiar vista');
  helpLine(['Esc'], 'menú');
  const fps = el('div', 'hud-fps');
  help.append(fps);

  // ---- Aterrizaje en paracaídas
  const landingBox = el('section', 'hud-landing');
  landingBox.hidden = true;
  const landingAltitude = el('strong', null, '—');
  const landingInfo = el('div', 'hud-landing-info');
  const landingBar = el('div', 'hud-bar');
  const landingFill = el('i');
  landingBar.append(landingFill);
  const landingSpeed = el('div', 'hud-landing-speed');
  landingBox.append(el('span', 'hud-landing-title', 'Aterrizaje en paracaídas'), landingAltitude, landingInfo, landingBar, landingSpeed);

  const reticle = el('div', 'hud-reticle');
  const prompt = el('div', 'hud-prompt');
  prompt.hidden = true;

  // ---- Tarjeta de inspección
  const card = el('section', 'hud-block hud-card');
  card.hidden = true;

  // ---- Menú de pausa
  const menu = el('div', 'hud-menu');
  menu.hidden = true;
  const box = el('div', 'hud-menu-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Menú');
  box.append(el('h2', null, 'En pausa'));
  const actions = el('div', 'hud-menu-actions');
  const resume = el('button', 'btn-primary hud-resume', 'Continuar');
  resume.type = 'button';
  resume.addEventListener('click', () => onResume());
  const exit = el('button', 'hud-exit', 'Volver al mapa');
  exit.type = 'button';
  exit.addEventListener('click', () => onExit());
  actions.append(resume, exit);
  box.append(actions);

  const scaleLabel = el('label', null, 'Velocidad del tiempo');
  const scaleSelect = el('select', 'hud-time-scale');
  for (const scale of timeScales) {
    const option = el('option', null, scale === 0 ? 'En pausa' : scale === 1 ? 'Tiempo real' : `${scale}× más rápido`);
    option.value = String(scale);
    scaleSelect.append(option);
  }
  scaleSelect.addEventListener('change', () => onTimeScale(Number(scaleSelect.value)));
  scaleLabel.append(scaleSelect);
  box.append(
    scaleLabel,
    el('div', 'hud-note', 'La velocidad del tiempo mueve el Sol y el clima de Marte. El oxígeno y el resto de la fisiología van siempre en tiempo real. También se cambia con la tecla T. Con "Jugar con realismo" (Modo avanzado, en el mapa) el tiempo queda en 1×.'),
  );
  const controls = el('dl', 'hud-controls');
  for (const [keys, text] of [
    ['W A S D', 'Moverse'], ['Ratón', 'Mirar'], ['Shift', 'Correr'], ['Space', 'Saltar'],
    ['E', 'Interactuar y hablar con el rover'], ['F', 'Subir o bajar de la camioneta'],
    ['G', 'Traer la camioneta a tu lado'],
    ['T', 'Velocidad del tiempo'], ['Tab', 'Telemetría completa'],
    ['V', 'Primera o tercera persona'], ['Esc', 'Este menú'],
  ]) {
    const dt = el('dt');
    dt.append(el('kbd', null, keys));
    controls.append(dt, el('dd', null, text));
  }
  box.append(controls);
  menu.append(box);

  hud.append(vitals, nav, compass, heading, clock, vehicleBadge, mission, help, landingBox, reticle, prompt, card, menu);
  container.append(hud);

  return {
    element: hud,
    setVisible(visible) {
      hud.hidden = !visible;
    },
    // prompts: [[tecla, texto], ...]; vacío lo oculta.
    setPrompts(prompts) {
      prompt.hidden = prompts.length === 0;
      prompt.replaceChildren();
      for (const [key, text] of prompts) {
        const line = el('div');
        line.append(el('kbd', null, key), text);
        prompt.append(line);
      }
    },
    setTimeScale(scale) {
      scaleSelect.value = String(scale);
      clockScale.textContent = scale === 0 ? 'tiempo en pausa' : scale === 1 ? 'tiempo real' : `tiempo ${scale}×`;
      clock.classList.toggle('is-paused', scale === 0);
    },
    // Tab: muestra u oculta la telemetría completa.
    // fall: { altitude_m, speed_ms, remaining_s, progress, scale } o null al tocar suelo.
    setLanding(fall) {
      landingBox.hidden = !fall;
      hud.classList.toggle('is-landing', Boolean(fall));
      if (!fall) return;
      landingAltitude.textContent = `${fall.altitude_m.toFixed(0)} m`;
      const real_s = fall.remaining_s / fall.scale;
      const eta = real_s >= 60 ? `${Math.floor(real_s / 60)} min ${String(Math.round(real_s % 60)).padStart(2, '0')} s` : `${real_s.toFixed(0)} s`;
      landingInfo.textContent = `sobre el suelo · bajando a ${fall.speed_ms.toFixed(1)} m/s · tocas suelo en ${eta}`;
      landingFill.style.transform = `scaleX(${fall.progress})`;
      landingSpeed.replaceChildren(el('kbd', null, 'T'), `acelerar la caída · ahora ${fall.scale}×`);
    },
    // Con realismo el tiempo queda fijo en 1× y no hay vehículos.
    setRealism(on) {
      hud.classList.toggle('is-realism', on);
      scaleSelect.disabled = on;
      clockKey.hidden = on;
      if (on) clockScale.textContent = 'realismo · tiempo real';
    },
    toggleDetails() {
      return hud.classList.toggle('is-detailed');
    },
    // lines: textos; kind: etiqueta corta sobre el título.
    // image (opcional): { src, credit, alt }; solo se aceptan enlaces https.
    showCard({ kind, title, lines, image }) {
      card.replaceChildren(el('h2', 'hud-title', kind), el('h3', null, title));
      if (image?.src?.startsWith('https://')) {
        const picture = el('img', 'hud-card-image');
        picture.alt = image.alt ?? '';
        picture.referrerPolicy = 'no-referrer';
        picture.addEventListener('error', () => picture.remove());
        picture.src = image.src;
        card.append(picture);
        if (image.credit) card.append(el('div', 'hud-card-credit', `Crédito: ${image.credit}`));
      }
      for (const line of lines) card.append(el('p', null, line));
      card.hidden = false;
    },
    hideCard() {
      card.hidden = true;
    },
    isCardOpen: () => !card.hidden,
    setMenu(open) {
      menu.hidden = !open;
      if (open) resume.focus();
    },
    isMenuOpen: () => !menu.hidden,
    /**
     * data = { vitals, status, o2_capacity_l, nav: { x_m, z_m, elevation_m, slope_deg,
     *          heading_deg, speed_ms, distance_m }, environment: { ambient_temp_c, phase },
     *          elapsed_s, samples, sampleSites, visited, objectives, running, firstPerson, fps,
     *          vehicle, objective, ltst_h }
     */
    update(data) {
      const v = data.vitals;
      const flags = v.flags;
      o2Value.textContent = v.o2_l.toFixed(0);
      o2Fill.style.transform = `scaleX(${Math.max(0, Math.min(1, v.o2_fraction))})`;
      setLevel(o2Bar, flags.o2_depleted ? 'danger' : flags.o2_low ? 'warn' : null);

      fields.autonomy.value.textContent = formatDuration(v.autonomy_h);
      fields.heart.value.textContent = `${v.heart_rate_bpm.toFixed(0)} lpm`;
      setLevel(fields.heart.line, flags.hr_above_85pct ? 'warn' : null);
      fields.temp.value.textContent = `${v.core_temp_c.toFixed(1)} °C`;
      setLevel(fields.temp.line, flags.thermal_critical ? 'danger' : flags.thermal_warning ? 'warn' : null);
      fields.hydration.value.textContent = `${v.dehydration_pct.toFixed(2)} %`;
      setLevel(fields.hydration.line, flags.dehydration_critical ? 'danger' : flags.dehydration_warning ? 'warn' : null);
      fields.radiation.value.textContent = `${v.dose_usv.toFixed(2)} µSv`;
      setLevel(fields.radiation.line, flags.career_dose_exceeded ? 'danger' : null);
      fields.metabolic.value.textContent = v.metabolic_w > 0 ? `${v.metabolic_w.toFixed(0)} W` : '—';
      setLevel(fields.metabolic.line, flags.over_sustainable ? 'warn' : null);
      vitalsNote.textContent = data.running
        ? 'Al correr, el gasto es una extrapolación: el modelo M5 está medido caminando.'
        : data.vehicle?.driving
          ? 'En la camioneta el gasto es el de estar quieto.'
          : 'Radiación: solo rayos cósmicos de fondo; las tormentas solares no están modeladas.';

      const n = data.nav;
      fields.coords.value.textContent = `x ${n.x_m.toFixed(0)}  z ${n.z_m.toFixed(0)} m`;
      fields.elevation.value.textContent = `${n.elevation_m.toFixed(1)} m`;
      fields.slope.value.textContent = `${n.slope_deg.toFixed(1)}°`;
      setLevel(fields.slope.line, n.slope_deg > 25 ? 'danger' : null);
      fields.speed.value.textContent = `${n.speed_ms.toFixed(2)} m/s`;
      fields.distance.value.textContent =
        n.distance_m >= 1000 ? `${(n.distance_m / 1000).toFixed(2)} km` : `${n.distance_m.toFixed(0)} m`;
      walked.value.textContent = fields.distance.value.textContent;
      const driven_m = data.vehicle?.driven_m ?? 0;
      driven.value.textContent = driven_m >= 1000 ? `${(driven_m / 1000).toFixed(2)} km` : `${driven_m.toFixed(0)} m`;
      driven.line.hidden = driven_m < 1;
      vehicleBadge.hidden = !data.vehicle?.driving;
      vehicleSpeed.textContent = (n.speed_ms * 3.6).toFixed(0);
      if (data.objective) {
        objectiveName.textContent = data.objective.name;
        const d = data.objective.distance_m;
        objectiveDistance.textContent = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d.toFixed(0)} m`;
      } else {
        objectiveName.textContent = 'Todos visitados';
        objectiveDistance.textContent = '';
      }
      if (Number.isFinite(data.ltst_h)) {
        const hours = Math.floor(data.ltst_h);
        const minutes = Math.floor((data.ltst_h - hours) * 60);
        clockHour.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} hora local`;
      }
      fields.ambient.value.textContent = data.environment
        ? `${data.environment.ambient_temp_c.toFixed(0)} °C · ${PHASES[data.environment.phase]}`
        : 'sin dato';

      strip.style.transform = `translateX(${-n.heading_deg * COMPASS_PX_PER_DEG}px)`;
      heading.textContent = `${String(Math.round(n.heading_deg) % 360).padStart(3, '0')}°`;

      const [label, level] = STATUS[data.status];
      status.textContent = label;
      status.className = `hud-status ${level}`;
      alerts.replaceChildren();
      for (const [flag, text] of Object.entries(ALERTS)) {
        // No se repite el aviso menor cuando ya está el mayor.
        if (!flags[flag]) continue;
        if (flag === 'o2_low' && flags.o2_depleted) continue;
        if (flag === 'thermal_warning' && flags.thermal_critical) continue;
        if (flag === 'dehydration_warning' && flags.dehydration_critical) continue;
        alerts.append(el('li', null, text));
      }
      objectives.value.textContent = `${data.visited} de ${data.objectives}`;
      samples.value.textContent = `${data.samples} de ${data.sampleSites}`;
      elapsed.value.textContent = formatDuration(data.elapsed_s / 3600);

      reticle.hidden = !data.firstPerson;
      fps.textContent = `${data.fps.toFixed(0)} cuadros/s`;
    },
  };
}
