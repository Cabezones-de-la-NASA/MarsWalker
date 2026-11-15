// Panel plegable del dashboard: <details class="panel"> con título y cuerpo.

// -> { root, body }; el contenido se añade a body.
export function createPanelShell(title, className, { open = true } = {}) {
  const root = document.createElement('details');
  root.className = `panel ${className}`;
  root.open = open;
  const summary = document.createElement('summary');
  const heading = document.createElement('h2');
  heading.textContent = title;
  summary.append(heading);
  const body = document.createElement('div');
  body.className = 'panel-body';
  root.append(summary, body);
  return { root, body };
}
