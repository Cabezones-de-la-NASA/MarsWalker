// Visor EVA. Solo muestra: cada lectura llega ya calculada por los modelos científicos
// (fisiología M5 a M12, terreno M1, entorno M16 y M17). Lo que ningún modelo calcula
// aparece como "sin dato".
import './hud.css';
import { tr, getLang, setLang, LANGUAGES } from '../../shared/i18n.js';

const STATUS = {
  nominal: [tr('Nominal'), 'is-ok'],
  low_o2: [tr('Oxígeno bajo'), 'is-warn'],
  elevated: [tr('Esfuerzo elevado'), 'is-warn'],
  at_risk_over_sustainable: [tr('Sobre el ritmo sostenible'), 'is-warn'],
  critical: [tr('Crítico'), 'is-danger'],
};

// Aviso de cada bandera de member.js.
const ALERTS = {
  o2_depleted: tr('Oxígeno agotado'),
  o2_low: tr('Oxígeno por debajo del 10 %'),
  over_sustainable: tr('Gasto por encima del ritmo sostenible'),
  hr_above_85pct: tr('Pulso por encima del 85 % del máximo'),
  thermal_critical: tr('Temperatura corporal crítica'),
  thermal_warning: tr('Temperatura corporal alta'),
  dehydration_critical: tr('Deshidratación crítica'),
  dehydration_warning: tr('Deshidratación'),
  career_dose_exceeded: tr('Dosis de carrera superada'),
};

const PHASES = { day: tr('día'), twilight: tr('crepúsculo'), night: tr('noche') };
const COMPASS_PX_PER_DEG = 3;
// La marca del objetivo no se sale de la brújula: más allá de esto se queda en el borde.
const COMPASS_EDGE_PX = 190;
// Duración del vuelo de los avisos hacia el panel de teclas (igual que en hud.css).
const DOCK_TRANSITION_MS = 700;
// [diseño] Burbujas del rover a la vez, y segundos que dura cada una.
const FEED_MAX = 4;
const FEED_SECONDS = 13;

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
 * createHud(container, { onResume, onExit, onTimeScale, timeScales, volumes, onVolume }) ->
 *   setVisible(bool), update(data), setPrompts([[tecla, texto]]), showCard({ kind, title, lines }),
 *   hideCard(), setMenu(bool), isMenuOpen(), setTimeScale(n), toggleDetails()
 */
