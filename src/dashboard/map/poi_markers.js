// Marcadores de puntos de interés sobre el terreno.
import * as THREE from 'three';

// [diseño] Color y letra de cada tipo de punto (sección 3: shelter | sampling | hazard).
export const POI_STYLES = {
  shelter: { color: '#3d8bfd', letter: 'R', label: 'Refugio' },
  sampling: { color: '#2bb673', letter: 'M', label: 'Muestreo' },
  hazard: { color: '#e5484d', letter: '!', label: 'Peligro' },
};
const FALLBACK_STYLE = { color: '#9aa0a6', letter: '?', label: 'Punto' };

// [diseño] Tamaño del marcador en pantalla (fracción del alto) y altura sobre el suelo.
const MARKER_SCREEN_SIZE = 0.055;
const MARKER_LIFT_M = 30;

function markerTexture(style) {
  const size_px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size_px;
  canvas.height = size_px;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size_px / 2, size_px / 2, size_px / 2 - 8, 0, Math.PI * 2);
  ctx.fillStyle = style.color;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.letter, size_px / 2, size_px / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// points: lista "points" de poi.json. -> { group, markers } ; cada marcador lleva userData.poi.
export function createPoiMarkers(scene, dem, points) {
  const group = new THREE.Group();
  group.name = 'poi';
  const textures = new Map();
  const markers = [];

  for (const poi of points) {
    const style = POI_STYLES[poi.type] || FALLBACK_STYLE;
    if (!textures.has(style)) textures.set(style, markerTexture(style));
    const material = new THREE.SpriteMaterial({
      map: textures.get(style),
      sizeAttenuation: false, // mismo tamaño en pantalla a cualquier distancia
      depthTest: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    const [x_m, z_m] = poi.position_m;
    sprite.position.set(x_m, dem.sampleElevation_m(x_m, z_m) + MARKER_LIFT_M, z_m);
    sprite.scale.set(MARKER_SCREEN_SIZE, MARKER_SCREEN_SIZE, 1);
    sprite.renderOrder = 10;
    sprite.userData.poi = poi;
    group.add(sprite);
    markers.push(sprite);
  }
  scene.add(group);
  return { group, markers };
}
