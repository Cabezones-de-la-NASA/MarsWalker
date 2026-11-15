// Función de Vercel: el servidor del rover. Guarda la clave del LLM y responde a la web.
//
//   GET  /api/rover  -> { status, model, key_configured }   (comprobación del despliegue)
//   POST /api/rover  { kind: 'chat' | 'route', context, messages: [{ role, content }] }
//   200              { text }
//
// Variables de entorno (en Vercel, nunca en el repositorio):
//   GEMINI_API_KEY    obligatoria. Clave de la API de Gemini.
//   GEMINI_MODEL      opcional. Modelo a usar; por defecto DEFAULT_MODEL.
//   ALLOWED_ORIGINS   opcional. Orígenes que pueden llamar, separados por comas.
import {
  validateRequest, toGeminiRequest, fromGeminiResponse, createRateLimiter, originAllowed,
} from '../lib/rover.js';

// Si este modelo deja de existir, cambia GEMINI_MODEL en Vercel; no hace falta tocar código.
const DEFAULT_MODEL = 'gemini-4-hydrogen';
// [diseño] Espera máxima de la respuesta del modelo. Pasado este tiempo se corta y la web
// usa su respuesta de reserva, en vez de quedarse esperando.
const MODEL_TIMEOUT_MS = 12000;
const DEFAULT_ORIGINS = 'https://cabezones-de-la-nasa.github.io,http://localhost:5173';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const allow = createRateLimiter({ max: 20, window_ms: 60000 });

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowed = originAllowed(origin, process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(allowed ? 204 : 403).end();
  // GET: estado del servidor, para comprobar el despliegue sin gastar una pregunta.
  // No revela la clave, solo si está puesta.
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok', model: process.env.GEMINI_MODEL ?? DEFAULT_MODEL, key_configured: Boolean(process.env.GEMINI_API_KEY),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });
  if (!allowed) return res.status(403).json({ error: 'Origen no permitido' });

  const visitor = String(req.headers['x-forwarded-for'] ?? 'desconocido').split(',')[0].trim();
  if (!allow(visitor)) return res.status(429).json({ error: 'Demasiadas preguntas; espera un minuto' });

  const request = validateRequest(req.body);
  if (!request.ok) return res.status(400).json({ error: request.error });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor' });

  try {
    const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    const response = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(toGeminiRequest(request)),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!response.ok) {
      // El detalle se queda en los registros del servidor; a la web solo le llega el código.
      console.error('Gemini respondió', response.status, (await response.text()).slice(0, 500));
      return res.status(502).json({ error: 'El modelo no respondió' });
    }
    const data = await response.json();
    const text = fromGeminiResponse(data);
    if (!text) {
      // El motivo (p. ej. MAX_TOKENS o SAFETY) ayuda a diagnosticar y no revela nada sensible.
      const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'desconocido';
      console.error('Gemini no devolvió texto. Motivo:', reason);
      return res.status(502).json({ error: 'El modelo no devolvió texto', reason });
    }
    return res.status(200).json({ text });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    console.error(timedOut ? `Gemini no respondió en ${MODEL_TIMEOUT_MS} ms` : 'Fallo al llamar a Gemini', error);
    return res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'El modelo tardó demasiado' : 'El modelo no respondió' });
  }
}
