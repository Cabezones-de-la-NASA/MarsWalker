// Constantes vitales del astronauta en el modo a pie.
// No calcula nada por su cuenta: junta lo caminado en tramos y se lo pasa a los modelos
// M5 a M12 con advanceMemberState (src/models/physiology/member.js).
import { defaultConfig } from '../models/physiology/defaults.js';
import { initMemberState, advanceMemberState } from '../models/physiology/member.js';
import { memberStatus } from '../models/physiology/group.js';

// [diseño] Cada cuántos segundos reales se cierra un tramo y se avanza la fisiología.
const SEGMENT_S = 1;

/**
 * createVitals({ dem, getMember, getAmbientTemp_c }) ->
 *   update(delta_s, x_m, z_m)   acumula lo caminado; devuelve true si cerró un tramo
 *   get()   -> { member, vitals (estado de member.js), status, distance_m, elapsed_s, time_scale }
 *   setTimeScale(n), reset(x_m, z_m)
 *
 * time_scale acelera el reloj de la fisiología para poder ver cambios en una demostración:
 * cada segundo real cuenta como n segundos caminando al ritmo de ese momento. Con 1 la
 * simulación va en tiempo real. La distancia mostrada es siempre la real.
 */
export function createVitals({ dem, getMember, getAmbientTemp_c }) {
  const cfg = defaultConfig();
  let member = getMember();
  let vitals = initMemberState(member, cfg);
  let time_scale = 1;
  let distance_m = 0;
  let elapsed_s = 0;
  let pending_s = 0;
  let pending_m = 0;
  let lastX_m = 0;
  let lastZ_m = 0;
  let segmentStartElev_m = 0;

  function reset(x_m, z_m) {
    member = getMember();
    vitals = initMemberState(member, cfg);
    distance_m = 0;
    elapsed_s = 0;
    pending_s = 0;
    pending_m = 0;
    lastX_m = x_m;
    lastZ_m = z_m;
    segmentStartElev_m = dem.sampleElevation_m(x_m, z_m);
  }

  return {
    reset,
    setTimeScale(next) {
      time_scale = next;
    },
    update(delta_s, x_m, z_m) {
      const step_m = Math.hypot(x_m - lastX_m, z_m - lastZ_m);
      lastX_m = x_m;
      lastZ_m = z_m;
      distance_m += step_m;
      elapsed_s += delta_s;
      pending_m += step_m;
      pending_s += delta_s;
      if (pending_s < SEGMENT_S) return false;

      // Desnivel y pendiente del tramo, del DEM (no del microrrelieve visual).
      const elev_m = dem.sampleElevation_m(x_m, z_m);
      const delta_elev_m = elev_m - segmentStartElev_m;
      const slope_deg = pending_m > 0.05 ? (Math.atan(Math.abs(delta_elev_m) / pending_m) * 180) / Math.PI : 0;
      vitals = advanceMemberState(
        {
          walking_time_h: (pending_s * time_scale) / 3600,
          slope_deg,
          delta_elev_m: delta_elev_m * time_scale,
          surface_distance_m: pending_m * time_scale,
          walk_speed_ms: pending_m / pending_s,
          ambient_temp_c: getAmbientTemp_c(),
        },
        vitals,
        member,
        cfg,
      );
      pending_s = 0;
      pending_m = 0;
      segmentStartElev_m = elev_m;
      return true;
    },
    get() {
      return { member, vitals, status: memberStatus(vitals.flags), distance_m, elapsed_s, time_scale };
    },
  };
}
