// Sonido del modo a pie. Mezcla grabaciones (ambiente, respiración, esfuerzo) con sonidos
// generados con Web Audio (pasos, avisos, motor, taladro, arena, latido).
// Las grabaciones están en public/media/audio/ y las aportó el equipo.
// Los niveles y timbres son diseño del juego [diseño].
import { BASE_URL } from '../../shared/base_url.js';

const MUTE_KEY = 'marswalk.muted';
const VOLUME_KEY = 'marswalk.volumes';
// [diseño] Volumen general, metros entre un paso y el siguiente, y segundos corriendo
// hasta que la respiración pasa a ser de sofoco.
const MASTER_GAIN = 0.8;
const STRIDE_M = 0.75;
const WINDED_AFTER_S = 3;

// Tres grupos con su volumen (de 0 a 1). La respiración empieza baja.
export const VOLUME_CHANNELS = Object.freeze(['ambience', 'breath', 'effects']);
const DEFAULT_VOLUMES = Object.freeze({ ambience: 0.6, breath: 0.25, effects: 0.7 });

const FILES = Object.freeze({
  ambientNeutral: 'ambient_neutral.mp3',
  ambientStorm: 'ambient_storm.mp3',
  breathNeutral: 'breath_neutral.mp3',
  breathRunning: 'breath_running.mp3',
  effortJump: 'effort_jump.mp3',
});

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function readVolumes() {
  const volumes = { ...DEFAULT_VOLUMES };
  try {
    const saved = JSON.parse(window.localStorage.getItem(VOLUME_KEY) ?? '{}');
    for (const channel of VOLUME_CHANNELS) {
      if (Number.isFinite(saved[channel])) volumes[channel] = Math.min(Math.max(saved[channel], 0), 1);
    }
  } catch {
    // Sin almacenamiento o dato roto: valores por defecto.
  }
  return volumes;
}

/**
 * createSound() ->
 *   resume()                 arranca el audio (hace falta un gesto del usuario antes)
 *   update(delta_s, state)   state: { walking_m (metros andados en el cuadro), running,
 *                            wind (0..1), vehicle_speed_ms (o null), falling (bool),
 *                            drilling (bool), agitation (0..1: sofoco y latido) }
 *   jump()                   esfuerzo al saltar
 *   beep(kind)               'sample' | 'warning' | 'tick' | 'done' | 'low'
 *   thud()                   golpe del aterrizaje
 *   getVolumes(), setVolume(channel, value)   channel: 'ambience' | 'breath' | 'effects'
 *   setMuted(bool), isMuted(), toggleMuted(), suspend()
 * Si el navegador no tiene Web Audio, todo esto no hace nada.
 */
