// Cápsula del descenso. El origen está bajo el escudo y el eje vertical es +Y.
import * as THREE from 'three';

export const CAPSULE_RADIUS_M = 1.7;
export const CAPSULE_HEIGHT_M = 2.7;

const LOWER_SHELL = { y: 0.55, radius: 1.61 };
const UPPER_SHELL = { y: 2.22, radius: 0.65 };
const SHELL_SLOPE = (LOWER_SHELL.radius - UPPER_SHELL.radius) / (UPPER_SHELL.y - LOWER_SHELL.y);

function material(color, roughness, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function ring(parent, profile, finish) {
  const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 64), finish);
  parent.add(mesh);
  return mesh;
}

function mount(parent, angle, y) {
  const radius = LOWER_SHELL.radius - (y - LOWER_SHELL.y) * SHELL_SLOPE;
  const radial = new THREE.Group();
  const plate = new THREE.Group();
  radial.rotation.y = angle;
  plate.position.set(0, y, radius);
  plate.rotation.x = -Math.atan(SHELL_SLOPE);
  radial.add(plate);
  parent.add(radial);
  return plate;
}

function plate(parent, width, height, corner, depth, finish, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  shape.moveTo(-w + corner, -h);
  shape.lineTo(w - corner, -h);
  shape.quadraticCurveTo(w, -h, w, -h + corner);
  shape.lineTo(w, h - corner);
  shape.quadraticCurveTo(w, h, w - corner, h);
  shape.lineTo(-w + corner, h);
  shape.quadraticCurveTo(-w, h, -w, h - corner);
  shape.lineTo(-w, -h + corner);
  shape.quadraticCurveTo(-w, -h, -w + corner, -h);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: 5
  }), finish);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function createCapsule({ shadows = false } = {}) {
  const group = new THREE.Group();
  group.name = 'capsule';
  const ceramic = material(0xeae4d8, 0.58, 0.12);
  const titanium = material(0xa39e91, 0.46, 0.46);
  const dark = material(0x28282a, 0.8, 0.15);
  const shield = material(0x40352f, 0.92);
  const copper = material(0xb36136, 0.52, 0.45);
  const seal = material(0x151a22, 0.72);
  const blueGlass = material(0x21405a, 0.26, 0.3);
  const reflection = material(0x688a99, 0.42, 0.18);
  const fastener = material(0xb5b1a7, 0.42, 0.38);

  // Escudo ablativo con hombro redondeado y anillo perimetral.
  ring(group, [[0, 0.015], [1.05, 0.015], [1.34, 0.053], [1.51, 0.15],
    [1.63, 0.26], [1.69, 0.36], [1.7, 0.43]], shield);
  ring(group, [[1.69, 0.39], [1.7, 0.43], [1.68, 0.49], [1.64, 0.53], [1.61, 0.55]], copper);
  const skirtHeight = 0.98;
  const skirtRadius = LOWER_SHELL.radius - (skirtHeight - LOWER_SHELL.y) * SHELL_SLOPE;
  ring(group, [[1.61, 0.55], [skirtRadius, skirtHeight]], titanium);
  ring(group, [[skirtRadius + 0.006, 0.975], [skirtRadius - 0.003, 0.994]], dark);
  ring(group, [[skirtRadius, skirtHeight], [UPPER_SHELL.radius, UPPER_SHELL.y],
    [0.59, 2.31], [0.51, 2.35]], ceramic);

  // Collar estructural y punto superior del que salen las líneas del paracaídas.
  ring(group, [[0.51, 2.34], [0.55, 2.36], [0.54, 2.42], [0.48, 2.46]], dark);
  ring(group, [[0.48, 2.45], [0.475, 2.51], [0.395, 2.56], [0.29, 2.57], [0, 2.57]], titanium);
  ring(group, [[0.255, 2.56], [0.255, 2.6], [0.185, 2.64], [0.10, 2.64], [0.10, CAPSULE_HEIGHT_M],
    [0, CAPSULE_HEIGHT_M]], dark);

  const studs = new THREE.CylinderGeometry(0.027, 0.027, 0.018, 8);
  for (let index = 0; index < 24; index += 1) {
    const holder = mount(group, index * Math.PI / 12, 0.64);
    const stud = new THREE.Mesh(studs, fastener);
    stud.rotation.x = Math.PI / 2;
    stud.position.z = 0.009;
    holder.add(stud);
  }

  // Escotilla con marco, junta, mirilla y bisagras.
  const hatch = mount(group, Math.PI, 1.47);
  plate(hatch, 0.92, 1.12, 0.14, 0.075, dark);
  plate(hatch, 0.84, 1.04, 0.12, 0.085, titanium, 0, 0, 0.026);
  plate(hatch, 0.70, 0.90, 0.095, 0.025, ceramic, 0, 0, 0.096);
  plate(hatch, 0.58, 0.44, 0.12, 0.02, seal, 0, 0.13, 0.121);
  plate(hatch, 0.44, 0.30, 0.08, 0.012, blueGlass, 0, 0.13, 0.142);
  plate(hatch, 0.30, 0.043, 0.02, 0.002, reflection, 0, 0.22, 0.155);
  plate(hatch, 0.19, 0.055, 0.025, 0.040, dark, 0.07, -0.22, 0.12);
  for (const y of [-0.28, 0.29]) {
    plate(hatch, 0.10, 0.19, 0.03, 0.037, dark, -0.38, y, 0.108);
  }

  // Ventanillas y respiraderos visibles desde distintos ángulos.
  for (const angle of [0, Math.PI / 2, -Math.PI / 2]) {
    const windowFrame = mount(group, angle, 1.70);
    plate(windowFrame, 0.59, 0.46, 0.10, 0.065, titanium);
    plate(windowFrame, 0.49, 0.37, 0.08, 0.020, seal, 0, 0, 0.062);
    plate(windowFrame, 0.37, 0.25, 0.055, 0.012, blueGlass, 0, 0, 0.081);
    plate(windowFrame, 0.26, 0.035, 0.017, 0.002, reflection, 0, 0.067, 0.094);
  }

  for (const angle of [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4]) {
    const vent = mount(group, angle, 0.81);
    plate(vent, 0.37, 0.25, 0.045, 0.04, dark);
    for (const y of [-0.063, 0, 0.063]) {
      plate(vent, 0.24, 0.027, 0.012, 0.015, titanium, 0, y, 0.04);
    }
  }

  group.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = shadows;
      node.receiveShadow = shadows;
    }
  });
  return group;
}
