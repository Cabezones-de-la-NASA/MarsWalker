// Aspecto de la atmósfera según el Sol (M16) y el polvo (M17). Sin three.js ni DOM:
// devuelve colores 0xRRGGBB e intensidades, y src/world/atmosphere.js los aplica.
//
// Todo aquí es dirección de arte [diseño] guiada por dos hechos físicos que sí vienen de
// los modelos: la altura del Sol y la opacidad del polvo. No es un modelo radiativo.
// El crepúsculo azulado alrededor del Sol sigue lo que muestran las imágenes de los rovers.
import { PALETTE, mixHex } from './palette.js';

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

// Colores que no están en la paleta diurna: noche y crepúsculo.
const NIGHT_TOP = 0x020306;
const NIGHT_HORIZON = 0x0a0b12;
const TWILIGHT_TOP = 0x1a182c;
const TWILIGHT_HORIZON = 0xaa5b4c;
const TWILIGHT_MIE = 0x6aa8ff;
const ZENITH_DAY = 0x7a4630; // cenit ocre oscuro: Mars Haze oscurecido
const STORM_HORIZON = 0x6e2e18;
const STORM_TOP = 0x3b160b;

/**
 * atmosphereLook({ elevation_deg, phase, dust_tau, storm, surface }) ->
 *   skyTop, skyHorizon, mieColor, mieIntensity, skyOpacity
 *   sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, fillIntensity
 *   fogColor, fogNear_m, fogFar_m      (solo con surface = true tienen sentido los metros)
 *   starOpacity, moonOpacity, headlamp, exposure, daylight (0..1)
 *
 * phase: 'day' | 'twilight' | 'night' (M16). surface: vista a pie (true) u orbital (false).
 */
export function atmosphereLook({ elevation_deg, phase, dust_tau = 0.5, storm = false, surface = false }) {
  // Más polvo: cielo más turbio y luz directa más débil.
  const haze = clamp01(dust_tau / 4);
  const high = clamp01((elevation_deg - 7.5) / 55); // 0 al salir del crepúsculo, 1 con el Sol alto
  const twilight = clamp01((elevation_deg + 6.5) / 14); // 0 al entrar la noche, 1 al empezar el día

  let look;
  if (phase === 'day') {
    const horizon = mixHex(mixHex(PALETTE.dustyPeach, PALETTE.paleOchre, high * 0.6), STORM_HORIZON, haze * 0.85);
    look = {
      skyTop: mixHex(ZENITH_DAY, STORM_TOP, haze * 0.9),
      skyHorizon: horizon,
      mieColor: mixHex(PALETTE.solarAmber, 0xff8247, haze),
      mieIntensity: 0.85 - 0.5 * haze,
      skyOpacity: 1,
      sunColor: mixHex(mixHex(0xffb580, PALETTE.solarAmber, high), 0xff8247, haze * 0.8),
      sunIntensity: (1.5 + 1.5 * high) * (1 - 0.6 * haze),
      hemiSky: mixHex(PALETTE.dustyPeach, STORM_HORIZON, haze * 0.7),
      hemiGround: mixHex(PALETTE.dustBrown, 0x33160c, haze),
      hemiIntensity: 0.85 + 0.45 * high,
      fillIntensity: 0.3,
      fogColor: horizon,
      fogNear_m: 220 - 190 * haze,
      fogFar_m: 5200 - 4850 * haze,
      starOpacity: 0,
      moonOpacity: 0,
      headlamp: 0,
      exposure: 1.0,
      daylight: 0.55 + 0.45 * high,
    };
  } else if (phase === 'twilight') {
    const horizon = mixHex(mixHex(0x241d2d, TWILIGHT_HORIZON, twilight), 0x3b1910, haze * 0.8);
    look = {
      skyTop: mixHex(NIGHT_TOP, TWILIGHT_TOP, 0.4 + 0.6 * twilight),
      skyHorizon: horizon,
      mieColor: TWILIGHT_MIE,
      mieIntensity: 1.3 * (1 - 0.7 * haze),
      skyOpacity: 1,
      sunColor: mixHex(0x5a9eff, 0xff986a, twilight * 0.6),
      sunIntensity: (0.25 + 1.0 * twilight) * (1 - 0.6 * haze),
      hemiSky: mixHex(0x38507f, 0x8a6a78, twilight),
      hemiGround: 0x1a1215,
      hemiIntensity: 0.42 + 0.38 * twilight,
      fillIntensity: 0.25,
      fogColor: horizon,
      fogNear_m: 160 - 130 * haze,
      fogFar_m: 3600 - 3250 * haze,
      starOpacity: (1 - twilight) * 0.7 * (1 - haze),
      moonOpacity: (1 - twilight) * 0.7 * (1 - haze),
      headlamp: surface ? (1 - twilight) * 0.8 : 0,
      exposure: 1.05,
      daylight: 0.18 + 0.37 * twilight,
    };
  } else {
    look = {
      skyTop: NIGHT_TOP,
      skyHorizon: mixHex(NIGHT_HORIZON, 0x150b07, haze),
      mieColor: 0x000000,
      mieIntensity: 0,
      skyOpacity: 1,
      sunColor: 0x44587c,
      // Vista orbital: queda una luz cenital tenue para no perder el relieve del mapa.
      sunIntensity: surface ? 0.05 : 0.3,
      hemiSky: 0x28364f,
      hemiGround: 0x08090d,
      hemiIntensity: surface ? 0.2 : 0.38,
      fillIntensity: 0.12,
      fogColor: 0x05070b,
      fogNear_m: 120,
      fogFar_m: 2600 - 2200 * haze,
      starOpacity: 1 - 0.95 * haze,
      moonOpacity: 0.95 * (1 - haze),
      headlamp: surface ? 1 : 0,
      exposure: 1.1,
      daylight: 0.12,
    };
  }
  look.storm = Boolean(storm);
  return look;
}
