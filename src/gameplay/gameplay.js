// Modo a pie: el astronauta camina sobre el terreno del DEM en primera o tercera persona,
// conduce la camioneta y conversa con el rover.
// Junta la locomoción (modelo puro), la cámara, el astronauta, las constantes vitales
// (modelos M5 a M12) y el visor. No importa nada del dashboard.
import * as THREE from 'three';
import { state, on, emit } from '../shared/state.js';
import { sampleSlope_deg } from '../models/terrain/slope.js';
import { stepPlayer, horizontalSpeed_ms, platformHeight_m, LOCOMOTION } from '../models/locomotion/kinematics.js';
import { visualGround_m } from '../world/surface_detail.js';
import { resolveRockCollision } from '../world/rock_field.js';
import { createAstronautRig } from '../models3d/explorer.js';
import { createBeacon, createInterestMark } from '../models3d/props.js';
import { createInput } from './player/input.js';
import { createFollowCamera } from './camera/follow_camera.js';
import { createVitals } from './vitals.js';
import { createHud } from './hud/hud.js';
import { createInteraction } from './interact.js';
import { createFootprints } from './footprints.js';
import { createCompanion } from './companion.js';
import { createVehicle } from './vehicle.js';
import { createParachute } from '../models3d/parachute.js';
import { createCapsule, CAPSULE_RADIUS_M, CAPSULE_HEIGHT_M } from '../models3d/capsule.js';
import { DESCENT, descentState } from '../models/locomotion/descent.js';
import { askRover } from '../shared/rover_llm.js';
import { createSpeech } from './rover_chat/speech.js';
import { createSound } from './audio/sound.js';
import { createSortie } from './sortie.js';
import { markFirstContactDone } from '../shared/first_contact.js';
import { NOMINAL_DUST_TAU, STORM_DUST_TAU } from '../models/environment/weather.js';
import { VEHICLE } from '../models/locomotion/vehicle.js';
import { FOLLOW } from '../models/locomotion/follow.js';
import { memberStatus } from '../models/physiology/group.js';
import { createStation } from '../models3d/station.js';

// [diseño] Margen hasta el borde del mapa, en metros.
const MAP_MARGIN_M = 4;
// [diseño] El rover aparece a esta distancia del astronauta al empezar.
const COMPANION_START_OFFSET_M = 5;
// [diseño] Color de la baliza de cada tipo de punto de interés.
const BEACON_COLORS = { shelter: 0x3d8bfd, sampling: 0x2bb673, hazard: 0xe5484d };
// [diseño] La camioneta aparece a esta distancia del astronauta al empezar.
const VEHICLE_START_OFFSET_M = [7, 3];
// [diseño] Radio con el que la camioneta choca con las rocas (menor que su largo, para
// que no se enganche en cada piedra).
const VEHICLE_ROCK_RADIUS_M = 1.4;
// [diseño] Con el astronauta en la camioneta, el rover corre para no quedarse atrás.
const FOLLOW_VEHICLE = Object.freeze({
  ...FOLLOW, max_speed_ms: VEHICLE.max_speed_ms + 1, acceleration_ms2: 6, keep_distance_m: 8, resume_distance_m: 10,
});
// [diseño] Velocidades del tiempo respecto al real: 0 es pausa. Al bajar a la superficie
// el tiempo corre solo a DEFAULT_TIME_SCALE.
const TIME_SCALES = [0, 1, 4, 16, 60, 120, 200, 300, 350, 400, 430];
const DEFAULT_TIME_SCALE = 4;
const HUD_REFRESH_S = 0.15;
// [diseño] Segundos que los avisos de acción salen en el centro al empezar a caminar;
// después pasan al panel de teclas.
const PROMPT_INTRO_S = 10;
// [diseño] Margen tras cerrar la conversación con el rover, en milisegundos.
const CHAT_CLOSE_GRACE_MS = 250;
// [diseño] Tras aterrizar, la cápsula queda hundida y ladeada, y el astronauta sale a
// unos metros de ella.
const CAPSULE_SINK_M = 0.4;
const CAPSULE_TILT_RAD = 0.14;
const CAPSULE_EXIT_M = 4.5;
// [diseño] El paracaídas de la cápsula es mayor que uno personal.
const PARACHUTE_SCALE = 1.7;

/**
 * createGameplay(container, { world, dem, terrain, rocks, dust, mission }) ->
 *   mission: base y objetivos propios (src/shared/missions.js)
 *   enter()   baja a la superficie en state.astronaut_position_m
 *   exit()    vuelve al mapa y guarda la posición en state.astronaut_position_m
 *   isActive()
 */
