// Misión "Primer contacto" en el modo a pie: pone las muestras en el terreno, hace que el
// rover guíe y hable, trae la tormenta y cierra con un informe. Las reglas están en el
// modelo puro src/models/missions/first_sortie.js.
import { emit } from '../shared/state.js';
import {
  SORTIE, planFirstSortie, createSortieState, stepSortie, collectSample, arriveHome, sortieTarget,
  inspectCapsule, registerJump, canCollect,
} from '../models/missions/first_sortie.js';
import { NOMINAL_DUST_TAU, STORM_DUST_TAU } from '../models/environment/weather.js';
import { MARS_FACTS } from '../shared/mars_facts.js';
import * as THREE from 'three';
import { createBeacon, createInterestMark } from '../models3d/props.js';
import { createStation } from '../models3d/station.js';

// [diseño] El polvo sube poco a poco: hasta WARNING_DUST_TAU durante la cuenta atrás y
// hasta el valor de tormenta en STORM_RISE_S; al terminar se despeja en STORM_CLEAR_S.
const WARNING_DUST_TAU = 1.6;
const STORM_RISE_S = 6;
const STORM_CLEAR_S = 14;
const DUST_STEP = 0.04; // cambio mínimo de τ que se manda a la escena
// [diseño] El rover solo se adelanta si el astronauta lo sigue de cerca.
const LEAD_LEASH_M = 22;
const SAMPLE_COLOR = 0x2bb673;
// [diseño] La primera muestra está sobre una roca de cima plana: hay que subir saltando.
const ROCK_RADIUS_M = 1.8;
const ROCK_HEIGHT_M = 1.2;

// Datos con fuente sobre las rocas de Jezero, para cuando se toma cada muestra.
const SAMPLE_FACTS = MARS_FACTS.filter((fact) => /núcleo de roca|campo de rocas/.test(fact.text));

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * createSortie({ world, dem, groundAt, bounds, hud, sound, say, getOxygen_l, onDone }) ->
 *   start(home)        home: { x_m, z_m } de la cápsula
 *   update(delta_s, { player, holding }) -> { leadTarget, drilling }
 *   isActive(), phase(), goal(), basePosition(), capsuleInspected(), cancel(), debug()
 * say(text): el rover dice una frase (burbuja y voz). onDone(): la misión terminó.
 */
