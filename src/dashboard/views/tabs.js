// Barra superior del dashboard: marca, pestañas (Mapa, Tripulación, Fórmulas, Créditos),
// perfil gráfico y el botón para bajar a la superficie.
import './views.css';
import logoUrl from '../../assets/space_apps_logo.png';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * views: [{ id, label, element?, onShow? }]; la primera es el mapa (sin elemento).
 * options: { subtitle, qualityOptions: [[id, label]], quality, onQuality(id), onExplore() }
 */
export function createTabs(container, views, options = {}) {
  const bar = el('header', 'top-bar');
  const brand = el('div', 'brand', 'MarsWalk');
  if (options.subtitle) brand.append(el('span', 'brand-sub', options.subtitle));
  const nav = el('nav', 'tab-bar');
  nav.setAttribute('aria-label', 'Vistas');
  bar.append(brand, nav);

  const buttons = new Map();
  let active = views[0].id;

  function show(id) {
    active = id;
    for (const view of views) {
      const selected = view.id === id;
      buttons.get(view.id).classList.toggle('is-active', selected);
      buttons.get(view.id).setAttribute('aria-pressed', String(selected));
      if (view.element) view.element.hidden = !selected;
      if (selected && view.onShow) view.onShow();
    }
    container.classList.toggle('has-open-view', id !== views[0].id);
  }

  for (const view of views) {
    const button = el('button', 'tab-button', view.label);
    button.type = 'button';
    button.dataset.view = view.id;
    button.addEventListener('click', () => show(view.id));
    buttons.set(view.id, button);
    nav.append(button);
    if (view.element) {
      view.element.classList.add('view');
      view.element.hidden = true;
      container.append(view.element);
    }
  }

  bar.append(el('div', 'top-bar-spacer'));

  if (options.qualityOptions) {
    const label = el('label', null, 'Gráficos');
    const select = el('select', 'quality-select');
    for (const [id, text] of options.qualityOptions) {
      const option = el('option', null, text);
      option.value = id;
      select.append(option);
    }
    select.value = options.quality;
    select.addEventListener('change', () => options.onQuality(select.value));
    label.append(select);
    bar.append(label);
  }

  if (options.onExplore) {
    const explore = el('button', 'explore-button btn-primary', 'Explorar a pie');
    explore.type = 'button';
    explore.addEventListener('click', options.onExplore);
    bar.append(explore);
  }

  const logo = el('img', 'tab-logo');
  logo.src = logoUrl;
  logo.alt = 'NASA Space Apps Challenge';
  bar.append(logo);

  container.append(bar);
  show(active);
  return { show, getActive: () => active };
}
