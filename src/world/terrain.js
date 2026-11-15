// Terreno: malla del mapa completo, parche de detalle alrededor del astronauta y material.
// El DEM es la fuente de verdad de la forma; aquí solo se dibuja.
import * as THREE from 'three';
import { visualGround_m } from './surface_detail.js';

export const TERRAIN_SEGMENTS = 256;

// Detalle fino del regolito, añadido al material estándar: variación de color y de
// rugosidad a escala de centímetros y metros, que se desvanece con la distancia.
function addRegolithDetail(material, strength) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vWorldPos;
        uniform float uDetailStrength;
        float mwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float mwNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(mwHash(i), mwHash(i + vec2(1.0, 0.0)), u.x),
                     mix(mwHash(i + vec2(0.0, 1.0)), mwHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          float mwDist = distance(cameraPosition, vWorldPos);
          float mwNear = 1.0 - smoothstep(25.0, 420.0, mwDist);
          float mwMid = 1.0 - smoothstep(600.0, 5000.0, mwDist);
          float grain = mwNoise(vWorldPos.xz * 9.0) * 0.5 + mwNoise(vWorldPos.xz * 2.1) * 0.5;
          float patches = mwNoise(vWorldPos.xz * 0.11) * 0.6 + mwNoise(vWorldPos.xz * 0.027) * 0.4;
          float tone = 1.0 + uDetailStrength * ((grain - 0.5) * 0.34 * mwNear + (patches - 0.5) * 0.30 * mwMid);
          diffuseColor.rgb *= tone;
          // Vetas más oscuras de roca expuesta donde el ruido grueso es alto.
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.62, 0.58),
            uDetailStrength * smoothstep(0.62, 0.9, patches) * 0.45 * mwMid);
        }`,
      );
  };
  // Clave de caché distinta para que three no reutilice el programa sin el detalle.
  material.customProgramCacheKey = () => `marswalk-regolith-${strength}`;
}

export function createTerrainMaterial(texture, quality) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.96, metalness: 0 });
  addRegolithDetail(material, quality.terrainDetail);
  return material;
}

// Malla del mapa completo: un plano de 256 x 256 segmentos desplazado con el DEM.
export function createTerrainMesh(dem, material) {
  const [width_m, depth_m] = dem.size_m;
  const geometry = new THREE.PlaneGeometry(width_m, depth_m, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  // El plano nace en XY; al girarlo queda en XZ con su borde superior hacia -Z (norte),
  // así la fila 0 de la textura coincide con la fila 0 del DEM.
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, dem.sampleElevation_m(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  return mesh;
}

// [diseño] En la vista a pie la malla del mapa baja estos metros para no asomar entre los
// triángulos, mucho más finos, del parche de detalle.
const MAP_MESH_DROP_M = 1.2;

/**
 * Parche de detalle: una malla densa que sigue al astronauta y dibuja el DEM con el
 * microrrelieve. Comparte textura y material con el mapa, con las mismas coordenadas UV.
 * -> { mesh, setActive(bool), update(x_m, z_m) }
 */
export function createLocalPatch(dem, material, terrainMesh, quality) {
  const size_m = quality.patchSize_m;
  const segments = quality.patchSegments;
  const step_m = size_m / segments;
  const [width_m, depth_m] = dem.size_m;

  const geometry = new THREE.PlaneGeometry(size_m, size_m, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  // Posición de cada vértice respecto al centro del parche, antes de moverlo.
  const local = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    local[i * 2] = position.getX(i);
    local[i * 2 + 1] = position.getZ(i);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain_patch';
  mesh.receiveShadow = true;
  mesh.visible = false;
  mesh.frustumCulled = false;

  let centerX_m = Infinity;
  let centerZ_m = Infinity;

  function rebuild(cx_m, cz_m) {
    centerX_m = cx_m;
    centerZ_m = cz_m;
    const half_m = size_m / 2;
    for (let i = 0; i < position.count; i++) {
      const x_m = cx_m + local[i * 2];
      const z_m = cz_m + local[i * 2 + 1];
      // El microrrelieve se apaga hacia el borde para empalmar con el mapa.
      const edge = Math.max(Math.abs(local[i * 2]), Math.abs(local[i * 2 + 1])) / half_m;
      const fade = 1 - THREE.MathUtils.smoothstep(edge, 0.82, 1);
      const base_m = dem.sampleElevation_m(x_m, z_m);
      position.setXYZ(i, x_m, base_m + (visualGround_m(dem, x_m, z_m) - base_m) * fade, z_m);
      uv.setXY(i, (x_m + width_m / 2) / width_m, 1 - (z_m + depth_m / 2) / depth_m);
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return {
    mesh,
    size_m,
    setActive(active) {
      mesh.visible = active;
      terrainMesh.position.y = active ? -MAP_MESH_DROP_M : 0;
      if (!active) centerX_m = centerZ_m = Infinity;
    },
    // Se recalcula cuando el astronauta se aleja del centro; el centro se ajusta a la
    // retícula de vértices para que el suelo no "nade" al moverse.
    update(x_m, z_m) {
      if (Math.max(Math.abs(x_m - centerX_m), Math.abs(z_m - centerZ_m)) < size_m * 0.18) return false;
      rebuild(Math.round(x_m / step_m) * step_m, Math.round(z_m / step_m) * step_m);
      return true;
    },
  };
}
