

// Carga un dataset de public/data/<dataset_id>/ (docs/modelosydb.md, sección 3).
// Lo usan el dashboard y el gameplay. Devuelve datos crudos; el DEM se arma con
// createDem de src/models/terrain/ en quien lo consume.

import { BASE_URL } from './base_url.js';
import { tr } from './i18n.js';

export const DEFAULT_DATASET_ID = 'hirise_jezero';
const DATASET_ID_PATTERN = /^[a-z0-9_]+$/;

// Lee ?dataset= de la URL; si falta o no es un nombre de carpeta válido, usa el de por defecto.
export function datasetIdFromUrl(search = window.location.search) {
  const id = new URLSearchParams(search).get('dataset');
  return id && DATASET_ID_PATTERN.test(id) ? id : DEFAULT_DATASET_ID;
}

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(tr`No se pudo cargar ${url} (HTTP ${response.status})`);
  }
  return response;
}

// Lista de zonas disponibles (public/data/index.json, lo escribe data_pipeline/build_index.py).
// -> [{ dataset_id, label, source, resolution_m, size_m, has_poi }], o [] si no hay índice.
export async function loadDatasetIndex() {
  try {
    const response = await fetch(`${BASE_URL}data/index.json`);

    if (
      !response.ok ||
      !(response.headers.get('content-type') || '').includes('json')
    ) {
      return [];
    }

    const index = await response.json();
    return Array.isArray(index.datasets) ? index.datasets : [];
  } catch {
    return [];
  }
}

// -> { metadata, heights_m: Float32Array, baseUrl, textureUrl, poi }
// poi es el contenido de poi.json, o null si el dataset no lo trae.
export async function loadDataset(dataset_id) {
  if (!DATASET_ID_PATTERN.test(dataset_id)) {
    throw new Error(tr`dataset_id no válido: ${dataset_id}`);
  }

  const baseUrl = `${BASE_URL}data/${dataset_id}/`;

  const metadataResponse = await fetchOk(`${baseUrl}metadata.json`);

  // El servidor de desarrollo responde index.html cuando la carpeta no existe.
  if (!(metadataResponse.headers.get('content-type') || '').includes('json')) {
    throw new Error(tr`No existe el dataset "${dataset_id}" en public/data/`);
  }

  const metadata = await metadataResponse.json();

  const buffer = await (
    await fetchOk(baseUrl + metadata.heightmap.file)
  ).arrayBuffer();

  // heightmap.f32 es little-endian, igual que Float32Array en los navegadores actuales.
  const heights_m = new Float32Array(buffer);

  const base = metadata.layers.find((layer) => layer.type === 'base');
  const textureUrl = baseUrl + (base ? base.file : 'texture.png');

  let poi = null;

  try {
    const response = await fetch(`${baseUrl}poi.json`);
    const type = response.headers.get('content-type') || '';

    if (response.ok && type.includes('json')) {
      poi = await response.json();
    }
  } catch {
    poi = null; // poi.json es opcional
  }

  return { metadata, heights_m, baseUrl, textureUrl, poi };
}
