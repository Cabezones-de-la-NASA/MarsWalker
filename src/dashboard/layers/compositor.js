// Compositor de capas: mezcla las capas visibles en un canvas 2D que alimenta
// la textura del terreno. Cambiar una capa no recarga nada: solo se vuelve a pintar.
import { LAYER_DEFS } from './layer_defs.js';
import { buildLayerRaster, tintBaseRaster } from './rasters.js';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar la capa ${url}`));
    image.src = url;
  });
}

function rasterToCanvas(raster) {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.getContext('2d').putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
  return canvas;
}

// dataset: lo que devuelve loadDataset; dem: createDem(...).
// -> { canvas, getLayers(), setLayer(id, { visible, opacity }), onChange(fn) }
export async function createCompositor(dem, dataset) {
  const canvas = document.createElement('canvas');
  canvas.width = dem.cols;
  canvas.height = dem.rows;
  const ctx = canvas.getContext('2d');

  const filesById = new Map(dataset.metadata.layers.map((layer) => [layer.id, layer.file]));
  const layers = [];
  for (const def of LAYER_DEFS) {
    const file = filesById.get(def.id);
    let source = null; // imagen o canvas; se crea al encender la capa si es calculada
    let simulated = false;
    if (file) {
      // Si metadata.layers trae archivo para la capa, se usa ese archivo.
      source = await loadImage(dataset.baseUrl + file);
      // La base se tiñe con la paleta de Marte salvo que el dataset diga "tint": false
      // (por ejemplo, cuando la textura ya es un ortomosaico en color).
      const entry = dataset.metadata.layers.find((layer) => layer.id === def.id);
      if (def.id === 'base' && entry?.tint !== false) {
        const scratch = document.createElement('canvas');
        scratch.width = dem.cols;
        scratch.height = dem.rows;
        const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
        scratchCtx.drawImage(source, 0, 0, dem.cols, dem.rows);
        const pixels = scratchCtx.getImageData(0, 0, dem.cols, dem.rows).data;
        source = rasterToCanvas({ width: dem.cols, height: dem.rows, data: tintBaseRaster(pixels, dem) });
      }
    } else if (def.canBeSimulated) {
      simulated = true;
    }
    layers.push({
      def,
      source,
      simulated,
      visible: def.defaultVisible,
      opacity: def.defaultOpacity,
    });
  }

  const listeners = [];

  function render() {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      if (!layer.source) layer.source = rasterToCanvas(buildLayerRaster(layer.def.id, dem));
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.source, 0, 0, canvas.width, canvas.height);
    }
    ctx.globalAlpha = 1;
    for (const fn of listeners) fn();
  }

  render();

  return {
    canvas,
    getLayers() {
      return layers.map(({ def, simulated, visible, opacity }) => ({
        ...def,
        simulated,
        visible,
        opacity,
      }));
    },
    setLayer(id, { visible, opacity } = {}) {
      const layer = layers.find((entry) => entry.def.id === id);
      if (!layer) throw new Error(`Capa desconocida: ${id}`);
      if (visible !== undefined) layer.visible = Boolean(visible);
      if (opacity !== undefined) layer.opacity = Math.min(Math.max(Number(opacity), 0), 1);
      render();
    },
    // fn() se llama cada vez que el canvas se vuelve a pintar.
    onChange(fn) {
      listeners.push(fn);
    },
  };
}
