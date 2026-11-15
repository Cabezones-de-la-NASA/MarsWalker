// Malla del terreno: un plano de 256 x 256 segmentos desplazado con el DEM.
import * as THREE from 'three';

export const TERRAIN_SEGMENTS = 256;

// texture: THREE.Texture con el mismo encuadre que el DEM (norte arriba).
export function createTerrainMesh(dem, texture) {
  const [width_m, depth_m] = dem.size_m;
  const geometry = new THREE.PlaneGeometry(width_m, depth_m, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  // El plano nace en XY; al girarlo queda en XZ con su borde superior hacia -Z (norte),
  // así la fila 0 de la textura coincide con la fila 0 del DEM.
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, dem.sampleElevation_m(position.getX(i), position.getZ(i)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  return mesh;
}
