// Polvo en suspensión: motas discretas que derivan alrededor de la cámara.
// Solo existe en los perfiles medio y alto. Es ambiente visual, no un dato de viento.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [diseño] Lado del volumen de polvo y velocidad de deriva.
const BOX_M = 36;
const DRIFT_MS = 0.35;

// -> { update(delta_s, camera, dust_tau), setActive(bool), dispose() } o null si el perfil no lo usa.
export function createDust(scene, quality) {
  if (!quality.dustCount) return null;
  let seed = 4242;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(quality.dustCount * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = (random() - 0.5) * BOX_M;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: PALETTE.paleOchre,
    size: 0.05,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'dust';
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  return {
    setActive(active) {
      points.visible = active;
    },
    update(delta_s, camera, dust_tau) {
      if (!points.visible) return;
      const attribute = geometry.attributes.position;
      const half = BOX_M / 2;
      for (let i = 0; i < attribute.count; i++) {
        // Deriva lenta hacia el este con una caída mínima; al salir del volumen, reaparece.
        let x = attribute.getX(i) + DRIFT_MS * delta_s;
        let y = attribute.getY(i) - 0.03 * delta_s;
        if (x > half) x -= BOX_M;
        if (y < -half) y += BOX_M;
        attribute.setXY(i, x, y);
      }
      attribute.needsUpdate = true;
      points.position.copy(camera.position);
      // Más polvo en el aire, motas más visibles.
      material.opacity = Math.min(0.2 + dust_tau * 0.12, 0.7);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(points);
    },
  };
}
