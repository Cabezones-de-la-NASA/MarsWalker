// Barra de lanzamiento: lo primero que se ve en el mapa. Un dato de Marte en grande, el
// botón para bajar a la superficie y el estado del punto de aterrizaje (M1 y M2).
import './launch_bar.css';
import { MARS_FACTS } from '../shared/mars_facts.js';
import { sampleSlope_deg, riskIndex, riskBand, MAX_SAFE_SLOPE_DEG } from '../models/terrain/slope.js';

// [diseño] Cada cuántos segundos cambia el dato de Marte.
const FACT_SECONDS = 11;
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
 * createLaunchBar(ui, { dem, onExplore }) -> { element, setLanding(x_m, z_m, dragging) }
 */
export function createLaunchBar(ui, { dem, onExplore }) {
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
  let timer = window.setInterval(showFact, FACT_SECONDS * 1000);
  fact.addEventListener('click', () => {
    window.clearInterval(timer);
    timer = window.setInterval(showFact, FACT_SECONDS * 1000);
    showFact();
  });
  showFact();

  const explore = el('button', 'explore-button btn-primary launch-button');
  explore.type = 'button';
  explore.append(el('span', 'launch-button-icon', '▶'), el('span', null, 'Explorar Marte'));
  explore.addEventListener('click', onExplore);

  const landing = el('div', 'launch-landing');
  landing.setAttribute('role', 'status');

  bar.append(fact, explore, landing);
  ui.append(bar);

  return {
    element: bar,
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
