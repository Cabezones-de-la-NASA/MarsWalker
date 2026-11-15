// Misión "Primer contacto" en el modo a pie: pone las muestras en el terreno, hace que el
// rover guíe y hable, trae la tormenta y cierra con un informe. Las reglas están en el
// modelo puro src/models/missions/first_sortie.js.
import { emit } from '../shared/state.js';
import {
  SORTIE, planFirstSortie, createSortieState, stepSortie, collectSample, arriveHome, sortieTarget,
} from '../models/missions/first_sortie.js';
import { NOMINAL_DUST_TAU, STORM_DUST_TAU } from '../models/environment/weather.js';
import { MARS_FACTS } from '../shared/mars_facts.js';
import { createBeacon, createInterestMark } from '../models3d/props.js';

// [diseño] El polvo sube poco a poco: hasta WARNING_DUST_TAU durante la cuenta atrás y
// hasta el valor de tormenta en STORM_RISE_S; al terminar se despeja en STORM_CLEAR_S.
const WARNING_DUST_TAU = 1.6;
const STORM_RISE_S = 6;
const STORM_CLEAR_S = 14;
const DUST_STEP = 0.04; // cambio mínimo de τ que se manda a la escena
// [diseño] El rover solo se adelanta si el astronauta lo sigue de cerca.
const LEAD_LEASH_M = 22;
const SAMPLE_COLOR = 0x2bb673;

// Datos con fuente sobre las rocas de Jezero, para cuando se toma cada muestra.
const SAMPLE_FACTS = MARS_FACTS.filter((fact) => /núcleo de roca|campo de rocas/.test(fact.text));

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * createSortie({ world, dem, groundAt, bounds, hud, sound, say, getOxygen_l, onDone }) ->
 *   start(home)        home: { x_m, z_m } de la cápsula
 *   update(delta_s, { player, holding }) -> { leadTarget, drilling }
 *   isActive(), cancel(), debug()
 * say(text): el rover dice una frase (burbuja y voz). onDone(): la misión terminó.
 */
