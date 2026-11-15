// Catálogo de capas que se pintan sobre el terreno, en orden de abajo hacia arriba.
// Las rampas son listas de [posición 0..1, [r, g, b]].

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
    label: 'Base',
    kind: 'image',
    unit: null,
    range: null,
    defaultVisible: true,
    defaultOpacity: 1,
  },
  {
    id: 'slope',
    label: 'Pendiente',
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
    unit: 'índice',
    range: [0, 1],
    bands: [
      { band: 'low', label: 'menor que 0.45' },
      { band: 'medium', label: '0.45 a 0.85' },
      { band: 'high', label: '0.85 o más' },
    ],
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
  {
    id: 'crism',
    label: 'CRISM (mineralogía)',
    kind: 'ramp',
    unit: 'índice simulado, sin unidad',
    range: [0, 1],
    ramp: [
      [0, [20, 60, 90]],
      [0.5, [70, 170, 160]],
      [1, [240, 230, 140]],
    ],
    canBeSimulated: true,
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
  {
    id: 'themis',
    label: 'THEMIS (inercia térmica)',
    kind: 'ramp',
    unit: 'índice simulado, sin unidad',
    range: [0, 1],
    ramp: [
      [0, [30, 20, 90]],
      [0.5, [180, 60, 120]],
      [1, [255, 200, 90]],
    ],
    canBeSimulated: true,
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
];
