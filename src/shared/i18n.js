// Idiomas de la página: inglés (por defecto) y español.
//
// El código está escrito en español. Cada texto visible pasa por tr(), que lo devuelve tal
// cual en español o busca su traducción en src/shared/i18n_en.js.
//   tr('Calcular')                       texto fijo
//   tr`Tormenta en ${segundos} s`        texto con valores: la clave es 'Tormenta en {} s'
// En la traducción, {} toma los valores en orden y {0}, {1}… los toma por posición.
// Cambiar de idioma recarga la página: muchos textos se preparan al arrancar.
import { EN, EN_PATTERNS } from './i18n_en.js';

export const LANGUAGES = Object.freeze([['en', 'English'], ['es', 'Español']]);
const STORAGE_KEY = 'marswalk.lang';
// Fuera del navegador (pruebas con Node) se usa el idioma del código.
const DEFAULT_LANG = typeof window === 'undefined' ? 'es' : 'en';

let lang = null;

export function getLang() {
  if (lang) return lang;
  lang = DEFAULT_LANG;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (LANGUAGES.some(([code]) => code === saved)) lang = saved;
  } catch {
    // Sin almacenamiento: idioma por defecto.
  }
  return lang;
}

// Guarda el idioma. Quien llama recarga la página para que se aplique a todo.
export function setLang(next) {
  if (!LANGUAGES.some(([code]) => code === next)) return;
  lang = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Sin almacenamiento: vale solo para esta visita.
  }
}

function fill(template, values) {
  let next = 0;
  return template.replace(/\{(\d*)\}/g, (_, index) => String(values[index === '' ? next++ : Number(index)] ?? ''));
}

// Traducción de una clave a un idioma concreto (lo usan tr y las pruebas).
export function translate(key, values = [], to = getLang()) {
  const template = to === 'es' ? key : (EN[key] ?? key);
  return values.length ? fill(template, values) : template;
}

/**
 * Texto que viene de los datos (puntos de interés, zonas): si está entero en el diccionario
 * se usa; si no, se traduce frase a frase con los patrones. Lo que no se reconoce se deja
 * en español. to: idioma (por defecto, el actual).
 */
export function trData(text, to = getLang()) {
  if (to === 'es' || typeof text !== 'string') return text;
  if (text in EN) return EN[text];
  return text.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚ¿¡])/).map((sentence) => {
    if (sentence in EN) return EN[sentence];
    for (const [pattern, template] of EN_PATTERNS) {
      if (pattern.test(sentence)) return sentence.replace(pattern, template);
    }
    return sentence;
  }).join(' ');
}

/**
 * tr('texto') o tr`texto con ${valores}` -> el texto en el idioma actual.
 * Si falta la traducción, devuelve el texto en español.
 */
export function tr(strings, ...values) {
  if (typeof strings === 'string') return translate(strings);
  return translate(strings.join('{}'), values);
}
