// Rocas instanciadas alrededor del astronauta. La posición la decide rock_field.js;
// aquí solo se dibujan, con cuatro formas y un material compartidos.
import * as THREE from 'three';
import { rocksNear } from './rock_field.js';
import { visualGround_m } from './surface_detail.js';
import { PALETTE } from './palette.js';

// [diseño] Radio alrededor del astronauta en el que se dibujan rocas, en metros.
const DRAW_RADIUS_M = 170;
const SHAPES = 4;

// Forma de roca: un icosaedro deformado con una semilla fija.
function rockGeometry(seed) {
  let s = seed;
  const random = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < position.count; i++) {
    // Los vértices repetidos comparten desplazamiento para que la malla no se abra.
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    if (!offsets.has(key)) offsets.set(key, 0.72 + random() * 0.5);
    const k = offsets.get(key);
    position.setXYZ(i, position.getX(i) * k, position.getY(i) * k, position.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// -> { group, update(x_m, z_m), setActive(bool), dispose() }
export function createRocks(scene, dem, quality) {
  const group = new THREE.Group();
  group.name = 'rocks';
  group.visible = false;
  // El color de cada roca va por instancia; el material es blanco para no oscurecerlo.
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, flatShading: true });
  const perShape = Math.ceil(quality.rockCount / SHAPES);
  const meshes = [];
  for (let k = 0; k < SHAPES; k++) {
    const mesh = new THREE.InstancedMesh(rockGeometry(1337 + k * 97), material, perShape);
    mesh.count = 0;
    mesh.castShadow = quality.shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // las instancias se reparten alrededor de la cámara
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(perShape * 3), 3);
    group.add(mesh);
    meshes.push(mesh);
  }
  scene.add(group);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const positionVec = new THREE.Vector3();
  const color = new THREE.Color();
  const dark = new THREE.Color(PALETTE.rustRed);
  const light = new THREE.Color(PALETTE.terracotta);
  let lastX_m = Infinity;
  let lastZ_m = Infinity;

  function rebuild(x_m, z_m) {
    lastX_m = x_m;
    lastZ_m = z_m;
    const counts = new Array(SHAPES).fill(0);
    for (const rock of rocksNear(dem, x_m, z_m, DRAW_RADIUS_M, quality.rockCount)) {
      const index = counts[rock.kind];
      if (index >= perShape) continue;
      // Medio enterrada en el suelo que se pisa.
      const ground_m = visualGround_m(dem, rock.x_m, rock.z_m);
      positionVec.set(rock.x_m, ground_m + rock.radius_m * rock.squash * 0.35, rock.z_m);
      euler.set(rock.tilt, rock.yaw, rock.tilt * 0.6);
      quaternion.setFromEuler(euler);
      scale.set(rock.radius_m, rock.radius_m * rock.squash, rock.radius_m * (0.8 + rock.squash * 0.3));
      matrix.compose(positionVec, quaternion, scale);
      meshes[rock.kind].setMatrixAt(index, matrix);
      color.copy(dark).lerp(light, (rock.yaw / (Math.PI * 2)) * 0.8);
      meshes[rock.kind].setColorAt(index, color);
      counts[rock.kind] += 1;
    }
    meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    });
  }

  return {
    group,
    setActive(active) {
      group.visible = active;
      if (!active) lastX_m = lastZ_m = Infinity;
    },
    // Las instancias se recolocan cuando el astronauta se ha movido lo bastante.
    update(x_m, z_m) {
      if (Math.hypot(x_m - lastX_m, z_m - lastZ_m) < DRAW_RADIUS_M * 0.25) return;
      rebuild(x_m, z_m);
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      material.dispose();
      scene.remove(group);
    },
  };
}