export function createSortie({ world, dem, groundAt, bounds, hud, sound, say, getOxygen_l, onDone, platforms }) {
  let mission = null; // { state, home, samples_m, hold_s, oxygenStart_l, lastTick }
  let dust_tau = NOMINAL_DUST_TAU;
  let sentDust_tau = NOMINAL_DUST_TAU;
  let lastDustPhase = 'calm';
  let clearing = false;
  let clock = 0;

  // Dos balizas con su marca de interés, y una marca grande sobre la cápsula para la vuelta.
  const markers = [0, 1].map(() => {
    const beacon = createBeacon(SAMPLE_COLOR, { shadows: world.quality.shadows });
    const mark = createInterestMark(0.9);
    beacon.visible = false;
    world.scene.add(beacon, mark);
    return { beacon, mark };
  });
  // Roca de la primera muestra: un bloque facetado de cima plana, con la baliza arriba.
  // Es decorado del juego, como las demás rocas; su huella se añade a `platforms`.
  const rockGeometry = new THREE.CylinderGeometry(ROCK_RADIUS_M, ROCK_RADIUS_M * 1.25, ROCK_HEIGHT_M + 0.6, 9, 1);
  const rockPosition = rockGeometry.attributes.position;
  for (let i = 0; i < rockPosition.count; i++) {
    // Los vértices de abajo se desordenan un poco; la cima queda plana para pisarla.
    if (rockPosition.getY(i) < 0) {
      const wobble = 0.82 + 0.3 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
      rockPosition.setX(i, rockPosition.getX(i) * wobble);
      rockPosition.setZ(i, rockPosition.getZ(i) * wobble);
    }
  }
  rockGeometry.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeometry, new THREE.MeshStandardMaterial({ color: 0x8a4a2e, roughness: 0.95, flatShading: true }));
  rock.castShadow = world.quality.shadows;
  rock.receiveShadow = world.quality.shadows;
  rock.visible = false;
  world.scene.add(rock);
  let platform = null;
  function removeRock() {
    rock.visible = false;
    if (platform) platforms.splice(platforms.indexOf(platform), 1);
    platform = null;
  }

  const homeMark = createInterestMark(1.6);
  // La base de la misión: una estación detrás de la cápsula. Se queda tras terminar.
  const station = createStation({ shadows: world.quality.shadows, groundAt });
  world.scene.add(homeMark, station.object);

  function sendDust(force = false) {
    let phase = 'calm';
    if (dust_tau > NOMINAL_DUST_TAU) {
      if (clearing) phase = 'settling';
      else if (!mission?.state.storm) phase = 'approaching';
      else phase = dust_tau < STORM_DUST_TAU ? 'crossing' : 'active';
    }
    if (!force && lastDustPhase === phase && Math.abs(dust_tau - sentDust_tau) < DUST_STEP) return;
    sentDust_tau = dust_tau;
    lastDustPhase = phase;
    emit('environment:dust', { dust_tau, phase });
  }

  function hideMarkers() {
    for (const { beacon, mark } of markers) {
      beacon.visible = false;
      mark.visible = false;
    }
    homeMark.visible = false;
  }

  function finish() {
    const { state, oxygenStart_l } = mission;
    const used_l = Math.max(0, oxygenStart_l - getOxygen_l());
    mission = null;
    clearing = true;
    hideMarkers();
    hud.setSortie(null);
    sound.beep('done');
    say(state.beat_storm
      ? 'Justo a tiempo. Buen trabajo en tu primer contacto con Marte.'
      : 'Llegamos con polvo hasta en las ruedas, pero llegamos. Buen primer contacto.');
    hud.showCard({
      kind: 'Primer contacto',
      title: 'Misión cumplida',
      lines: [
        `Dos muestras recogidas en ${formatClock(state.elapsed_s)}.`,
        state.beat_storm ? 'Llegaste a la base antes de que entrara la tormenta.' : 'La tormenta te alcanzó antes de llegar a la base.',
        `Oxígeno gastado: ${used_l.toFixed(1)} L.`,
        'Te han dejado una camioneta junto a la base. A partir de ahora, Marte es tuyo.',
        'Esta misión y su tormenta son parte del juego; no reproducen un suceso real.',
      ],
    });
    onDone();
  }

  return {
    isActive: () => Boolean(mission),
    phase: () => mission?.state.phase ?? null,
    // Hacia dónde hay que ir ahora, para la marca de la brújula -> { x_m, z_m, label } o null.
    goal() {
      if (!mission?.goal_m) return null;
      const label = { intro: 'Cápsula', to_first: 'Roca 1', to_second: 'Roca 2', return: 'Base' }[mission.state.phase];
      return { x_m: mission.goal_m[0], z_m: mission.goal_m[1], label };
    },
    station,
    basePosition: () => (station.object.visible ? { x_m: station.object.position.x, z_m: station.object.position.z } : null),
    // Tutorial: se inspeccionó la cápsula; ahora sí, a por las rocas.
    capsuleInspected() {
      if (!mission || mission.state.phase !== 'intro') return;
      mission.state = inspectCapsule(mission.state);
      sound.beep('sample');
      say('Ahora sígueme: quiero analizar dos rocas cerca de aquí. Con Shift corres.');
    },
    debug: () => mission,
    start(home) {
      const plan = planFirstSortie(dem, [home.x_m, home.z_m], bounds);
      mission = {
        state: createSortieState(), home, samples_m: plan.samples_m, base_m: plan.base_m, hold_s: 0,
        oxygenStart_l: getOxygen_l(), lastTick: null,
      };
      clearing = false;
      dust_tau = NOMINAL_DUST_TAU;
      sendDust(true);
      // La roca va antes que las balizas: así groundAt ya da la altura de su cima.
      removeRock();
      const [rockX_m, rockZ_m] = plan.samples_m[0];
      const rockBase_m = groundAt(rockX_m, rockZ_m);
      rock.position.set(rockX_m, rockBase_m + (ROCK_HEIGHT_M - 0.6) / 2, rockZ_m);
      rock.visible = true;
      platform = { x_m: rockX_m, z_m: rockZ_m, radius_m: ROCK_RADIUS_M, height_m: ROCK_HEIGHT_M };
      platforms.push(platform);
      markers.forEach(({ beacon, mark }, index) => {
        const [x_m, z_m] = plan.samples_m[index];
        beacon.position.set(x_m, groundAt(x_m, z_m), z_m);
        beacon.visible = true;
        mark.visible = true;
      });
      const [baseX_m, baseZ_m] = plan.base_m;
      const yaw_rad = Math.atan2(home.x_m - baseX_m, home.z_m - baseZ_m);
      station.place(baseX_m, baseZ_m, yaw_rad);
      say('Bienvenido a Marte. Antes de nada, echa un vistazo a la cápsula que te trajo.');
    },
    // Se sale al mapa a media misión: no cuenta y el cielo vuelve a su estado normal.
    cancel() {
      if (!mission && !clearing) return;
      mission = null;
      clearing = false;
      hideMarkers();
      removeRock();
      station.object.visible = false;
      hud.setSortie(null);
      dust_tau = NOMINAL_DUST_TAU;
      sendDust(true);
    },
    update(delta_s, { player, holding }) {
      clock += delta_s;
      // Al terminar, el polvo se asienta aunque la misión ya no esté activa.
      if (!mission) {
        if (clearing) {
          dust_tau = NOMINAL_DUST_TAU + (dust_tau - NOMINAL_DUST_TAU) * Math.exp(-3.7 * delta_s / STORM_CLEAR_S);
          if (dust_tau - NOMINAL_DUST_TAU < 0.06) dust_tau = NOMINAL_DUST_TAU;
          sendDust(dust_tau === NOMINAL_DUST_TAU);
          if (dust_tau === NOMINAL_DUST_TAU) clearing = false;
        }
        return { leadTarget: null, drilling: false };
      }

      const before = mission.state;
      mission.state = stepSortie(before, delta_s);
      const { state, home, samples_m, base_m } = mission;
      const goal = sortieTarget(state);
      const goal_m = goal === 'capsule' ? [home.x_m, home.z_m] : goal === 'home' ? base_m : samples_m[goal];
      mission.goal_m = goal_m;
      const distance_m = Math.hypot(goal_m[0] - player.x_m, goal_m[1] - player.z_m);

      // Tutorial, paso 1: la cápsula. Solo se enseñan las teclas; el resto espera.
      if (goal === 'capsule') {
        homeMark.visible = true;
        homeMark.position.set(home.x_m, groundAt(home.x_m, home.z_m) + 5 + Math.sin(clock * 2.4) * 0.1, home.z_m);
        hud.setSortie({
          title: 'Primer contacto · primeros pasos',
          detail: 'Acércate a la cápsula e inspecciónala',
          keys: [['W A S D', 'moverte'], ['Ratón', 'mirar'], ['E', 'interactuar']],
          countdown_s: null, storm: false, hold: 0,
        });
        return { leadTarget: null, drilling: false };
      }
      // Tutorial, paso 2: un salto de camino a la primera roca.
      if (state.phase === 'to_first' && !state.jumped && !player.grounded) {
        mission.state = registerJump(state);
        sound.beep('tick');
        say('¡Así se salta con un tercio de la gravedad de la Tierra!');
      }

      // Tormenta: aviso con pitido cada segundo y frase del rover cuando entra.
      if (state.storm_in_s !== null && !state.storm) {
        const tick = Math.ceil(state.storm_in_s);
        if (tick !== mission.lastTick) {
          mission.lastTick = tick;
          if (tick <= 10) sound.beep('tick');
        }
        const progress = 1 - state.storm_in_s / SORTIE.storm_delay_s;
        dust_tau = NOMINAL_DUST_TAU + (WARNING_DUST_TAU - NOMINAL_DUST_TAU) * progress;
      } else if (state.storm) {
        if (!before.storm) {
          sound.beep('warning');
          say('Ya la tenemos encima. Mira la brújula: la base está donde apunta la marca.');
        }
        dust_tau = Math.min(STORM_DUST_TAU, dust_tau + ((STORM_DUST_TAU - WARNING_DUST_TAU) / STORM_RISE_S) * delta_s);
      }
      sendDust();

      // Recoger: mantener E junto a la muestra mientras el rover taladra.
      let drilling = false;
      if (goal !== 'home') {
        // La primera muestra está en lo alto de la roca: hay que estar pisando su cima.
        const reach_m = goal === 0 ? ROCK_RADIUS_M : SORTIE.collect_reach_m;
        const near = distance_m <= reach_m && player.grounded && canCollect(mission.state);
        drilling = near && holding;
        mission.hold_s = drilling ? mission.hold_s + delta_s : 0;
        if (mission.hold_s >= SORTIE.collect_hold_s) {
          mission.hold_s = 0;
          mission.state = collectSample(mission.state);
          markers[goal].mark.visible = false;
          markers[goal].beacon.visible = false;
          sound.beep('sample');
          const fact = SAMPLE_FACTS[goal % SAMPLE_FACTS.length];
          if (goal === 0) {
            say(`Muestra guardada. ${fact.text}`);
            say(`Espera… detecto un frente de polvo. Llega en ${SORTIE.storm_delay_s} segundos. Vamos por la segunda y nos refugiamos en la base.`);
            sound.beep('warning');
          } else {
            say('¡La tenemos! A la base, detrás de la cápsula. Sigue la marca de la brújula.');
          }
          drilling = false;
        }
      } else if (distance_m <= SORTIE.home_reach_m) {
        mission.state = arriveHome(state);
        finish();
        return { leadTarget: null, drilling: false };
      }

      // Marcas: flotan sobre la muestra pendiente; en la vuelta, sobre la cápsula.
      const bob_m = Math.sin(clock * 2.4) * 0.1;
      markers.forEach(({ mark }, index) => {
        if (!mark.visible) return;
        const [x_m, z_m] = samples_m[index];
        mark.position.set(x_m, groundAt(x_m, z_m) + 3.3 + bob_m, z_m);
      });
      const now = mission.state;
      homeMark.visible = now.phase === 'return';
      if (homeMark.visible) homeMark.position.set(base_m[0], groundAt(base_m[0], base_m[1]) + 8 + bob_m, base_m[1]);

      // Visor: qué hacer, a qué distancia y, si toca, la cuenta atrás.
      const where = goal === 'home' ? 'Refúgiate en la base' : goal === 0 ? 'Sigue al rover hasta la primera roca' : 'Corre a la segunda roca';
      const near = goal !== 'home' && distance_m <= (goal === 0 ? ROCK_RADIUS_M : SORTIE.collect_reach_m) && player.grounded && canCollect(now);
      // Teclas en grande según lo que toca aprender en cada tramo.
      const needsJump = now.phase === 'to_first' && !now.jumped;
      let keys = null;
      let detail = `${where} · ${distance_m.toFixed(0)} m`;
      if (near) {
        detail = 'Toma la muestra';
        keys = [['E', 'mantener pulsada']];
      } else if (needsJump && distance_m <= SORTIE.jump_hint_m) {
        detail = `La baliza está sobre la roca: salta para subir · ${distance_m.toFixed(0)} m`;
        keys = [['Espacio', 'saltar']];
      } else if (now.phase === 'to_first' && distance_m <= SORTIE.jump_hint_m) {
        detail = `Sube a la roca de un salto · ${distance_m.toFixed(0)} m`;
        keys = [['Espacio', 'saltar']];
      } else if (now.phase === 'to_first') {
        keys = [['Shift', 'correr']];
      }
      hud.setSortie({
        title: `Primer contacto · muestra ${Math.min(now.collected + 1, 2)} de 2`,
        detail,
        keys,
        countdown_s: now.storm_in_s !== null && !now.storm ? now.storm_in_s : null,
        storm: now.storm,
        hold: near ? mission.hold_s / SORTIE.collect_hold_s : 0,
      });

      // El rover va delante hacia la muestra si no deja atrás al astronauta; a la vuelta, sigue.
      return { leadTarget: goal === 'home' ? null : { x_m: goal_m[0], z_m: goal_m[1], leash_m: LEAD_LEASH_M }, drilling };
    },
  };
}
