// Constantes planetarias de Marte (docs/modelosydb.md, tabla 2.3).
// F2 = https://science.nasa.gov/mars/facts/ (leída el 2026-11-14).

// [publicado] F2: "a radius of 2,106 miles (3,390 kilometers)".
export const MARS_RADIUS_M = 3_390_000;

// [publicado] F2: "it completes one rotation every 24.6 hours".
export const MARS_DAY_H = 24.6;

// [publicado] F2: "A year on Mars lasts 669.6 sols, which is the same as 687 Earth days".
export const MARS_YEAR_SOLS = 669.6;
export const MARS_YEAR_EARTH_DAYS = 687;

// [publicado] F2: "Mars' axis of rotation is tilted 25 degrees".
// M16 usa un valor más preciso (25.19°) que se define con ese modelo.
export const MARS_AXIAL_TILT_DEG = 25;

// [publicado] F2: "Mars is 1.5 astronomical units away from the Sun".
// M16 usa un valor más preciso (1.52368 UA) que se define con ese modelo.
export const MARS_SUN_DISTANCE_AU = 1.5;

// [publicado] F2: "as high as 70 degrees Fahrenheit (20 degrees Celsius) or as low as
// about -225 degrees Fahrenheit (-153 degrees Celsius)".
export const MARS_SURFACE_TEMP_MAX_C = 20;
export const MARS_SURFACE_TEMP_MIN_C = -153;

// [publicado] F2: "Mars has two small moons, Phobos and Deimos".
export const MARS_MOONS = Object.freeze(['Phobos', 'Deimos']);

// [publicado] NASA Mars Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
// (F2 no da la gravedad). Valor tomado de la tabla 2.3; la hoja no se abrió para verificarlo.
export const MARS_GRAVITY_MS2 = 3.71;
