import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionStore, BASE_ID, MAX_OBJECTIVES } from '../src/shared/missions.js';
import { stepFollower, FOLLOW } from '../src/models/locomotion/follow.js';
import { MARS_FACTS } from '../src/gameplay/mars_facts.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}
const DATASET_POINTS = [{ id: 'poi_01', name: 'Refugio base', position_m: [10, 10], type: 'shelter', description: '', source: '' }];
const make = (storage = memoryStorage(), over = {}) =>
  createMissionStore({ dataset_id: 'zona', datasetPoints: DATASET_POINTS, halfWidth_m: 1000, halfDepth_m: 1000, storage, ...over });

test('misión: colocar, mover y quitar la base', () => {
  const store = make();
  assert.equal(store.getBase(), null);
  assert.equal(store.setBase([120, -340]), true);
  assert.deepEqual(store.getBase().position_m, [120, -340]);
  assert.equal(store.getBase().type, 'shelter');
  assert.equal(store.getBase().id, BASE_ID);
  store.setBase([5, 6]);
  assert.deepEqual(store.getBase().position_m, [5, 6]);
  assert.equal(store.setBase([5000, 0]), false); // fuera del mapa
  assert.deepEqual(store.getBase().position_m, [5, 6]);
  store.setBase(null);
  assert.equal(store.getBase(), null);
});

test('misión: los objetivos propios se suman a los puntos de la zona', () => {
  const store = make();
  const a = store.addObjective({ name: '  Roca rara  ', type: 'sampling', position_m: [1, 2] });
  const b = store.addObjective({ name: '', type: 'hazard', position_m: [3, 4] });
  assert.equal(a.name, 'Roca rara');
  assert.equal(b.name, 'Peligro 2');
  assert.notEqual(a.id, b.id);
  assert.equal(store.addObjective({ name: 'x', type: 'sampling', position_m: [NaN, 0] }), null);
  assert.equal(store.addObjective({ name: 'x', type: 'otra', position_m: [0, 0] }).type, 'sampling');
  store.setBase([50, 50]);
  assert.deepEqual(store.getPoints().map((p) => p.id), ['poi_01', 'base', a.id, b.id, 'custom_03']);
  store.removeObjective(a.id);
  assert.equal(store.getObjectives().length, 2);
  // El nombre se recorta.
  assert.equal(store.addObjective({ name: 'n'.repeat(200), type: 'sampling', position_m: [0, 0] }).name.length, 40);
});

test('misión: se guarda por zona y se recupera', () => {
  const storage = memoryStorage();
  const first = make(storage);
  first.setBase([7, 8]);
  first.addObjective({ name: 'Punto A', type: 'sampling', position_m: [1, 1] });
  const again = make(storage);
  assert.deepEqual(again.getBase().position_m, [7, 8]);
  assert.equal(again.getObjectives()[0].name, 'Punto A');
  // Un objetivo nuevo no repite identificador.
  assert.notEqual(again.addObjective({ name: 'B', type: 'hazard', position_m: [2, 2] }).id, again.getObjectives()[0].id);
  // Otra zona no ve esta misión.
  assert.equal(make(storage, { dataset_id: 'otra' }).getBase(), null);
  // Datos guardados corruptos no rompen nada.
  storage.setItem('marswalk.mission.zona', '{no es json');
  assert.equal(make(storage).getBase(), null);
});

test('misión: exportar e importar con el formato de poi.json', () => {
  const store = make();
  store.setBase([100, 200]);
  store.addObjective({ name: 'Muestra 1', type: 'sampling', position_m: [10, 20] });
  const exported = store.toJSON();
  assert.equal(exported.dataset_id, 'zona');
  assert.deepEqual(exported.points.map((p) => p.type), ['shelter', 'sampling']);
  for (const point of exported.points) {
    for (const key of ['id', 'name', 'position_m', 'type', 'description', 'source']) assert.ok(key in point, key);
    assert.equal('custom' in point, false);
  }
  const other = make();
  const count = other.importJSON({
    points: [...exported.points, { type: 'sampling', position_m: [99999, 0], name: 'fuera' }, { type: 'x', position_m: [0, 0] }, null],
  });
  assert.equal(count, 2);
  assert.deepEqual(other.getBase().position_m, [100, 200]);
  assert.equal(other.getObjectives()[0].name, 'Muestra 1');
  assert.equal(other.importJSON({ nada: true }), 0);
});

test('misión: avisa de los cambios y respeta el tope de objetivos', () => {
  const store = make();
  let calls = 0;
  store.onChange(() => { calls += 1; });
  store.setBase([1, 1]);
  for (let i = 0; i < MAX_OBJECTIVES + 5; i++) store.addObjective({ name: `o${i}`, type: 'sampling', position_m: [i, i] });
  assert.equal(store.getObjectives().length, MAX_OBJECTIVES);
  assert.equal(calls, 1 + MAX_OBJECTIVES);
  store.clear();
  assert.equal(store.getPoints().length, 1);
});

test('rover: sigue al astronauta y se queda a distancia sin atropellarlo', () => {
  let rover = { x_m: 0, z_m: 0, yaw_rad: 0, speed_ms: 0, moving: false };
  const target = { x_m: 0, z_m: 30 };
  let minDistance_m = Infinity;
  for (let i = 0; i < 60 * 40; i++) {
    rover = stepFollower(rover, target, 1 / 60);
    assert.ok(rover.speed_ms <= FOLLOW.max_speed_ms + 1e-9);
    minDistance_m = Math.min(minDistance_m, Math.hypot(target.x_m - rover.x_m, target.z_m - rover.z_m));
  }
  assert.ok(minDistance_m >= FOLLOW.keep_distance_m - 1e-6, `se acercó a ${minDistance_m} m`);
  assert.ok(minDistance_m < FOLLOW.keep_distance_m + 0.3);
  assert.equal(rover.moving, false);
  assert.equal(rover.speed_ms, 0);
  // Mira hacia el astronauta (rumbo 0 = +Z).
  assert.ok(Math.abs(rover.yaw_rad) < 1e-6);
});

test('rover: no arranca por pasos pequeños y reaparece si queda muy lejos', () => {
  const parked = { x_m: 0, z_m: 0, yaw_rad: 0, speed_ms: 0, moving: false };
  const near = stepFollower(parked, { x_m: 0, z_m: FOLLOW.keep_distance_m + 0.5 }, 0.1);
  assert.equal(near.moving, false);
  assert.deepEqual([near.x_m, near.z_m], [0, 0]);
  const far = stepFollower(parked, { x_m: 0, z_m: FOLLOW.resume_distance_m + 0.5 }, 0.1);
  assert.equal(far.moving, true);
  const jumped = stepFollower(parked, { x_m: 500, z_m: 0 }, 0.1);
  assert.ok(Math.abs(Math.hypot(500 - jumped.x_m, jumped.z_m) - FOLLOW.keep_distance_m) < 1e-9);
  // No modifica el estado de entrada.
  assert.deepEqual(parked, { x_m: 0, z_m: 0, yaw_rad: 0, speed_ms: 0, moving: false });
});

test('datos de Marte: cada uno con texto y fuente', () => {
  assert.ok(MARS_FACTS.length >= 12);
  for (const fact of MARS_FACTS) {
    assert.ok(fact.text.length > 30 && fact.source.length > 5);
  }
  assert.equal(new Set(MARS_FACTS.map((fact) => fact.text)).size, MARS_FACTS.length);
});
