import { BASE_URL } from '../../shared/base_url.js';
import captureUrl from '../../../Promts/base-terrestre-ns-02/captura-visor-360.png?url';
import promptUrl from '../../../Promts/base-terrestre-ns-02/prompt-visor-360.md?url';
import './models3d_view.css';
import { tr } from '../../shared/i18n.js';

const assetRoot = `${BASE_URL}models3d/base-terrestre-ns-02/`;
const viewerUrl = `${assetRoot}base-terrestre-ns-02-360.html`;

function link(label, href) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = label;
  return anchor;
}

export function createModels3dView() {
  const element = document.createElement('section');
  element.className = 'models3d-view';

  const inner = document.createElement('div');
  inner.className = 'view-inner models3d-inner';
  const header = document.createElement('header');
  header.className = 'models3d-header';
  const heading = document.createElement('h1');
  heading.textContent = tr('Modelos 3D');
  element.setAttribute('aria-label', heading.textContent);

  const actions = document.createElement('div');
  actions.className = 'models3d-actions';
  const fullscreen = link(tr('Abrir visor en otra pestaña'), viewerUrl);
  fullscreen.target = '_blank';
  fullscreen.rel = 'noopener';
  const model = link(tr('Descargar GLB'), `${assetRoot}base-terrestre-ns-02.glb`);
  model.download = 'base-terrestre-ns-02.glb';
  const capture = link(tr('Ver captura'), captureUrl);
  capture.target = '_blank';
  capture.rel = 'noopener';
  const prompt = link(tr('Descargar prompt'), promptUrl);
  prompt.download = 'prompt-visor-360.md';
  actions.append(fullscreen, model, capture, prompt);

  const iframe = document.createElement('iframe');
  iframe.className = 'models3d-frame';
  iframe.title = tr('Visor 360° de la Base terrestre NS-02');

  header.append(heading, actions);
  inner.append(header, iframe);
  element.append(inner);
  return {
    element,
    onShow() {
      if (!iframe.hasAttribute('src')) iframe.src = viewerUrl;
    },
  };
}
