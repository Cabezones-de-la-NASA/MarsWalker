// Introducción: cabina espacial con Marte 3D, música ambiental, video de transición
// y acercamiento progresivo hacia el cráter Jezero antes de revelar el dashboard.
import { emit } from '../shared/state.js';
import './intro.css';

const MARS_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const MARS_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform float uSize;
uniform mat3 uOrientation;
uniform sampler2D uMap;
out vec4 color;

void main() {
  const float pi = 3.141592653589793;
  const vec3 sun = vec3(-.45, .35, .821);
  const float diskRadius = .421;
  vec2 plane = (gl_FragCoord.xy / uSize - .5) / diskRadius;
  float r2 = dot(plane, plane);
  float radius = sqrt(r2);
  float side = clamp(.49 - .30 * plane.x + .29 * plane.y, .04, 1.0);
  float outside = max(0.0, radius - 1.0);
  float halo = (.24 * side * exp(-outside * 15.0) + .27 * side * side * exp(-outside * 39.0))
    * (1.0 - smoothstep(1.11, 1.185, radius));
  vec4 result = vec4(.88, .313, .136, halo);

  if (radius < 1.004) {
    vec3 normal = normalize(vec3(plane, sqrt(max(0.0, 1.0 - r2))));
    vec3 local = uOrientation * normal;
    vec2 uv = vec2(.128 + atan(local.z, local.x) / (2.0 * pi),
                   .5 - asin(clamp(local.y, -1.0, 1.0)) / pi);
    vec3 sampleColor = texture(uMap, uv).rgb;
    float ice = smoothstep(.78, .98, sampleColor.r) * smoothstep(.83, .98, abs(local.y));
    vec3 soil = mix(sampleColor * vec3(1.24, .99, .88) + vec3(.054, .016, .01), sampleColor * 1.03, ice);
    float day = max(0.0, dot(normal, sun));
    float shade = .092 + .98 * pow(day, .71);
    float rim = pow(1.0 - normal.z, 4.4) * pow(day, .55);
    vec3 ground = soil * shade + vec3(.37, .178, .083) * rim;
    float nightBounce = pow(max(0.0, normal.x), 2.3) * (1.0 - smoothstep(0.0, .32, day));
    ground += vec3(.018, .025, .038) * nightBounce;
    float coverage = 1.0 - smoothstep(1.0 - 1.45 / (uSize * diskRadius), 1.0, radius);
    result = mix(result, vec4(ground, 1), coverage);
  }
  color = result;
}`;

function buildIntroMarkup() {
  const root = document.createElement('div');
  root.className = 'intro-root';
  root.innerHTML = `
    <div class="intro-cabin">
      <img class="intro-cabin-image" src="/media/referencia_ventanilla_circular.png" width="740" height="494" alt="" fetchpriority="high">
      <div class="intro-glass">
        <canvas class="intro-stars" aria-hidden="true"></canvas>
        <canvas class="intro-mars" role="img" aria-label="Marte iluminado a través de la ventanilla de la nave"></canvas>
      </div>
    </div>
    <img class="intro-astronaut" src="/media/astronauta_cabina.png" width="1024" height="1536"
      alt="Una astronauta con casco y traje espacial mira Marte de perfil" fetchpriority="high">
    <div class="intro-shade" aria-hidden="true"></div>
    <button type="button" class="intro-cta" id="intro-start-trip">
      <h1>Comenzar viaje</h1>
      <p>Clic para continuar</p>
    </button>
    <button type="button" class="intro-sound-control" id="intro-sound-control" aria-pressed="false">
      <svg class="icon-sound-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      </svg>
      <svg class="icon-sound-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      </svg>
      <span class="sound-label">Activar música</span>
    </button>
    <div class="intro-brand-mark">MarsWalk</div>
    <div class="intro-transition-overlay" id="intro-transition-overlay" aria-hidden="true">
      <div class="intro-video-loader" id="intro-video-loader" aria-live="polite">Cargando viaje...</div>
      <video class="intro-trip-video" id="intro-trip-video" src="/media/space_mono.mp4" preload="auto" playsinline disablePictureInPicture></video>
      <button type="button" class="intro-skip-story" id="intro-skip-story">Saltar historia</button>
    </div>
    <audio id="intro-cabin-music" src="/media/musica_cabina.mpeg" autoplay loop></audio>
  `;
  return root;
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * Monta la introducción sobre container y gestiona la secuencia completa hasta el zoom a Jezero.
 * @param {HTMLElement} container
 * @param {object} [callbacks]
 * @param {() => Promise<void>} [callbacks.waitReady] Promesa que resuelve cuando el terreno 3D está listo.
 * @param {() => void} [callbacks.onRevealStart] Se llama cuando inicia el crossfade hacia el dashboard.
 * @param {() => void} [callbacks.onComplete] Se llama cuando la intro se desmonta por completo.
 */
export function startIntro(container, { waitReady, onRevealStart, onComplete } = {}) {
  const root = buildIntroMarkup();
  container.append(root);

  const starCanvas = root.querySelector('.intro-stars');
  const stars = starCanvas.getContext('2d');
  let planet = root.querySelector('.intro-mars');
  const glass = root.querySelector('.intro-glass');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const map = new Image();
  const turn = 2 * Math.PI;
  const baseTilt = 0.30;
  const jezeroTilt = 0.3208; // ~18.38° N (latitud de Jezero)

  let drawPlanet = null;
  let frame = 0;
  let startTime;
  let side = 0;
  let currentAngle = 0.53;
  let zoomState = null; // { start, duration, fromAngle, toAngle, revealTriggered }
  let destroyed = false;

  function drawStars() {
    const density = Math.min(devicePixelRatio, 1.5);
    const width = starCanvas.clientWidth;
    const height = starCanvas.clientHeight;
    starCanvas.width = Math.max(1, Math.round(width * density));
    starCanvas.height = Math.max(1, Math.round(height * density));
    stars.setTransform(density, 0, 0, density, 0, 0);
    let seed = 943871;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const count = Math.round((width * height) / 1250);
    for (let i = 0; i < count; i++) {
      const x = random() * width;
      const y = random() * height;
      const brightness = random();
      const bright = brightness > 0.965;
      const size = bright ? 0.9 + random() * 0.57 : 0.32 + random() * 0.49;
      const opacity = bright ? 0.71 + 0.28 * random() : 0.25 + 0.54 * random();
      if (bright) {
        const halo = stars.createRadialGradient(x, y, 0, x, y, size * 3);
        halo.addColorStop(0, 'rgba(207,222,255,.25)');
        halo.addColorStop(1, 'rgba(207,222,255,0)');
        stars.fillStyle = halo;
        stars.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
      }
      stars.fillStyle = `rgba(228,238,255,${opacity})`;
      stars.beginPath();
      stars.arc(x, y, size, 0, turn);
      stars.fill();
    }
  }

  function gpuRenderer(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, MARS_VERTEX_SHADER],
      [gl.FRAGMENT_SHADER, MARS_FRAGMENT_SHADER],
    ]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, map);
    gl.uniform1i(gl.getUniformLocation(program, 'uMap'), 0);
    const sizeUniform = gl.getUniformLocation(program, 'uSize');
    const orientation = gl.getUniformLocation(program, 'uOrientation');
    return (size, matrix) => {
      gl.viewport(0, 0, size, size);
      gl.uniform1f(sizeUniform, size);
      gl.uniformMatrix3fv(orientation, false, matrix);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
  }

  function softwareRenderer(canvas) {
    const context = canvas.getContext('2d');
    const surface = document.createElement('canvas');
    surface.width = surface.height = 272;
    const surfaceContext = surface.getContext('2d');
    const image = surfaceContext.createImageData(surface.width, surface.height);
    const atlas = document.createElement('canvas');
    const mapWidth = (atlas.width = map.naturalWidth);
    const mapHeight = (atlas.height = map.naturalHeight);
    const atlasContext = atlas.getContext('2d');
    atlasContext.drawImage(map, 0, 0);
    const pixels = atlasContext.getImageData(0, 0, mapWidth, mapHeight).data;
    const points = [];
    for (let row = 0; row < surface.height; row++) {
      for (let col = 0; col < surface.width; col++) {
        const x = (2 * (col + 0.5)) / surface.width - 1;
        const y = 1 - (2 * (row + 0.5)) / surface.height;
        const r2 = x * x + y * y;
        if (r2 >= 1) continue;
        const z = Math.sqrt(1 - r2);
        const day = Math.max(0, -0.45 * x + 0.35 * y + 0.821 * z);
        const shade = 0.092 + 0.98 * day ** 0.71;
        const rim = (1 - z) ** 4.4 * day ** 0.55;
        const night = Math.max(0, x) ** 2.3 * (1 - Math.min(1, day / 0.32));
        const position = (row * surface.width + col) * 4;
        image.data[position + 3] = Math.min(255, (1 - r2) * surface.width * 90);
        points.push({ x, y, z, shade, rim, night, position });
      }
    }
    return (size, matrix) => {
      for (const { x, y, z, shade, rim, night, position } of points) {
        const a = matrix[0] * x + matrix[3] * y + matrix[6] * z;
        const b = matrix[1] * x + matrix[4] * y + matrix[7] * z;
        const c = matrix[2] * x + matrix[5] * y + matrix[8] * z;
        const u = 0.128 + Math.atan2(c, a) / turn;
        const v = 0.5 - Math.asin(Math.min(1, Math.max(-1, b))) / Math.PI;
        const col = Math.floor((u - Math.floor(u)) * mapWidth);
        const row = Math.min(mapHeight - 1, Math.floor(v * mapHeight));
        const sample = (row * mapWidth + col) * 4;
        const ice = Math.abs(b) > 0.91 && pixels[sample] > 215;
        image.data[position] = (pixels[sample] * (ice ? 1.03 : 1.24) + (ice ? 0 : 14)) * shade + 94 * rim + 5 * night;
        image.data[position + 1] = (pixels[sample + 1] * (ice ? 1.03 : 0.99) + 4) * shade + 45 * rim + 6 * night;
        image.data[position + 2] = (pixels[sample + 2] * (ice ? 1.03 : 0.88) + 3) * shade + 21 * rim + 10 * night;
      }
      surfaceContext.putImageData(image, 0, 0);
      const center = size / 2;
      const radius = 0.421 * size;
      context.clearRect(0, 0, size, size);
      const glow = context.createRadialGradient(center, center, radius * 0.9, center, center, radius * 1.18);
      glow.addColorStop(0, 'rgba(224,81,36,.52)');
      glow.addColorStop(0.54, 'rgba(224,81,36,.16)');
      glow.addColorStop(1, 'rgba(224,81,36,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, size, size);
      context.drawImage(surface, center - radius, center - radius, radius * 2, radius * 2);
    };
  }

  function useSoftware() {
    const replacement = planet.cloneNode(false);
    planet.replaceWith(replacement);
    planet = replacement;
    drawPlanet = softwareRenderer(planet);
    resize();
  }

  function render(time) {
    frame = 0;
    if (destroyed || !drawPlanet) return;
    if (startTime === undefined) startTime = time;

    let tilt = baseTilt;

    if (zoomState) {
      const elapsed = time - zoomState.start;
      const progress = Math.min(1, elapsed / zoomState.duration);
      const eased = easeInOutSine(progress);
      currentAngle = zoomState.fromAngle + (zoomState.toAngle - zoomState.fromAngle) * eased;
      tilt = baseTilt + (jezeroTilt - baseTilt) * eased;

      // Acercamiento progresivo de la esfera hacia el cráter Jezero con desenfoque atmosférico sutil.
      const scale = 1 + Math.pow(eased, 1.4) * 5.5;
      const blurPx = progress > 0.65 ? ((progress - 0.65) / 0.35) * 6 : 0;
      planet.style.transform = `scale(${scale.toFixed(4)})`;
      planet.style.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : '';

      if (progress >= 0.42 && !zoomState.revealTriggered) {
        zoomState.revealTriggered = true;
        triggerDashboardReveal();
      }
      if (progress < 1) {
        frame = requestAnimationFrame(render);
      }
    } else {
      currentAngle = 0.53 + (motion.matches ? 0 : ((time - startTime) / 110000) * turn);
      if (!motion.matches) frame = requestAnimationFrame(render);
    }

    const c = Math.cos(currentAngle);
    const s = Math.sin(currentAngle);
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);
    drawPlanet(side, [
      c, 0, -s,
      -s * sinTilt, cosTilt, -c * sinTilt,
      s * cosTilt, sinTilt, c * cosTilt,
    ]);
  }

  function resize() {
    if (destroyed) return;
    drawStars();
    side = Math.max(1, Math.min(1152, Math.round(planet.clientWidth * Math.min(devicePixelRatio, 1.35))));
    if (planet.width !== side || planet.height !== side) planet.width = planet.height = side;
    if (!frame && drawPlanet) frame = requestAnimationFrame(render);
  }

  const resizeObserver = new ResizeObserver(resize);

  map.onload = () => {
    if (destroyed) return;
    try {
      drawPlanet = gpuRenderer(planet) || softwareRenderer(planet);
    } catch {
      useSoftware();
    }
    planet.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      useSoftware();
    }, { once: true });
    resizeObserver.observe(glass);
    resize();
  };

  drawStars();
  map.src = '/media/mars_map.jpg';

  // --- Control de audio, video de historia y transición hacia Jezero ---
  const music = root.querySelector('#intro-cabin-music');
  const control = root.querySelector('#intro-sound-control');
  const soundLabel = control.querySelector('.sound-label');
  const startTrip = root.querySelector('#intro-start-trip');
  const overlay = root.querySelector('#intro-transition-overlay');
  const video = root.querySelector('#intro-trip-video');
  const videoLoader = root.querySelector('#intro-video-loader');
  const skipStory = root.querySelector('#intro-skip-story');

  let tripStarted = false;
  let videoStarted = false;
  let videoEnding = false;
  let marsRevealed = false;
  let revealStarted = false;
  let loaderTimer = 0;
  let skipRevealTimer = 0;

  function updateControl() {
    const isMuted = music.paused || music.muted;
    soundLabel.textContent = isMuted ? 'Activar música' : 'Silenciar música';
    control.classList.toggle('is-unmuted', !isMuted);
    control.setAttribute('aria-pressed', String(!isMuted));
  }

  async function startMusic() {
    if (tripStarted || destroyed) return;
    try {
      await music.play();
    } catch {
      // Los navegadores pueden bloquear la reproducción automática hasta el primer gesto.
    }
    updateControl();
  }

  function unlockAutoplay(event) {
    if (tripStarted || destroyed) return;
    if (event.target.closest('#intro-sound-control, #intro-start-trip')) return;
    if (music.paused) {
      music.muted = false;
      startMusic();
    }
  }

  function fadeOutMusic(durationMs) {
    if (music.paused || music.muted) {
      music.pause();
      updateControl();
      return;
    }
    const initialVolume = music.volume;
    const fadeStart = performance.now();
    function step(now) {
      const progress = Math.min(1, (now - fadeStart) / durationMs);
      music.volume = Math.max(0, initialVolume * (1 - progress));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        music.pause();
        music.volume = initialVolume;
        updateControl();
      }
    }
    requestAnimationFrame(step);
  }

  function showSkipButton() {
    if (videoEnding || !videoStarted) return;
    clearTimeout(skipRevealTimer);
    skipStory.classList.add('is-visible');
  }

  function scheduleLoader() {
    if (videoEnding || marsRevealed || loaderTimer) return;
    loaderTimer = window.setTimeout(() => {
      if (!videoEnding && !marsRevealed && video.readyState < 3) {
        videoLoader.classList.add('is-visible');
      }
    }, 250);
  }

  function hideLoader() {
    clearTimeout(loaderTimer);
    loaderTimer = 0;
    videoLoader.classList.remove('is-visible');
  }

  function beginVideo() {
    if (video.classList.contains('is-playing') || videoEnding || destroyed) return;
    videoStarted = true;
    video.classList.add('is-playing');
    if (video.readyState < 3) scheduleLoader();
    video.play().catch(() => {});
    skipRevealTimer = window.setTimeout(showSkipButton, 2000);
  }

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    clearTimeout(loaderTimer);
    clearTimeout(skipRevealTimer);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', unlockAutoplay);
    document.removeEventListener('keydown', unlockAutoplay);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', startMusic);
    music.pause();
    video.pause();
    root.remove();
    emit('intro:done');
    if (onComplete) onComplete();
  }

  async function triggerDashboardReveal() {
    if (revealStarted || destroyed) return;
    revealStarted = true;
    if (waitReady) {
      await waitReady();
    }
    if (destroyed) return;
    if (onRevealStart) onRevealStart();
    root.classList.add('is-fading-out');
    const fallback = window.setTimeout(cleanup, 1750);
    root.addEventListener('transitionend', (event) => {
      if (event.target !== root || event.propertyName !== 'opacity') return;
      clearTimeout(fallback);
      cleanup();
    }, { once: true });
  }

  function startZoomToJezero() {
    if (destroyed || zoomState) return;
    root.classList.add('is-zooming-jezero');
    // Girar suavemente hacia la longitud de Jezero (~77.58° E en el mapa Viking).
    const baseTarget = 2.22;
    const turns = Math.ceil((currentAngle - baseTarget) / turn);
    const toAngle = baseTarget + turns * turn;
    const duration = motion.matches ? 400 : 3200;
    zoomState = {
      start: performance.now(),
      duration,
      fromAngle: currentAngle,
      toAngle,
      revealTriggered: false,
    };
    if (!frame && drawPlanet) frame = requestAnimationFrame(render);
  }

  function revealMarsSolo() {
    if (marsRevealed || destroyed) return;
    marsRevealed = true;
    hideLoader();
    clearTimeout(skipRevealTimer);
    video.pause();
    video.style.display = 'none';
    root.classList.add('is-mars-solo');
    resize();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.remove('is-active');
        overlay.setAttribute('aria-hidden', 'true');
        window.setTimeout(startZoomToJezero, motion.matches ? 100 : 350);
      });
    });
  }

  function finishVideoToMars() {
    if (videoEnding || destroyed) return;
    videoEnding = true;
    hideLoader();
    clearTimeout(skipRevealTimer);
    skipStory.classList.remove('is-visible');
    skipStory.disabled = true;
    video.classList.remove('is-playing');
    const initialVolume = video.volume;
    const fadeStart = performance.now();
    function fadeVideoAudio(now) {
      const progress = Math.min(1, (now - fadeStart) / 600);
      video.volume = Math.max(0, initialVolume * (1 - progress));
      if (progress < 1 && !video.paused) {
        requestAnimationFrame(fadeVideoAudio);
      }
    }
    if (!video.paused) requestAnimationFrame(fadeVideoAudio);

    const fallback = window.setTimeout(revealMarsSolo, 850);
    video.addEventListener('transitionend', (event) => {
      if (event.target !== video || event.propertyName !== 'opacity') return;
      clearTimeout(fallback);
      revealMarsSolo();
    }, { once: true });
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && videoStarted && !videoEnding) {
      finishVideoToMars();
    }
  }

  function onPageHide() {
    music.pause();
  }

  video.addEventListener('waiting', scheduleLoader);
  video.addEventListener('canplay', hideLoader);
  video.addEventListener('playing', hideLoader);
  video.addEventListener('ended', finishVideoToMars);
  skipStory.addEventListener('click', finishVideoToMars);
  overlay.addEventListener('pointermove', showSkipButton);
  overlay.addEventListener('pointerdown', showSkipButton);
  document.addEventListener('keydown', onKeyDown);

  startTrip.addEventListener('click', () => {
    if (tripStarted) return;
    tripStarted = true;
    startTrip.disabled = true;
    control.disabled = true;
    fadeOutMusic(700);
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-active');

    const fallback = window.setTimeout(beginVideo, 950);
    overlay.addEventListener('transitionend', (event) => {
      if (event.target !== overlay || event.propertyName !== 'opacity') return;
      clearTimeout(fallback);
      beginVideo();
    }, { once: true });
  });

  control.addEventListener('click', () => {
    if (tripStarted) return;
    if (music.paused) {
      music.muted = false;
      startMusic();
    } else {
      music.muted = !music.muted;
    }
  });

  music.addEventListener('playing', updateControl);
  music.addEventListener('volumechange', updateControl);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', startMusic);
  document.addEventListener('pointerdown', unlockAutoplay, { once: true });
  document.addEventListener('keydown', unlockAutoplay, { once: true });

  startMusic();

  return { destroy: cleanup };
}
