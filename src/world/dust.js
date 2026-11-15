// Aerosoles en el espacio de la escena: grano fino y penachos bajos, en un lote.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const VERTEX = /* glsl */ `
  attribute vec4 dustSeed;
  uniform float density;
  uniform float pixelScale;
  uniform vec2 windScreen;
  varying vec2 vAxis;
  varying vec3 vLayer;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.);
    float meters = max(.25, -view.z);
    float sheet = step(.76, dustSeed.x);
    float scale = mix(.019 + .033 * dustSeed.y, 4. + 7. * dustSeed.z, sheet);
    float coverage = (1. - smoothstep(45., 79., meters)) * smoothstep(.6, 2.7, meters);
    float fade = smoothstep(dustSeed.w, dustSeed.w + .14, density);
    gl_PointSize = clamp(scale * pixelScale / meters, 1., mix(4.5, 153., sheet));
    vLayer = vec3(sheet, coverage * fade, dustSeed.z);
    vAxis = windScreen;
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 tint;
  uniform float intensity;
  varying vec2 vAxis;
  varying vec3 vLayer;
  void main() {
    vec2 p = gl_PointCoord * 2. - 1.;
    vec2 ellipse = vec2(dot(p, vAxis), dot(p, vec2(-vAxis.y, vAxis.x)));
    float haze = vLayer.x;
    ellipse.y *= mix(1.22, 3.7, haze);
    float wave = sin(p.x * 7. + vLayer.z * 21.) * sin(p.y * 9. + vLayer.z * 8.);
    float alpha = 1. - smoothstep(.05, 1., dot(ellipse, ellipse) + haze * wave * .18);
    alpha *= vLayer.y * mix(.22 + intensity * .15, .019 + intensity * .074, haze);
    if (alpha < .002) discard;
    gl_FragColor = vec4(tint * mix(.82, 1.18, vLayer.z), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const WIDTH_M = 142;
const wrap = (n) => (n % WIDTH_M + WIDTH_M) % WIDTH_M - WIDTH_M / 2;

export function createDust(scene, quality, terrainAt) {
  if (!quality.dustCount) return null;
  let seed = 4242;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = quality.dustCount * 2;
  const positions = new Float32Array(count * 3);
  const seeds = Float32Array.from({ length: count * 4 }, random);
  const starts = Float32Array.from({ length: count * 2 }, () => random() * WIDTH_M);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('dustSeed', new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    density: { value: 0 },
    intensity: { value: 0 },
    pixelScale: { value: 1 },
    windScreen: { value: new THREE.Vector2(1, 0) },
    tint: { value: new THREE.Color(PALETTE.paleOchre) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  const highlight = new THREE.Color(PALETTE.paleOchre);
  points.name = 'dust';
  points.visible = false;
  points.frustumCulled = false;
  scene.add(points);
  let travelX = 0;
  let travelZ = 0;
  let elapsed_s = 0;

  return {
    setActive(active) { points.visible = active; },
    update(delta_s, camera, dust, look, pixelHeight) {
      if (!points.visible) return;
      elapsed_s += delta_s;
      travelX += dust.wind_x_ms * delta_s;
      travelZ += dust.wind_z_ms * delta_s;
      const { x: cx, y: cy, z: cz } = camera.position;
      const altitude = Math.max(0, cy - terrainAt(cx, cz));
      for (let i = 0; i < count; i++) {
        const n = i * 4;
        const phase = elapsed_s * (.52 + seeds[n+1] * .8) + seeds[n+2] * 24;
        const sheared = seeds[n] > .76;
        const speed = sheared ? .56 + seeds[n+2] * .26 : .62 + seeds[n+1] * .60;
        const x = cx + wrap(starts[i*2] + travelX * speed - cx);
        const z = cz + wrap(starts[i*2+1] + travelZ * speed - cz);
        const y = sheared
          ? .24 + seeds[n+2] * 2.1 + .22 * Math.cos(phase)
          : .12 + seeds[n+2] ** 2 * 30 + .20 * Math.sin(phase);
        position.setXYZ(i, x, terrainAt(x, z) + y + (sheared ? 0 : Math.max(0, altitude - 18)));
      }
      position.needsUpdate = true;
      const view = camera.matrixWorldInverse.elements;
      uniforms.windScreen.value.set(
        view[0] * dust.wind_x_ms + view[8] * dust.wind_z_ms,
        -(view[1] * dust.wind_x_ms + view[9] * dust.wind_z_ms),
      );
      if (uniforms.windScreen.value.lengthSq() < .004) uniforms.windScreen.value.set(1, 0);
      else uniforms.windScreen.value.normalize();
      uniforms.density.value = .035 + .97 * dust.load;
      uniforms.intensity.value = dust.gust + dust.load * .4;
      uniforms.pixelScale.value = pixelHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
      uniforms.tint.value.setHex(look.fogColor).lerp(highlight, .22 * look.daylight);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(points);
    },
  };
}
