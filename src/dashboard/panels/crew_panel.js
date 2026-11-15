// Panel Tripulación: de 1 a 6 personas editables, con VO2máx, FC máxima y ritmo sostenible
// calculados en vivo (M8 y M13), y la comparación de la ruta clásica contra la de salud.
import { state, emit } from '../../shared/state.js';
import { defaultConfig, FITNESS_TABLE } from '../../models/physiology/defaults.js';
import { vo2max_mlkgmin, sustainable_w, hrMax_bpm } from '../../models/physiology/cardio.js';
import { sustainableSpeed_ms, MAX_CREW, MIN_SPEED_MS } from '../../models/physiology/group.js';
import { marsMetabolic_w } from '../../models/physiology/metabolic.js';
import { tr } from '../../shared/i18n.js';

const FITNESS_LABELS = { baja: tr('Baja'), nominal: tr('Nominal'), buena: tr('Buena'), elite: tr('Élite') };
const COMPARE_ROWS = [
  ['time_h', tr('Tiempo'), 'h', 2],
  ['distance_m', tr('Distancia'), 'm', 0],
  ['o2_used_l', tr('O₂ consumido (quien más gasta)'), 'L', 1],
  ['peak_metabolic_w', tr('Pico metabólico'), 'W', 0],
  ['peak_heart_rate_bpm', tr('Pico de pulso'), 'lpm', 0],
  ['peak_core_temp_c', tr('Pico de temperatura'), '°C', 2],
  ['minutes_over_sustainable', tr('Minutos sobre el ritmo sostenible'), 'min', 1],
];
const STATUS_LABELS = {
  nominal: 'nominal',
  low_o2: tr('oxígeno bajo'),
  elevated: 'elevado',
  at_risk_over_sustainable: tr('en riesgo: sobre el ritmo sostenible'),
  critical: tr('crítico'),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// deps: { routePanel }  (para comparar se usan el inicio y el destino del panel Ruta)
export function createCrewPanel({ routePanel }) {
  const cfg = defaultConfig();
  const view = el('section');
  const inner = el('div', 'view-inner');
  view.append(inner);
  inner.append(
    el('h1', null, tr('Tripulación')),
    el('p', null, tr('De 1 a 6 personas. Los valores de la derecha se recalculan al editar. El ritmo sostenible es en llano, caminando a solas, con el traje xEMU en Marte.')),
  );

  const scroll = el('div', 'table-scroll');
  const table = el('table', 'crew-table');
  const head = el('tr');
  for (const [label, numeric] of [
    [tr('Nombre'), false], [tr('Rol'), false], ['Masa (kg)', false], [tr('Edad'), false], [tr('Sexo'), false],
    [tr('Condición'), false], [tr('VO₂máx (mL/kg/min)'), true], [tr('FC máx (lpm)'), true],
    ['M sostenible (W)', true], [tr('Ritmo sostenible (m/s)'), true], ['', false],
  ]) {
    head.append(el('th', numeric ? 'num' : null, label));
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  table.append(thead, body);
  scroll.append(table);
  inner.append(scroll);

  const actions = el('div', 'crew-actions');
  const addButton = el('button', 'crew-add', tr('Añadir persona'));
  addButton.type = 'button';
  const note = el('span', 'crew-warning');
  note.setAttribute('role', 'status');
  actions.append(addButton, note);
  inner.append(actions);

  function commit() {
    emit('crew:change', state.crew);
  }

  function input(type, value, onChange, attrs = {}) {
    const node = el('input');
    node.type = type;
    node.value = String(value);
    Object.assign(node, attrs);
    node.addEventListener('input', () => onChange(node.value));
    return node;
  }

  function select(options, value, onChange) {
    const node = el('select');
    for (const [key, label] of options) {
      const option = el('option', null, label);
      option.value = key;
      node.append(option);
    }
    node.value = value;
    node.addEventListener('change', () => onChange(node.value));
    return node;
  }

  function cell(child, className) {
    const td = el('td', className);
    if (child) td.append(child);
    return td;
  }

  function renderComputed(member, cells) {
    const valid =
      member.mass_kg >= 40 && member.mass_kg <= 130 && member.age >= 18 && member.age <= 80;
    if (!valid) {
      for (const td of Object.values(cells)) td.textContent = '—';
      return false;
    }
    const solo = { ...member, eta: cfg.eta };
    const speed_ms = sustainableSpeed_ms(solo, 0, cfg);
    const limit_w = sustainable_w(member, cfg.rer);
    const atMin_w = marsMetabolic_w({
      mass_kg: member.mass_kg, suit_true_mass_kg: cfg.suit.suit_true_mass_kg, speed_ms: MIN_SPEED_MS,
      slope_deg: 0, eta: cfg.eta, g_mars_ms2: cfg.g_mars_ms2, g_earth_ms2: cfg.g_earth_ms2,
      gait_factor: cfg.gait_factor, pressure_overhead: cfg.suit.pressure_overhead,
    }).total_w;
    cells.vo2.textContent = vo2max_mlkgmin(member).toFixed(1);
    cells.hr.textContent = String(hrMax_bpm(member.age));
    cells.sost.textContent = limit_w.toFixed(0);
    // Si ni al paso mínimo se cumple el límite, se dice en vez de mostrar 0.30 sin más.
    cells.speed.textContent =
      atMin_w > limit_w ? tr`${speed_ms.toFixed(2)} (sobre su límite)` : speed_ms.toFixed(2);
    cells.speed.classList.toggle('crew-warning', atMin_w > limit_w);
    return true;
  }

  function render() {
    body.replaceChildren();
    state.crew.forEach((member, index) => {
      const row = el('tr');
      row.dataset.member = String(index);
      const cells = { vo2: el('td', 'num'), hr: el('td', 'num'), sost: el('td', 'num'), speed: el('td', 'num') };
      const refresh = () => {
        const ok = renderComputed(member, cells);
        note.textContent = ok ? '' : tr('Masa entre 40 y 130 kg y edad entre 18 y 80 años.');
        if (ok) commit();
      };
      const remove = el('button', 'crew-remove', tr('Quitar'));
      remove.type = 'button';
      remove.disabled = state.crew.length <= 1;
      remove.setAttribute('aria-label', tr`Quitar a ${member.name}`);
      remove.addEventListener('click', () => {
        state.crew.splice(index, 1);
        render();
        commit();
      });
      row.append(
        cell(input('text', member.name, (v) => { member.name = v; commit(); }, { maxLength: 30 })),
        cell(input('text', member.role ?? '', (v) => { member.role = v; commit(); }, { maxLength: 30 })),
        cell(input('number', member.mass_kg, (v) => { member.mass_kg = Number(v); refresh(); }, { min: '40', max: '130', step: '1' })),
        cell(input('number', member.age, (v) => { member.age = Number(v); refresh(); }, { min: '18', max: '80', step: '1' })),
        cell(select([['female', tr('Mujer')], ['male', tr('Hombre')]], member.sex, (v) => { member.sex = v; refresh(); })),
        cell(select(Object.keys(FITNESS_TABLE).map((k) => [k, FITNESS_LABELS[k]]), member.fitness, (v) => { member.fitness = v; refresh(); })),
        cells.vo2, cells.hr, cells.sost, cells.speed,
        cell(remove),
      );
      body.append(row);
      renderComputed(member, cells);
    });
    addButton.disabled = state.crew.length >= MAX_CREW;
  }

  addButton.addEventListener('click', () => {
    if (state.crew.length >= MAX_CREW) return;
    state.crew.push({
      name: tr`Tripulante ${state.crew.length + 1}`, role: '', age: 35, sex: 'female', mass_kg: 65,
      fitness: 'nominal', prior_dose_msv: 0,
    });
    render();
    commit();
  });

  // ---- Comparación clásica contra salud
  inner.append(
    el('h2', null, tr('Comparación: ruta clásica contra ruta por salud')),
    el('p', null, tr('Calcula las dos rutas entre el inicio y el destino del panel Ruta y las camina con esta tripulación (M13). La diferencia es salud menos clásica.')),
  );
  const compareActions = el('div', 'crew-actions');
  const compareButton = el('button', 'crew-compare', tr('Comparar'));
  compareButton.type = 'button';
  const compareStatus = el('span');
  compareStatus.setAttribute('role', 'status');
  compareActions.append(compareButton, compareStatus);
  const compareScroll = el('div', 'table-scroll');
  const compareTable = el('table', 'compare-table');
  compareTable.hidden = true;
  compareScroll.append(compareTable);
  inner.append(compareActions, compareScroll);

  compareButton.addEventListener('click', async () => {
    compareStatus.textContent = tr('Calculando…');
    compareButton.disabled = true;
    const result = await routePanel.compare();
    compareButton.disabled = false;
    if (result.failed) {
      compareTable.hidden = true;
      compareStatus.textContent = tr(result.error);
      return;
    }
    compareStatus.textContent = '';
    compareTable.replaceChildren();
    const headRow = el('tr');
    for (const [label, numeric] of [['', false], [tr('Clásica (A* O2)'), true], [tr('Salud'), true], [tr('Diferencia'), true], ['%', true]]) {
      headRow.append(el('th', numeric ? 'num' : null, label));
    }
    compareTable.append(headRow);
    for (const [key, label, unit, digits] of COMPARE_ROWS) {
      const item = result.comparison[key];
      const row = el('tr');
      row.dataset.metric = key;
      const diffClass = item.diff < 0 ? 'num compare-better' : item.diff > 0 ? 'num compare-worse' : 'num';
      row.append(
        el('td', null, `${label} (${unit})`),
        el('td', 'num', item.classic.toFixed(digits)),
        el('td', 'num', item.health.toFixed(digits)),
        el('td', diffClass, `${item.diff > 0 ? '+' : ''}${item.diff.toFixed(digits)}`),
        el('td', diffClass, item.diff_pct === null ? '—' : `${item.diff_pct > 0 ? '+' : ''}${item.diff_pct.toFixed(1)} %`),
      );
      compareTable.append(row);
    }
    const statusRow = el('tr');
    statusRow.dataset.metric = 'worst_status';
    statusRow.append(
      el('td', null, tr('Peor estado del grupo')),
      el('td', 'num', STATUS_LABELS[result.comparison.worst_status.classic]),
      el('td', 'num', STATUS_LABELS[result.comparison.worst_status.health]),
      el('td'), el('td'),
    );
    compareTable.append(statusRow);
    compareTable.hidden = false;
  });

  render();
  return { element: view, render };
}
