// Raíz pública de la aplicación, con barra final.
// Vite la define según dónde se sirve: '/' en desarrollo y '/MarsWalker/' en GitHub Pages
// (la opción `base` de vite.config.js). Todo archivo de public/ se pide con esta raíz
// delante, sin barra inicial: `${BASE_URL}media/mars_map.jpg`.
// Fuera de Vite (las pruebas con node --test) no existe import.meta.env y se usa '/'.
export const BASE_URL = import.meta.env?.BASE_URL ?? '/';
