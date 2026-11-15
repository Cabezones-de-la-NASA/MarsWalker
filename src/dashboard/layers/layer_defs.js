// Catálogo de capas que se pintan sobre el terreno, en orden de abajo hacia arriba.
// Las rampas son listas de [posición 0..1, [r, g, b]].
import { tr } from '../../shared/i18n.js';

// [diseño] Colores de las tres bandas de riesgo de M2.
export const RISK_COLORS = {
  low: [46, 158, 79], // verde
  medium: [230, 194, 41], // amarillo
  high: [209, 53, 43], // rojo
};

// [diseño] Tope de la escala de la capa de pendiente.
export const SLOPE_LAYER_MAX_DEG = 45;

export const LAYER_DEFS = [
  {
    id: 'base',
    label: tr('Base'),
    kind: 'image',
    unit: null,
    range: null,
    defaultVisible: true,
    defaultOpacity: 1,
  },
  {
    id: 'slope',
    label: tr('Pendiente'),
    kind: 'ramp',
    unit: '°',
    range: [0, SLOPE_LAYER_MAX_DEG],
    ramp: [
      [0, [255, 247, 214]],
      [0.25, [254, 196, 79]],
      [0.5, [236, 112, 20]],
      [0.75, [153, 52, 4]],
      [1, [74, 20, 60]],
    ],
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
  {
    id: 'risk',
    label: 'Riesgo (M2)',
    kind: 'bands',
    unit: tr('índice'),
    range: [0, 1],
    bands: [
      { band: 'low', label: tr('menor que 0.45') },
      { band: 'medium', label: '0.45 a 0.85' },
      { band: 'high', label: tr('0.85 o más') },
    ],
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
  // CRISM y THEMIS no se simulan: solo aparecen si la zona trae el archivo real en
  // metadata.layers. La unidad, el rango y la fuente salen de esa entrada:
  //   { "id": "themis", "file": "themis.png", "type": "overlay",
  //     "unit": "J m⁻² K⁻¹ s⁻½", "range": [150, 600], "source": "…" }
  {
    id: 'crism',
    label: tr('CRISM (mineralogía)'),
    kind: 'file',
    requiresFile: true,
    unit: null,
    range: null,
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
  {
    id: 'themis',
    label: tr('THEMIS (inercia térmica)'),
    kind: 'file',
    requiresFile: true,
    unit: null,
    range: null,
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
];
