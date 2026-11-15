// Vista "Fórmulas": M5 a M13 con los valores actuales sustituidos, su fuente y la etiqueta
// de cada constante.
import { state } from '../../shared/state.js';
import { defaultConfig } from '../../models/physiology/defaults.js';
import { buildFormulaCards } from './formulas_data.js';
import { tr } from '../../shared/i18n.js';

const TAG_LABELS = { publicado: tr('[publicado]'), 'diseño': tr('[diseño]'), 'sin etiqueta': tr('[sin etiqueta]') };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createFormulasView() {
  const cfg = defaultConfig();
  const view = el('section');
  const inner = el('div', 'view-inner');
  view.append(inner);
  inner.append(
    el('h1', null, tr('Fórmulas')),
    el('p', null, tr('Modelos M5 a M13 con los valores de la persona elegida, caminando a su ritmo sostenible. [publicado] es una cifra de una fuente citada; [diseño] es un supuesto del proyecto, no un dato científico; [sin etiqueta] es un valor que el documento del proyecto da sin decir de dónde sale.')),
  );

  const controls = el('div', 'formula-controls');
  const memberLabel = el('label', null, tr('Persona '));
  const memberSelect = el('select');
  memberSelect.className = 'formula-member';
  memberLabel.append(memberSelect);
  const slopeLabel = el('label', null, tr('Pendiente (°) '));
  const slopeInput = el('input');
  slopeInput.type = 'number';
  slopeInput.className = 'formula-slope';
  slopeInput.min = '-20';
  slopeInput.max = '25';
  slopeInput.step = '1';
  slopeInput.value = '0';
  slopeLabel.append(slopeInput);
  controls.append(memberLabel, slopeLabel);
  const list = el('div', 'formula-list');
  inner.append(controls, list);

  function render() {
    const selected = Math.min(Number(memberSelect.value) || 0, state.crew.length - 1);
    memberSelect.replaceChildren();
    state.crew.forEach((member, i) => {
      const option = el('option', null, member.name || tr`Tripulante ${i + 1}`);
      option.value = String(i);
      memberSelect.append(option);
    });
    memberSelect.value = String(selected);

    const slope_deg = Math.min(Math.max(Number(slopeInput.value) || 0, -20), 25);
    const ambient_temp_c = state.environment?.weather?.ambient_temp_c ?? -56;
    list.replaceChildren();
    for (const card of buildFormulaCards(state.crew, selected, cfg, { slope_deg, ambient_temp_c })) {
      const box = el('article', 'formula-card');
      box.dataset.model = card.id;
      box.append(
        el('h2', null, `${card.id} · ${card.title}`),
        el('div', 'formula-math', card.formula),
        el('div', 'formula-source', tr`Con: ${card.substitution}`),
        el('div', 'formula-result', card.result),
        el('div', 'formula-source', tr`Fuente: ${card.source}`),
      );
      const constants = el('ul', 'constant-list');
      for (const constant of card.constants) {
        const item = el('li');
        item.append(
          el('span', `tag tag-${constant.tag.replace(' ', '-')}`, TAG_LABELS[constant.tag]),
          `${constant.name}: ${constant.value}${constant.source ? ` (${constant.source})` : ''}`,
        );
        constants.append(item);
      }
      box.append(constants);
      list.append(box);
    }
  }

  memberSelect.addEventListener('change', render);
  slopeInput.addEventListener('input', render);
  return { element: view, render };
}
