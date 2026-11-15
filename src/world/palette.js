// Paleta de Marte de la dirección artística. Una sola fuente para la escena 3D;
// src/styles/tokens.css repite estos valores como variables CSS para la interfaz.
// Son decisiones de arte [diseño]: no son colores medidos de la superficie.

export const PALETTE = Object.freeze({
  marsOrange: 0xc65b27, // terreno dominante
  oxideOrange: 0xa94324, // regolito
  rustRed: 0x87351f, // rocas
  terracotta: 0xb9673e, // variaciones del suelo
  burntSienna: 0x71351f, // sombras de rocas
  dustBrown: 0x563323, // profundidad del terreno
  dustyPeach: 0xd98a61, // horizonte
  paleOchre: 0xe5a36f, // atmósfera iluminada
  marsHaze: 0xb96c4c, // cielo
  solarAmber: 0xffd29a, // luz solar
  hudAmber: 0xffb45c, // interfaz
  hudCream: 0xf4e8d7, // tipografía
});

// 0xRRGGBB -> [r, g, b] de 0 a 255.
export function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// Mezcla lineal de dos colores 0xRRGGBB; t de 0 a 1.
export function mixHex(a, b, t) {
  const k = Math.min(Math.max(t, 0), 1);
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return (
    (Math.round(ar + (br - ar) * k) << 16) |
    (Math.round(ag + (bg - ag) * k) << 8) |
    Math.round(ab + (bb - ab) * k)
  );
}
