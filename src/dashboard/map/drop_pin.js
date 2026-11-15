// Indicador de aterrizaje: marca dónde bajará el astronauta y se arrastra sobre el mapa.
// La posición viaja en state.astronaut_position_m, que es lo que lee el modo a pie.
import * as THREE from 'three';
import { state, emit } from '../../shared/state.js';

// [diseño] Tamaño del indicador como fracción de la distancia a la cámara, para que se
// vea igual de grande a cualquier zoom.
const SCALE_PER_DISTANCE = 0.017;
const PIN_COLOR = 0xffb45c;

/**
 * createDropPin({ scene, camera, domElement, mesh, dem, controls, isEnabled, onMove }) ->
 *   group, update(), setVisible(bool), setPosition(x_m, z_m), isDragging()
 * onMove(x_m, z_m, dragging): se llama al arrastrar y al soltar.
 */
export function createDropPin({ scene, camera, domElement, mesh, dem, controls, isEnabled = () => true, onMove }) {
  const group = new THREE.Group();
  group.name = 'drop-pin';
  const solid = new THREE.MeshBasicMaterial({ color: PIN_COLOR, depthTest: false, transparent: true });
  const glow = new THREE.MeshBasicMaterial({
    color: PIN_COLOR, depthTest: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  // Punta hacia el suelo, cabeza redonda, anillo en el suelo y haz de luz.
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 20), solid);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), solid);
  head.position.y = 1.9;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), solid);
  ring.rotation.x = -Math.PI / 2;
  const pulse = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.3, 40), glow);
  pulse.rotation.x = -Math.PI / 2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8, 1, true), glow);
  beam.position.y = 6.4;
  // Zona de agarre, invisible y generosa.
  const grip = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  grip.position.y = 1.2;
  group.add(ring, pulse, beam, tip, head, grip);
  for (const child of group.children) child.renderOrder = 20;
  scene.add(group);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let dragging = false;
  let hovering = false;
  let clock = 0;

  function setPosition(x_m, z_m) {
    group.position.set(x_m, dem.sampleElevation_m(x_m, z_m), z_m);
  }
  const start = state.astronaut_position_m ?? [0, 0];
  setPosition(start[0], start[1]);

  function aim(event) {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }
  const overPin = (event) => {
    aim(event);
    return raycaster.intersectObject(grip, false).length > 0;
  };

  // En fase de captura: si se agarra el indicador, ni la cámara ni el clic de ruta se enteran.
  function onPointerDown(event) {
    if (!group.visible || !isEnabled() || event.button !== 0 || !overPin(event)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    dragging = true;
    controls.enabled = false;
    domElement.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', onRelease);
  }

  function onDrag(event) {
    aim(event);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit) return;
    const half = [dem.size_m[0] / 2, dem.size_m[1] / 2];
    const x_m = Math.min(Math.max(hit.point.x, -half[0]), half[0]);
    const z_m = Math.min(Math.max(hit.point.z, -half[1]), half[1]);
    setPosition(x_m, z_m);
    onMove?.(x_m, z_m, true);
  }

  function onRelease() {
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointerup', onRelease);
    dragging = false;
    controls.enabled = isEnabled();
    domElement.style.cursor = '';
    state.astronaut_position_m = [group.position.x, group.position.z];
    onMove?.(group.position.x, group.position.z, false);
    emit('astronaut:moved', state.astronaut_position_m);
  }

  function onHover(event) {
    if (dragging || !group.visible || !isEnabled()) return;
    const over = overPin(event);
    if (over !== hovering) {
      hovering = over;
      domElement.style.cursor = over ? 'grab' : '';
    }
  }

  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointermove', onHover);

  return {
    group,
    isDragging: () => dragging,
    setPosition,
    setVisible(visible) {
      group.visible = visible;
      if (!visible) domElement.style.cursor = '';
    },
    // Una vez por cuadro: tamaño constante en pantalla y pulso del anillo.
    update(delta_s) {
      if (!group.visible) return;
      clock += delta_s;
      group.scale.setScalar(Math.max(camera.position.distanceTo(group.position) * SCALE_PER_DISTANCE, 1));
      const wave = (clock * 0.7) % 1;
      pulse.scale.setScalar(1 + wave * 1.6);
      glow.opacity = 0.4 * (1 - wave) + 0.12;
      head.position.y = 1.9 + Math.sin(clock * 2.4) * 0.12;
    },
  };
}
