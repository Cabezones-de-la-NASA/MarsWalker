// Sonido del modo a pie, generado con Web Audio: no hay archivos de audio.
// Respiración en el casco, pasos, viento, motor de la camioneta, taladro y avisos.
// Todos los timbres son diseño del juego [diseño]; no pretenden ser grabaciones de Marte.

const MUTE_KEY = 'marswalk.muted';
// [diseño] Volumen general y metros entre un paso y el siguiente.
const MASTER_GAIN = 0.55;
const STRIDE_M = 0.75;

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * createSound() ->
 *   resume()                 arranca el audio (hace falta un gesto del usuario antes)
 *   update(delta_s, state)   state: { walking_m (metros andados en el cuadro), running,
 *                            heart_bpm, wind (0..1), vehicle_speed_ms (o null), falling (bool),
 *                            drilling (bool) }
 *   beep(kind)               'sample' | 'warning' | 'tick' | 'done' | 'low'
 *   thud()                   golpe del aterrizaje
 *   setMuted(bool), isMuted(), toggleMuted(), suspend()
 * Si el navegador no tiene Web Audio, todo esto no hace nada.
 */
export function createSound() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let ctx = null;
  let master = null;
  let nodes = null;
  let muted = readMuted();
  let strideLeft_m = STRIDE_M;
  let breathPhase = 0;

  function build() {
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);

    // Dos segundos de ruido blanco en bucle: de él salen viento, respiración y pasos.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = () => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start();
      return source;
    };
    const chain = (source, filterType, frequency, q = 1) => {
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(master);
      return { filter, gain };
    };

    const wind = chain(noise(), 'bandpass', 320, 0.6);
    const breath = chain(noise(), 'bandpass', 900, 1.4);
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
    motorFilter.connect(motorGain).connect(master);
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
    drill.connect(drillFilter).connect(drillGain).connect(master);
    drill.start();

    nodes = { buffer, wind, breath, motorGain, motorA, motorB, drillGain };
  }

  const ready = () => Boolean(ctx) && ctx.state === 'running';
  const glide = (param, value, time_s = 0.15) => param.setTargetAtTime(value, ctx.currentTime, time_s);

  // Un golpe corto de ruido filtrado: pasos y aterrizaje.
  function burst({ frequency, gain, decay_s, type = 'lowpass' }) {
    const source = ctx.createBufferSource();
    source.buffer = nodes.buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + decay_s);
    source.connect(filter).connect(envelope).connect(master);
    source.start(now, Math.random() * 1.5);
    source.stop(now + decay_s + 0.05);
  }

  // Un tono con envolvente: avisos.
  function tone(frequency, at_s, length_s, gain = 0.18, type = 'sine') {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const envelope = ctx.createGain();
    const start = ctx.currentTime + at_s;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length_s);
    oscillator.connect(envelope).connect(master);
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
      // Viento: un fondo suave siempre; la tormenta y la caída lo suben y lo agudizan.
      const wind = Math.min(1, Math.max(state.wind ?? 0, state.falling ? 0.55 : 0));
      glide(nodes.wind.gain.gain, 0.035 + wind * 0.5, 0.6);
      glide(nodes.wind.filter.frequency, 280 + wind * 700, 0.6);

      // Respiración: el ritmo sigue al pulso del modelo (unas 4 pulsaciones por respiración).
      const breaths_hz = Math.min(Math.max((state.heart_bpm ?? 70) / 60 / 4, 0.2), 0.75);
      breathPhase = (breathPhase + delta_s * breaths_hz) % 1;
      const inhale = breathPhase < 0.42;
      const swell = Math.sin(Math.PI * (inhale ? breathPhase / 0.42 : (breathPhase - 0.42) / 0.58));
      glide(nodes.breath.gain.gain, swell * (inhale ? 0.1 : 0.075), 0.05);
      glide(nodes.breath.filter.frequency, inhale ? 1250 : 720, 0.08);

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
