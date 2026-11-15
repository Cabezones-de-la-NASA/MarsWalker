// M16: posición del Sol e irradiancia. docs/modelosydb.md, sección 4, grupo F.
// Código puro: sin three.js ni DOM.

// [publicado] Semieje mayor de la órbita de Marte, en UA (tabla 2.3: F2 da 1.5; M16 usa 1.52368).
export const MARS_SEMI_MAJOR_AXIS_AU = 1.52368;
// [publicado] Excentricidad de la órbita (ficha M16; el documento no cita la fuente concreta).
export const MARS_ECCENTRICITY = 0.0934;
// [publicado] Longitud solar del perihelio, en grados (ficha M16).
export const PERIHELION_LS_DEG = 251;
// [publicado] Oblicuidad, en grados (tabla 2.3: F2 da 25; M16 usa 25.19).
export const MARS_OBLIQUITY_DEG = 25.19;
// [publicado] Constante solar a 1 UA, en W/m² (ficha M16).
export const SOLAR_CONSTANT_W_M2 = 1361;
// [diseño] Coeficientes de atenuación por polvo de la luz directa y difusa.
export const DUST_EXTINCTION = 0.68;
export const DIFFUSE_FRACTION = 0.34;
export const DIFFUSE_DUST_LOSS = 0.18;
// Masa de aire: m = 1 / (sen(alfa) + 0.095 (alfa + 3.2)^-1.22), con 1 <= m <= 14 y alfa en
// grados dentro de la potencia. La ficha M16 da estos tres coeficientes sin etiqueta y cita a
// Kasten y Young (1989); no se verificaron contra el artículo. Se tratan como [diseño].
export const AIR_MASS_A = 0.095;
export const AIR_MASS_B_DEG = 3.2;
export const AIR_MASS_C = -1.22;
export const AIR_MASS_MAX = 14;
// Fases (ficha M16): día si alfa > 7.5°, crepúsculo si -6.5° < alfa <= 7.5°, noche por debajo.
export const DAY_MIN_ELEVATION_DEG = 7.5;
export const TWILIGHT_MIN_ELEVATION_DEG = -6.5;
// Latitud de Jezero, en grados norte (ficha M16: "≈ 18.4° N").
export const JEZERO_LAT_DEG = 18.4;

const DEG = Math.PI / 180;

// r = a (1 - e²) / (1 + e cos(L_s - 251°)), en UA.
export function sunDistance_au(ls_deg) {
  return (
    (MARS_SEMI_MAJOR_AXIS_AU * (1 - MARS_ECCENTRICITY ** 2)) /
    (1 + MARS_ECCENTRICITY * Math.cos((ls_deg - PERIHELION_LS_DEG) * DEG))
  );
}

/**
 * solarState({ ls_deg, ltst_h, lat_deg, dust_tau }) ->
 *   sun_distance_au     distancia al Sol
 *   irradiance_top_w_m2 irradiancia en el tope de la atmósfera, I_0 = 1361 / r²
 *   elevation_deg       altura del Sol sobre el horizonte, alfa
 *   azimuth_deg         acimut medido desde el norte hacia el este, de 0 a 360
 *   air_mass            masa de aire (null con el Sol bajo el horizonte)
 *   direct_w_m2, diffuse_w_m2, surface_w_m2   irradiancia en superficie
 *   phase               'day' | 'twilight' | 'night'
 */
export function solarState({ ls_deg, ltst_h, lat_deg = JEZERO_LAT_DEG, dust_tau = 0 }) {
  const sun_distance_au = sunDistance_au(ls_deg);
  const irradiance_top_w_m2 = SOLAR_CONSTANT_W_M2 / sun_distance_au ** 2;

  // sen(delta) = sen(25.19°) sen(L_s);  h = 15° (LTST - 12)
  const sinDecl = Math.sin(MARS_OBLIQUITY_DEG * DEG) * Math.sin(ls_deg * DEG);
  const cosDecl = Math.sqrt(1 - sinDecl * sinDecl);
  const hourAngle = 15 * (ltst_h - 12) * DEG;
  const sinLat = Math.sin(lat_deg * DEG);
  const cosLat = Math.cos(lat_deg * DEG);

  // sen(alfa) = sen(phi) sen(delta) + cos(phi) cos(delta) cos(h)
  const sinElev = Math.min(1, Math.max(-1, sinLat * sinDecl + cosLat * cosDecl * Math.cos(hourAngle)));
  const elevation_deg = Math.asin(sinElev) / DEG;

  // Acimut: atan2(-cos(delta) sen(h), sen(delta) cos(phi) - cos(delta) sen(phi) cos(h)).
  const azimuth_raw_deg =
    Math.atan2(-cosDecl * Math.sin(hourAngle), sinDecl * cosLat - cosDecl * sinLat * Math.cos(hourAngle)) / DEG;
  const azimuth_deg = (azimuth_raw_deg + 360) % 360;

  let air_mass = null;
  let direct_w_m2 = 0;
  let diffuse_w_m2 = 0;
  // De noche la irradiancia es 0: con el Sol en el horizonte o por debajo no llega luz directa.
  if (elevation_deg > 0) {
    air_mass = Math.min(
      Math.max(1 / (sinElev + AIR_MASS_A * (elevation_deg + AIR_MASS_B_DEG) ** AIR_MASS_C), 1),
      AIR_MASS_MAX,
    );
    const transmitted = Math.exp(-DUST_EXTINCTION * dust_tau * air_mass);
    // I_dir = I_0 sen(alfa) e^(-0.68 tau m)
    direct_w_m2 = irradiance_top_w_m2 * sinElev * transmitted;
    // I_dif = 0.34 I_0 sen(alfa) (1 - e^(-0.68 tau m)) e^(-0.18 tau)
    diffuse_w_m2 =
      DIFFUSE_FRACTION * irradiance_top_w_m2 * sinElev * (1 - transmitted) *
      Math.exp(-DIFFUSE_DUST_LOSS * dust_tau);
  }

  let phase = 'night';
  if (elevation_deg > DAY_MIN_ELEVATION_DEG) phase = 'day';
  else if (elevation_deg > TWILIGHT_MIN_ELEVATION_DEG) phase = 'twilight';

  return {
    sun_distance_au,
    irradiance_top_w_m2,
    elevation_deg,
    azimuth_deg,
    air_mass,
    direct_w_m2,
    diffuse_w_m2,
    surface_w_m2: direct_w_m2 + diffuse_w_m2,
    phase,
  };
}

/**
 * Vector unitario hacia el Sol en los ejes de la escena: +X este, +Y arriba, -Z norte.
 * -> [x, y, z]
 */
export function sunDirection(elevation_deg, azimuth_deg) {
  const elev = elevation_deg * DEG;
  const az = azimuth_deg * DEG;
  return [Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)];
}
