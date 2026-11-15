// Estado global único y emisor de eventos mínimo.
// Lo comparten todas las partes; un cambio aquí lo revisa todo el equipo.

// mode: 'intro' | 'dashboard' | 'gameplay'
export const state = {
  mode: 'intro',
};

const handlers = new Map();

export function on(event, handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(handler);
}

export function off(event, handler) {
  const set = handlers.get(event);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) handlers.delete(event);
}

export function emit(event, payload) {
  const set = handlers.get(event);
  if (!set) return;
  // Copia: un handler puede darse de baja mientras se emite.
  for (const handler of [...set]) handler(payload);
}
