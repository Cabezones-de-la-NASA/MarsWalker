// Barra de pestañas del dashboard: Mapa, Tripulación, Fórmulas y Créditos.
// "Mapa" deja ver la escena; las demás abren una vista a pantalla completa sobre ella.
import './views.css';
import logoUrl from '../../assets/space_apps_logo.png';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// views: [{ id, label, element?, onShow? }]; la primera es el mapa (sin elemento).
export function createTabs(container, views) {
  const bar = el('nav', 'tab-bar');
  bar.setAttribute('aria-label', 'Vistas');
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
    bar.append(button);
    if (view.element) {
      view.element.classList.add('view');
      view.element.hidden = true;
      container.append(view.element);
    }
  }

  const logo = el('img', 'tab-logo');
  logo.src = logoUrl;
  logo.alt = 'NASA Space Apps Challenge';
  bar.append(logo);

  container.append(bar);
  show(active);
  return { show, getActive: () => active };
}
