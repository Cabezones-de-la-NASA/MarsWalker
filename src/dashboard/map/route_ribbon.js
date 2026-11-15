// Ruta dibujada como una cinta pegada al terreno, con flechas que apuntan del inicio al
// destino. Sustituye a la línea flotante: la cinta sigue el relieve y el terreno la tapa
// donde corresponde. También lleva los marcadores de inicio y destino.
import * as THREE from 'three';
import { visualGround_m } from '../../world/surface_detail.js';

export const ROUTE_COLORS = Object.freeze({ primary: 0xffb45c, compare: 0x7fc4e8, start: 0x7fd6a4, goal: 0xffd29a });

// [diseño] Segundos que tarda la ruta en dibujarse de inicio a destino.
const REVEAL_S = 0.9;
// [diseño] Velocidad a la que avanzan las flechas, en flechas por segundo.
const FLOW_ARROWS_S = 0.6;

// Medidas de la cinta según la vista. Desde la órbita tiene que ser ancha para verse;
// a pie mide menos de un metro y va a ras del suelo que se pisa.
function ribbonStyle(view, dem) {
  const span_m = Math.max(dem.size_m[0], dem.size_m[1]);
  if (view === 'surface') {
    return { width_m: 0.7, arrow_m: 1.6, lift_m: 0.04, step_m: 0.5, ground: (x, z) => visualGround_m(dem, x, z) };
  }
  // [diseño] Ancho de 1/110 del mapa y una elevación mínima sobre la malla del mapa, que
  // es más gruesa que el DEM y si no taparía la cinta en las crestas.
  const width_m = span_m / 110;
  return {
    width_m,
    arrow_m: width_m * 2.4,
    lift_m: Math.max(1.5, span_m / 2400),
    step_m: Math.max(dem.resolution_m, width_m / 3),
    ground: (x, z) => dem.sampleElevation_m(x, z),
  };
}

// Textura de una flecha (galón) que se repite a lo largo de la cinta.
function arrowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.fillRect(0, 0, size, size);
  // El galón apunta hacia +V de la textura, que es el sentido de avance de la ruta.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.14);
  ctx.lineTo(size * 0.92, size * 0.62);
  ctx.lineTo(size * 0.92, size * 0.9);
  ctx.lineTo(size * 0.5, size * 0.44);
  ctx.lineTo(size * 0.08, size * 0.9);
  ctx.lineTo(size * 0.08, size * 0.62);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Geometría de la cinta: dos vértices por muestra, a cada lado del camino, cada uno a la
 * altura del terreno en su sitio. La coordenada V crece con la distancia recorrida.
 * -> { geometry, length_m }
 */
export function buildRibbonGeometry(path_m, style) {
  // Muestras a paso fijo a lo largo del camino.
  const samples = [];
  for (let i = 0; i < path_m.length - 1; i++) {
    const [ax, az] = path_m[i];
    const [bx, bz] = path_m[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / style.step_m));
    for (let s = 0; s < steps; s++) samples.push([ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps]);
  }
  samples.push(path_m[path_m.length - 1]);

  const positions = new Float32Array(samples.length * 6);
  const uvs = new Float32Array(samples.length * 4);
  const indices = [];
  let length_m = 0;
  for (let i = 0; i < samples.length; i++) {
    const [x, z] = samples[i];
    const [px, pz] = samples[Math.max(i - 1, 0)];
    const [nx, nz] = samples[Math.min(i + 1, samples.length - 1)];
    if (i > 0) length_m += Math.hypot(x - px, z - pz);
    // Dirección de avance y su perpendicular (a la izquierda).
    let dx = nx - px;
    let dz = nz - pz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const half = style.width_m / 2;
    const lx = x + dz * half;
    const lz = z - dx * half;
    const rx = x - dz * half;
    const rz = z + dx * half;
    positions.set([lx, style.ground(lx, lz) + style.lift_m, lz, rx, style.ground(rx, rz) + style.lift_m, rz], i * 6);
    const v = length_m / style.arrow_m;
    uvs.set([0, v, 1, v], i * 4);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, length_m };
}

