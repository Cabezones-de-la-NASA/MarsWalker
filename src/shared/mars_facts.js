// Datos de Marte que cuenta el rover. Cada uno lleva su fuente, y todas son páginas que
// se leyeron para este proyecto; no se añade nada de memoria.
//   F2    https://science.nasa.gov/mars/facts/
//   ROVER https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/
//   PJ    fichas de NASA Photojournal (https://science.nasa.gov/photojournal/)
//   DOC   docs/modelosydb.md (cifras con su fuente publicada)
import { tr } from './i18n.js';

const F2 = tr('NASA Science, Mars Facts');
const ROVER = tr('NASA Science, Perseverance Rover Components');

export const MARS_FACTS = Object.freeze([
  { text: tr('Marte tiene un radio de 3 390 kilómetros: es más o menos la mitad de grande que la Tierra.'), source: F2 },
  { text: tr('Marte está a unos 228 millones de kilómetros del Sol, 1.5 veces la distancia de la Tierra. La luz del Sol tarda 13 minutos en llegar hasta aquí.'), source: F2 },
  { text: tr('Marte da una vuelta sobre sí mismo cada 24.6 horas. A los días marcianos se les llama soles.'), source: F2 },
  { text: tr('Un año en Marte dura 669.6 soles, que son 687 días de la Tierra.'), source: F2 },
  { text: tr('El eje de Marte está inclinado 25 grados, parecido a los 23.4 de la Tierra. Por eso tiene estaciones, aunque duran más porque su año es más largo.'), source: F2 },
  { text: tr('La temperatura en Marte puede llegar a 20 °C y bajar hasta unos −153 °C. La atmósfera es tan delgada que el calor del Sol se escapa con facilidad.'), source: F2 },
  { text: tr('Marte tiene dos lunas pequeñas, Fobos y Deimos, que podrían ser asteroides capturados. Tienen forma de papa porque les falta masa para ser esféricas.'), source: F2 },
  { text: tr('Fobos y Deimos se llaman así por los caballos que tiraban del carro de Ares, el dios griego de la guerra, cuyo equivalente romano es Marte.'), source: F2 },
  { text: tr('En el centro de Marte hay un núcleo denso de hierro, níquel y azufre, de entre 1 500 y 2 100 kilómetros de radio.'), source: F2 },
  { text: tr('Marte se formó hace unos 4 500 millones de años, cuando la gravedad juntó gas y polvo hasta formar el cuarto planeta desde el Sol.'), source: F2 },
  { text: tr('Mido 3 metros de largo, 2.7 de ancho y 2.2 de alto, y mi masa es de 1 025 kilogramos.'), source: ROVER },
  { text: tr('Cada núcleo de roca que guarda Perseverance es del tamaño de un gis de pizarrón: 13 milímetros de diámetro y 60 de largo.'), source: tr('NASA Photojournal, PIA25690') },
  { text: tr('En el cráter Jezero hay un campo de rocas que dejó un río antiguo y rápido.'), source: tr('NASA Photojournal, PIA25963') },
  { text: tr('Perseverance tomó muestras de roca en dos lugares del delta de Jezero llamados Wildcat Ridge y Skinner Ridge, para un posible retorno a la Tierra.'), source: tr('NASA Photojournal, PIA24924') },
  { text: tr('En la superficie de Marte, el detector RAD del rover Curiosity midió una dosis media de rayos cósmicos de 0.67 milisieverts por día.'), source: tr('Hassler et al. (2014), Science 343') },
  { text: tr('La gravedad en la superficie de Marte es de 3.71 m/s², un poco más de un tercio de la terrestre. Por eso aquí saltas más alto.'), source: tr('NASA Mars Fact Sheet') },
]);
