// Línea de la ruta pegada al terreno, y marcadores de inicio y destino.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// [diseño] La línea se dibuja unos metros sobre el suelo para que no parpadee contra la malla.
const LINE_LIFT_M = 6;
// [diseño] Entre dos puntos de la ruta se intercalan puntos cada tantos metros para seguir el relieve.
const SAMPLE_EVERY_M = 20;

function endpointMarker(color) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  marker.renderOrder = 9;
  marker.visible = false;
  return marker;
}

// -> { setPath(path_m), clear(), setStart(point_m | null), setGoal(point_m | null), update(camera) }
export function createRouteLine(scene, dem, renderer) {
  const material = new LineMaterial({ color: 0x4cc9f0, linewidth: 4, depthTest: false });
  let line = null;

  const start = endpointMarker(0x2bb673);
  const goal = endpointMarker(0xf2c14e);
  scene.add(start, goal);

  function place(marker, point_m) {
    marker.visible = Boolean(point_m);
    if (point_m) marker.position.set(point_m[0], dem.sampleElevation_m(point_m[0], point_m[1]), point_m[1]);
  }

  function clear() {
    if (!line) return;
    scene.remove(line);
    line.geometry.dispose();
    line = null;
  }

  return {
    clear,
    setStart: (point_m) => place(start, point_m),
    setGoal: (point_m) => place(goal, point_m),
    setPath(path_m) {
      clear();
      if (!path_m || path_m.length < 2) return;
      const positions = [];
      const push = (x_m, z_m) =>
        positions.push(x_m, dem.sampleElevation_m(x_m, z_m) + LINE_LIFT_M, z_m);
      for (let i = 0; i < path_m.length - 1; i++) {
        const [ax, az] = path_m[i];
        const [bx, bz] = path_m[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SAMPLE_EVERY_M));
        for (let s = 0; s < steps; s++) push(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
      }
      push(...path_m[path_m.length - 1]);
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      line = new Line2(geometry, material);
      line.renderOrder = 8;
      scene.add(line);
    },
    // Una vez por cuadro: grosor en píxeles y marcadores de tamaño constante en pantalla.
    update(camera) {
      renderer.getSize(material.resolution);
      for (const marker of [start, goal]) {
        if (marker.visible) marker.scale.setScalar(camera.position.distanceTo(marker.position) * 0.012);
      }
    },
  };
}
