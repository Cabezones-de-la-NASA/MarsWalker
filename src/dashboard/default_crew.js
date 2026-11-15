// Tripulación de ejemplo para la ruta por salud mientras no se cargue config_health.json.
// [diseño] Dos personas inventadas para probar la interfaz; no representan a nadie real.
import { tr } from '../shared/i18n.js';
export const DEFAULT_CREW = [
  { name: tr('Tripulante 1'), role: tr('Comandante'), age: 34, sex: 'female', mass_kg: 62, fitness: 'buena', prior_dose_msv: 0 },
  { name: tr('Tripulante 2'), role: tr('Geología'), age: 41, sex: 'male', mass_kg: 78, fitness: 'buena', prior_dose_msv: 0 },
];