export function createSound() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let ctx = null;
  let master = null;
  let nodes = null;
  let muted = readMuted();
  const volumes = readVolumes();
  const buffers = {};
  let strideLeft_m = STRIDE_M;
  let gustPhase = 0;
  let beatLeft_s = 0;
  let running_s = 0;
  let winded = 0; // 0 respiración tranquila, 1 sofoco

  // Una grabación en bucle con su propia ganancia, dentro de un grupo.
  function loop(name, group) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(group);
    const start = () => {
      if (!buffers[name] || gain.started) return;
      gain.started = true;
      const source = ctx.createBufferSource();
      source.buffer = buffers[name];
      source.loop = true;
      source.connect(gain);
      source.start();
    };
    return { gain, start };
  }

  async function load(name) {
    try {
      const response = await fetch(`${BASE_URL}media/audio/${FILES[name]}`);
      if (!response.ok) throw new Error(String(response.status));
      buffers[name] = await ctx.decodeAudioData(await response.arrayBuffer());
      nodes?.loops[name]?.start();
    } catch (error) {
      console.warn(`Sonido: no se pudo cargar ${FILES[name]}`, error);
    }
  }

  function build() {
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    const groups = {};
    for (const channel of VOLUME_CHANNELS) {
      groups[channel] = ctx.createGain();
      groups[channel].gain.value = volumes[channel];
      groups[channel].connect(master);
    }

    // Ruido blanco en bucle: de él salen los pasos, la arena y el viento de la caída.
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const filteredNoise = (filterType, frequency, q, group) => {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      source.start();
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(group);
      return { filter, gain };
    };
    const fallWind = filteredNoise('bandpass', 420, 0.6, groups.ambience);
    // Arena contra el casco: ruido agudo que solo se oye en la tormenta.
    const sand = filteredNoise('highpass', 3200, 0.7, groups.effects);

    // Motor eléctrico: dos ondas cerca una de otra, para que zumbe.
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0;
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 600;
    const motorA = ctx.createOscillator();
    const motorB = ctx.createOscillator();
    motorA.type = 'sawtooth';
    motorB.type = 'triangle';
    motorA.connect(motorFilter);
    motorB.connect(motorFilter);
    motorFilter.connect(motorGain).connect(groups.effects);
    motorA.start();
    motorB.start();
    // Taladro del rover al tomar una muestra.
    const drillGain = ctx.createGain();
    drillGain.gain.value = 0;
    const drill = ctx.createOscillator();
    drill.type = 'sawtooth';
    drill.frequency.value = 95;
    const drillFilter = ctx.createBiquadFilter();
    drillFilter.type = 'bandpass';
    drillFilter.frequency.value = 700;
    drill.connect(drillFilter).connect(drillGain).connect(groups.effects);
    drill.start();

    const loops = {
      ambientNeutral: loop('ambientNeutral', groups.ambience),
      ambientStorm: loop('ambientStorm', groups.ambience),
      breathNeutral: loop('breathNeutral', groups.breath),
      breathRunning: loop('breathRunning', groups.breath),
    };
    nodes = { noiseBuffer, groups, loops, fallWind, sand, motorGain, motorA, motorB, drillGain };
    for (const name of Object.keys(FILES)) load(name);
  }

  const ready = () => Boolean(ctx) && ctx.state === 'running';
  const glide = (param, value, time_s = 0.15) => param.setTargetAtTime(value, ctx.currentTime, time_s);

  // Un golpe corto de ruido filtrado: pasos y aterrizaje.
  function burst({ frequency, gain, decay_s, type = 'lowpass' }) {
    const source = ctx.createBufferSource();
    source.buffer = nodes.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + decay_s);
    source.connect(filter).connect(envelope).connect(nodes.groups.effects);
    source.start(now, Math.random() * 1.5);
    source.stop(now + decay_s + 0.05);
  }

  // Un tono con envolvente: avisos y latido.
  function tone(frequency, at_s, length_s, gain = 0.18, type = 'sine') {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const envelope = ctx.createGain();
    const start = ctx.currentTime + at_s;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length_s);
    oscillator.connect(envelope).connect(nodes.groups.effects);
    oscillator.start(start);
    oscillator.stop(start + length_s + 0.05);
  }

  const BEEPS = {
    sample: [[660, 0, 0.12], [990, 0.12, 0.22]],
    warning: [[440, 0, 0.18], [440, 0.26, 0.18], [440, 0.52, 0.3]],
    tick: [[880, 0, 0.06]],
    done: [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.34]],
    low: [[330, 0, 0.25], [262, 0.28, 0.35]],
  };

  return {
    isMuted: () => muted,
    setMuted(next) {
      muted = next;
      if (master) glide(master.gain, muted ? 0 : MASTER_GAIN, 0.05);
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Sin almacenamiento: no se recuerda.
      }
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },
    getVolumes: () => ({ ...volumes }),
    setVolume(channel, value) {
      if (!VOLUME_CHANNELS.includes(channel)) return;
      volumes[channel] = Math.min(Math.max(value, 0), 1);
      if (nodes) glide(nodes.groups[channel].gain, volumes[channel], 0.05);
      try {
        window.localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
      } catch {
        // Sin almacenamiento: no se recuerda.
      }
    },
    resume() {
      if (!AudioContextClass) return;
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    // Al volver al mapa: silencio total sin perder el contexto.
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
    update(delta_s, state) {
      if (!ready()) return;
      const wind = Math.min(Math.max(state.wind ?? 0, 0), 1);
      // Ambiente: la grabación tranquila da paso a la de tormenta según el polvo.
      glide(nodes.loops.ambientNeutral.gain.gain, 1 - wind * 0.85, 0.8);
      glide(nodes.loops.ambientStorm.gain.gain, wind, 0.8);
      // Viento de la caída en cápsula (generado) y arena en la tormenta, a rachas.
      gustPhase += delta_s;
      const gust = 0.7 + 0.3 * Math.sin(gustPhase * 1.7) * Math.sin(gustPhase * 0.61 + 1.3);
      glide(nodes.fallWind.gain.gain, state.falling ? 0.3 * gust : 0, 0.4);
      glide(nodes.sand.gain.gain, wind > 0.25 ? (wind - 0.25) * 0.16 * gust : 0, 0.3);

      // Respiración: tranquila por defecto; tras unos segundos corriendo, o con la tormenta
      // encima, pasa a la de sofoco, y vuelve poco a poco al parar.
      const agitation = Math.min(Math.max(state.agitation ?? 0, 0), 1);
      running_s = state.running ? running_s + delta_s : Math.max(0, running_s - delta_s * 0.6);
      const target = Math.max(running_s >= WINDED_AFTER_S ? 1 : 0, agitation > 0.5 ? 1 : 0);
      winded += (target - winded) * Math.min(1, delta_s * (target > winded ? 0.8 : 0.3));
      const inside = state.falling ? 0 : 1; // dentro de la cápsula no se oye la respiración
      glide(nodes.loops.breathNeutral.gain.gain, (1 - winded) * inside, 0.3);
      glide(nodes.loops.breathRunning.gain.gain, winded * inside, 0.3);
      if (agitation > 0.3) {
        beatLeft_s -= delta_s;
        if (beatLeft_s <= 0) {
          // Latido doble, más rápido cuanto mayor la agitación.
          beatLeft_s = 60 / (95 + agitation * 55);
          tone(52, 0, 0.16, 0.22 * agitation);
          tone(46, 0.14, 0.18, 0.15 * agitation);
        }
      }

      // Pasos: uno cada STRIDE_M metros andados.
      if (state.walking_m > 0) {
        strideLeft_m -= state.walking_m;
        if (strideLeft_m <= 0) {
          strideLeft_m += STRIDE_M;
          burst({ frequency: state.running ? 520 : 380, gain: state.running ? 0.3 : 0.22, decay_s: 0.16 });
        }
      }

      // Motor: el tono sube con la velocidad.
      const speed_ms = Math.abs(state.vehicle_speed_ms ?? 0);
      const driving = state.vehicle_speed_ms !== null && state.vehicle_speed_ms !== undefined;
      glide(nodes.motorGain.gain, driving ? 0.05 + Math.min(speed_ms / 12, 1) * 0.09 : 0, 0.2);
      glide(nodes.motorA.frequency, 55 + speed_ms * 9, 0.2);
      glide(nodes.motorB.frequency, 56.5 + speed_ms * 9.1, 0.2);

      glide(nodes.drillGain.gain, state.drilling ? 0.12 : 0, 0.05);
    },
    // Esfuerzo al saltar: una sola vez por salto, en el grupo de la respiración.
    jump() {
      if (!ready() || !buffers.effortJump) return;
      const source = ctx.createBufferSource();
      source.buffer = buffers.effortJump;
      const gain = ctx.createGain();
      gain.gain.value = 1.6; // por encima de la respiración de fondo, que va baja
      source.connect(gain).connect(nodes.groups.breath);
      source.start();
    },
    beep(kind) {
      if (!ready()) return;
      for (const [frequency, at_s, length_s] of BEEPS[kind] ?? BEEPS.tick) tone(frequency, at_s, length_s);
    },
    thud() {
      if (!ready()) return;
      burst({ frequency: 140, gain: 0.9, decay_s: 0.5 });
      tone(58, 0, 0.45, 0.5);
    },
  };
}
