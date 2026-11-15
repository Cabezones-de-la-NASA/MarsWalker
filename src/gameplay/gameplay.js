// Modo a pie: el astronauta camina sobre el terreno del DEM en primera o tercera persona.
// Junta la locomoción (modelo puro), la cámara, el astronauta, las constantes vitales
// (modelos M5 a M12) y el visor. No importa nada del dashboard.
import * as THREE from 'three';
import { state, emit } from '../shared/state.js';
import { sampleSlope_deg } from '../models/terrain/slope.js';
import { stepPlayer, horizontalSpeed_ms, LOCOMOTION } from '../models/locomotion/kinematics.js';
import { visualGround_m } from '../world/surface_detail.js';
import { resolveRockCollision } from '../world/rock_field.js';
import { createAstronautRig } from '../models3d/explorer.js';
import { createBeacon } from '../models3d/props.js';
import { createInput } from './player/input.js';
import { createFollowCamera } from './camera/follow_camera.js';
import { createVitals } from './vitals.js';
import { createHud } from './hud/hud.js';
import { createInteraction } from './interact.js';
import { createFootprints } from './footprints.js';

// [diseño] Margen hasta el borde del mapa y radio de colisión del rover, en metros.
const MAP_MARGIN_M = 4;
const ROVER_RADIUS_M = 2.2;
// [diseño] Color de la baliza de cada tipo de punto de interés.
const BEACON_COLORS = { shelter: 0x3d8bfd, sampling: 0x2bb673, hazard: 0xe5484d };
// [diseño] Aceleraciones disponibles para el reloj de la fisiología.
const TIME_SCALES = [1, 20, 120];
const HUD_REFRESH_S = 0.15;

/**
 * createGameplay(container, { world, dem, dataset, terrain, rocks, dust }) ->
 *   enter()   baja a la superficie en state.astronaut_position_m
 *   exit()    vuelve al mapa y guarda la posición en state.astronaut_position_m
 *   isActive()
 */
