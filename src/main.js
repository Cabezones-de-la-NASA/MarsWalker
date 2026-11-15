import './styles/base.css';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

function draw() {
  const ratio = window.devicePixelRatio || 1;
  const width_px = window.innerWidth;
  const height_px = window.innerHeight;
  canvas.width = Math.round(width_px * ratio);
  canvas.height = Math.round(height_px * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  ctx.fillStyle = '#120907';
  ctx.fillRect(0, 0, width_px, height_px);
  ctx.fillStyle = '#e8a06a';
  ctx.font = `600 ${Math.max(32, Math.round(width_px / 12))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MarsWalk', width_px / 2, height_px / 2);
}

window.addEventListener('resize', draw);
draw();
