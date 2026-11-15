// Misión propia del usuario en una zona: una base y puntos objetivo.
// Sin three.js. Se guarda por zona en el almacenamiento del navegador y se puede exportar
// e importar con el mismo formato de poi.json (docs/modelosydb.md, sección 3).
//
// La base es un punto de tipo 'shelter'; los objetivos son 'sampling' o 'hazard'.

const STORAGE_PREFIX = 'marswalk.mission.';
export const BASE_ID = 'base';
export const OBJECTIVE_TYPES = Object.freeze(['sampling', 'hazard']);
// [diseño] Tope de objetivos propios por zona.
export const MAX_OBJECTIVES = 24;
const MAX_NAME_LENGTH = 40;

function isPosition(value) {
  return Array.isArray(value) && value.length === 2 && value.every((v) => Number.isFinite(v));
}

function cleanName(value, fallback) {
  const text = typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
  return text || fallback;
}

/**
 * createMissionStore({ dataset_id, datasetPoints, halfWidth_m, halfDepth_m, storage }) ->
 *   getBase() -> punto o null          setBase(position_m | null)
 *   getObjectives() -> puntos propios  addObjective({ name, type, position_m }) -> punto o null
 *   removeObjective(id)
 *   getPoints() -> puntos del dataset + base + objetivos (lo que ven el mapa y el modo a pie)
 *   toJSON() / importJSON(obj) -> número de puntos importados
 *   clear(), onChange(fn)
 * storage: objeto con getItem y setItem (por defecto, localStorage si existe).
 */
export function createMissionStore({ dataset_id, datasetPoints = [], halfWidth_m, halfDepth_m, storage }) {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  const key = STORAGE_PREFIX + dataset_id;
  const listeners = [];
  let base = null;
  let objectives = [];
  let nextNumber = 1;

  const inside = (position_m) =>
    isPosition(position_m) && Math.abs(position_m[0]) <= halfWidth_m && Math.abs(position_m[1]) <= halfDepth_m;

  function makeBase(position_m) {
    return {
      id: BASE_ID,
      name: 'Base',
      position_m: [position_m[0], position_m[1]],
      type: 'shelter',
      description: 'Base colocada por el usuario. Sirve de refugio y de punto de partida.',
      source: 'Punto creado por el usuario en Alone in Mars; no es un dato de misión.',
      custom: true,
    };
  }

  function makeObjective(input) {
    const type = OBJECTIVE_TYPES.includes(input.type) ? input.type : 'sampling';
    const number = nextNumber;
    nextNumber += 1;
    return {
      id: `custom_${String(number).padStart(2, '0')}`,
      name: cleanName(input.name, type === 'hazard' ? `Peligro ${number}` : `Objetivo ${number}`),
      position_m: [input.position_m[0], input.position_m[1]],
      type,
      description:
        type === 'hazard'
          ? 'Zona marcada como peligrosa por el usuario.'
          : 'Punto de muestreo marcado por el usuario.',
      source: 'Punto creado por el usuario en Alone in Mars; no es un dato de misión.',
      custom: true,
    };
  }

  function save() {
    try {
      store?.setItem(key, JSON.stringify({ base: base?.position_m ?? null, objectives, nextNumber }));
    } catch {
      // Sin almacenamiento disponible: la misión dura solo esta sesión.
    }
  }

  function changed() {
    save();
    for (const fn of [...listeners]) fn();
  }

  function load() {
    try {
      const saved = JSON.parse(store?.getItem(key) ?? 'null');
      if (!saved) return;
      if (inside(saved.base)) base = makeBase(saved.base);
      nextNumber = Number.isInteger(saved.nextNumber) && saved.nextNumber > 0 ? saved.nextNumber : 1;
      for (const item of Array.isArray(saved.objectives) ? saved.objectives : []) {
        if (objectives.length >= MAX_OBJECTIVES) break;
        if (!item || !inside(item.position_m) || !OBJECTIVE_TYPES.includes(item.type)) continue;
        // Lo guardado es texto del usuario: se vuelve a armar campo a campo.
        const number = nextNumber;
        const objective = makeObjective(item);
        objective.id = typeof item.id === 'string' && /^custom_\d+$/.test(item.id) ? item.id : objective.id;
        nextNumber = Math.max(number + 1, nextNumber);
        objectives.push(objective);
      }
    } catch {
      base = null;
      objectives = [];
    }
  }
  load();

  return {
    dataset_id,
    getBase: () => base,
    getObjectives: () => [...objectives],
    getPoints: () => [...datasetPoints, ...(base ? [base] : []), ...objectives],
    setBase(position_m) {
      if (position_m !== null && !inside(position_m)) return false;
      base = position_m ? makeBase(position_m) : null;
      changed();
      return true;
    },
    addObjective(input) {
      if (objectives.length >= MAX_OBJECTIVES || !inside(input.position_m)) return null;
      const objective = makeObjective(input);
      objectives.push(objective);
      changed();
      return objective;
    },
    removeObjective(id) {
      const before = objectives.length;
      objectives = objectives.filter((item) => item.id !== id);
      if (objectives.length !== before) changed();
    },
    clear() {
      base = null;
      objectives = [];
      nextNumber = 1;
      changed();
    },
    // Mismo formato que poi.json: la base y los objetivos como "points".
    toJSON() {
      const strip = (point) => {
        const copy = { ...point };
        delete copy.custom;
        return copy;
      };
      return { dataset_id, points: [...(base ? [base] : []), ...objectives].map(strip) };
    },
    // Sustituye la misión por la del archivo. Devuelve cuántos puntos entraron.
    importJSON(data) {
      if (!data || !Array.isArray(data.points)) return 0;
      base = null;
      objectives = [];
      nextNumber = 1;
      let count = 0;
      for (const point of data.points) {
        if (!point || !inside(point.position_m)) continue;
        if (point.type === 'shelter') {
          if (!base) {
            base = makeBase(point.position_m);
            count += 1;
          }
        } else if (OBJECTIVE_TYPES.includes(point.type) && objectives.length < MAX_OBJECTIVES) {
          objectives.push(makeObjective(point));
          count += 1;
        }
      }
      changed();
      return count;
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
}
