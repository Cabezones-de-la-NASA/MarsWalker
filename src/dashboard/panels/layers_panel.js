// Panel de capas: casilla, opacidad y leyenda (unidad y rango) por capa.
import './panels.css';
import { createPanelShell } from './panel_shell.js';
import { RISK_COLORS } from '../layers/layer_defs.js';
import { tr } from '../../shared/i18n.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const rgb = (color) => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

function buildLegend(layer) {
  const legend = el('div', 'layer-legend');
  if (layer.kind === 'ramp') {
    const bar = el('div', 'legend-bar');
    const stops = layer.ramp.map(([t, color]) => `${rgb(color)} ${t * 100}%`).join(', ');
    bar.style.background = `linear-gradient(to right, ${stops})`;
    const ends = el('div', 'legend-ends');
    const unit = layer.unit === '°' ? '°' : '';
    ends.append(el('span', null, `${layer.range[0]}${unit}`), el('span', null, `${layer.range[1]}${unit}`));
    legend.append(bar, ends);
    if (layer.unit !== '°') legend.append(el('div', 'legend-unit', layer.unit));
  } else if (layer.kind === 'bands') {
    for (const { band, label } of layer.bands) {
      const row = el('div', 'legend-band');
      const swatch = el('span', 'legend-swatch');
      swatch.style.background = rgb(RISK_COLORS[band]);
      row.append(swatch, el('span', null, label));
      legend.append(row);
    }
    legend.append(el('div', 'legend-unit', tr`${layer.unit}, de ${layer.range[0]} a ${layer.range[1]}`));
  }
  return legend;
}

export function createLayersPanel(container, compositor) {
  const shell = createPanelShell(tr('Capas'), 'layers-panel');
  const panel = shell.body;

  for (const layer of compositor.getLayers()) {
    const item = el('div', 'layer-item');
    item.dataset.layer = layer.id;

    const head = el('label', 'layer-head');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = layer.visible;
    head.append(checkbox, el('span', 'layer-name', layer.label));
    const opacityRow = el('label', 'layer-opacity');
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(layer.opacity * 100));
    const value = el('span', 'layer-opacity-value', `${slider.value} %`);
    opacityRow.append(el('span', null, tr('Opacidad')), slider, value);

    checkbox.addEventListener('change', () => {
      compositor.setLayer(layer.id, { visible: checkbox.checked });
    });
    slider.addEventListener('input', () => {
      value.textContent = `${slider.value} %`;
      compositor.setLayer(layer.id, { opacity: Number(slider.value) / 100 });
    });

    item.append(head, opacityRow);
    if (layer.kind === 'ramp' || layer.kind === 'bands') item.append(buildLegend(layer));
    if (layer.kind === 'file') {
      // Capa de datos reales: unidad, rango y fuente, tal como los declara la zona.
      const range = layer.range ? `de ${layer.range[0]} a ${layer.range[1]}` : tr('rango no declarado');
      item.append(el('div', 'layer-legend', `${layer.unit ?? tr('unidad no declarada')}, ${range}`));
      if (layer.source) item.append(el('div', 'layer-legend', tr`Fuente: ${layer.source}`));
    }
    panel.append(item);
  }

  container.append(shell.root);
  return shell.root;
}
