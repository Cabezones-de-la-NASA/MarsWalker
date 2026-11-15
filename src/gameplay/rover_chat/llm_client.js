// Cliente del LLM del rover.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// PUNTO DE INTEGRACIÓN DEL LLM
//
// Hoy no hay LLM conectado: askRover() responde con los datos de src/shared/mars_facts.js
// (modo de muestra). Para conectarlo NO pongas la clave aquí ni en ninguna variable VITE_:
// todo lo que entra en el build de GitHub Pages es público. La clave vive en un servidor
// intermedio (un Cloudflare Worker, una función de Vercel…) y la web solo conoce su URL.
//
// 1. Despliega un servidor que acepte este contrato:
//      POST <URL>   Content-Type: application/json
//      { "system": "<personaje + CONTEXTO>",
//        "messages": [{ "role": "user" | "assistant", "content": "<texto>" }, ...] }
//    y responda:
//      200 { "text": "<respuesta del rover>" }
//    Dentro, el servidor añade la clave y llama al proveedor que elijas, pasando `system`
//    y `messages` tal cual. Conviene que limite el origen (CORS) a la web del proyecto.
// 2. Pon la URL en .env.local (desarrollo) o en una variable del workflow de despliegue:
//      VITE_ROVER_LLM_URL=https://tu-servidor.example/rover
//    (ver .env.example). Con eso isLlmConfigured() pasa a true y el chat usa el LLM.
// 3. Si el servidor falla o tarda más de REQUEST_TIMEOUT_MS, el chat vuelve solo al modo
//    de muestra y lo indica en pantalla.
//
// Para cambiar de contrato (otro formato de petición o de respuesta) basta con tocar
// requestLlm(), más abajo.
// ─────────────────────────────────────────────────────────────────────────────────────
import { MARS_FACTS } from '../../shared/mars_facts.js';
import { ROVER_PERSONA, buildRoverContext, pickMockReply } from '../../shared/rover_context.js';

export const ROVER_LLM_URL = import.meta.env?.VITE_ROVER_LLM_URL ?? '';
// [diseño] Espera máxima de la respuesta y turnos de conversación que se envían.
const REQUEST_TIMEOUT_MS = 20000;
const HISTORY_TURNS = 8;

export const isLlmConfigured = () => Boolean(ROVER_LLM_URL);

// ► INTEGRACIÓN: única función que habla con el servidor.
async function requestLlm(system, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ROVER_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, messages }),
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

let mockIndex = 0;

function mockReply(question) {
  const { fact, matched } = pickMockReply(question, MARS_FACTS, mockIndex);
  if (!matched) mockIndex += 1;
  const lead = !question ? '' : matched ? '' : 'De eso todavía no tengo datos, pero te cuento otra cosa. ';
  return { text: `${lead}${fact.text}`, source: fact.source, mode: 'mock' };
}

/**
 * askRover({ question, history, snapshot }) -> Promise<{ text, source, mode, error }>
 *   question   lo que dijo o escribió el usuario ('' para pedir un dato cualquiera)
 *   history    [{ role: 'user' | 'assistant', content }] turnos anteriores
 *   snapshot   estado de la caminata (ver buildRoverContext)
 *   mode       'llm' si respondió el LLM; 'mock' si salió de la lista de datos
 */
export async function askRover({ question, history = [], snapshot }) {
  if (!isLlmConfigured() || !question) return mockReply(question);
  const system = `${ROVER_PERSONA}\n\n${buildRoverContext(snapshot, MARS_FACTS)}`;
  const messages = [...history.slice(-HISTORY_TURNS), { role: 'user', content: question }];
  try {
    return { text: await requestLlm(system, messages), source: null, mode: 'llm' };
  } catch (error) {
    console.warn('Rover: el LLM no respondió, se usa el modo de muestra.', error);
    return { ...mockReply(question), error: error.message };
  }
}
