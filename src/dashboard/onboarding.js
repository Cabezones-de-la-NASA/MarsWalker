// Primeros pasos: una guía corta la primera vez que se abre el dashboard. Explica el mapa,
// el aterrizaje, la ruta y los tres algoritmos.
// Cada paso se completa solo al hacer lo que pide; también se puede saltar.
import './onboarding.css';
import { on } from '../shared/state.js';
import { tr } from '../shared/i18n.js';

// v2: el tutorial cambió (indicador de aterrizaje, primer contacto); se enseña de nuevo.
const STORAGE_KEY = 'marswalk.onboarded.v4';

// Cada paso: título, texto, lista opcional (items), elemento que se resalta (target) y el
// evento que lo da por hecho (done); sin evento se avanza con el botón.
// [diseño] Giro mínimo del mapa (unos 45°) y tiempo mínimo en pantalla para dar por
// hecho el primer paso.
const ROTATE_DONE_RAD = 0.8;
const MIN_READ_MS = 2500;

const STEPS = [
  {
    title: 'Bienvenido a Marte',
    text: tr('Este es el cráter Jezero. Arrastra para girar el mapa y usa la rueda para acercarte.'),
    done: 'orbit',
  },
  {
    title: tr('Llegar pronto, y llegar vivo'),
    text: tr('Aquí el oxígeno se acaba y las cuestas agotan. Haz clic en dos puntos del mapa y te trazamos el camino. Puedes pedirlo de tres maneras:'),
    items: [
      [tr('Ahorra oxígeno'), tr('el camino que menos aire gasta.')],
      [tr('Cuida al astronauta'), tr('evita lo que más cansa o pone en riesgo.')],
      [tr('Corredor'), tr('prueba muchos caminos parecidos y se queda con el mejor (idea tomada de un algoritmo cuántico).')],
    ],
    target: '.route-cards',
    done: 'route:computed',
  },
  {
    title: 'Ahora, a caminarlo',
    text: tr('Arrastra el indicador naranja a donde quieras aterrizar y pulsa el botón grande. Un rover te acompañará.'),
    target: '.explore-button',
  },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function alreadySeen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Sin almacenamiento: los pasos volverán a salir en la próxima visita.
  }
}

/**
 * createOnboarding(ui, { orbitControls }) -> { start(force), isOpen() }
 * start() no hace nada si ya se vio; start(true) lo repite (botón de ayuda).
 */
export function createOnboarding(ui, { orbitControls }) {
  const card = el('aside', 'panel onboarding');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', tr('Primeros pasos'));
  const number = el('div', 'onboarding-number');
  const count = el('div', 'onboarding-count');
  const title = el('h2', 'onboarding-title');
  const text = el('p', 'onboarding-text');
  const list = el('ul', 'onboarding-list');
  const dots = el('div', 'onboarding-dots');
  const actions = el('div', 'onboarding-actions');
  const skip = el('button', 'onboarding-skip', tr('Saltar'));
  skip.type = 'button';
  const next = el('button', 'onboarding-next btn-primary', tr('Siguiente'));
  next.type = 'button';
  actions.append(skip, next);
  const body = el('div', 'onboarding-body');
  body.append(count, title, text, list, dots, actions);
  card.append(number, body);
  ui.append(card);

  let step = -1;
  let shownAt_ms = 0;
  let highlighted = null;

  function highlight(selector) {
    highlighted?.classList.remove('onboarding-target');
    highlighted = selector ? ui.querySelector(selector) : null;
    highlighted?.classList.add('onboarding-target');
  }

  function show(index) {
    step = index;
    shownAt_ms = performance.now();
    turned_rad = 0;
    const current = STEPS[index];
    count.textContent = tr`Primeros pasos · ${index + 1} de ${STEPS.length}`;
    number.textContent = String(index + 1);
    title.textContent = current.title;
    text.textContent = current.text;
    list.replaceChildren();
    for (const [name, detail] of current.items ?? []) {
      const item = el('li');
      item.append(el('strong', null, name), `: ${detail}`);
      list.append(item);
    }
    list.hidden = !current.items;
    // Si el paso señala un panel plegado, se abre para que se vea.
    const host = current.target ? ui.querySelector(current.target)?.closest('details') : null;
    if (host) host.open = true;
    dots.replaceChildren(...STEPS.map((_, i) => el('i', i === index ? 'is-on' : i < index ? 'is-done' : null)));
    next.textContent = index === STEPS.length - 1 ? tr('Entendido') : tr('Siguiente');
    highlight(current.target);
    card.hidden = false;
    // Reinicia la animación de entrada en cada paso.
    card.classList.remove('is-in');
    void card.offsetWidth;
    card.classList.add('is-in');
  }

  function finish() {
    step = -1;
    card.hidden = true;
    highlight(null);
    markSeen();
  }

  function advance(from) {
    if (step !== from) return;
    if (from >= STEPS.length - 1) finish();
    else show(from + 1);
  }

  next.addEventListener('click', () => advance(step));
  skip.addEventListener('click', finish);
  // Cada paso se da por hecho cuando la persona hace lo que pide.
  const doneStep = (event) => advance(STEPS.findIndex((item) => item.done === event));
  // El primer paso no se da por hecho con cualquier toque: hay que girar el mapa de verdad
  // (ROTATE_DONE_RAD en total) y haber tenido tiempo de leerlo.
  let lastAzimuth = orbitControls.getAzimuthalAngle();
  let turned_rad = 0;
  orbitControls.addEventListener('change', () => {
    const azimuth = orbitControls.getAzimuthalAngle();
    let delta = azimuth - lastAzimuth;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    lastAzimuth = azimuth;
    if (STEPS[step]?.done !== 'orbit') return;
    turned_rad += Math.abs(delta);
  });
  orbitControls.addEventListener('end', () => {
    if (turned_rad >= ROTATE_DONE_RAD && performance.now() - shownAt_ms >= MIN_READ_MS) doneStep('orbit');
  });
  on('astronaut:moved', () => doneStep('astronaut:moved'));
  on('route:computed', () => doneStep('route:computed'));
  on('mode:request', (mode) => {
    if (mode === 'gameplay' && step >= 0) finish();
  });

  return {
    isOpen: () => step >= 0,
    start(force = false) {
      if (step >= 0 || (!force && alreadySeen())) return;
      // Durante la guía el Plan de EVA empieza plegado; el paso que lo explica lo abre.
      const plan = ui.querySelector('.route-panel');
      if (plan) plan.open = false;
      show(0);
    },
  };
}
