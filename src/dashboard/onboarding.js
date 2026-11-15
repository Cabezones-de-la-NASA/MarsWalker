// Primeros pasos: una guía corta la primera vez que se abre el dashboard. Explica el mapa,
// el aterrizaje, la ruta y los tres algoritmos.
// Cada paso se completa solo al hacer lo que pide; también se puede saltar.
import './onboarding.css';
import { on } from '../shared/state.js';

// v2: el tutorial cambió (indicador de aterrizaje, primer contacto); se enseña de nuevo.
const STORAGE_KEY = 'marswalk.onboarded.v3';

// Cada paso: título, texto, lista opcional (items), elemento que se resalta (target) y el
// evento que lo da por hecho (done); sin evento se avanza con el botón.
const STEPS = [
  {
    title: 'Esto es el cráter Jezero, en Marte',
    text: 'Es un mapa 3D hecho con datos reales de elevación. Arrastra para girarlo, usa la rueda para acercarte y el botón derecho para desplazarte.',
    done: 'orbit',
  },
  {
    title: 'Elige dónde aterrizar',
    text: 'El indicador naranja marca dónde bajarás. Arrástralo sobre el terreno: abajo verás la pendiente y si el sitio es seguro.',
    target: '.launch-status',
    done: 'astronaut:moved',
  },
  {
    title: 'Planifica una caminata',
    text: 'Haz clic en dos puntos del mapa: el primero es el inicio y el segundo, el destino. La ruta se calcula sola y se dibuja con flechas.',
    target: '.route-panel',
    done: 'route:computed',
  },
  {
    title: 'Tres formas de trazar la ruta',
    text: 'En "Plan de EVA" eliges cómo se calcula. Prueba las tres y compara:',
    items: [
      ['Ahorra oxígeno', 'el algoritmo A* busca el camino que menos oxígeno gasta, teniendo en cuenta cada cuesta.'],
      ['Cuida al astronauta', 'tú marcas qué importa más (pulso, calor, pendiente, radiación…) y la ruta lo evita.'],
      ['Corredor inspirado en QAOA', 'una versión clásica de un algoritmo cuántico: explora un corredor de rutas en varias rondas.'],
    ],
    target: '.route-cards',
  },
  {
    title: 'Baja a Marte',
    text: 'Pulsa el botón grande. Aterrizarás en una cápsula y el rover te guiará en tu primera misión. Lo técnico (capas, clima, fórmulas) está en "Modo avanzado", arriba a la izquierda.',
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
  card.setAttribute('aria-label', 'Primeros pasos');
  const number = el('div', 'onboarding-number');
  const count = el('div', 'onboarding-count');
  const title = el('h2', 'onboarding-title');
  const text = el('p', 'onboarding-text');
  const list = el('ul', 'onboarding-list');
  const dots = el('div', 'onboarding-dots');
  const actions = el('div', 'onboarding-actions');
  const skip = el('button', 'onboarding-skip', 'Saltar');
  skip.type = 'button';
  const next = el('button', 'onboarding-next btn-primary', 'Siguiente');
  next.type = 'button';
  actions.append(skip, next);
  const body = el('div', 'onboarding-body');
  body.append(count, title, text, list, dots, actions);
  card.append(number, body);
  ui.append(card);

  let step = -1;
  let highlighted = null;

  function highlight(selector) {
    highlighted?.classList.remove('onboarding-target');
    highlighted = selector ? ui.querySelector(selector) : null;
    highlighted?.classList.add('onboarding-target');
  }

  function show(index) {
    step = index;
    const current = STEPS[index];
    count.textContent = `Primeros pasos · ${index + 1} de ${STEPS.length}`;
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
    next.textContent = index === STEPS.length - 1 ? 'Entendido' : 'Siguiente';
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
  orbitControls.addEventListener('end', () => doneStep('orbit'));
  on('astronaut:moved', () => doneStep('astronaut:moved'));
  on('route:computed', () => doneStep('route:computed'));
  on('mode:request', (mode) => {
    if (mode === 'gameplay' && step >= 0) finish();
  });

  return {
    isOpen: () => step >= 0,
    start(force = false) {
      if (step >= 0 || (!force && alreadySeen())) return;
      show(0);
    },
  };
}