export function createGameplay(container, { world, dem, dataset, terrain, rocks, dust, mission }) {
  const getPoints = () => mission.getPoints();
  const [width_m, depth_m] = dem.size_m;
  // Suelo de la escena y superficies que puede pisar el astronauta.
  const platforms = [];
  const terrainGroundAt = (x_m, z_m) => visualGround_m(dem, x_m, z_m) + platformHeight_m(platforms, x_m, z_m);
  const baseStation = createStation({ shadows: world.quality.shadows, groundAt: terrainGroundAt });
  let sortie;
  const groundAt = (x_m, z_m) => Math.max(
    terrainGroundAt(x_m, z_m),
    baseStation.walkSurface_m(x_m, z_m),
    sortie?.station.walkSurface_m(x_m, z_m) ?? -Infinity,
  );

  const companion = createCompanion({ world, groundAt: terrainGroundAt });
  const truck = createVehicle({ world, groundAt: terrainGroundAt });

  function avoidStations(px, pz, radius_m, onFoot) {
    const [x, z] = baseStation.resolveCollision(px, pz, radius_m, onFoot);
    return sortie?.station.resolveCollision(x, z, radius_m, onFoot) ?? [x, z];
  }
  function avoidCapsule(px, pz, radius_m) {
    if (!capsuleSite) return [px, pz];
    const dx = px - capsuleSite.x_m;
    const dz = pz - capsuleSite.z_m;
    const distance_m = Math.hypot(dx, dz);
    const reach_m = CAPSULE_RADIUS_M + radius_m;
    if (distance_m >= reach_m || distance_m < 1e-6) return [px, pz];
    return [capsuleSite.x_m + (dx / distance_m) * reach_m, capsuleSite.z_m + (dz / distance_m) * reach_m];
  }
  function resolveCollision(x_m, z_m) {
    let [px, pz] = resolveRockCollision(dem, x_m, z_m, LOCOMOTION.body_radius_m);
    [px, pz] = companion.resolveCollision(px, pz, LOCOMOTION.body_radius_m);
    [px, pz] = truck.resolveCollision(px, pz, LOCOMOTION.body_radius_m);
    [px, pz] = avoidCapsule(px, pz, LOCOMOTION.body_radius_m);
    return avoidStations(px, pz, LOCOMOTION.body_radius_m, true);
  }
  const bounds = { halfWidth_m: width_m / 2 - MAP_MARGIN_M, halfDepth_m: depth_m / 2 - MAP_MARGIN_M };
  const env = { groundAt, resolveCollision, ...bounds };
  // La camioneta choca con rocas, con el rover y con la base.
  const vehicleEnv = {
    groundAt: terrainGroundAt,
    resolveCollision(x_m, z_m) {
      let [px, pz] = resolveRockCollision(dem, x_m, z_m, VEHICLE_ROCK_RADIUS_M);
      [px, pz] = companion.resolveCollision(px, pz, VEHICLE_ROCK_RADIUS_M);
      [px, pz] = avoidCapsule(px, pz, VEHICLE.body_radius_m);
      return avoidStations(px, pz, VEHICLE.body_radius_m, false);
    },
    ...bounds,
  };

  const rig = createAstronautRig({ shadows: world.quality.shadows });
  world.scene.add(rig.object);

  // Balizas en los puntos de interés (la base lleva su estación, no baliza).
  const beacons = new THREE.Group();
  beacons.name = 'beacons';
  beacons.visible = false;
  // Estación en la base del usuario. Se ve también desde el mapa.
  const station = baseStation.object;
  world.scene.add(beacons, station);

  function rebuildMissionObjects() {
    beacons.clear();
    const base = mission.getBase();
    for (const poi of getPoints()) {
      if (base && poi.id === base.id) continue;
      const beacon = createBeacon(BEACON_COLORS[poi.type] ?? 0xffb45c, { shadows: world.quality.shadows });
      beacon.position.set(poi.position_m[0], terrainGroundAt(poi.position_m[0], poi.position_m[1]), poi.position_m[1]);
      beacons.add(beacon);
    }
    if (base) baseStation.place(...base.position_m);
    else station.visible = false;
  }
  rebuildMissionObjects();
  mission.onChange(rebuildMissionObjects);

  const footprints = createFootprints(world.scene, world.quality.footprints);
  const interaction = createInteraction({ dem, getPoints, companion, getCapsule: () => capsuleSite });
  const followCamera = createFollowCamera(world.camera, groundAt);
  const vitals = createVitals({
    dem,
    getMember: () => ({ ...(state.crew[0] ?? { name: 'Astronauta', age: 35, sex: 'female', mass_kg: 65, fitness: 'nominal', prior_dose_msv: 0 }) }),
    getAmbientTemp_c: () => state.environment?.weather?.ambient_temp_c ?? -56,
  });

  let active = false;
  let paused = false;
  let player = null;
  let target = null;
  let hudClock = 0;
  let jumpHeld = false;
  let driving = false;
  let chatOpen = false;
  let chatClosed_ms = -Infinity;
  // Esc que cierra la conversación no debe abrir además el menú de pausa.
  const justClosedChat = () => performance.now() - chatClosed_ms < CHAT_CLOSE_GRACE_MS * 2;
  let promptIntro_s = PROMPT_INTRO_S;
  // Aterrizaje en curso: { t_s, scale, ground_m, yaw0_rad } o null.
  let landing = null;
  // Misión "Primer contacto" pedida para esta bajada: sin realismo, sin acelerar el
  // tiempo y sin camioneta hasta terminarla.
  let sortieMode = false;
  const isRealism = () => state.realism && !sortieMode;
  const sound = createSound();
  const speech = createSpeech();
  let lowOxygenWarned = false;
  const parachute = createParachute();
  parachute.scale.setScalar(PARACHUTE_SCALE);
  parachute.visible = false;
  // La cápsula en la que baja el astronauta; después se queda en el suelo.
  const capsule = createCapsule({ shadows: world.quality.shadows });
  capsule.visible = false;
  let capsuleSite = null; // { x_m, z_m } donde quedó, o null
  // Signos de admiración sobre lo que aún no se ha usado: la cápsula y la camioneta.
  const capsuleMark = createInterestMark();
  const truckMark = createInterestMark();
  let capsuleSeen = false;
  let truckUsed = false;
  let markClock = 0;
  world.scene.add(parachute, capsule, capsuleMark, truckMark);
  let timeScale = DEFAULT_TIME_SCALE;

  function setTimeScale(scale) {
    // Solo mueve el reloj de Marte (Sol y clima). La fisiología va siempre en tiempo real.
    timeScale = isRealism() || sortieMode ? 1 : scale;
    hud.setTimeScale(timeScale);
  }

  const hud = createHud(container, {
    timeScales: TIME_SCALES,
    onResume: () => setPaused(false),
    onExit: () => emit('mode:request', 'dashboard'),
    onTimeScale: setTimeScale,
  });
  setTimeScale(DEFAULT_TIME_SCALE);

  // Estado de la caminata que el rover conoce al responder (src/shared/rover_context.js).
  function roverSnapshot() {
    const snapshot = vitals.get();
    const v = snapshot.vitals;
    const environment = state.environment;
    return {
      zone: { label: dataset?.metadata.label ?? 'Marte', resolution_m: dem.resolution_m },
      position_m: [player.x_m, player.z_m],
      elevation_m: dem.sampleElevation_m(player.x_m, player.z_m),
      slope_deg: sampleSlope_deg(dem, player.x_m, player.z_m),
      vitals: {
        o2_l: v.o2_l, o2_fraction: v.o2_fraction, autonomy_h: v.autonomy_h,
        heart_rate_bpm: v.heart_rate_bpm, core_temp_c: v.core_temp_c, status: memberStatus(v.flags),
      },
      environment: environment && {
        ltst_h: environment.ltst_h, ambient_temp_c: environment.weather.ambient_temp_c,
        phase: environment.sun.phase, dust_tau: environment.dust_tau, storm: environment.storm,
      },
      progress: interaction.progress(),
      walked_m: snapshot.distance_m, driven_m: snapshot.driven_m, in_vehicle: driving, time_scale: timeScale,
      nearby: interaction.nearby(player.x_m, player.z_m),
    };
  }

  // Conversación con el rover, sin detenerse: se le habla manteniendo R o se le escribe
  // con Enter, y contesta en burbujas a la derecha y en voz alta. Las respuestas vienen de
  // askRover (el LLM del servidor o, si no hay, un dato de la lista).
  const history = [];
  let asking = false;
  let listening = null; // burbuja en vivo mientras se mantiene R
  async function askRoverAloud(question) {
    if (asking) return;
    asking = true;
    const thinking = question ? hud.sayLive('Rover') : null;
    try {
      const reply = await askRover({ question, history, snapshot: roverSnapshot() });
      if (question) history.push({ role: 'user', content: question });
      history.push({ role: 'assistant', content: reply.text });
      thinking?.remove();
      if (!active) return;
      hud.say(reply.text, 'Rover', reply.source ? `Fuente: ${reply.source}` : null);
      if (!sound.isMuted()) speech.speak(reply.text);
    } finally {
      asking = false;
    }
  }
  function startTalking() {
    if (listening || chatOpen) return;
    if (!speech.canListen) {
      hud.say('Aquí no puedo oírte: este navegador no reconoce la voz. Pulsa Enter y escríbeme.');
      return;
    }
    speech.cancelSpeech();
    const bubble = hud.sayLive('Tú', 'Te escucho…');
    listening = bubble;
    speech.listen({ onPartial: (text) => bubble.set(text) })
      .then((text) => {
        if (text) {
          bubble.set(text);
          bubble.done();
          askRoverAloud(text);
        } else {
          bubble.remove();
          hud.say('No te oí. Mantén R mientras hablas, o pulsa Enter y escríbeme.');
        }
      })
      .catch((error) => {
        bubble.remove();
        hud.say(`${error.message} Pulsa Enter y escríbeme.`);
      })
      .finally(() => {
        if (listening === bubble) listening = null;
      });
  }
  // Escribirle: mientras la línea está abierta las teclas son letras y el astronauta para.
  function closeLine() {
    chatOpen = false;
    chatClosed_ms = performance.now();
    if (active && !paused) {
      input.setEnabled(true);
      // El cursor se recaptura un instante después: si se pidiera dentro de la misma
      // pulsación de Esc, el navegador lo soltaría otra vez con esa tecla.
      window.setTimeout(() => {
        if (active && !paused && !chatOpen) input.requestPointerLock();
      }, CHAT_CLOSE_GRACE_MS);
    }
  }
  function openLine() {
    if (chatOpen || hud.isCardOpen()) return;
    chatOpen = true;
    input.setEnabled(false);
    hud.openLine({
      onSend(text) {
        closeLine();
        hud.say(text, 'Tú');
        askRoverAloud(text);
      },
      onCancel: closeLine,
    });
  }

  function setDriving(next) {
    driving = next;
    followCamera.setVehicleMode(driving);
    if (!driving) truck.setCabinLight(false);
    followCamera.snap();
    rig.setVisible(!driving && !followCamera.isFirstPerson());
    hud.hideCard();
  }
  function truckDistance_m() {
    const parked = truck.state();
    if (!parked) return Infinity;
    return Math.hypot(parked.x_m - player.x_m, parked.z_m - player.z_m);
  }
  const formatDistance = (d_m) => (d_m >= 1000 ? `${(d_m / 1000).toFixed(1)} km` : `${d_m.toFixed(0)} m`);
  function toggleVehicle() {
    if (driving) {
      // Baja a la izquierda de la camioneta, sin atravesar rocas ni la base.
      const [x_m, z_m] = resolveCollision(...truck.exitPosition());
      player = { ...player, x_m, z_m, y_m: groundAt(x_m, z_m), vx_ms: 0, vy_ms: 0, vz_ms: 0, grounded: true };
      setDriving(false);
      placeAstronaut();
    } else if (truck.canBoard(player.x_m, player.z_m)) {
      truckUsed = true;
      setDriving(true);
    }
  }

  // El rover habla: burbuja a la derecha y, si el sonido está activo, voz.
  function roverSay(text) {
    hud.say(text);
    if (!sound.isMuted()) speech.speak(text);
  }
  // Viento para el sonido: 0 en calma y 1 en plena tormenta, según el polvo de la escena.
  const windLevel = () => Math.min(Math.max(
    ((state.environment?.dust_tau ?? NOMINAL_DUST_TAU) - NOMINAL_DUST_TAU) / (STORM_DUST_TAU - NOMINAL_DUST_TAU), 0), 1);
  sortie = createSortie({
    world, dem, groundAt: terrainGroundAt, bounds, hud, sound, say: roverSay, platforms,
    getOxygen_l: () => vitals.get().vitals.o2_l,
    onDone() {
      // Misión cumplida: llega la camioneta y todo queda libre.
      markFirstContactDone();
      emit('sortie:complete');
      sortieMode = false;
      placeVehicle();
      setTimeScale(DEFAULT_TIME_SCALE);
    },
  });

  const input = createInput(world.renderer.domElement, {
    onInteract() {
      if (!active || paused) return;
      if (hud.isCardOpen()) {
        hud.hideCard();
        return;
      }
      if (!target || driving || landing) return;
      if (target.type === 'rover') askRoverAloud(''); // E junto al rover: cuenta un dato
      else {
        if (target.type === 'capsule') {
          capsuleSeen = true;
          sortie.capsuleInspected(); // primer paso del tutorial, si está en curso
        }
        hud.showCard(interaction.use(target));
      }
    },
    onToggleView() {
      if (!active || paused) return;
      const firstPerson = followCamera.toggle();
      rig.setVisible(!firstPerson && !driving);
    },
    onVehicle() {
      if (active && !paused && !landing) toggleVehicle();
    },
    // G trae la camioneta junto al astronauta, esté donde esté.
    onSummonVehicle() {
      if (active && !paused && !driving && !chatOpen && !isRealism() && !sortieMode && !landing) placeVehicle();
    },
    // T pasa a la siguiente velocidad del tiempo (la pausa se elige en el menú).
    onTimeScale() {
      if (!active || paused) return;
      // Durante el aterrizaje, T acelera la caída (hasta 100×), también con realismo.
      if (landing) {
        const steps = DESCENT.time_scales;
        landing.scale = steps[(steps.indexOf(landing.scale) + 1) % steps.length];
        return;
      }
      if (isRealism() || sortieMode) return;
      const speeds = TIME_SCALES.filter((scale) => scale > 0);
      setTimeScale(speeds[(speeds.indexOf(timeScale) + 1) % speeds.length]);
    },
    onDetails() {
      if (active) hud.toggleDetails();
    },
    onTalkStart() {
      if (active && !paused) startTalking();
    },
    onTalkEnd() {
      if (listening) speech.stopListening();
    },
    onChatLine() {
      if (active && !paused && !landing) openLine();
    },
    onMute() {
      if (!active) return;
      const muted = sound.toggleMuted();
      if (muted) speech.cancelSpeech();
      hud.say(muted ? 'Sonido apagado. Pulsa M para volver a oírme.' : 'Sonido activado.');
    },
    onMenu() {
      if (!active || justClosedChat()) return;
      // El primer Esc cierra la tarjeta abierta (como E); el segundo abre el menú.
      if (hud.isCardOpen() && !paused) {
        hud.hideCard();
        return;
      }
      setPaused(!paused);
    },
    onPointerLockChange(locked) {
      // Al soltar el cursor con Esc el navegador no entrega la tecla: se abre el menú aquí.
      if (!active || locked || paused || chatOpen || justClosedChat()) return;
      // Con una tarjeta abierta, ese Esc solo la cierra. El cursor queda libre: un clic
      // lo vuelve a capturar y mientras tanto se puede mirar arrastrando.
      if (hud.isCardOpen()) {
        hud.hideCard();
        input.requestPointerLock();
        return;
      }
      setPaused(true);
    },
  });
  world.renderer.domElement.addEventListener('click', () => {
    if (!active || paused) return;
    // Un clic fuera de la conversación la cierra y devuelve el control.
    if (chatOpen) hud.closeLine();
    else input.requestPointerLock();
  });

  function setPaused(next) {
    paused = next;
    hud.setMenu(paused);
    if (paused) {
      if (input.hasPointerLock()) document.exitPointerLock();
    } else {
      input.requestPointerLock();
    }
  }

  function startLanding() {
    landing = { t_s: 0, scale: 1, ground_m: groundAt(player.x_m, player.z_m), yaw0_rad: player.yaw_rad };
    parachute.visible = true;
    // El astronauta va dentro de la cápsula: durante la caída solo se ve ella.
    capsuleSite = null;
    capsuleSeen = false;
    capsule.visible = true;
    capsule.rotation.set(0, 0, 0);
    rig.setVisible(false);
    followCamera.setVehicleMode(true); // cámara alejada para ver la campana
    followCamera.setFreeLook(true); // y libre: se puede mirar alrededor, arriba y abajo
    followCamera.snap();
    hud.setLanding({ ...descentState(0), scale: 1, scales: DESCENT.time_scales });
  }
  // cancel: se sale al mapa a media caída; no cuenta como aterrizaje visto.
  function finishLanding(cancel = false) {
    landing = null;
    parachute.visible = false;
    hud.setLanding(null);
    followCamera.setVehicleMode(false);
    followCamera.setFreeLook(false);
    if (cancel) {
      capsule.visible = false;
      player = { ...player, y_m: groundAt(player.x_m, player.z_m), vy_ms: 0, grounded: true };
      placeAstronaut();
      return;
    }
    // La cápsula se queda donde cayó, algo hundida y ladeada; el astronauta sale a unos
    // metros, del lado de la escotilla.
    capsuleSite = { x_m: player.x_m, z_m: player.z_m };
    capsule.position.set(player.x_m, groundAt(player.x_m, player.z_m) - CAPSULE_SINK_M, player.z_m);
    capsule.rotation.set(CAPSULE_TILT_RAD, player.yaw_rad, CAPSULE_TILT_RAD * 0.6);
    const [x_m, z_m] = resolveCollision(
      player.x_m + Math.sin(player.yaw_rad) * CAPSULE_EXIT_M, player.z_m + Math.cos(player.yaw_rad) * CAPSULE_EXIT_M,
    );
    player = { ...player, x_m, z_m, y_m: groundAt(x_m, z_m), vx_ms: 0, vy_ms: 0, vz_ms: 0, grounded: true };
    placeAstronaut();
    followCamera.snap();
    rig.setVisible(!followCamera.isFirstPerson());
    vitals.reset(player.x_m, player.z_m);
    sound.thud();
    followCamera.shake(0.5);
    if (sortieMode) sortie.start(capsuleSite);
  }
  // La caída en cápsula sale con la misión "Primer contacto" o si se pide en el mapa
  // ("Aterrizaje realista"); el resto de bajadas son directas.
  const shouldLand = () => state.landingRequested;

  function placeAstronaut() {
    rig.object.position.set(player.x_m, player.y_m, player.z_m);
    rig.object.rotation.y = player.yaw_rad;
  }

  function spawn(position_m) {
    const [x_m, z_m] = resolveCollision(position_m[0], position_m[1]);
    player = { x_m, y_m: groundAt(x_m, z_m), z_m, vx_ms: 0, vy_ms: 0, vz_ms: 0, yaw_rad: Math.PI, grounded: true };
    placeAstronaut();
  }
  spawn(state.astronaut_position_m ?? [0, 0]);

  // El rover empieza al lado del astronauta, mirando hacia él.
  function placeCompanion() {
    const [px, pz] = resolveRockCollision(dem, player.x_m - COMPANION_START_OFFSET_M, player.z_m, 1.9);
    const [x_m, z_m] = avoidStations(px, pz, 1.9, false);
    companion.place(x_m, z_m, Math.PI / 2);
  }
  placeCompanion();

  function placeVehicle() {
    const [px, pz] = resolveRockCollision(
      dem, player.x_m + VEHICLE_START_OFFSET_M[0], player.z_m + VEHICLE_START_OFFSET_M[1], VEHICLE.body_radius_m,
    );
    const [x_m, z_m] = avoidStations(px, pz, VEHICLE.body_radius_m, false);
    truck.place(
      Math.min(Math.max(x_m, -bounds.halfWidth_m), bounds.halfWidth_m),
      Math.min(Math.max(z_m, -bounds.halfDepth_m), bounds.halfDepth_m),
      Math.PI,
    );
  }
  placeVehicle();

  // Si en el mapa se arrastra el indicador de aterrizaje, el astronauta y el rover se
  // mudan con él. La camioneta no: se queda donde se dejó hasta que se la llame con G.
  on('astronaut:moved', (position_m) => {
    if (active) return;
    spawn(position_m);
    if (!state.realism) placeCompanion();
  });

  world.onFrame((delta_s) => {
    if (!active) {
      // En el mapa el astronauta descansa en su sitio.
      rig.update(delta_s, { speed_ms: 0, walk_speed_ms: LOCOMOTION.walk_speed_ms, run_speed_ms: LOCOMOTION.run_speed_ms });
      companion.update(delta_s, null, world.camera);
      return;
    }
    const look = paused ? [0, 0] : input.consumeLook();
    // El tiempo de Marte (Sol, clima) avanza con la velocidad elegida. Lo escucha quien
    // lleve el reloj de simulación.
    if (!paused && landing) emit('time:advance', delta_s * landing.scale);
    else if (!paused && timeScale > 0) emit('time:advance', delta_s * timeScale);
    if (landing) {
      if (!paused) landing.t_s += delta_s * landing.scale;
      sound.update(delta_s, { walking_m: 0, heart_bpm: 70, wind: windLevel(), vehicle_speed_ms: null, falling: true });
      const fall = descentState(landing.t_s);
      player = { ...player, y_m: landing.ground_m + fall.altitude_m, yaw_rad: landing.yaw0_rad + fall.spin_rad, grounded: false };
      placeAstronaut();
      capsule.position.set(player.x_m, player.y_m, player.z_m);
      capsule.rotation.set(0, player.yaw_rad, fall.sway_rad);
      parachute.position.set(player.x_m, player.y_m + CAPSULE_HEIGHT_M, player.z_m);
      parachute.rotation.set(0, player.yaw_rad, fall.sway_rad * 0.6);
      companion.update(delta_s, null, world.camera);
      truck.update(delta_s, null, vehicleEnv, world.camera);
      hud.setLanding({ ...fall, scale: landing.scale, scales: DESCENT.time_scales });
      if (fall.landed) finishLanding();
    } else if (!paused && driving) {
      // W y S aceleran y frenan; A y D giran el volante. La cámara gira con la camioneta.
      const yawBefore = truck.state().yaw_rad;
      truck.update(delta_s, { throttle: input.state.forward, steer: input.state.right }, vehicleEnv, world.camera);
      const car = truck.state();
      followCamera.setYaw(followCamera.yaw + (car.yaw_rad - yawBefore));
      player = {
        ...player, x_m: car.x_m, z_m: car.z_m, y_m: truck.height_m(), yaw_rad: car.yaw_rad,
        vx_ms: Math.sin(car.yaw_rad) * car.speed_ms, vy_ms: 0, vz_ms: Math.cos(car.yaw_rad) * car.speed_ms, grounded: true,
      };
      placeAstronaut();
      vitals.update(delta_s, player.x_m, player.z_m, { riding: true });
      companion.update(delta_s, player, world.camera, FOLLOW_VEHICLE);
      sound.update(delta_s, { walking_m: 0, heart_bpm: vitals.get().vitals.heart_rate_bpm, wind: windLevel(), vehicle_speed_ms: car.speed_ms });
      state.astronaut_position_m = [player.x_m, player.z_m];
      target = null;
    } else if (!paused) {
      truck.update(delta_s, null, vehicleEnv, world.camera);
      // Dirección deseada respecto a la cámara: W avanza hacia donde se mira.
      const yaw = followCamera.yaw;
      const { forward, right } = input.state;
      let dirX = Math.sin(yaw) * forward - Math.cos(yaw) * right;
      let dirZ = Math.cos(yaw) * forward + Math.sin(yaw) * right;
      const length = Math.hypot(dirX, dirZ);
      if (length > 1e-6) {
        dirX /= length;
        dirZ /= length;
      }
      // El salto se dispara una vez por pulsación.
      const jump = input.state.jump && !jumpHeld;
      jumpHeld = input.state.jump;
      const previousYaw = player.yaw_rad;
      const before = player;
      player = stepPlayer(player, { dirX, dirZ, run: input.state.run, jump }, env, delta_s);
      const speed_ms = horizontalSpeed_ms(player);
      placeAstronaut();
      rig.update(delta_s, {
        speed_ms,
        walk_speed_ms: LOCOMOTION.walk_speed_ms,
        run_speed_ms: LOCOMOTION.run_speed_ms,
        turn: THREE.MathUtils.clamp((player.yaw_rad - previousYaw) / Math.max(delta_s, 1e-3) / 3, -1, 1),
        airborne: !player.grounded,
      });
      vitals.update(delta_s, player.x_m, player.z_m);
      footprints.update(player, groundAt);
      // Misión guiada: el rover se adelanta hacia la muestra mientras no deje atrás al
      // astronauta; fuera de ella, lo sigue.
      const guided = sortie.update(delta_s, { player, holding: input.state.interact && !hud.isCardOpen() });
      const rover = companion.position();
      const lead = guided.leadTarget;
      const leading = lead && rover && Math.hypot(rover.x_m - player.x_m, rover.z_m - player.z_m) < lead.leash_m;
      companion.update(delta_s, leading ? lead : player, world.camera);
      state.astronaut_position_m = [player.x_m, player.z_m];
      // En la misión guiada solo se interactúa con la cápsula, y solo en su tutorial.
      if (!sortie.isActive()) target = interaction.nearest(player.x_m, player.z_m);
      else target = sortie.phase() === 'intro' ? interaction.capsuleTarget(player.x_m, player.z_m) : null;
      const flags = vitals.get().vitals;
      sound.update(delta_s, {
        walking_m: player.grounded ? Math.hypot(player.x_m - before.x_m, player.z_m - before.z_m) : 0,
        running: speed_ms > LOCOMOTION.walk_speed_ms + 0.05,
        heart_bpm: flags.heart_rate_bpm, wind: windLevel(), vehicle_speed_ms: null, drilling: guided.drilling,
        agitation: windLevel(),
      });
      // Aviso sonoro la primera vez que el oxígeno baja del 10 %.
      if (flags.flags.o2_low && !lowOxygenWarned) sound.beep('low');
      lowOxygenWarned = flags.flags.o2_low;
    }

    const cabinEye = driving && followCamera.isFirstPerson() ? truck.driverEye : null;
    truck.setCabinLight(Boolean(cabinEye));
    followCamera.update(delta_s, player, look, cabinEye);
    terrain.patch.update(player.x_m, player.z_m);
    rocks.update(player.x_m, player.z_m);
    dust?.update(delta_s, world.camera, state.environment?.dust_tau ?? 0.5);
    world.setShadowFocus(rig.object.position);

    // Marcas de interés: flotan con un vaivén suave y desaparecen al usar la cosa.
    markClock += delta_s;
    const bob_m = Math.sin(markClock * 2.2) * 0.08;
    capsuleMark.visible = Boolean(capsuleSite) && !capsuleSeen;
    if (capsuleMark.visible) capsuleMark.position.set(capsuleSite.x_m, capsule.position.y + CAPSULE_HEIGHT_M + 0.9 + bob_m, capsuleSite.z_m);
    const parked = truck.state();
    truckMark.visible = Boolean(parked) && !truckUsed && !landing;
    if (truckMark.visible) truckMark.position.set(parked.x_m, truck.height_m() + 3.6 + bob_m, parked.z_m);
    // La cuenta de los avisos en el centro empieza al pisar el suelo, no durante la caída.
    if (!paused && !landing && promptIntro_s > 0) {
      promptIntro_s -= delta_s;
      if (promptIntro_s <= 0) hud.dockPrompts(true);
    }
    hudClock += delta_s;
    if (hudClock >= HUD_REFRESH_S) {
      hudClock = 0;
      const snapshot = vitals.get();
      const yaw = followCamera.viewYaw;
      // Rumbo desde el norte (-Z) hacia el este (+X), en grados.
      const heading_deg = ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;
      const speed_ms = horizontalSpeed_ms(player);
      const prompts = [];
      if (!paused && !hud.isCardOpen() && !chatOpen && !landing && sortie.isActive()) {
        if (target) prompts.push(['E', target.prompt, true]);
      } else if (!paused && !hud.isCardOpen() && !chatOpen && !landing) {
        if (driving) {
          if (speed_ms < 2) prompts.push(['F', 'Bajar de la camioneta']);
          prompts.push(['V', followCamera.isFirstPerson() ? 'Vista exterior' : 'Vista de cabina']);
        } else {
          // El tercer valor marca lo que merece el centro de la pantalla: algo con lo
          // que interactuar. Hablar con el rover y traer la camioneta van solo al panel.
          if (target) prompts.push(['E', target.prompt, target.type !== 'rover']);
          if (truck.canBoard(player.x_m, player.z_m)) prompts.push(['F', 'Subir a la camioneta', true]);
          else if (truck.state()) prompts.push(['G', `Traer la camioneta (está a ${formatDistance(truckDistance_m())})`]);
        }
      }
      hud.setPrompts(prompts);
      // Marca en la brújula hacia el objetivo de la misión guiada.
      const goal = sortie.goal();
      if (goal) {
        const bearing_deg = (Math.atan2(goal.x_m - player.x_m, -(goal.z_m - player.z_m)) * 180) / Math.PI;
        hud.setCompassTarget({ offset_deg: ((bearing_deg - heading_deg + 540) % 360) - 180, label: goal.label });
      } else hud.setCompassTarget(null);
      hud.setDust(windLevel());
      hud.update({
        vehicle: { driving, driven_m: snapshot.driven_m },
        objective: interaction.nearestObjective(player.x_m, player.z_m),
        ltst_h: state.environment?.ltst_h ?? null,
        vitals: snapshot.vitals,
        status: snapshot.status,
        elapsed_s: snapshot.elapsed_s,
        nav: {
          x_m: player.x_m,
          z_m: player.z_m,
          // Elevación y pendiente del DEM (M1), no del microrrelieve visual.
          elevation_m: dem.sampleElevation_m(player.x_m, player.z_m),
          slope_deg: sampleSlope_deg(dem, player.x_m, player.z_m),
          heading_deg,
          speed_ms,
          distance_m: snapshot.distance_m,
        },
        environment: state.environment
          ? { ambient_temp_c: state.environment.weather.ambient_temp_c, phase: state.environment.sun.phase }
          : null,
        ...interaction.progress(),
        running: !driving && speed_ms > LOCOMOTION.walk_speed_ms + 0.05,
        firstPerson: followCamera.isFirstPerson(),
        fps: world.stats.fps,
      });
    }
  });

  return {
    isActive: () => active,
    // Referencias para las pruebas de navegador.
    debug: {
      getPlayer: () => player, vitals, followCamera, input, hud, interaction, rig, env, companion, station, beacons,
      sortie, sound, isSortieMode: () => sortieMode,
      truck, toggleVehicle, askRoverAloud, openLine, parachute, capsule, capsuleMark, truckMark, getCapsuleSite: () => capsuleSite, getLanding: () => landing, isDriving: () => driving, getTimeScale: () => timeScale, setTimeScale, roverSnapshot,
    },
    enter() {
      if (active) return;
      active = true;
      paused = false;
      if (driving) setDriving(false);
      spawn(state.astronaut_position_m ?? [0, 0]);
      setTimeScale(DEFAULT_TIME_SCALE);
      // "Primer contacto": siempre con aterrizaje, con rover y sin camioneta hasta acabar.
      sortieMode = state.sortieRequested;
      state.sortieRequested = false;
      setTimeScale(DEFAULT_TIME_SCALE); // en la misión guiada queda en 1×
      sound.resume();
      hud.clearFeed();
      if (isRealism()) {
        // Con realismo se va solo y a pie: sin rover de compañía ni camioneta.
        companion.remove();
        truck.remove();
      } else if (sortieMode) {
        placeCompanion();
        truck.remove();
      } else {
        // Si el astronauta se movió en el mapa, el rover reaparece a su lado.
        const rover = companion.position();
        if (!rover || Math.hypot(rover.x_m - player.x_m, rover.z_m - player.z_m) > 30) placeCompanion();
        if (!truck.state()) placeVehicle();
      }
      hud.setRealism(isRealism());
      vitals.reset(player.x_m, player.z_m);
      footprints.reset();
      world.setView('surface');
      terrain.patch.setActive(true);
      terrain.patch.update(player.x_m, player.z_m);
      rocks.setActive(true);
      rocks.update(player.x_m, player.z_m);
      dust?.setActive(true);
      footprints.setActive(true);
      beacons.visible = true;
      rig.setVisible(!followCamera.isFirstPerson());
      followCamera.setVehicleMode(false);
      followCamera.snap();
      hud.setVisible(true);
      hud.setMenu(false);
      hud.hideCard();
      input.setEnabled(true);
      input.requestPointerLock();
      hudClock = HUD_REFRESH_S;
      promptIntro_s = PROMPT_INTRO_S;
      hud.dockPrompts(false);
      // La primera bajada (o si se pide en el mapa) empieza colgando del paracaídas.
      if (shouldLand() || sortieMode) startLanding();
      state.landingRequested = false;
    },
    exit() {
      if (!active) return;
      hud.closeLine();
      speech.stopListening();
      hud.setCompassTarget(null);
      hud.setDust(0);
      sortie.cancel();
      sortieMode = false;
      speech.cancelSpeech();
      sound.suspend();
      if (landing) finishLanding(true);
      if (driving) toggleVehicle();
      active = false;
      input.setEnabled(false);
      hud.setVisible(false);
      terrain.patch.setActive(false);
      rocks.setActive(false);
      dust?.setActive(false);
      footprints.setActive(false);
      beacons.visible = false;
      capsuleMark.visible = false;
      truckMark.visible = false;
      rig.setVisible(true);
      state.astronaut_position_m = [player.x_m, player.z_m];
      world.setView('orbit');
    },
  };
}
