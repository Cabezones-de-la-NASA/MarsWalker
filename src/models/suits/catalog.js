// Catálogo de trajes espaciales. docs/modelosydb.md, sección 4, "Catálogo de trajes".
// Alimenta M6 (masa y sobrecoste por presión), M7 (oxígeno) y M10 (enfriamiento).

export const SUITS = Object.freeze({
  xemu: Object.freeze({
    id: 'xemu',
    name: 'xEMU',
    // [publicado] NASA NTRS 20240007384, "xEMU Testing Overview" (sección 2.5).
    mass_kg: 170,
    // [publicado] misma fuente: 4.3 psi = 29.6 kPa, O2 puro.
    pressure_psi: 4.3,
    pressure_kpa: 29.6,
    // [diseño] O2 primario: 580 L equivalentes (8 h + margen).
    o2_primary_l: 580,
    // [diseño] O2 secundario: 30 min.
    o2_secondary_min: 30,
    // [publicado] eliminación de CO2 continua.
    co2_removal: 'continua',
    // [diseño] eficiencia de la prenda de enfriamiento, epsilon de M10.
    cooling_efficiency: 0.85,
    // [diseño] agua potable.
    drinking_water_l: 2.0,
    // [diseño] sobrecoste metabólico por presión, f_p de M6.
    pressure_overhead: 0.3,
  }),
});

// [diseño] M7: el O2 se considera crítico al 10 % del tanque.
export const O2_CRITICAL_FRACTION = 0.1;

/**
 * Convierte un traje del catálogo en los parámetros que usan los modelos.
 * g_mars_ms2 / g_earth_ms2 escala la masa a la carga equivalente de M6.
 */
export function suitToConfig(suit, g_mars_ms2, g_earth_ms2) {
  return {
    suit_mass_kg: (suit.mass_kg * g_mars_ms2) / g_earth_ms2,
    suit_true_mass_kg: suit.mass_kg,
    o2_capacity_l: suit.o2_primary_l,
    o2_critical_l: suit.o2_primary_l * O2_CRITICAL_FRACTION,
    pressure_overhead: suit.pressure_overhead,
    lcvg_efficiency: suit.cooling_efficiency,
    // Extra (no está en la lista del documento): lo necesita M11.
    drinking_water_l: suit.drinking_water_l,
  };
}
