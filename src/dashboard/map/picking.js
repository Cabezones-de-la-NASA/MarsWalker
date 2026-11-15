// Clic sobre la escena: marcadores de POI primero, terreno después.
// Elevación y pendiente salen siempre de src/models/terrain/, no de la malla.
import * as THREE from 'three';
import { emit } from '../../shared/state.js';
import { sampleSlope_deg } from '../../models/terrain/slope.js';

// Un clic que arrastra más que esto se considera movimiento de cámara.
const DRAG_TOLERANCE_PX = 5;

// markers: THREE.Object3D[] con userData.poi (opcional).
export function createPicking({ camera, domElement, mesh, dem, markers = [] }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;

  function onPointerDown(event) {
    down = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event) {
    if (!down) return;
    const moved_px = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved_px > DRAG_TOLERANCE_PX || event.button !== 0) return;

    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const markerHit = raycaster.intersectObjects(markers, false)[0];
    if (markerHit) {
      emit('poi:click', markerHit.object.userData.poi);
      return;
    }
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit) return;
    const x_m = hit.point.x;
    const z_m = hit.point.z;
    emit('terrain:click', {
      x_m,
      z_m,
      elevation_m: dem.sampleElevation_m(x_m, z_m),
      slope_deg: sampleSlope_deg(dem, x_m, z_m),
    });
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointerup', onPointerUp);

  return {
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointerup', onPointerUp);
    },
  };
}
