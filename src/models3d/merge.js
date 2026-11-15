// Reduce llamadas de dibujo uniendo mallas que comparten material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEPT_ATTRIBUTES = ['position', 'normal', 'uv'];

// Copia de la geometría con solo posición, normal y uv, sin índice y ya transformada.
function prepared(geometry, matrix) {
  let copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(copy.attributes)) {
    if (!KEPT_ATTRIBUTES.includes(name)) copy.deleteAttribute(name);
  }
  if (!copy.attributes.normal) copy.computeVertexNormals();
  if (!copy.attributes.uv) {
    copy.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(copy.attributes.position.count * 2), 2));
  }
  copy.morphAttributes = {};
  copy.applyMatrix4(matrix);
  return copy;
}

function isPlainMesh(node) {
  return node.isMesh && !node.isInstancedMesh && !node.isSkinnedMesh && !Array.isArray(node.material);
}

/**
 * Une, dentro de cada grupo, las mallas hijas directas que comparten material.
 * Las articulaciones (los grupos) no cambian, así que el modelo se sigue pudiendo animar.
 */
export function mergeMeshesPerGroup(root) {
  const groups = [];
  root.traverse((node) => {
    if (!node.isMesh) groups.push(node);
  });
  for (const group of groups) {
    const byMaterial = new Map();
    for (const child of [...group.children]) {
      if (!isPlainMesh(child) || child.children.length > 0) continue;
      if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
      byMaterial.get(child.material).push(child);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix();
        return prepared(mesh.geometry, mesh.matrix);
      });
      const merged = new THREE.Mesh(mergeGeometries(parts, false), material);
      merged.castShadow = meshes.some((mesh) => mesh.castShadow);
      merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
      for (const part of parts) part.dispose();
      for (const mesh of meshes) group.remove(mesh);
      group.add(merged);
    }
  }
  return root;
}

/**
 * Une todas las mallas de un modelo estático por material, en el espacio del propio modelo.
 * El resultado ya no tiene jerarquía: sirve para modelos que no se animan.
 */
export function mergeStaticModel(root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMaterial = new Map();
  root.traverse((node) => {
    if (!isPlainMesh(node)) return;
    if (!byMaterial.has(node.material)) byMaterial.set(node.material, []);
    byMaterial.get(node.material).push(prepared(node.geometry, new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld)));
  });
  const merged = new THREE.Group();
  merged.name = root.name;
  for (const [material, parts] of byMaterial) {
    merged.add(new THREE.Mesh(parts.length > 1 ? mergeGeometries(parts, false) : parts[0], material));
    if (parts.length > 1) for (const part of parts) part.dispose();
  }
  return merged;
}
