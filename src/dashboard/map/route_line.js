// Línea de la ruta pegada al terreno, una segunda línea para comparar, y los marcadores
// de inicio y destino.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// [diseño] La línea se dibuja unos metros sobre el suelo para que no parpadee contra la malla.
const LINE_LIFT_M = 6;
// [diseño] Entre dos puntos de la ruta se intercalan puntos cada tantos metros para seguir el relieve.
const SAMPLE_EVERY_M = 20;
// [diseño] Segundos que tarda la ruta en dibujarse de inicio a destino.
const REVEAL_S = 0.9;

export const ROUTE_COLORS = Object.freeze({ primary: 0xffb45c, compare: 0x7fc4e8, start: 0x7fd6a4, goal: 0xffd29a });

function endpointMarker(color) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false }),
  );
  marker.renderOrder = 9;
  marker.visible = false;
  return marker;
}

/**
 * createRouteLine(scene, dem, renderer) ->
 *   setPath(path_m)          ruta principal, con animación de trazado
 *   setComparePath(path_m)   segunda ruta (o null para quitarla)
 *   clear(), setStart(point_m | null), setGoal(point_m | null), update(camera, delta_s)
 */
export function createRouteLine(scene, dem, renderer) {
  const materials = {
    primary: new LineMaterial({ color: ROUTE_COLORS.primary, linewidth: 4, depthTest: false, fog: false }),
    compare: new LineMaterial({ color: ROUTE_COLORS.compare, linewidth: 3, depthTest: false, fog: false, dashed: false }),
  };
  const lines = { primary: null, compare: null };
  let revealed = 1; // fracción de la ruta principal ya dibujada

  const start = endpointMarker(ROUTE_COLORS.start);
  const goal = endpointMarker(ROUTE_COLORS.goal);
  scene.add(start, goal);

  function place(marker, point_m) {
    marker.visible = Boolean(point_m);
    if (point_m) marker.position.set(point_m[0], dem.sampleElevation_m(point_m[0], point_m[1]), point_m[1]);
  }

  function remove(key) {
    if (!lines[key]) return;
    scene.remove(lines[key]);
    lines[key].geometry.dispose();
    lines[key] = null;
  }

  function build(key, path_m, lift_m) {
    remove(key);
    if (!path_m || path_m.length < 2) return;
    const positions = [];
    const push = (x_m, z_m) => positions.push(x_m, dem.sampleElevation_m(x_m, z_m) + lift_m, z_m);
    for (let i = 0; i < path_m.length - 1; i++) {
      const [ax, az] = path_m[i];
      const [bx, bz] = path_m[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SAMPLE_EVERY_M));
      for (let s = 0; s < steps; s++) push(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
    }
    push(...path_m[path_m.length - 1]);
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const line = new Line2(geometry, materials[key]);
    line.renderOrder = key === 'primary' ? 8 : 7;
    line.userData.segments = positions.length / 3 - 1;
    scene.add(line);
    lines[key] = line;
  }

  return {
    clear() {
      remove('primary');
      remove('compare');
    },
    setStart: (point_m) => place(start, point_m),
    setGoal: (point_m) => place(goal, point_m),
    setPath(path_m) {
      build('primary', path_m, LINE_LIFT_M);
      if (lines.primary) {
        revealed = 0;
        lines.primary.geometry.instanceCount = 0;
      }
    },
    setComparePath(path_m) {
      build('compare', path_m, LINE_LIFT_M * 0.6);
    },
    // Una vez por cuadro: grosor en píxeles, trazado animado y marcadores de tamaño constante.
    update(camera, delta_s = 0) {
      renderer.getSize(materials.primary.resolution);
      materials.compare.resolution.copy(materials.primary.resolution);
      if (lines.primary && revealed < 1) {
        revealed = Math.min(1, revealed + delta_s / REVEAL_S);
        // Curva de salida suave: rápido al principio, frena al llegar.
        const eased = 1 - (1 - revealed) ** 3;
        lines.primary.geometry.instanceCount = Math.ceil(lines.primary.userData.segments * eased);
      }
      const pulse = 1 + 0.12 * Math.sin(performance.now() / 320);
      for (const marker of [start, goal]) {
        if (marker.visible) marker.scale.setScalar(camera.position.distanceTo(marker.position) * 0.011 * pulse);
      }
    },
  };
}
