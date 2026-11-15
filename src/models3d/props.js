// Elementos de exploración hechos con primitivas: balizas de navegación.
import * as THREE from 'three';

// [diseño] Medidas de la baliza, en metros.
const POLE_HEIGHT_M = 2.4;

/**
 * Baliza: un mástil con una luz de color en la punta. Origen en la base.
 * color: 0xRRGGBB. -> THREE.Group con userData.lamp (el material de la luz).
 */
export function createBeacon(color, { shadows = false } = {}) {
  const group = new THREE.Group();
  group.name = 'beacon';
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8f8c, roughness: 0.45, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2b, roughness: 0.8 });
  const lamp = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.12, 12), dark);
  base.position.y = 0.06;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, POLE_HEIGHT_M, 8), metal);
  pole.position.y = POLE_HEIGHT_M / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), lamp);
  head.position.y = POLE_HEIGHT_M + 0.05;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), dark);
  collar.position.y = POLE_HEIGHT_M - 0.04;
  // Tres patas para que se lea como instrumento y no como un palo.
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), metal);
    const angle = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(angle) * 0.22, 0.3, Math.sin(angle) * 0.22);
    leg.rotation.set(Math.sin(angle) * 0.6, 0, -Math.cos(angle) * 0.6);
    group.add(leg);
  }
  group.add(base, pole, collar, head);
  group.traverse((node) => {
    if (node.isMesh) node.castShadow = shadows;
  });
  group.userData.lamp = lamp;
  return group;
}

/**
 * Marca de interés: un signo de admiración fino dentro de un aro, que flota sobre algo
 * con lo que se puede interactuar. Siempre mira a la cámara.
 * -> THREE.Sprite; size_m es su alto en metros.
 */
export function createInterestMark(size_m = 0.7) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ffb45c';
  ctx.fillStyle = '#ffb45c';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(64, 32);
  ctx.lineTo(64, 74);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 94, 6, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.setScalar(size_m);
  sprite.name = 'interest-mark';
  sprite.visible = false;
  return sprite;
}
