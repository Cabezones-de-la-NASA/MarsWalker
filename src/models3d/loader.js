// Carga de modelos glTF con caché: cada archivo se descarga y se interpreta una sola vez.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { BASE_URL } from '../shared/base_url.js';

// Los modelos de NASA 3D Resources vienen comprimidos con Draco. El decodificador es el
// que distribuye three.js (examples/jsm/libs/draco/gltf), copiado a public/draco/.
const draco = new DRACOLoader();
draco.setDecoderPath(`${BASE_URL}draco/`);
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const cache = new Map(); // url -> Promise<THREE.Object3D>

// Devuelve una copia independiente de la escena del modelo (comparte geometría y materiales).
export function loadModel(url) {
  if (!cache.has(url)) {
    const pending = loader.loadAsync(url).then((gltf) => gltf.scene);
    // Si falla, no se guarda el error: el siguiente intento vuelve a descargar.
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return cache.get(url).then((scene) => scene.clone(true));
}

/**
 * Envuelve un modelo para que mida lo que mide el objeto real y tenga el origen en el suelo.
 *   size_m   medida real, en metros
 *   axis     'longest_horizontal' (la mayor de X y Z) o 'height' (Y)
 * -> THREE.Group con el origen centrado en X y Z y apoyado en Y = 0.
 */
export function normalizeModel(object, { size_m, axis }) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const measured = axis === 'height' ? size.y : Math.max(size.x, size.z);
  const scale = size_m / measured;

  object.position.set(-center.x, -box.min.y, -center.z);
  const group = new THREE.Group();
  group.add(object);
  group.scale.setScalar(scale);
  group.userData.scale = scale;
  group.userData.size_m = size.multiplyScalar(scale).toArray();
  return group;
}
