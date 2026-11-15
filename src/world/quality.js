// Perfiles gráficos: bajo, medio y alto. Todo lo que cuesta GPU se decide aquí.

export const QUALITY_PROFILES = Object.freeze({
  low: Object.freeze({
    id: 'low', label: 'Bajo',
    pixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 0,
    patchSize_m: 480, patchSegments: 120, rockCount: 500, dustCount: 0,
    anisotropy: 2, terrainDetail: 0.6, footprints: 40,
  }),
  medium: Object.freeze({
    id: 'medium', label: 'Medio',
    pixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 1024,
    patchSize_m: 640, patchSegments: 176, rockCount: 1400, dustCount: 220,
    anisotropy: 4, terrainDetail: 1, footprints: 90,
  }),
  high: Object.freeze({
    id: 'high', label: 'Alto',
    pixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 2048,
    patchSize_m: 800, patchSegments: 240, rockCount: 2800, dustCount: 520,
    anisotropy: 8, terrainDetail: 1, footprints: 160,
  }),
});

const STORAGE_KEY = 'marswalk.quality';

// Orden: ?quality= en la URL, la elección guardada, y si no "medio".
export function pickQuality(search = window.location.search) {
  const fromUrl = new URLSearchParams(search).get('quality');
  if (fromUrl && QUALITY_PROFILES[fromUrl]) return QUALITY_PROFILES[fromUrl];
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && QUALITY_PROFILES[saved]) return QUALITY_PROFILES[saved];
  } catch {
    // Sin almacenamiento disponible: se usa el perfil por defecto.
  }
  return QUALITY_PROFILES.medium;
}

export function saveQuality(id) {
  if (!QUALITY_PROFILES[id]) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Sin almacenamiento disponible: la elección solo dura esta sesión.
  }
}