export function createGameplay(container, { world, dem, dataset, terrain, rocks, dust }) {
  const points = dataset.poi?.points ?? [];
  const shelter = points.find((poi) => poi.type === 'shelter');
  const [width_m, depth_m] = dem.size_m;
  const groundAt = (x_m, z_m) => visualGround_m(dem, x_m, z_m);

  // Colisiones: rocas grandes y el rover. La malla del astronauta no interviene: el
  // cuerpo de colisión es un cilindro de radio fijo, independiente del modelo visual.
  function resolveCollision(x_m, z_m) {
    let [px, pz] = resolveRockCollision(dem, x_m, z_m, LOCOMOTION.body_radius_m);
    if (shelter) {
      const dx = px - shelter.position_m[0];
      const dz = pz - shelter.position_m[1];
      const distance_m = Math.hypot(dx, dz);
      const reach_m = ROVER_RADIUS_M + LOCOMOTION.body_radius_m;
      if (distance_m < reach_m && distance_m > 1e-6) {
        px = shelter.position_m[0] + (dx / distance_m) * reach_m;
        pz = shelter.position_m[1] + (dz / distance_m) * reach_m;
      }
    }
    return [px, pz];
  }
  const env = {
    groundAt, resolveCollision,
    halfWidth_m: width_m / 2 - MAP_MARGIN_M, halfDepth_m: depth_m / 2 - MAP_MARGIN_M,
  };

  const rig = createAstronautRig({ shadows: world.quality.shadows });
  world.scene.add(rig.object);

  // Balizas en los puntos de interés: referencias de navegación a pie.
  const beacons = new THREE.Group();
  beacons.name = 'beacons';
  beacons.visible = false;
  for (const poi of points) {
    const beacon = createBeacon(BEACON_COLORS[poi.type] ?? 0xffb45c, { shadows: world.quality.shadows });
    beacon.position.set(poi.position_m[0], groundAt(poi.position_m[0], poi.position_m[1]), poi.position_m[1]);
    beacons.add(beacon);
  }
  world.scene.add(beacons);

  const footprints = createFootprints(world.scene, world.quality.footprints);
  const interaction = createInteraction({ dem, points });
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

  const hud = createHud(container, {
    timeScales: TIME_SCALES,
    onResume: () => setPaused(false),
    onExit: () => emit('mode:request', 'dashboard'),
    onTimeScale: (scale) => vitals.setTimeScale(scale),
  });

  const input = createInput(world.renderer.domElement, {
    onInteract() {
      if (!active || paused) return;
      if (hud.isCardOpen()) {
        hud.hideCard();
        return;
      }
      if (target) hud.showCard(interaction.use(target));
    },
    onToggleView() {
      if (!active || paused) return;
      rig.setVisible(!followCamera.toggle());
    },
    onMenu() {
      if (active) setPaused(!paused);
    },
    onPointerLockChange(locked) {
      // Al soltar el cursor con Esc el navegador no entrega la tecla: se abre el menú aquí.
      if (active && !locked && !paused) setPaused(true);
    },
  });
  world.renderer.domElement.addEventListener('click', () => {
    if (active && !paused) input.requestPointerLock();
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

  world.onFrame((delta_s) => {
    if (!active) {
      // En el mapa el astronauta descansa en su sitio.
      rig.update(delta_s, { speed_ms: 0, walk_speed_ms: LOCOMOTION.walk_speed_ms, run_speed_ms: LOCOMOTION.run_speed_ms });
      return;
    }
    const look = paused ? [0, 0] : input.consumeLook();
    if (!paused) {
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
      state.astronaut_position_m = [player.x_m, player.z_m];
      target = interaction.nearest(player.x_m, player.z_m);
    }

    followCamera.update(delta_s, player, look);
    terrain.patch.update(player.x_m, player.z_m);
    rocks.update(player.x_m, player.z_m);
    dust?.update(delta_s, world.camera, state.environment?.dust_tau ?? 0.5);
    world.setShadowFocus(rig.object.position);

    hudClock += delta_s;
    if (hudClock >= HUD_REFRESH_S) {
      hudClock = 0;
      const snapshot = vitals.get();
      const yaw = followCamera.yaw;
      // Rumbo desde el norte (-Z) hacia el este (+X), en grados.
      const heading_deg = ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;
      const speed_ms = horizontalSpeed_ms(player);
      hud.setPrompt(!paused && !hud.isCardOpen() && target ? target.prompt : null);
      hud.update({
        vitals: snapshot.vitals,
        status: snapshot.status,
        time_scale: snapshot.time_scale,
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
        samples: interaction.samples().length,
        sampleSites: interaction.sampleSites,
        running: speed_ms > LOCOMOTION.walk_speed_ms + 0.05,
        firstPerson: followCamera.isFirstPerson(),
        fps: world.stats.fps,
      });
    }
  });

  return {
    isActive: () => active,
    // Referencias para las pruebas de navegador.
    debug: { getPlayer: () => player, vitals, followCamera, input, hud, interaction, rig, env },
    enter() {
      if (active) return;
      active = true;
      paused = false;
      spawn(state.astronaut_position_m ?? [0, 0]);
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
      followCamera.snap();
      hud.setVisible(true);
      hud.setMenu(false);
      hud.hideCard();
      input.setEnabled(true);
      input.requestPointerLock();
      hudClock = HUD_REFRESH_S;
    },
    exit() {
      if (!active) return;
      active = false;
      input.setEnabled(false);
      hud.setVisible(false);
      terrain.patch.setActive(false);
      rocks.setActive(false);
      dust?.setActive(false);
      footprints.setActive(false);
      beacons.visible = false;
      rig.setVisible(true);
      state.astronaut_position_m = [player.x_m, player.z_m];
      world.setView('orbit');
    },
  };
}
