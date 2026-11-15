// Perfil de elevación en canvas. Los tramos de más de 25° se pintan en rojo.
import { MAX_SAFE_SLOPE_DEG } from '../../models/terrain/slope.js';

const COLOR_SAFE = '#4cc9f0';
const COLOR_UNSAFE = '#e5484d';
const COLOR_AXIS = '#cdb9aa';

// samples: salida de buildElevationProfile. Devuelve cuántos tramos pasan de 25°.
export function drawElevationProfile(canvas, samples) {
  const ratio = window.devicePixelRatio || 1;
  const width_px = canvas.clientWidth || 280;
  const height_px = canvas.clientHeight || 120;
  canvas.width = Math.round(width_px * ratio);
  canvas.height = Math.round(height_px * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width_px, height_px);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = COLOR_AXIS;

  if (!samples || samples.length < 2) {
    ctx.textAlign = 'center';
    ctx.fillText('Sin ruta', width_px / 2, height_px / 2);
    return 0;
  }

  const pad = { left: 44, right: 8, top: 8, bottom: 18 };
  const total_m = samples[samples.length - 1].distance_m || 1;
  let min_m = Infinity;
  let max_m = -Infinity;
  for (const { elevation_m } of samples) {
    min_m = Math.min(min_m, elevation_m);
    max_m = Math.max(max_m, elevation_m);
  }
  if (max_m - min_m < 1) {
    min_m -= 0.5;
    max_m += 0.5;
  }
  const plot_w = width_px - pad.left - pad.right;
  const plot_h = height_px - pad.top - pad.bottom;
  const px = (distance_m) => pad.left + (distance_m / total_m) * plot_w;
  const py = (elevation_m) => pad.top + (1 - (elevation_m - min_m) / (max_m - min_m)) * plot_h;

  // Ejes: elevación mínima y máxima, distancia total.
  ctx.strokeStyle = 'rgba(205, 185, 170, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left + 0.5, pad.top + 0.5, plot_w, plot_h);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${max_m.toFixed(0)} m`, pad.left - 4, pad.top);
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${min_m.toFixed(0)} m`, pad.left - 4, pad.top + plot_h);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('0', pad.left, pad.top + plot_h + 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${(total_m / 1000).toFixed(2)} km`, pad.left + plot_w, pad.top + plot_h + 4);

  // Relleno suave bajo la curva.
  ctx.beginPath();
  ctx.moveTo(px(0), py(min_m));
  for (const sample of samples) ctx.lineTo(px(sample.distance_m), py(sample.elevation_m));
  ctx.lineTo(px(total_m), py(min_m));
  ctx.closePath();
  ctx.fillStyle = 'rgba(76, 201, 240, 0.15)';
  ctx.fill();

  // La curva, tramo a tramo, en rojo donde la pendiente pasa del límite seguro.
  let unsafe = 0;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 1; i < samples.length; i++) {
    const isUnsafe = samples[i].slope_deg > MAX_SAFE_SLOPE_DEG;
    if (isUnsafe) unsafe++;
    ctx.strokeStyle = isUnsafe ? COLOR_UNSAFE : COLOR_SAFE;
    ctx.beginPath();
    ctx.moveTo(px(samples[i - 1].distance_m), py(samples[i - 1].elevation_m));
    ctx.lineTo(px(samples[i].distance_m), py(samples[i].elevation_m));
    ctx.stroke();
  }
  return unsafe;
}
