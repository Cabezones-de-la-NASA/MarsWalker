// Cliente del LLM del rover. Lo usan el modo a pie (conversación) y el mapa (explicación
// de rutas).
//
// La clave del LLM NO vive aquí ni en ninguna variable VITE_: todo lo que entra en el
// build es público. Vive en el servidor de server/ (una función de Vercel), y la web solo
// conoce su URL, en VITE_ROVER_LLM_URL (ver .env.example y server/README.md).
//
// Contrato con el servidor:
//   POST <URL>  { kind: 'chat' | 'route', context: '<texto>', messages: [{ role, content }] }
//   200         { text: '<respuesta>' }
// El personaje del rover lo pone el servidor según `kind`; la web manda solo el contexto.
//
// Sin URL, o si el servidor falla, quien llama recibe la respuesta de reserva (un dato de
// src/shared/mars_facts.js en el chat; el veredicto fijo en las rutas). No se avisa en
// pantalla: el rover simplemente contesta.
import { MARS_FACTS } from './mars_facts.js';
import { buildRoverContext, pickMockReply } from './rover_context.js';

export const ROVER_LLM_URL = import.meta.env?.VITE_ROVER_LLM_URL ?? '';
// [diseño] Espera máxima de la respuesta y turnos de conversación que se envían.
const REQUEST_TIMEOUT_MS = 15000;
const HISTORY_TURNS = 8;

export const isLlmConfigured = () => Boolean(ROVER_LLM_URL);

// Única función que habla con el servidor.
async function requestLlm(kind, context, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ROVER_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, context, messages }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`El servidor del rover respondió ${response.status}`);
    const data = await response.json();
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Respuesta sin texto');
    return data.text.trim();
  } finally {
    clearTimeout(timer);
  }
}

let fallbackIndex = 0;

function fallbackReply(question) {
  const { fact, matched } = pickMockReply(question, MARS_FACTS, fallbackIndex);
  if (!matched) fallbackIndex += 1;
  const lead = question && !matched ? 'De eso no tengo datos a mano, pero te cuento otra cosa. ' : '';
  return { text: `${lead}${fact.text}`, source: fact.source, fromLlm: false };
}

/**
 * askRover({ question, history, snapshot }) -> Promise<{ text, source, fromLlm }>
 *   question   lo que dijo o escribió el usuario ('' para pedir un dato cualquiera)
 *   history    [{ role: 'user' | 'assistant', content }] turnos anteriores
 *   snapshot   estado de la caminata (ver buildRoverContext)
 */
export async function askRover({ question, history = [], snapshot }) {
  if (!isLlmConfigured() || !question) return fallbackReply(question);
  const messages = [...history.slice(-HISTORY_TURNS), { role: 'user', content: question }];
  try {
    const text = await requestLlm('chat', buildRoverContext(snapshot, MARS_FACTS), messages);
    return { text, source: null, fromLlm: true };
  } catch (error) {
    console.warn('Rover: el servidor no respondió; contesta con un dato de la lista.', error);
    return fallbackReply(question);
  }
}

/**
 * explainRoute(brief) -> Promise<string | null>
 * brief: texto de buildRouteBrief (src/shared/route_brief.js). Devuelve la explicación en
 * lenguaje llano, o null si no hay servidor o falló (se queda el veredicto fijo).
 */
export async function explainRoute(brief) {
  if (!isLlmConfigured()) return null;
  try {
    return await requestLlm('route', brief, [{ role: 'user', content: 'Explícame esta ruta.' }]);
  } catch (error) {
    console.warn('Rover: no se pudo explicar la ruta; queda el resumen fijo.', error);
    return null;
  }
}
