// Cielo de Marte: domo con gradiente y halo solar, disco solar, estrellas y Fobos.
// Adaptado del prototipo anterior del equipo (scene.js) a esta arquitectura.
import * as THREE from 'three';

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 sunDirection;
  uniform vec3 mieColor;
  uniform float mieIntensity;
  uniform float opacity;
  uniform float stormLoad;
  uniform vec2 dustFlow;
  varying vec3 vDirection;

  float hazeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hazeNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hazeHash(i), hazeHash(i + vec2(1., 0.)), f.x),
      mix(hazeHash(i + vec2(0., 1.)), hazeHash(i + vec2(1.)), f.x), f.y);
  }

  void main() {
    vec3 dir = normalize(vDirection);
    // Gradiente vertical: horizonte polvoriento hacia un cenit más oscuro.
    float h = clamp(dir.y * 1.5 + 0.1, 0.0, 1.0);
    vec3 sky = mix(horizonColor, topColor, pow(h, 0.62));
    // Banda de bruma pegada al horizonte.
    float band = exp(-abs(dir.y) * 9.0);
    sky = mix(sky, horizonColor * 1.06, band * 0.55);
    // Bajo el horizonte, el domo se funde con el color de la bruma.
    sky = mix(sky, horizonColor * 0.82, 1.0 - smoothstep(-0.25, 0.0, dir.y));
    if (stormLoad > 0.01) {
      vec2 p = dir.xz * 5. + vec2(dir.y * 3.5, dir.y * 7.0) + dustFlow;
      float gusts = hazeNoise(p) * .64 + hazeNoise(p * 2.29 + 16.) * .36;
      float bottom = smoothstep(-.20, -.015, dir.y) * (1. - smoothstep(.05, .49, dir.y));
      sky = mix(sky, horizonColor * (.78 + gusts * .38), bottom * stormLoad * .84);
    }
    // Dispersión hacia delante alrededor del Sol.
    float cosTheta = max(dot(dir, normalize(sunDirection)), 0.0);
    sky += mieColor * (pow(cosTheta, 32.0) + 0.28 * pow(cosTheta, 6.0)) * mieIntensity;
    gl_FragColor = vec4(sky, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function radialTexture(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStars(count) {
  // Posiciones con una semilla fija: el cielo es el mismo en cada carga.
  let seed = 20260411;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tints = [[1, 1, 1], [0.84, 0.91, 1], [1, 0.93, 0.87], [1, 0.82, 0.65]];
  for (let i = 0; i < count; i++) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = Math.cos(phi);
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
    const tint = tints[Math.floor(random() * tints.length)];
    const brightness = 0.45 + random() * 0.55;
    colors.set(tint.map((c) => c * brightness), i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    map: radialTexture(32, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(220,235,255,0.6)'], [1, 'rgba(0,0,0,0)']]),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  return new THREE.Points(geometry, material);
}

// -> { group, update(camera, sunDirection, look) }
// El cielo se dibuja siempre alrededor de la cámara y detrás de todo lo demás.
export function createSky(scene, { starCount = 2500 } = {}) {
  const group = new THREE.Group();
  group.name = 'sky';
  group.renderOrder = -10;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 24),
    new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: {
        topColor: { value: new THREE.Color() },
        horizonColor: { value: new THREE.Color() },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        mieColor: { value: new THREE.Color() },
        mieIntensity: { value: 0.8 },
        opacity: { value: 1 },
        stormLoad: { value: 0 },
        dustFlow: { value: new THREE.Vector2() },
      },
      side: THREE.BackSide,
      // Opaco y sin profundidad: se dibuja el primero y todo lo demás lo tapa.
      depthWrite: false,
      depthTest: false,
      transparent: false,
      fog: false,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;

  const stars = createStars(starCount);
  stars.renderOrder = -9;
  stars.frustumCulled = false;

  const sunDisc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture(128, [
        [0, 'rgba(255,255,255,1)'], [0.1, 'rgba(255,244,224,0.96)'],
        [0.26, 'rgba(255,198,145,0.42)'], [0.55, 'rgba(135,175,235,0.12)'], [1, 'rgba(0,0,0,0)'],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  sunDisc.renderOrder = -8;

  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture(64, [[0, '#f2ece4'], [0.5, '#c5beb4'], [0.85, '#6a645d'], [1, 'rgba(30,28,25,0)']]),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    }),
  );
  moon.renderOrder = -8;

  group.add(dome, stars, sunDisc, moon);
  scene.add(group);

  // [diseño] Fobos queda fijo en el cielo: su órbita no está modelada.
  const MOON_DIRECTION = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
  const direction = new THREE.Vector3();
  let lastSky_s = 0;

  return {
    group,
    update(camera, sunDirection, look, elapsed_s, weather) {
      // Radio dentro del plano lejano de la cámara para que nada se recorte.
      const radius = camera.far * 0.45;
      group.position.copy(camera.position);
      dome.scale.setScalar(radius);
      stars.scale.setScalar(radius * 0.98);

      direction.set(sunDirection[0], sunDirection[1], sunDirection[2]).normalize();
      const u = dome.material.uniforms;
      u.topColor.value.setHex(look.skyTop);
      u.horizonColor.value.setHex(look.skyHorizon);
      u.mieColor.value.setHex(look.mieColor);
      u.mieIntensity.value = look.mieIntensity;
      u.sunDirection.value.copy(direction);
      u.opacity.value = look.skyOpacity;
      u.stormLoad.value = look.stormLoad;
      const delta_s = Math.min(.12, Math.max(0, elapsed_s - lastSky_s));
      lastSky_s = elapsed_s;
      u.dustFlow.value.x -= delta_s * (weather.wind_x_ms ?? 0) * .0018;
      u.dustFlow.value.y -= delta_s * (weather.wind_z_ms ?? 0) * .0018;

      sunDisc.position.copy(direction).multiplyScalar(radius * 0.9);
      sunDisc.scale.setScalar(radius * 0.033);
      sunDisc.material.color.setHex(look.sunColor);
      // El disco se apaga al cruzar el horizonte.
      sunDisc.material.opacity = THREE.MathUtils.clamp((direction.y + 0.06) / 0.1, 0, 1) * (look.sunDisc ?? 1);
      // Las estrellas giran muy despacio: da vida al fondo sin distraer.
      stars.rotation.y += 0.00012;

      stars.material.opacity = look.starOpacity;
      moon.position.copy(MOON_DIRECTION).multiplyScalar(radius * 0.9);
      moon.scale.setScalar(radius * 0.035);
      moon.material.opacity = look.moonOpacity;
    },
  };
}