function endpointMarker(color) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false }),
  );
  marker.renderOrder = 9;
  marker.visible = false;
  return marker;
}

/**
 * createRouteRibbon(scene, dem) ->
 *   setPath(path_m)          ruta principal, con animación de trazado
 *   setComparePath(path_m)   segunda ruta (o null para quitarla)
 *   setView('orbit' | 'surface')   rehace las cintas con las medidas de esa vista
 *   clear(), setStart(point_m | null), setGoal(point_m | null), update(camera, delta_s)
 */
export function createRouteRibbon(scene, dem) {
  const texture = arrowTexture();
  const makeMaterial = (color, opacity) =>
    new THREE.MeshBasicMaterial({
      color, map: texture, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
      fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
  const materials = { primary: makeMaterial(ROUTE_COLORS.primary, 0.95), compare: makeMaterial(ROUTE_COLORS.compare, 0.8) };
  const paths = { primary: null, compare: null };
  const meshes = { primary: null, compare: null };
  let view = 'orbit';
  let revealed = 1;

  const start = endpointMarker(ROUTE_COLORS.start);
  const goal = endpointMarker(ROUTE_COLORS.goal);
  scene.add(start, goal);

  function place(marker, point_m) {
    marker.visible = Boolean(point_m);
    if (point_m) marker.position.set(point_m[0], dem.sampleElevation_m(point_m[0], point_m[1]), point_m[1]);
  }

  function remove(key) {
    if (!meshes[key]) return;
    scene.remove(meshes[key]);
    meshes[key].geometry.dispose();
    meshes[key] = null;
  }

  function build(key) {
    remove(key);
    const path_m = paths[key];
    if (!path_m || path_m.length < 2) return;
    const style = ribbonStyle(view, dem);
    // La ruta de comparación va algo más estrecha para que se distingan al solaparse.
    if (key === 'compare') style.width_m *= 0.7;
    const { geometry } = buildRibbonGeometry(path_m, style);
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.name = `route_${key}`;
    mesh.renderOrder = key === 'primary' ? 8 : 7;
    mesh.frustumCulled = false;
    mesh.userData.indexCount = geometry.index.count;
    scene.add(mesh);
    meshes[key] = mesh;
  }

  return {
    clear() {
      paths.primary = paths.compare = null;
      remove('primary');
      remove('compare');
    },
    hasPath: () => Boolean(paths.primary),
    setStart: (point_m) => place(start, point_m),
    setGoal: (point_m) => place(goal, point_m),
    setPath(path_m) {
      paths.primary = path_m;
      build('primary');
      if (meshes.primary) {
        revealed = 0;
        meshes.primary.geometry.setDrawRange(0, 0);
      }
    },
    setComparePath(path_m) {
      paths.compare = path_m;
      build('compare');
    },
    setView(next) {
      if (next === view) return;
      view = next;
      build('primary');
      build('compare');
      revealed = 1;
      // A pie los marcadores esféricos estorban: basta la cinta y las balizas.
      start.material.opacity = goal.material.opacity = 1;
    },
    // Una vez por cuadro: trazado animado, flechas que avanzan y marcadores de tamaño constante.
    update(camera, delta_s = 0) {
      if (meshes.primary && revealed < 1) {
        revealed = Math.min(1, revealed + delta_s / REVEAL_S);
        const eased = 1 - (1 - revealed) ** 3;
        // Triángulos completos: el recuento se redondea a múltiplos de 6 (un tramo).
        meshes.primary.geometry.setDrawRange(0, Math.ceil((meshes.primary.userData.indexCount * eased) / 6) * 6);
      }
      texture.offset.y = (texture.offset.y - FLOW_ARROWS_S * delta_s) % 1;
      const pulse = 1 + 0.12 * Math.sin(performance.now() / 320);
      const size = view === 'surface' ? 0.004 : 0.011;
      for (const marker of [start, goal]) {
        if (marker.visible) marker.scale.setScalar(camera.position.distanceTo(marker.position) * size * pulse);
      }
    },
  };
}
