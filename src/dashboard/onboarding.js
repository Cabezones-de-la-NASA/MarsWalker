// Primeros pasos: tres indicaciones la primera vez que se abre el dashboard.
// Cada paso se completa solo al hacer lo que pide; también se puede saltar.
import './onboarding.css';
import { on } from '../shared/state.js';

const STORAGE_KEY = 'marswalk.onboarded';

const STEPS = [
  {
    title: 'Mueve el mapa',
    text: 'Arrastra para rotar, usa la rueda para acercarte y el botón derecho para desplazarte.',
    target: null,
  },
  {
    title: 'Traza una ruta',
    text: 'Haz clic en el mapa para fijar el inicio y otra vez para el destino. La ruta se calcula sola.',
    target: '.route-panel',
  },
  {
    title: 'Baja a la superficie',
    text: 'Arrastra el indicador naranja para elegir dónde aterrizar y pulsa el botón grande. Allí te esperan el rover y la camioneta.',
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
  const count = el('div', 'onboarding-count');
  const title = el('h2', 'onboarding-title');
  const text = el('p', 'onboarding-text');
  const dots = el('div', 'onboarding-dots');
  const actions = el('div', 'onboarding-actions');
  const skip = el('button', 'onboarding-skip', 'Saltar');
  skip.type = 'button';
  const next = el('button', 'onboarding-next btn-primary', 'Siguiente');
  next.type = 'button';
  actions.append(skip, next);
  card.append(count, title, text, dots, actions);
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
    count.textContent = `Paso ${index + 1} de ${STEPS.length}`;
    title.textContent = current.title;
    text.textContent = current.text;
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
  orbitControls.addEventListener('end', () => advance(0));
  on('route:computed', () => advance(1));
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