export function createHud(container, { onResume, onExit, onTimeScale, timeScales = [1], volumes = {}, onVolume }) {
  const hud = el('div', 'hud');
  hud.hidden = true;

  // ---- Constantes vitales
  const vitals = el('section', 'hud-block hud-vitals');
  vitals.append(el('h2', 'hud-title', tr('Soporte vital')));
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
    autonomy: row(vitals, tr('Autonomía')),
  };
  // Lo que sigue es telemetría para curiosos: se despliega con Tab.
  const vitalsMore = el('div', 'hud-more');
  vitals.append(vitalsMore);
  Object.assign(fields, {
    heart: row(vitalsMore, tr('Pulso')),
    temp: row(vitalsMore, tr('Temp. corporal')),
    hydration: row(vitalsMore, tr('Deshidratación')),
    radiation: row(vitalsMore, tr('Radiación')),
    metabolic: row(vitalsMore, tr('Gasto')),
  });
  const vitalsNote = el('div', 'hud-note');
  vitalsMore.append(vitalsNote);
  const moreHint = el('div', 'hud-more-hint');
  moreHint.append(el('kbd', null, tr('Tab')), tr('telemetría completa'));
  vitals.append(moreHint);

  // ---- Navegación (telemetría: solo con Tab)
  const nav = el('section', 'hud-block hud-nav hud-detail-only');
  nav.append(el('h2', 'hud-title', tr('Navegación')));
  Object.assign(fields, {
    coords: row(nav, tr('Posición')),
    elevation: row(nav, tr('Elevación')),
    slope: row(nav, tr('Pendiente')),
    speed: row(nav, tr('Velocidad')),
    distance: row(nav, tr('Recorrido')),
    ambient: row(nav, tr('Ambiente')),
    wind: row(nav, tr('Viento')),
  });
  fields.wind.value.textContent = tr('sin dato');

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
  // Marca del objetivo: se mueve bajo la brújula; en el borde, una flecha dice hacia dónde girar.
  const compassTarget = el('div', 'hud-compass-target');
  compassTarget.hidden = true;
  // Polvo en el visor durante la tormenta.
  const dustVeil = el('div', 'hud-dust');
  const dustReading = el('div', 'hud-dust-reading');
  dustReading.hidden = true;

  // ---- Reloj de Marte y velocidad del tiempo
  const clock = el('div', 'hud-clock');
  const clockHour = el('span', 'hud-clock-hour', '—');
  const clockScale = el('span', 'hud-clock-scale', '—');
  const clockKey = el('kbd', null, 'T');
  // Niveles de velocidad del tiempo: uno por cada valor que recorre la tecla T.
  const clockTiers = el('span', 'hud-clock-tiers');
  const speedTiers = timeScales.filter((scale) => scale > 0);
  clock.append(clockHour, clockScale, clockTiers, clockKey);

  // ---- Aviso de vehículo
  const vehicleBadge = el('div', 'hud-vehicle');
  vehicleBadge.hidden = true;
  const vehicleSpeed = el('strong', null, '0');
  vehicleBadge.append(el('span', 'hud-vehicle-title', tr('En camioneta')), vehicleSpeed, el('small', null, tr('km/h')),
    el('span', 'hud-vehicle-note', tr('Estos kilómetros no cuentan como caminata')));

  // ---- Misión
  const mission = el('section', 'hud-block hud-mission');
  mission.append(el('h2', 'hud-title', tr('Estado de misión')));
  const status = el('div', 'hud-status', '—');
  const alerts = el('ul', 'hud-alerts');
  const objective = el('div', 'hud-objective');
  const objectiveName = el('span', 'hud-objective-name', '—');
  const objectiveDistance = el('strong', null, '');
  objective.append(el('small', null, tr('Objetivo más cercano')), objectiveName, objectiveDistance);
  mission.append(objective);
  const objectives = row(mission, tr('Objetivos'));
  const walked = row(mission, 'A pie');
  const driven = row(mission, tr('En camioneta'));
  const samples = row(mission, tr('Muestras'));
  const elapsed = row(mission, tr('Tiempo de EVA'));
  mission.append(status, alerts);

  // ---- Ayuda
  const help = el('section', 'hud-block hud-help');
  // Acciones disponibles ahora mismo (hablar con el rover, traer la camioneta…): arriba
  // del panel de teclas y en grande. Los primeros segundos salen también en el centro.
  const actionList = el('div', 'hud-actions');
  help.append(actionList);
  const helpLine = (keys, text) => {
    const line = el('div');
    for (const key of keys) line.append(el('kbd', null, key));
    line.append(text);
    help.append(line);
  };
  helpLine(['W', 'A', 'S', 'D'], tr('moverse'));
  helpLine(['Shift'], tr('correr'));
  helpLine(['Space'], tr('saltar'));
  helpLine(['E'], tr('interactuar'));
  helpLine(['R'], tr('mantén para hablarle al rover'));
  helpLine(['Enter'], tr('escribirle al rover'));
  helpLine(['F'], tr('subir o bajar de la camioneta'));
  helpLine(['G'], tr('traer la camioneta'));
  helpLine(['T'], tr('velocidad del tiempo'));
  helpLine(['M'], tr('sonido sí o no'));
  helpLine(['V'], tr('cambiar vista'));
  helpLine(['Esc'], tr('menú'));
  const fps = el('div', 'hud-fps');
  help.append(fps);
  // Con la lista plegada queda solo esta pista.
  const helpHint = el('div', 'hud-help-hint');
  helpHint.append(el('kbd', null, 'R'), tr('mantén para hablarle al rover'), el('br'), el('kbd', null, tr('Tab')), tr('controles y telemetría'));
  help.append(helpHint);

  // ---- Aterrizaje en paracaídas
  const landingBox = el('section', 'hud-landing');
  landingBox.hidden = true;
  const landingAltitude = el('strong', null, '—');
  const landingInfo = el('div', 'hud-landing-info');
  const landingBar = el('div', 'hud-bar');
  const landingFill = el('i');
  landingBar.append(landingFill);
  const landingSpeed = el('div', 'hud-landing-speed');
  const landingTiers = el('div', 'hud-tiers');
  let landingSignature = '';
  landingBox.append(el('span', 'hud-landing-title', tr('Aterrizaje en paracaídas')), landingAltitude, landingInfo, landingBar, landingSpeed, landingTiers);

  // ---- Misión guiada: qué hacer ahora, cuenta atrás de la tormenta y barra al recoger
  const sortieBox = el('section', 'hud-sortie');
  sortieBox.hidden = true;
  const sortieTitle = el('span', 'hud-sortie-title');
  const sortieDetail = el('strong');
  const sortieKeys = el('div', 'hud-sortie-keys');
  const sortieStorm = el('div', 'hud-sortie-storm');
  const sortieHold = el('div', 'hud-bar');
  const sortieHoldFill = el('i');
  sortieHold.append(sortieHoldFill);
  sortieBox.append(sortieTitle, sortieDetail, sortieKeys, sortieHold, sortieStorm);
  let sortieKeysSignature = '';

  // ---- Lo que dice el rover: burbujas a la derecha que se van solas
  const feedBox = el('div', 'hud-feed');
  const feed = el('div', 'hud-feed-list');
  feed.setAttribute('aria-live', 'polite');
  feedBox.append(feed);
  let line = null;
  function addBubble(who) {
    const root = el('div', who === tr('Tú') ? 'hud-bubble is-user' : 'hud-bubble');
    const text = el('p');
    root.append(el('span', 'hud-bubble-who', tr(who)), text);
    feed.append(root);
    while (feed.children.length > FEED_MAX) feed.firstChild.remove();
    return {
      root, text,
      expire() {
        window.setTimeout(() => root.classList.add('is-leaving'), FEED_SECONDS * 1000);
        window.setTimeout(() => root.remove(), FEED_SECONDS * 1000 + 700);
      },
    };
  }

  let promptSignature = '';
  let promptsDocked = false;
  let lastPrompts = [];
  let dockTimer = 0;
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
  box.setAttribute('aria-label', tr('Menú'));
  box.append(el('h2', null, tr('En pausa')));
  const actions = el('div', 'hud-menu-actions');
  const resume = el('button', 'btn-primary hud-resume', tr('Continuar'));
  resume.type = 'button';
  resume.addEventListener('click', () => onResume());
  const exit = el('button', 'hud-exit', tr('Volver al mapa'));
  exit.type = 'button';
  exit.addEventListener('click', () => onExit());
  actions.append(resume, exit);
  box.append(actions);

  const scaleLabel = el('label', null, tr('Velocidad del tiempo'));
  const scaleSelect = el('select', 'hud-time-scale');
  for (const scale of timeScales) {
    const option = el('option', null, scale === 0 ? tr('En pausa') : scale === 1 ? tr('Tiempo real') : tr`${scale}× más rápido`);
    option.value = String(scale);
    scaleSelect.append(option);
  }
  scaleSelect.addEventListener('change', () => onTimeScale(Number(scaleSelect.value)));
  scaleLabel.append(scaleSelect);
  box.append(
    scaleLabel,
    el('div', 'hud-note', tr('La velocidad del tiempo mueve el Sol y el clima de Marte. El oxígeno y el resto de la fisiología van siempre en tiempo real. También se cambia con la tecla T. Con "Jugar con realismo" (Modo avanzado, en el mapa) el tiempo queda en 1×.')),
  );
  // Volúmenes: ambiente, respiración y efectos.
  const volumeBox = el('div', 'hud-volumes');
  for (const [channel, label] of [['ambience', tr('Ambiente')], ['breath', tr('Respiración')], ['effects', 'Efectos y avisos']]) {
    const row = el('label', 'hud-volume', label);
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '5';
    slider.value = String(Math.round((volumes[channel] ?? 0.5) * 100));
    const value = el('span', 'hud-volume-value', `${slider.value} %`);
    slider.addEventListener('input', () => {
      value.textContent = `${slider.value} %`;
      onVolume?.(channel, Number(slider.value) / 100);
    });
    row.append(slider, value);
    volumeBox.append(row);
  }
  box.append(el('h3', 'hud-menu-heading', tr('Sonido')), volumeBox);
  // Idioma: recarga la página y vuelve al mapa.
  const langLabel = el('label', null, tr('Idioma'));
  const langSelect = el('select', 'hud-lang');
  for (const [code, name] of LANGUAGES) {
    const option = el('option', null, name);
    option.value = code;
    langSelect.append(option);
  }
  langSelect.value = getLang();
  langSelect.addEventListener('change', () => {
    setLang(langSelect.value);
    try {
      window.sessionStorage.setItem('marswalk_skip_intro', '1');
    } catch {
      // Ignorar si sessionStorage está restringido.
    }
    window.location.reload();
  });
  langLabel.append(langSelect);
  box.append(langLabel);
  const controls = el('dl', 'hud-controls');
  for (const [keys, text] of [
    ['W A S D', tr('Moverse')], [tr('Ratón'), tr('Mirar')], ['Shift', tr('Correr')], ['Space', tr('Saltar')],
    ['E', tr('Interactuar')], ['R (mantener)', tr('Hablarle al rover')], ['Enter', tr('Escribirle al rover')], ['F', tr('Subir o bajar de la camioneta')],
    ['G', tr('Traer la camioneta a tu lado')],
    ['T', tr('Velocidad del tiempo')], ['Tab', tr('Telemetría completa')], ['M', tr('Sonido sí o no')],
    ['V', tr('Primera o tercera persona')], ['Esc', tr('Este menú')],
  ]) {
    const dt = el('dt');
    dt.append(el('kbd', null, keys));
    controls.append(dt, el('dd', null, text));
  }
  box.append(controls);
  menu.append(box);

  hud.append(dustVeil, vitals, nav, compass, heading, compassTarget, clock, dustReading, vehicleBadge, mission, help, landingBox, sortieBox, feedBox, reticle, prompt, card, menu);
  container.append(hud);

  return {
    element: hud,
    setVisible(visible) {
      hud.hidden = !visible;
    },
    // prompts: [[tecla, texto, importante], ...]; vacío lo oculta. Los importantes (algo
    // con lo que interactuar) salen siempre en el centro.
    setPrompts(prompts) {
      // Solo se rehace si cambió: así no se reinicia la animación en cada refresco.
      lastPrompts = prompts;
      // Tras los primeros segundos, en el centro solo queda lo marcado como importante.
      const centered = promptsDocked ? prompts.filter((item) => item[2]) : prompts;
      prompt.hidden = centered.length === 0;
      // Solo se rehace si cambió: así no se reinicia la animación en cada refresco.
      const signature = `${promptsDocked}|${prompts.map(([key, text]) => `${key}:${text}`).join('|')}`;
      if (signature === promptSignature) return;
      promptSignature = signature;
      prompt.replaceChildren();
      actionList.replaceChildren();
      const fill = (host, items) => {
        for (const [key, text] of items) {
          const line = el('div');
          line.append(el('kbd', null, key), text);
          host.append(line);
        }
      };
      fill(prompt, centered);
      fill(actionList, prompts);
    },
    // docked = true: los avisos dejan el centro y pasan al panel de teclas con una
    // transición; desde entonces el centro solo muestra los importantes.
    dockPrompts(docked) {
      window.clearTimeout(dockTimer);
      if (!docked) {
        promptsDocked = false;
        hud.classList.remove('is-prompts-docked', 'is-prompts-docking');
        this.setPrompts(lastPrompts);
        return;
      }
      hud.classList.add('is-prompts-docked', 'is-prompts-docking');
      dockTimer = window.setTimeout(() => {
        promptsDocked = true;
        hud.classList.remove('is-prompts-docking');
        this.setPrompts(lastPrompts);
      }, DOCK_TRANSITION_MS);
    },
    setTimeScale(scale) {
      scaleSelect.value = String(scale);
      clockScale.textContent = scale === 0 ? 'tiempo en pausa' : scale === 1 ? 'tiempo real' : tr`tiempo ${scale}×`;
      clock.classList.toggle('is-paused', scale === 0);
      const level = speedTiers.indexOf(scale);
      clockTiers.replaceChildren(...speedTiers.map((_, index) => el('i', index <= level ? 'is-on' : null)));
      clockTiers.title = level >= 0 ? tr`Nivel ${level + 1} de ${speedTiers.length}` : '';
      clockKey.title = level === speedTiers.length - 1 ? tr('T vuelve a tiempo real') : tr('T acelera el tiempo');
    },
    // Tab: muestra u oculta la telemetría completa.
    // target: { offset_deg (de -180 a 180 respecto a donde se mira), label } o null.
    setCompassTarget(target) {
      compassTarget.hidden = !target;
      if (!target) return;
      const offset_px = Math.max(-COMPASS_EDGE_PX, Math.min(COMPASS_EDGE_PX, target.offset_deg * COMPASS_PX_PER_DEG));
      const side = Math.abs(target.offset_deg) * COMPASS_PX_PER_DEG <= COMPASS_EDGE_PX ? 0 : Math.sign(target.offset_deg);
      compassTarget.style.transform = `translateX(calc(-50% + ${offset_px.toFixed(0)}px))`;
      compassTarget.textContent = side < 0 ? `◀ ${target.label}` : side > 0 ? `${target.label} ▶` : `▼ ${target.label}`;
      compassTarget.classList.toggle('is-off', side !== 0);
    },
    // Solo se deposita polvo en el borde del visor o del parabrisas.
    setDust(level, reading) {
      dustVeil.style.opacity = String(Math.min(Math.max(level, 0), 1));
      dustReading.hidden = !reading || reading.load <= .13;
      if (!dustReading.hidden) {
        const distance = reading.visibility_m < 1000
          ? `${Math.round(reading.visibility_m)} m` : `${(reading.visibility_m / 1000).toFixed(1)} km`;
        dustReading.textContent = tr`Vis. est. ${distance} · Viento ${Math.round(reading.wind_ms)} m/s`;
      }
    },
    // sortie: { title, detail, keys: [[tecla, texto]] (o null), countdown_s (o null), storm,
    //           hold (0..1) } o null.
    setSortie(sortie) {
      sortieBox.hidden = !sortie;
      hud.classList.toggle('is-sortie', Boolean(sortie));
      if (!sortie) return;
      sortieTitle.textContent = sortie.title;
      sortieDetail.textContent = sortie.detail;
      // Teclas del tutorial, en grande. Solo se rehacen si cambian.
      const keysSignature = (sortie.keys ?? []).map((pair) => pair.join(':')).join('|');
      if (keysSignature !== sortieKeysSignature) {
        sortieKeysSignature = keysSignature;
        sortieKeys.replaceChildren();
        for (const [key, text] of sortie.keys ?? []) {
          const item = el('span', 'hud-sortie-key');
          item.append(el('kbd', null, key), text);
          sortieKeys.append(item);
        }
      }
      sortieKeys.hidden = !sortie.keys?.length;
      sortieHold.hidden = sortie.hold <= 0;
      sortieHoldFill.style.transform = `scaleX(${Math.min(sortie.hold, 1)})`;
      sortieStorm.hidden = sortie.countdown_s === null && !sortie.storm;
      sortieStorm.classList.toggle('is-here', sortie.storm);
      sortieStorm.textContent = sortie.storm
        ? tr('Tormenta de polvo encima')
        : sortie.countdown_s !== null ? tr`Tormenta en ${Math.ceil(sortie.countdown_s)} s` : '';
    },
    // El rover dice algo: una burbuja a la derecha que se apaga sola.
    // who: quién habla ('Rover' o 'Tú'); note: línea pequeña opcional (la fuente del dato).
    say(text, who = 'Rover', note = null) {
      const bubble = addBubble(who);
      bubble.text.textContent = text;
      if (note) bubble.root.append(el('small', 'hud-bubble-note', note));
      bubble.expire();
    },
    // Burbuja que se va rellenando (lo que se oye por el micrófono, o "pensando…").
    // -> { set(text), done(), remove() }; done() la deja como una burbuja normal.
    sayLive(who, text = '…') {
      const bubble = addBubble(who);
      bubble.root.classList.add('is-live');
      bubble.text.textContent = text;
      return {
        set: (next) => { bubble.text.textContent = next; },
        done() {
          bubble.root.classList.remove('is-live');
          bubble.expire();
        },
        remove: () => bubble.root.remove(),
      };
    },
    // Línea para escribirle al rover. Enter envía; Esc cancela. Solo una a la vez.
    openLine({ onSend, onCancel }) {
      if (line) return;
      const field = el('input', 'hud-line');
      field.type = 'text';
      field.maxLength = 300;
      field.placeholder = tr('Escríbele al rover… (Enter envía, Esc cancela)');
      field.autocomplete = 'off';
      const close = (callback, value) => {
        if (!line) return;
        line = null;
        window.removeEventListener('keydown', onEscape, true);
        field.remove();
        callback(value);
      };
      // Esc cierra la línea esté donde esté el foco, y esa pulsación no llega a nadie más.
      function onEscape(event) {
        if (event.code !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        close(onCancel);
      }
      field.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.code === 'Enter' || event.code === 'NumpadEnter') {
          const text = field.value.trim();
          if (text) close(onSend, text);
          else close(onCancel);
        } else if (event.code === 'Escape') close(onCancel);
      });
      field.addEventListener('keyup', (event) => event.stopPropagation());
      window.addEventListener('keydown', onEscape, true);
      line = { cancel: () => close(onCancel) };
      feedBox.append(field);
      field.focus();
    },
    closeLine() {
      line?.cancel();
    },
    isLineOpen: () => Boolean(line),
    clearFeed() {
      feed.replaceChildren();
    },
    // fall: { altitude_m, speed_ms, remaining_s, progress, scale, scales } o null al tocar suelo.
    setLanding(fall) {
      landingBox.hidden = !fall;
      hud.classList.toggle('is-landing', Boolean(fall));
      if (!fall) return;
      landingAltitude.textContent = `${fall.altitude_m.toFixed(0)} m`;
      const real_s = fall.remaining_s / fall.scale;
      const eta = real_s >= 60 ? `${Math.floor(real_s / 60)} min ${String(Math.round(real_s % 60)).padStart(2, '0')} s` : `${real_s.toFixed(0)} s`;
      landingInfo.textContent = tr`sobre el suelo · bajando a ${fall.speed_ms.toFixed(1)} m/s · tocas suelo en ${eta}`;
      landingFill.style.transform = `scaleX(${fall.progress})`;
      // Tecla y niveles: se ve cuál está puesto y si aún queda uno más rápido.
      const signature = `${fall.scale}|${(fall.scales ?? []).join(',')}`;
      if (signature !== landingSignature) {
        landingSignature = signature;
        const last = fall.scales?.[fall.scales.length - 1];
        landingSpeed.replaceChildren(
          tr('Pulsa '), el('kbd', null, 'T'),
          fall.scale === last ? 'para volver a la velocidad normal' : tr('para acelerar la caída'),
        );
        landingTiers.replaceChildren(...(fall.scales ?? []).map((scale) => {
          const tier = el('span', scale === fall.scale ? 'is-on' : scale < fall.scale ? 'is-done' : null, `${scale}×`);
          return tier;
        }));
      }
    },
    // Con realismo el tiempo queda fijo en 1× y no hay vehículos.
    setRealism(on) {
      hud.classList.toggle('is-realism', on);
      scaleSelect.disabled = on;
      clockKey.hidden = on;
      if (on) clockScale.textContent = tr('realismo · tiempo real');
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
        if (image.credit) card.append(el('div', 'hud-card-credit', tr`Crédito: ${image.credit}`));
      }
      for (const line of lines) card.append(el('p', null, line));
      const closeHint = el('div', 'hud-card-close');
      closeHint.append(el('kbd', null, 'E'), tr('cerrar'));
      card.append(closeHint);
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
      fields.heart.value.textContent = tr`${v.heart_rate_bpm.toFixed(0)} lpm`;
      setLevel(fields.heart.line, flags.hr_above_85pct ? 'warn' : null);
      fields.temp.value.textContent = `${v.core_temp_c.toFixed(1)} °C`;
      setLevel(fields.temp.line, flags.thermal_critical ? 'danger' : flags.thermal_warning ? 'warn' : null);
      fields.hydration.value.textContent = `${v.dehydration_pct.toFixed(2)} %`;
      setLevel(fields.hydration.line, flags.dehydration_critical ? 'danger' : flags.dehydration_warning ? 'warn' : null);
      fields.radiation.value.textContent = tr`${v.dose_usv.toFixed(2)} µSv`;
      setLevel(fields.radiation.line, flags.career_dose_exceeded ? 'danger' : null);
      fields.metabolic.value.textContent = v.metabolic_w > 0 ? `${v.metabolic_w.toFixed(0)} W` : '—';
      setLevel(fields.metabolic.line, flags.over_sustainable ? 'warn' : null);
      vitalsNote.textContent = data.running
        ? tr('Al correr, el gasto es una extrapolación: el modelo M5 está medido caminando.')
        : data.vehicle?.driving
          ? tr('En la camioneta el gasto es el de estar quieto.')
          : tr('Radiación: solo rayos cósmicos de fondo; las tormentas solares no están modeladas.');

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
        objectiveName.textContent = tr('Todos visitados');
        objectiveDistance.textContent = '';
      }
      if (Number.isFinite(data.ltst_h)) {
        const hours = Math.floor(data.ltst_h);
        const minutes = Math.floor((data.ltst_h - hours) * 60);
        clockHour.textContent = tr`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} hora local`;
      }
      fields.ambient.value.textContent = data.environment
        ? `${data.environment.ambient_temp_c.toFixed(0)} °C · ${PHASES[data.environment.phase]}`
        : tr('sin dato');

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
      fps.textContent = tr`${data.fps.toFixed(0)} cuadros/s`;
    },
  };
}
