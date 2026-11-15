// M8 (capacidad aeróbica) y M9 (frecuencia cardíaca).
import {
  FITNESS_TABLE,
  VO2MAX_DECLINE_PER_YEAR,
  VO2MAX_REFERENCE_AGE,
  SUSTAINABLE_FRACTION,
  HR_MAX_BASE_BPM,
  VO2_REST_MLKGMIN,
  RER,
} from './defaults.js';
import { o2Energy_kj_l } from './oxygen.js';

function fitnessRow(fitness) {
  const row = FITNESS_TABLE[fitness];
  if (!row) throw new Error(`Condición física desconocida: ${fitness}`);
  return row;
}

// M8: VO2máx(a) = VO2máx(25) (1 - 0.01 max(0, a - 25)), en mL/kg/min.
// sex: 'male' | 'female'; fitness: 'baja' | 'nominal' | 'buena' | 'elite'.
export function vo2max_mlkgmin({ age, sex, fitness }) {
  const row = fitnessRow(fitness);
  const at25 = sex === 'female' ? row.vo2max_female : row.vo2max_male;
  return at25 * (1 - VO2MAX_DECLINE_PER_YEAR * Math.max(0, age - VO2MAX_REFERENCE_AGE));
}

// VO2máx en L/min = mL/kg/min * masa / 1000.
export function vo2max_lmin(member) {
  return (vo2max_mlkgmin(member) * member.mass_kg) / 1000;
}

// M8: M_sost = 0.60 VO2máx (1000 E_O2 / 60), en watts.
export function sustainable_w(member, rer = RER) {
  return (SUSTAINABLE_FRACTION * vo2max_lmin(member) * 1000 * o2Energy_kj_l(rer)) / 60;
}

// M8: FC máx = 220 - edad.
export function hrMax_bpm(age) {
  return HR_MAX_BASE_BPM - age;
}

export function hrRest_bpm(fitness) {
  return fitnessRow(fitness).hr_rest_bpm;
}

/**
 * M9: FC = FC_rep + (FC_max - FC_rep) (VO2 - VO2_rep) / (VO2máx - VO2_rep),
 * con VO2 en mL/kg/min y VO2_rep = 3.5. Se recorta a [FC_rep, FC_max].
 */
export function heartRate_bpm({ vo2_mlkgmin, vo2max_mlkgmin: max_mlkgmin, hr_rest_bpm, hr_max_bpm }) {
  const reserve = (vo2_mlkgmin - VO2_REST_MLKGMIN) / (max_mlkgmin - VO2_REST_MLKGMIN);
  const hr_bpm = hr_rest_bpm + (hr_max_bpm - hr_rest_bpm) * reserve;
  return Math.min(Math.max(hr_bpm, hr_rest_bpm), hr_max_bpm);
}
