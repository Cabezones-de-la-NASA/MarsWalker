// Panel Misión: colocar la base, añadir objetivos propios con un clic en el mapa,
// y exportar o importar la misión.
import './panels.css';
import { createPanelShell } from './panel_shell.js';
import { state, on } from '../../shared/state.js';
import { MAX_OBJECTIVES } from '../../shared/missions.js';

const TYPE_LABELS = { sampling: 'Muestreo', hazard: 'Peligro' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// deps: { mission }  (createMissionStore de src/shared/missions.js)
export function createMissionPanel(container, { mission }) {
  const shell = createPanelShell('Misión', 'mission-panel', { open: false });
  const panel = shell.body;

  // --- Base
  const baseRow = el('div', 'route-row');
  const baseButton = el('button', 'mission-base btn-primary', 'Colocar base');
  baseButton.type = 'button';
  const baseRemove = el('button', 'mission-base-remove', 'Quitar');
  baseRemove.type = 'button';
  baseRow.append(baseButton, baseRemove);
  const baseInfo = el('div', 'route-hint');
  panel.append(baseRow, baseInfo);

  // --- Objetivos
  panel.append(el('div', 'route-section', 'Objetivos propios'));
  const form = el('div', 'route-row');
  const nameInput = el('input', 'mission-name');
  nameInput.type = 'text';
  nameInput.maxLength = 40;
  nameInput.placeholder = 'Nombre (opcional)';
  nameInput.setAttribute('aria-label', 'Nombre del objetivo');
  const typeSelect = el('select', 'mission-type');
  typeSelect.setAttribute('aria-label', 'Tipo de objetivo');
  for (const [value, label] of Object.entries(TYPE_LABELS)) {
    const option = el('option', null, label);
    option.value = value;
    typeSelect.append(option);
  }
  form.append(nameInput, typeSelect);
  const addButton = el('button', 'mission-add', 'Añadir con un clic en el mapa');
  addButton.type = 'button';
  const status = el('div', 'route-status');
  status.setAttribute('role', 'status');
  const list = el('ul', 'mission-list');
  panel.append(form, addButton, status, list);

  // --- Archivo
  const fileRow = el('div', 'route-row');
  const exportButton = el('button', 'mission-export', 'Exportar');
  exportButton.type = 'button';
  const importButton = el('button', 'mission-import', 'Importar');
  importButton.type = 'button';
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileRow.append(exportButton, importButton, fileInput);
  panel.append(
    fileRow,
    el('div', 'route-hint', 'La misión se guarda en este navegador, por zona. Los puntos propios no son datos de misión reales.'),
  );
  container.append(shell.root);

  function setMode(mode) {
    state.clickMode = mode;
    baseButton.classList.toggle('is-active', mode === 'place_base');
    addButton.classList.toggle('is-active', mode === 'place_objective');
    if (mode === 'place_base') status.textContent = 'Haz clic en el mapa donde quieras la base.';
    else if (mode === 'place_objective') status.textContent = 'Haz clic en el mapa donde quieras el objetivo.';
  }

  function render() {
    const base = mission.getBase();
    baseButton.textContent = base ? 'Mover base' : 'Colocar base';
    baseRemove.disabled = !base;
    baseInfo.textContent = base
      ? `Base en x ${base.position_m[0].toFixed(0)}, z ${base.position_m[1].toFixed(0)} m. Cuenta como refugio.`
      : 'Sin base. Se verá a pie como una estación y servirá de refugio.';
    const objectives = mission.getObjectives();
    addButton.disabled = objectives.length >= MAX_OBJECTIVES;
    list.replaceChildren();
    for (const item of objectives) {
      const row = el('li', 'mission-item');
      row.dataset.id = item.id;
      const remove = el('button', 'mission-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Quitar ${item.name}`);
      remove.addEventListener('click', () => mission.removeObjective(item.id));
      row.append(
        el('span', `mission-kind mission-kind-${item.type}`, TYPE_LABELS[item.type]),
        el('span', 'mission-item-name', item.name),
        remove,
      );
      list.append(row);
    }
    if (objectives.length === 0) list.append(el('li', 'route-hint', 'Aún no hay objetivos.'));
    exportButton.disabled = !base && objectives.length === 0;
  }

  baseButton.addEventListener('click', () => setMode(state.clickMode === 'place_base' ? 'route' : 'place_base'));
  addButton.addEventListener('click', () => setMode(state.clickMode === 'place_objective' ? 'route' : 'place_objective'));
  baseRemove.addEventListener('click', () => {
    mission.setBase(null);
    status.textContent = 'Base quitada.';
  });

  on('terrain:click', ({ x_m, z_m }) => {
    if (state.clickMode === 'place_base') {
      mission.setBase([x_m, z_m]);
      setMode('route');
      status.textContent = 'Base colocada.';
    } else if (state.clickMode === 'place_objective') {
      const added = mission.addObjective({ name: nameInput.value, type: typeSelect.value, position_m: [x_m, z_m] });
      setMode('route');
      status.textContent = added ? `Objetivo "${added.name}" añadido.` : 'No se pudo añadir el objetivo.';
      nameInput.value = '';
    }
  });

  exportButton.addEventListener('click', () => {
    const blob = new Blob([`${JSON.stringify(mission.toJSON(), null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mision_${mission.dataset_id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      // Tope de tamaño: una misión son, como mucho, unas decenas de puntos.
      if (file.size > 200_000) throw new Error('archivo demasiado grande');
      const count = mission.importJSON(JSON.parse(await file.text()));
      status.textContent = count > 0
        ? `Misión importada: ${count} punto(s).`
        : 'El archivo no tenía puntos válidos para esta zona.';
    } catch {
      status.textContent = 'No se pudo leer el archivo: tiene que ser un JSON con el formato de poi.json.';
    }
  });

  mission.onChange(render);
  render();
  return { panel: shell.root };
}
