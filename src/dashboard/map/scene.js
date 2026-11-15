// Escena orbital: renderer, cámara, luces y bucle.
import * as THREE from 'three';

// -> { scene, camera, renderer, onFrame(fn), start(), stop() }
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
  scene.add(new THREE.HemisphereLight(0xffe8d6, 0x3a2418, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
  sun.position.set(-1, 1.2, -1);
  scene.add(sun);

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
