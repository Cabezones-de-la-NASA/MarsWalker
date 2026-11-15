// Voz del rover: escuchar al usuario (reconocimiento de voz del navegador) y leer las
// respuestas en alto (síntesis de voz). Las dos cosas son opcionales: si el navegador no
// las tiene (Firefox no reconoce voz), el chat sigue funcionando con texto.

import { getLang, tr } from '../../shared/i18n.js';

// [diseño] Idioma de escucha y de lectura, según el de la página.
const SPEECH_LANG = getLang() === 'es' ? 'es-MX' : 'en-US';
const VOICE_PREFIX = SPEECH_LANG.slice(0, 2);

/**
 * createSpeech() ->
 *   canListen, canSpeak
 *   listen({ onPartial }) -> Promise<string>   texto reconocido ('' si no se oyó nada)
 *   stopListening(), isListening()
 *   speak(text), cancelSpeech()
 */
export function createSpeech() {
  const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  const synth = globalThis.speechSynthesis;
  let recognition = null;

  function pickVoice() {
    const voices = synth.getVoices();
    return voices.find((voice) => voice.lang === SPEECH_LANG)
      ?? voices.find((voice) => voice.lang?.startsWith(VOICE_PREFIX))
      ?? null;
  }

  return {
    canListen: Boolean(Recognition),
    canSpeak: Boolean(synth && globalThis.SpeechSynthesisUtterance),
    isListening: () => Boolean(recognition),
    listen({ onPartial } = {}) {
      if (!Recognition) return Promise.reject(new Error(tr('Este navegador no reconoce voz.')));
      if (recognition) recognition.abort();
      return new Promise((resolve, reject) => {
        const session = new Recognition();
        recognition = session;
        session.lang = SPEECH_LANG;
        session.interimResults = true;
        session.maxAlternatives = 1;
        let finalText = '';
        session.onresult = (event) => {
          let text = '';
          for (const result of event.results) text += result[0].transcript;
          finalText = text.trim();
          onPartial?.(finalText);
        };
        session.onerror = (event) => {
          if (recognition === session) recognition = null;
          // 'no-speech' y 'aborted' no son fallos: simplemente no hubo frase.
          if (event.error === 'no-speech' || event.error === 'aborted') resolve('');
          else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            reject(new Error(tr('El navegador no dio permiso para usar el micrófono.')));
          } else reject(new Error(tr`No se pudo escuchar (${event.error}).`));
        };
        session.onend = () => {
          if (recognition === session) recognition = null;
          resolve(finalText);
        };
        try {
          session.start();
        } catch (error) {
          recognition = null;
          reject(error);
        }
      });
    },
    stopListening() {
      recognition?.stop();
    },
    speak(text) {
      if (!synth || !globalThis.SpeechSynthesisUtterance) return;
      synth.cancel();
      const utterance = new globalThis.SpeechSynthesisUtterance(text);
      utterance.lang = SPEECH_LANG;
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 1.02;
      utterance.pitch = 1.15;
      synth.speak(utterance);
    },
    cancelSpeech() {
      synth?.cancel();
    },
  };
}
