// Lógica del servidor del rover, separada de la función de Vercel para poder probarla.
// Valida la petición de la web, pone el personaje y la traduce al formato de Gemini.

// Límites [diseño]: evitan que la función se use como un LLM gratuito de propósito general.
export const LIMITS = Object.freeze({
  context_chars: 9000,
  message_chars: 600,
  messages: 10,
  // Holgado a propósito: en los modelos que razonan antes de contestar, ese razonamiento
  // también gasta de este tope. La brevedad la pide el personaje, no este número.
  output_tokens: 2048,
});

const RULES = [
  'Hablas en primera persona, con tono cercano y curioso.',
  'Usa solo los datos del bloque de contexto. Si te preguntan algo que no está ahí y no lo sabes con seguridad, dilo; no inventes cifras.',
  'No uses listas, markdown ni emojis. No menciones que eres un modelo de lenguaje ni qué tecnología te hace funcionar.',
  'Solo hablas de Marte, de la exploración espacial y de esta caminata. Si te piden otra cosa, dilo con amabilidad y vuelve al tema.',
].join(' ');

export const PERSONAS = Object.freeze({
  chat: [
    'Eres el rover de compañía de Alone in Mars, una réplica del Perseverance que acompaña a un astronauta en una caminata por Marte.',
    'Respondes en dos o tres frases cortas: tu respuesta se lee en voz alta mientras el astronauta camina.',
    'Si el oxígeno, la pendiente o el estado del astronauta son preocupantes, avisa antes de responder lo demás.',
    RULES,
  ].join(' '),
  route: [
    'Eres el rover de compañía de Alone in Mars y explicas una ruta de caminata por Marte a alguien sin conocimientos técnicos.',
    'En dos o tres frases di cuánto se tarda, si el oxígeno alcanza con holgura y si hay cuestas peligrosas, y da un consejo.',
    'Si hay una comparación, di cuál de las dos rutas conviene y por qué. No cambies ni redondees a tu gusto los números del contexto.',
    RULES,
  ].join(' '),
});

/**
 * Revisa el cuerpo de la petición. -> { ok: true, kind, context, messages } o { ok: false, error }
 */
export function validateRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Cuerpo no válido' };
  const { kind, context, messages } = body;
  if (!Object.hasOwn(PERSONAS, kind)) return { ok: false, error: 'kind debe ser chat o route' };
  if (typeof context !== 'string' || context.length > LIMITS.context_chars) {
    return { ok: false, error: 'context debe ser un texto de tamaño razonable' };
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > LIMITS.messages) {
    return { ok: false, error: 'messages debe traer entre 1 y 10 turnos' };
  }
  for (const message of messages) {
    const roleOk = message?.role === 'user' || message?.role === 'assistant';
    if (!roleOk || typeof message.content !== 'string' || !message.content.trim()
      || message.content.length > LIMITS.message_chars) {
      return { ok: false, error: 'Cada turno necesita role (user o assistant) y un content corto' };
    }
  }
  if (messages[messages.length - 1].role !== 'user') return { ok: false, error: 'El último turno debe ser del usuario' };
  // Idioma de la respuesta: inglés salvo que la web pida español.
  return { ok: true, kind, context, messages, lang: body.lang === 'es' ? 'es' : 'en' };
}

// Cuerpo para generateContent de la API de Gemini.
export function toGeminiRequest({ kind, context, messages, lang = 'en' }) {
  const language = lang === 'es'
    ? 'Responde siempre en español.'
    : 'Always answer in English, whatever language these instructions or the context are written in.';
  return {
    system_instruction: { parts: [{ text: `${PERSONAS[kind]} ${language}\n\n${context}` }] },
    contents: messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
    generationConfig: { maxOutputTokens: LIMITS.output_tokens, temperature: 0.6 },
  };
}

// Texto de la respuesta de Gemini, o null si no trae ninguno (bloqueada, vacía…).
export function fromGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim();
  return text || null;
}

/**
 * Límite de peticiones por visitante, en memoria. Es un freno sencillo: cada instancia de
 * la función lleva su propia cuenta, así que no es exacto, pero corta el abuso evidente.
 * -> allow(key, now_ms) -> bool
 */
export function createRateLimiter({ max = 20, window_ms = 60000 } = {}) {
  const hits = new Map();
  return function allow(key, now_ms = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((time) => now_ms - time < window_ms);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now_ms);
    hits.set(key, recent);
    // Limpieza ocasional para que el mapa no crezca sin fin.
    if (hits.size > 5000) for (const [k, times] of hits) if (now_ms - times[times.length - 1] >= window_ms) hits.delete(k);
    return true;
  };
}

// ¿Puede este origen llamar a la función? allowed: lista separada por comas.
export function originAllowed(origin, allowed) {
  if (!origin) return false;
  return allowed.split(',').map((item) => item.trim()).filter(Boolean).includes(origin);
}
