// Escena orbital: renderer, cámara, luces y bucle.
import * as THREE from 'three';

// -> { scene, camera, renderer, setSun(direction, daylight), onFrame(fn), start(), stop() }
export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a0f0b);

  // 1 unidad = 1 metro: el plano lejano cubre un DEM de decenas de kilómetros.
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 400_000);

  // Luz de cielo suave más un sol direccional desde el noroeste (-X, -Z), como el sombreado.
  const sky = new THREE.HemisphereLight(0xffe8d6, 0x3a2418, 1.1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
  sun.position.set(-1, 1.2, -1);
  scene.add(sun);

  // [diseño] Intensidades de la luz. De noche queda una luz de cielo mínima para que el
  // mapa siga siendo legible: es una ayuda de interfaz, no un dato físico.
  const SUN_MAX_INTENSITY = 2.6;
  const SKY_MAX_INTENSITY = 1.1;
  const SKY_MIN_INTENSITY = 0.35;

  // direction: vector unitario hacia el Sol en los ejes de la escena (M16, sunDirection).
  // daylight: de 0 (noche) a 1 (pleno día).
  function setSun(direction, daylight) {
    const level = Math.min(Math.max(daylight, 0), 1);
    sun.position.set(direction[0], Math.max(direction[1], 0.02), direction[2]);
    sun.intensity = SUN_MAX_INTENSITY * level;
    sky.intensity = SKY_MIN_INTENSITY + (SKY_MAX_INTENSITY - SKY_MIN_INTENSITY) * level;
  }

  function resize() {
    const width_px = container.clientWidth || window.innerWidth;
    const height_px = container.clientHeight || window.innerHeight;
    renderer.setSize(width_px, height_px);
    camera.aspect = width_px / height_px;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const frameCallbacks = [];
  const clock = new THREE.Clock();

  return {
    scene,
    camera,
    renderer,
    setSun,
    // fn(delta_s) se llama antes de dibujar cada cuadro.
    onFrame(fn) {
      frameCallbacks.push(fn);
    },
    start() {
      clock.start();
      renderer.setAnimationLoop(() => {
        const delta_s = clock.getDelta();
        for (const fn of frameCallbacks) fn(delta_s);
        renderer.render(scene, camera);
      });
    },
    stop() {
      renderer.setAnimationLoop(null);
    },
  };
}