export function createSortie({ world, dem, groundAt, bounds, hud, sound, say, getOxygen_l, onDone }) {
  let mission = null; // { state, home, samples_m, hold_s, oxygenStart_l, lastTick }
  let dust_tau = NOMINAL_DUST_TAU;
  let sentDust_tau = NOMINAL_DUST_TAU;
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
  const homeMark = createInterestMark(1.6);
  world.scene.add(homeMark);

  function sendDust(force = false) {
    if (!force && Math.abs(dust_tau - sentDust_tau) < DUST_STEP) return;
    sentDust_tau = dust_tau;
    emit('environment:dust', { dust_tau, storm: dust_tau > WARNING_DUST_TAU + 0.2 });
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
        state.beat_storm ? 'Volviste a la cápsula antes de que llegara la tormenta.' : 'La tormenta te alcanzó antes de llegar a la cápsula.',
        `Oxígeno gastado: ${used_l.toFixed(1)} L.`,
        'Te han enviado una camioneta: está junto a la cápsula. A partir de ahora, Marte es tuyo.',
        'Esta misión y su tormenta son parte del juego; no reproducen un suceso real.',
      ],
    });
    onDone();
  }

  return {
    isActive: () => Boolean(mission),
    debug: () => mission,
    start(home) {
      const plan = planFirstSortie(dem, [home.x_m, home.z_m], bounds);
      mission = {
        state: createSortieState(), home, samples_m: plan.samples_m, hold_s: 0,
        oxygenStart_l: getOxygen_l(), lastTick: null,
      };
      clearing = false;
      dust_tau = NOMINAL_DUST_TAU;
      sendDust(true);
      markers.forEach(({ beacon, mark }, index) => {
        const [x_m, z_m] = plan.samples_m[index];
        beacon.position.set(x_m, groundAt(x_m, z_m), z_m);
        beacon.visible = true;
        mark.visible = true;
      });
      say('Bienvenido a Marte. Quiero analizar dos rocas cerca de aquí. Sígueme a la primera.');
    },
    // Se sale al mapa a media misión: no cuenta y el cielo vuelve a su estado normal.
    cancel() {
      if (!mission && !clearing) return;
      mission = null;
      clearing = false;
      hideMarkers();
      hud.setSortie(null);
      dust_tau = NOMINAL_DUST_TAU;
      sendDust(true);
    },
    update(delta_s, { player, holding }) {
      clock += delta_s;
      // Al terminar, el polvo se asienta aunque la misión ya no esté activa.
      if (!mission) {
        if (clearing) {
          dust_tau = Math.max(NOMINAL_DUST_TAU, dust_tau - ((STORM_DUST_TAU - NOMINAL_DUST_TAU) / STORM_CLEAR_S) * delta_s);
          sendDust(dust_tau === NOMINAL_DUST_TAU);
          if (dust_tau === NOMINAL_DUST_TAU) clearing = false;
        }
        return { leadTarget: null, drilling: false };
      }

      const before = mission.state;
      mission.state = stepSortie(before, delta_s);
      const { state, home, samples_m } = mission;
      const goal = sortieTarget(state);
      const goal_m = goal === 'home' ? [home.x_m, home.z_m] : samples_m[goal];
      const distance_m = Math.hypot(goal_m[0] - player.x_m, goal_m[1] - player.z_m);

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
          say('Ya la tenemos encima. Sigue la luz de la cápsula.');
        }
        dust_tau = Math.min(STORM_DUST_TAU, dust_tau + ((STORM_DUST_TAU - WARNING_DUST_TAU) / STORM_RISE_S) * delta_s);
      }
      sendDust();

      // Recoger: mantener E junto a la muestra mientras el rover taladra.
      let drilling = false;
      if (goal !== 'home') {
        const near = distance_m <= SORTIE.collect_reach_m;
        drilling = near && holding;
        mission.hold_s = drilling ? mission.hold_s + delta_s : 0;
        if (mission.hold_s >= SORTIE.collect_hold_s) {
          mission.hold_s = 0;
          mission.state = collectSample(state);
          markers[goal].mark.visible = false;
          markers[goal].beacon.visible = false;
          sound.beep('sample');
          const fact = SAMPLE_FACTS[goal % SAMPLE_FACTS.length];
          if (goal === 0) {
            say(`Muestra guardada. ${fact.text}`);
            say(`Espera… detecto un frente de polvo. Llega en ${SORTIE.storm_delay_s} segundos. Vamos por la segunda y volvemos a la cápsula.`);
            sound.beep('warning');
          } else {
            say('¡La tenemos! Vuelve a la cápsula, yo te sigo.');
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
      if (homeMark.visible) homeMark.position.set(home.x_m, groundAt(home.x_m, home.z_m) + 5 + bob_m, home.z_m);

      // Visor: qué hacer, a qué distancia y, si toca, la cuenta atrás.
      const where = goal === 'home' ? 'Vuelve a la cápsula' : goal === 0 ? 'Sigue al rover hasta la primera roca' : 'Corre a la segunda roca';
      const near = goal !== 'home' && distance_m <= SORTIE.collect_reach_m;
      hud.setSortie({
        title: `Primer contacto · muestra ${Math.min(now.collected + 1, 2)} de 2`,
        detail: near ? 'Mantén E para tomar la muestra' : `${where} · ${distance_m.toFixed(0)} m`,
        countdown_s: now.storm_in_s !== null && !now.storm ? now.storm_in_s : null,
        storm: now.storm,
        hold: near ? mission.hold_s / SORTIE.collect_hold_s : 0,
      });

      // El rover va delante hacia la muestra si no deja atrás al astronauta; a la vuelta, sigue.
      return { leadTarget: goal === 'home' ? null : { x_m: goal_m[0], z_m: goal_m[1], leash_m: LEAD_LEASH_M }, drilling };
    },
  };
}
