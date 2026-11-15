// M12: radiación. Solo cubre los rayos cósmicos de fondo; las tormentas solares no están
// modeladas, y la interfaz tiene que decirlo.
import { DOSE_RATE_USV_H, CAREER_LIMIT_MSV } from './defaults.js';

// D = D_punto t, en µSv.
export function dose_usv(time_h, dose_rate_usv_h = DOSE_RATE_USV_H) {
  return dose_rate_usv_h * time_h;
}

// F_carrera = (D_previa + D) / 600 mSv.
export function careerFraction(prior_dose_msv, eva_dose_usv) {
  return (prior_dose_msv + eva_dose_usv / 1000) / CAREER_LIMIT_MSV;
}
