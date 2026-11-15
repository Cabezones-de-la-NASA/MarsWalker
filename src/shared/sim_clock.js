// Reloj de simulación mínimo.
//
// Idea tomada de la arquitectura de NOS3 (https://github.com/nasa/nos3), sin copiar código:
// allí un único "time driver" reparte el tiempo como una cuenta de ticks, cada simulador
// convierte ticks en tiempo absoluto (inicio + ticks x duración del tick), y los modelos de
// hardware piden sus datos de entorno a un "data provider" (alimentado por el motor de
// dinámica 42) en vez de calcularlos ellos mismos.
// Aquí, lo mismo en pequeño:
//   - el reloj es la única fuente de tiempo: cuenta ticks de dt_s segundos;
//   - la hora local y la longitud solar se derivan de la cuenta de ticks, no se acumulan;
//   - los sistemas (sol, clima, salud) se suscriben y reciben cada tick en el orden en que
//     se registraron, de modo que el entorno se actualiza antes que quien lo consume.
import { MARS_DAY_H, MARS_YEAR_SOLS } from './constants.js';

// [diseño] Ticks como mucho por llamada a advance(): evita un bucle largo tras una pausa.
const MAX_TICKS_PER_ADVANCE = 600;

/**
 * createSimClock({ dt_s, ls_deg, ltst_h })
 *   dt_s     segundos simulados por tick
 *   ls_deg   longitud solar inicial, en grados
 *   ltst_h   hora solar local inicial, de 0 a 24
 * -> { tick(n), advance(seconds), getTime(), setStart({ ls_deg, ltst_h }), subscribe(fn), reset() }
 *
 * Aproximaciones [diseño]: un sol dura MARS_DAY_H horas (tabla 2.3) y equivale a 24 horas
 * locales; L_s avanza a ritmo constante, 360° cada MARS_YEAR_SOLS soles.
 */
export function createSimClock({ dt_s = 60, ls_deg = 0, ltst_h = 12 } = {}) {
  let start = { ls_deg, ltst_h };
  let ticks = 0;
  const subscribers = [];
  const sol_s = MARS_DAY_H * 3600;

  function getTime() {
    const elapsed_s = ticks * dt_s;
    const sols = elapsed_s / sol_s;
    return {
      ticks,
      dt_s,
      elapsed_s,
      sol: Math.floor(sols + start.ltst_h / 24),
      ltst_h: (((start.ltst_h + sols * 24) % 24) + 24) % 24,
      ls_deg: (((start.ls_deg + (sols * 360) / MARS_YEAR_SOLS) % 360) + 360) % 360,
    };
  }

  function tick(n = 1) {
    for (let i = 0; i < n; i++) {
      ticks += 1;
      const time = getTime();
      for (const fn of subscribers) fn(time);
    }
    return getTime();
  }
  let pending_s = 0;

  return {
    getTime,
    // Avanza n ticks; tras cada uno llama a los suscriptores en orden de registro.
    tick,
    // Avanza un tiempo simulado cualquiera, en segundos. Lo que no llena un tick se guarda
    // para la próxima llamada, así el reloj sigue contando ticks enteros.
    // Devuelve cuántos ticks dio. [diseño] Tope de MAX_TICKS_PER_ADVANCE por llamada.
    advance(seconds) {
      pending_s += Math.max(0, seconds);
      const n = Math.min(Math.floor(pending_s / dt_s), MAX_TICKS_PER_ADVANCE);
      pending_s -= n * dt_s;
      if (n > 0) tick(n);
      return n;
    },
    // fn(time) con time = getTime(). Devuelve una función para darse de baja.
    subscribe(fn) {
      subscribers.push(fn);
      return () => {
        const index = subscribers.indexOf(fn);
        if (index >= 0) subscribers.splice(index, 1);
      };
    },
    // Cambia el instante inicial y pone la cuenta de ticks a cero.
    setStart(next) {
      start = { ...start, ...next };
      ticks = 0;
      pending_s = 0;
    },
    reset() {
      ticks = 0;
      pending_s = 0;
    },
  };
}
