// Vista "Créditos": todas las fuentes de la sección 2 del documento del proyecto.
import logoUrl from '../../assets/space_apps_logo.png';
import { CREDIT_GROUPS, NASA_DISCLAIMER } from './credits_data.js';
import { tr } from '../../shared/i18n.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createCreditsView() {
  const view = el('section');
  const inner = el('div', 'view-inner');
  view.append(inner);

  const logo = el('img', 'credits-logo');
  logo.src = logoUrl;
  logo.alt = tr('NASA Space Apps Challenge');
  inner.append(el('h1', null, tr('Créditos')), logo, el('p', null, NASA_DISCLAIMER));

  for (const group of CREDIT_GROUPS) {
    inner.append(el('h2', null, group.title));
    const scroll = el('div', 'table-scroll');
    const table = el('table');
    for (const item of group.items) {
      const row = el('tr');
      const name = el('td');
      if (item.url) {
        const link = el('a', null, item.name);
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        name.append(link);
      } else {
        name.textContent = item.name;
      }
      row.append(el('td', 'credit-id', item.id), name, el('td', null, item.use));
      table.append(row);
    }
    scroll.append(table);
    inner.append(scroll);
  }
  return { element: view };
}
