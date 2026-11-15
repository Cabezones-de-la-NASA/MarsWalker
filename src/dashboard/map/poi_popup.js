// Popup de un punto de interés: nombre, descripción, fuente, imagen y distancia al astronauta.
// Todo el texto entra con textContent; nada de poi.json se interpreta como HTML.
import './poi_popup.css';
import { POI_STYLES } from './poi_markers.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Solo se aceptan enlaces https.
function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// Distancia horizontal en línea recta, en metros.
export function distance_m(a_m, b_m) {
  return Math.hypot(a_m[0] - b_m[0], a_m[1] - b_m[1]);
}

function formatDistance(value_m) {
  return value_m >= 1000 ? `${(value_m / 1000).toFixed(2)} km` : `${Math.round(value_m)} m`;
}

// -> { show(poi, astronaut_position_m), hide() }
export function createPoiPopup(container) {
  const popup = el('aside', 'panel poi-popup');
  popup.hidden = true;
  container.append(popup);

  function hide() {
    popup.hidden = true;
  }

  function show(poi, astronaut_position_m) {
    popup.replaceChildren();
    const style = POI_STYLES[poi.type];

    const close = el('button', 'poi-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar');
    close.addEventListener('click', hide);

    const kind = el('div', 'poi-kind', style ? style.label : poi.type);
    if (style) kind.style.color = style.color;
    popup.append(close, kind, el('h2', 'poi-name', poi.name));

    const pageUrl = poi.image_url ? safeUrl(poi.image_url) : null;
    const imageSrc = poi.image_src ? safeUrl(poi.image_src) : null;
    if (imageSrc) {
      const image = el('img', 'poi-image');
      image.alt = `Imagen de referencia de ${poi.name}`;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove());
      image.src = imageSrc;
      popup.append(image);
    }
    if (pageUrl || poi.image_credit) {
      const credit = el('div', 'poi-credit');
      if (poi.image_credit) credit.append(`Crédito: ${poi.image_credit}. `);
      if (pageUrl) {
        const link = el('a', null, 'Ver la imagen en NASA Photojournal');
        link.href = pageUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        credit.append(link);
      }
      popup.append(credit);
    }

    popup.append(el('p', 'poi-description', poi.description));

    const distance = el('div', 'poi-distance');
    distance.textContent = astronaut_position_m
      ? `Distancia al astronauta: ${formatDistance(distance_m(astronaut_position_m, poi.position_m))} (en línea recta)`
      : 'Distancia al astronauta: sin astronauta en el mapa';
    popup.append(distance);

    popup.append(el('div', 'poi-source', `Fuente: ${poi.source}`));
    popup.hidden = false;
  }

  return { show, hide };
}
