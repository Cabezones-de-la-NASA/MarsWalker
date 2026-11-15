// M1 (parte 1): lectura del modelo de elevación. docs/modelosydb.md, secciones 3 y 4.
// Código puro: sin three.js ni DOM.
//
// Ejes: +X este, -Z norte, +Y arriba; origen en el centro del DEM; 1 unidad = 1 metro.
// heightmap.f32 va fila por fila de norte a sur, así que la fila 0 es el borde norte (-Z)
// y la columna 0 es el borde oeste (-X). El valor de cada celda está en su centro.

/**
 * @param {object} metadata  metadata.json del dataset (sección 3)
 * @param {Float32Array} float32Array  contenido de heightmap.f32
 */
export function createDem(metadata, float32Array) {
  const [rows, cols] = metadata.shape;
  const resolution_m = metadata.resolution_m;
  const size_m = [metadata.size_m[0], metadata.size_m[1]];

  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error('metadata.shape debe ser [filas, columnas] enteros positivos');
  }
  if (!(resolution_m > 0)) {
    throw new Error('metadata.resolution_m debe ser positivo');
  }
  if (float32Array.length !== rows * cols) {
    throw new Error(
      `heightmap: se esperaban ${rows * cols} valores (filas x columnas) y llegaron ${float32Array.length}`,
    );
  }

  const halfWidth_m = size_m[0] / 2;
  const halfDepth_m = size_m[1] / 2;

  // Posición fraccionaria en la malla, recortada al rango de centros de celda.
  // Fuera del mapa se usa el valor del borde más cercano (el documento no lo define).
  function toCol(x_m) {
    return Math.min(Math.max((x_m + halfWidth_m) / resolution_m - 0.5, 0), cols - 1);
  }
  function toRow(z_m) {
    return Math.min(Math.max((z_m + halfDepth_m) / resolution_m - 0.5, 0), rows - 1);
  }

  // Interpolación bilineal entre las cuatro celdas más cercanas (M1).
  function sampleElevation_m(x_m, z_m) {
    const col = toCol(x_m);
    const row = toRow(z_m);
    const col0 = Math.floor(col);
    const row0 = Math.floor(row);
    const col1 = Math.min(col0 + 1, cols - 1);
    const row1 = Math.min(row0 + 1, rows - 1);
    const tx = col - col0;
    const tz = row - row0;
    const north_m =
      float32Array[row0 * cols + col0] * (1 - tx) + float32Array[row0 * cols + col1] * tx;
    const south_m =
      float32Array[row1 * cols + col0] * (1 - tx) + float32Array[row1 * cols + col1] * tx;
    return north_m * (1 - tz) + south_m * tz;
  }

  return {
    // Identificador del dataset, si el metadata lo trae (lo usa route.json).
    dataset_id: metadata.dataset_id ?? null,
    sampleElevation_m,
    cols,
    rows,
    size_m,
    resolution_m,
    // Extra para slope.js: acceso directo a la malla.
    elevations_m: float32Array,
    // Celda (fila, columna) más cercana a un punto.
    cellAt(x_m, z_m) {
      return { row: Math.round(toRow(z_m)), col: Math.round(toCol(x_m)) };
    },
  };
}
