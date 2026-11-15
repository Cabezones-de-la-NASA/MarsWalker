// Barra de lanzamiento: lo primero que se ve en el mapa. Un dato de Marte en grande, el
// botón para bajar a la superficie y el estado del punto de aterrizaje (M1 y M2).
import './launch_bar.css';
import { MARS_FACTS } from '../shared/mars_facts.js';
import { sampleSlope_deg, riskIndex, riskBand, MAX_SAFE_SLOPE_DEG } from '../models/terrain/slope.js';

// [diseño] Cada cuántos segundos cambia el dato de Marte.
const FACT_SECONDS = 11;
const FACT_KEY = 'marswalk.facts_open';
const RISK_TEXT = {
  low: ['terreno seguro', 'is-ok'],
  medium: ['terreno con pendiente', 'is-warn'],
  high: ['terreno peligroso: mejor mueve el indicador', 'is-danger'],
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * createLaunchBar(ui, { dem, onExplore, onLanding }) -> { element, setLanding(x_m, z_m, dragging), setClick(text) }
 */
export function createLaunchBar(ui, { dem, onExplore, onLanding }) {
  const bar = el('section', 'launch-bar');

  const fact = el('button', 'launch-fact');
  fact.type = 'button';
  fact.title = 'Ver otro dato';
  const factText = el('span', 'launch-fact-text');
  const factSource = el('span', 'launch-fact-source');
  fact.append(el('span', 'launch-fact-kicker', '¿Sabías que…?'), factText, factSource);
  let factIndex = Math.floor(Math.random() * MARS_FACTS.length);
  function showFact() {
    const current = MARS_FACTS[factIndex % MARS_FACTS.length];
    factIndex += 1;
    factText.textContent = current.text;
    factSource.textContent = `Fuente: ${current.source}`;
    fact.classList.remove('is-in');
    void fact.offsetWidth;
    fact.classList.add('is-in');
  }
  // Se puede plegar: queda un botón "?" que lo vuelve a abrir. Se recuerda entre visitas.
  const factWrap = el('div', 'launch-fact-wrap');
  const closeFact = el('button', 'launch-fact-close', '×');
  closeFact.type = 'button';
  closeFact.title = 'Ocultar los datos de Marte';
  closeFact.setAttribute('aria-label', 'Ocultar los datos de Marte');
  const openFact = el('button', 'launch-fact-open', '?');
  openFact.type = 'button';
  openFact.title = '¿Sabías que…? Ver datos de Marte';
  openFact.setAttribute('aria-label', 'Ver datos de Marte');
  factWrap.append(fact, closeFact, openFact);
  function setFactOpen(open, remember = true) {
    fact.hidden = !open;
    closeFact.hidden = !open;
    openFact.hidden = open;
    if (!remember) return;
    try {
      window.localStorage.setItem(FACT_KEY, open ? '1' : '0');
    } catch {
      // Sin almacenamiento: no se recuerda.
    }
  }
  closeFact.addEventListener('click', () => setFactOpen(false));
  openFact.addEventListener('click', () => {
    setFactOpen(true);
    showFact();
  });
  let startOpen = true;
  try {
    startOpen = window.localStorage.getItem(FACT_KEY) !== '0';
  } catch {
    // Sin almacenamiento: empieza abierto.
  }
  setFactOpen(startOpen, false);
  let timer = window.setInterval(showFact, FACT_SECONDS * 1000);
  fact.addEventListener('click', () => {
    window.clearInterval(timer);
    timer = window.setInterval(showFact, FACT_SECONDS * 1000);
    showFact();
  });
  showFact();

  const explore = el('button', 'explore-button btn-primary launch-button');
  explore.type = 'button';
  const exploreLabel = el('span', null, 'Explorar Marte');
  explore.append(el('span', 'launch-button-icon', '▶'), exploreLabel);
  explore.addEventListener('click', onExplore);
  // Repite la bajada en paracaídas (la primera vez sale sola).
  const landingButton = el('button', 'launch-landing-button', '🪂 Aterrizaje realista');
  landingButton.type = 'button';
  landingButton.title = 'Bajar en paracaídas hasta el indicador';
  landingButton.addEventListener('click', onLanding);
  const buttons = el('div', 'launch-buttons');
  buttons.append(explore, landingButton);

  const status = el('div', 'launch-status');
  status.setAttribute('role', 'status');
  const landing = el('div', 'launch-landing');
  const click = el('div', 'launch-click');
  status.append(landing, click);

  bar.append(factWrap, buttons, status);
  ui.append(bar);

  return {
    element: bar,
    // Avisa en el botón de que se bajará en modo realista.
    setRealism(on) {
      exploreLabel.textContent = on ? 'Explorar Marte · realismo' : 'Explorar Marte';
    },
    // Lectura del último clic en el terreno (coordenadas, elevación y pendiente).
    setClick(text) {
      click.textContent = text;
    },
    setLanding(x_m, z_m, dragging = false) {
      const slope_deg = sampleSlope_deg(dem, x_m, z_m);
      const [text, level] = RISK_TEXT[riskBand(riskIndex(slope_deg, MAX_SAFE_SLOPE_DEG))];
      landing.className = `launch-landing ${level}`;
      landing.textContent = dragging
        ? `Suelta para aterrizar aquí · pendiente ${slope_deg.toFixed(1)}° · ${text}`
        : `Aterrizas en el indicador naranja (arrástralo) · pendiente ${slope_deg.toFixed(1)}° · ${text}`;
    },
  };
}
