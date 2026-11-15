// Mundo 3D compartido por el dashboard y el modo a pie: renderer, escena, cámara, luces,
// cielo, atmósfera y bucle. 1 unidad = 1 metro; +X este, -Z norte, +Y arriba.
import * as THREE from 'three';
import { createSky } from './sky.js';
import { atmosphereLook } from './atmosphere_look.js';

// [diseño] Mitad del lado del volumen de sombras que sigue al astronauta, en metros.
const SHADOW_HALF_SIZE_M = 60;

/**
 * createWorld(container, quality) ->
 *   scene, camera, renderer, quality, sunLight, headlamp
 *   setEnvironment({ sunDirection, sun, weather })   Sol de M16 y clima de M17
 *   setView('orbit' | 'surface')                      cambia bruma, sombras y planos de cámara
 *   setShadowFocus(position)                          centra las sombras (modo a pie)
 *   onFrame(fn), start(), stop(), stats
 */
export function createWorld(container, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('world-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 1, 1);
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 400_000);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.3);
  scene.add(hemi, sunLight, sunLight.target, fill);

  if (quality.shadows) {
    sunLight.castShadow = false; // solo en la vista a pie
    sunLight.shadow.mapSize.setScalar(quality.shadowMapSize);
    const cam = sunLight.shadow.camera;
    cam.left = cam.bottom = -SHADOW_HALF_SIZE_M;
    cam.right = cam.top = SHADOW_HALF_SIZE_M;
    cam.near = 1;
    cam.far = 600;
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.06;
  }

  // Linterna del casco: va con la cámara y solo se enciende a pie, de noche o en crepúsculo.
  const headlamp = new THREE.SpotLight(0xeaf4ff, 0, 70, Math.PI / 4.4, 0.4, 1.3);
  camera.add(headlamp, headlamp.target);
  headlamp.target.position.set(0, 0, -20);

  const sky = createSky(scene);

  let view = 'orbit';
  let environment = {
    sunDirection: [-0.4, 0.8, -0.4],
    sun: { elevation_deg: 55, phase: 'day' },
    weather: { dust_tau: 0.5, storm: false },
  };
  const shadowFocus = new THREE.Vector3();
  const sunVector = new THREE.Vector3();

  function applyEnvironment() {
    const surface = view === 'surface';
    const look = atmosphereLook({
      elevation_deg: environment.sun.elevation_deg,
      phase: environment.sun.phase,
      dust_tau: environment.weather.dust_tau,
      storm: environment.weather.storm,
      surface,
    });
    const [sx, sy, sz] = environment.sunDirection;
    sunVector.set(sx, Math.max(sy, 0.03), sz).normalize();

    sunLight.color.setHex(look.sunColor);
    sunLight.intensity = look.sunIntensity;
    hemi.color.setHex(look.hemiSky);
    hemi.groundColor.setHex(look.hemiGround);
    hemi.intensity = look.hemiIntensity;
    fill.intensity = look.fillIntensity;
    fill.position.set(-sunVector.x, 0.35, -sunVector.z);
    headlamp.intensity = look.headlamp * 260;
    renderer.toneMappingExposure = look.exposure;

    scene.fog.color.setHex(look.fogColor);
    if (surface) {
      scene.fog.near = look.fogNear_m;
      scene.fog.far = look.fogFar_m;
    } else {
      // Desde la órbita la bruma solo funde el borde lejano del mapa.
      scene.fog.near = camera.far * 0.5;
      scene.fog.far = camera.far;
    }
    renderer.setClearColor(look.fogColor, 1);
    world.look = look;
    placeSun();
  }

  function placeSun() {
    // La luz direccional se coloca respecto al foco de sombras para que el mapa de sombras
    // cubra siempre los alrededores del astronauta.
    sunLight.target.position.copy(shadowFocus);
    sunLight.position.copy(shadowFocus).addScaledVector(sunVector, 300);
  }

  function resize() {
    const width_px = container.clientWidth || window.innerWidth;
    const height_px = container.clientHeight || window.innerHeight;
    renderer.setSize(width_px, height_px);
    camera.aspect = width_px / height_px;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  const frameCallbacks = [];
  const timer = new THREE.Timer();
  const stats = { fps: 0, frame_ms: 0, triangles: 0, calls: 0 };
  let frames = 0;
  let statsTime_s = 0;

  const world = {
    scene,
    camera,
    renderer,
    quality,
    sunLight,
    headlamp,
    look: null,
    stats,
    get view() {
      return view;
    },
    setEnvironment(next) {
      environment = { ...environment, ...next };
      applyEnvironment();
    },
    setView(next) {
      view = next;
      const surface = view === 'surface';
      // A pie hace falta precisión de centímetros cerca de la cámara.
      camera.near = surface ? 0.08 : 5;
      camera.far = surface ? 60_000 : 400_000;
      camera.fov = surface ? 62 : 50;
      camera.updateProjectionMatrix();
      if (quality.shadows) sunLight.castShadow = surface;
      applyEnvironment();
    },
    setShadowFocus(position) {
      shadowFocus.copy(position);
      placeSun();
    },
    // fn(delta_s, elapsed_s) se llama antes de dibujar cada cuadro.
    onFrame(fn) {
      frameCallbacks.push(fn);
      return () => {
        const index = frameCallbacks.indexOf(fn);
        if (index >= 0) frameCallbacks.splice(index, 1);
      };
    },
    start() {
      renderer.setAnimationLoop((now_ms) => {
        timer.update(now_ms);
        // Se limita el paso para que una pausa larga no dispare la simulación.
        const delta_s = Math.min(timer.getDelta(), 0.1);
        for (const fn of [...frameCallbacks]) fn(delta_s, timer.getElapsed());
        // El disco solar usa la dirección real (puede estar bajo el horizonte).
        sky.update(camera, environment.sunDirection, world.look);
        renderer.render(scene, camera);
        frames += 1;
        statsTime_s += delta_s;
        if (statsTime_s >= 0.5) {
          stats.fps = frames / statsTime_s;
          stats.frame_ms = (statsTime_s / frames) * 1000;
          stats.triangles = renderer.info.render.triangles;
          stats.calls = renderer.info.render.calls;
          frames = 0;
          statsTime_s = 0;
        }
      });
    },
    stop() {
      renderer.setAnimationLoop(null);
    },
  };

  resize();
  world.setView('orbit');
  return world;
}
