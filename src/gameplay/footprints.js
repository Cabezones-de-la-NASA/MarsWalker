// Huellas del astronauta: una marca en el suelo cada medio paso.
// Hay un máximo fijo; al llegar a él se reutiliza la más antigua.
import * as THREE from 'three';

// [diseño] Medidas de la huella y separación entre pies, en metros.
const PRINT_LENGTH_M = 0.34;
const PRINT_WIDTH_M = 0.15;
const FOOT_OFFSET_M = 0.13;
const STEP_M = 0.72;

// -> { update(player, groundAt), setActive(bool), reset(), dispose() }
export function createFootprints(scene, maxPrints) {
  const geometry = new THREE.PlaneGeometry(PRINT_WIDTH_M, PRINT_LENGTH_M);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x2a140c, transparent: true, opacity: 0.42, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const printDust = new THREE.InstancedBufferAttribute(new Float32Array(maxPrints), 1);
  printDust.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('printDust', printDust);
  const deposit = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.dustDeposit = deposit;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float printDust; varying float vPrintDust;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrintDust = printDust;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float dustDeposit; varying float vPrintDust;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= exp(vPrintDust - dustDeposit);');
  };
  const mesh = new THREE.InstancedMesh(geometry, material, maxPrints);
  mesh.name = 'footprints';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let next = 0;
  let walked_m = 0;
  let left = true;
  let lastX_m = null;
  let lastZ_m = null;

  return {
    setActive(active) {
      mesh.visible = active;
    },
    weather(delta_s, dust) {
      deposit.value += delta_s * (dust.load * .105 + dust.gust * .36);
    },
    reset() {
      mesh.count = 0;
      deposit.value = 0;
      next = 0;
      walked_m = 0;
      lastX_m = lastZ_m = null;
    },
    // player: { x_m, z_m, yaw_rad, grounded }
    update(player, groundAt) {
      if (lastX_m === null) {
        lastX_m = player.x_m;
        lastZ_m = player.z_m;
        return;
      }
      const step_m = Math.hypot(player.x_m - lastX_m, player.z_m - lastZ_m);
      lastX_m = player.x_m;
      lastZ_m = player.z_m;
      if (!player.grounded) return;
      walked_m += step_m;
      if (walked_m < STEP_M) return;
      walked_m = 0;
      // El pie cae a un lado del eje de marcha, alternando.
      const side = left ? -1 : 1;
      left = !left;
      const x_m = player.x_m + Math.cos(player.yaw_rad) * FOOT_OFFSET_M * side;
      const z_m = player.z_m - Math.sin(player.yaw_rad) * FOOT_OFFSET_M * side;
      position.set(x_m, groundAt(x_m, z_m) + 0.015, z_m);
      quaternion.setFromAxisAngle(up, player.yaw_rad);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(next, matrix);
      printDust.setX(next, deposit.value);
      printDust.needsUpdate = true;
      next = (next + 1) % maxPrints;
      mesh.count = Math.min(mesh.count + 1, maxPrints);
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(mesh);
    },
  };
}
