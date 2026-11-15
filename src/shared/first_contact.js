// Recuerda si ya se completó la misión "Primer contacto" en este navegador.
// Lo leen el mapa (para rotular el botón) y el modo a pie (para marcarla al terminar).
const KEY = 'marswalk.first_contact';

export function isFirstContactDone() {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markFirstContactDone() {
  try {
    globalThis.localStorage?.setItem(KEY, '1');
  } catch {
    // Sin almacenamiento: la misión volverá a ofrecerse en la próxima visita.
  }
}
