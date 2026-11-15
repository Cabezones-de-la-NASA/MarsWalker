// Fuentes de la sección 2 de docs/modelosydb.md, para la vista "Créditos".
// Cada grupo: { title, note?, items: [{ id, name, url, use }] }.
import { tr } from '../../shared/i18n.js';

export const CREDIT_GROUPS = [
  {
    title: tr('Enlaces base del proyecto (2.1)'),
    items: [
      { id: 'F1', name: tr('JPL · Mars'), url: 'https://www.jpl.nasa.gov/topics/mars/', use: tr('Textos de contexto de misiones y POI.') },
      { id: 'F2', name: tr('NASA Science · Mars y Mars Facts'), url: 'https://science.nasa.gov/mars/facts/', use: tr('Constantes planetarias y textos de la intro.') },
      { id: 'F3', name: tr('NASA Photojournal · galería de Marte'), url: 'https://science.nasa.gov/photojournal/galleries/pj-mars/', use: tr('Imágenes de los POI.') },
      { id: 'F4', name: tr('NASA–USGS, Joint Agency Satellite Division'), url: 'https://www.nasa.gov/directorates/smd/joint-agency-satellite-division/usgs-united-states-geological-survey/', use: tr('Nos lleva a USGS; los datos de Marte salen de USGS Astrogeology.') },
      { id: 'F5', name: tr('NASA NOS3'), url: 'https://github.com/nasa/nos3', use: tr('Referencia de arquitectura para el reloj de simulación. No se copió código.') },
      { id: 'F6', name: tr('Repositorios de NASA en GitHub'), url: 'https://github.com/search?q=NASA&type=repositories', use: tr('Buscador con el que se encontraron los repositorios de 2.4.') },
    ],
  },
  {
    title: tr('Datos de terreno, USGS Astrogeology (2.2)'),
    items: [
      { id: 'D1', name: 'Mars 2020 TRN CTX DTM Mosaic, 20 m/px (DOI 10.5066/P906QQT8)', url: 'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic', use: tr('DEM del dataset jezero_ctx.') },
      { id: 'D2', name: tr('Mars 2020 Science Investigation CTX DEM Mosaic'), url: 'https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic', use: tr('DEM del cráter completo. Aún no se usa.') },
      { id: 'D3', name: tr('DTM HiRISE DTEEC_045994_1985_046060_1985_U01 (USGS/UA)'), url: 'https://hirise.lpl.arizona.edu/ESP_045994_1985', use: tr('Zona hirise_jezero: ventana de 2 km a 1 m/px, preparada por el equipo.') },
      { id: 'D4', name: tr('Mars 2020 TRN CTX Orthorectified Image Mosaic'), url: 'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_context_camera_orthorectified_image_mosaic', use: tr('Textura base. Aún no se usa: el mapa muestra un sombreado calculado.') },
      { id: 'D5', name: tr('Topographic Slopes of Mars 2020 Landing Site, Jezero West'), url: 'https://astrogeology.usgs.gov/search/map/topographic_slopes_of_mars_2020_landing_site_jezero_west', use: tr('Validación de la pendiente M1.') },
      { id: 'D6', name: tr('MEDA, clima de Perseverance (PDS)'), url: 'https://pds-geosciences.wustl.edu/missions/mars2020/', use: tr('Ajuste de M17. Aún no se usa con datos reales.') },
    ],
  },
  {
    title: tr('Constantes planetarias (2.3)'),
    items: [
      { id: 'F2', name: tr('NASA Science · Mars Facts'), url: 'https://science.nasa.gov/mars/facts/', use: tr('Radio, día, año, inclinación, distancia al Sol, temperaturas y lunas.') },
      { id: '', name: tr('NASA Mars Fact Sheet'), url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html', use: tr('Gravedad, 3.71 m/s².') },
    ],
  },
  {
    title: tr('Repositorios de NASA (2.4)'),
    items: [
      { id: 'G1', name: 'NASA 3D Resources', url: 'https://github.com/nasa/NASA-3D-Resources', use: tr('Modelo del rover Perseverance (NASA/JPL-Caltech).') },
      { id: 'G2', name: 'NASA-AMMOS 3DTilesRendererJS', url: 'https://github.com/NASA-AMMOS/3DTilesRendererJS', use: tr('Referencia para terreno grande. No está instalado.') },
      { id: 'G3', name: tr('NASA-AMMOS MMGIS'), url: 'https://github.com/NASA-AMMOS/MMGIS', use: tr('Referencia de interfaz: capas, leyendas y perfil de elevación.') },
      { id: 'G4', name: tr('NASA NOS3'), url: 'https://github.com/nasa/nos3', use: tr('Referencia de arquitectura de simulación con paso de tiempo.') },
    ],
  },
  {
    title: tr('Fuentes científicas de los modelos (2.5)'),
    items: [
      { id: 'M1', name: tr('USGS, ráster de pendientes D5 y su script'), url: '', use: tr('Pendiente del terreno.') },
      { id: 'M4', name: tr('Hart, Nilsson y Raphael (1968), IEEE Trans. Systems Science and Cybernetics 4(2)'), url: '', use: tr('Búsqueda A*.') },
      { id: 'M5', name: tr('Pandolf, Givoni y Goldman (1977), J. Appl. Physiol. 43(4)'), url: 'https://journals.physiology.org/doi/abs/10.1152/jappl.1977.43.4.577', use: tr('Tasa metabólica.') },
      { id: 'M6', name: tr('NASA NTRS 20240007384, xEMU Testing Overview'), url: 'https://ntrs.nasa.gov/api/citations/20240007384/downloads/xEMU%20Testing%20Overview%20ICES%20Updated1.pdf', use: tr('Masa y presión del traje xEMU.') },
      { id: 'M7', name: tr('Equivalente calórico del oxígeno según el cociente respiratorio (tabla de Lusk)'), url: '', use: tr('Consumo de oxígeno.') },
      { id: 'M8', name: tr('ACSM, Guidelines for Exercise Testing and Prescription'), url: '', use: tr('Capacidad aeróbica.') },
      { id: 'M9', name: tr('Swain y Leutholtz (1997), Med. Sci. Sports Exerc. 29(3), DOI 10.1097/00005768-199703000-00018'), url: '', use: tr('Frecuencia cardíaca.') },
      { id: 'M10', name: tr('Balance de calor de Gagge, simplificado'), url: '', use: tr('Temperatura corporal.') },
      { id: 'M11', name: tr('Sawka et al. (2007), ACSM Position Stand, Med. Sci. Sports Exerc. 39(2)'), url: '', use: tr('Hidratación.') },
      { id: 'M12', name: tr('Hassler et al. (2014), Science 343, DOI 10.1126/science.1244797; NASA-STD-3001'), url: '', use: tr('Radiación y límite de carrera.') },
      { id: 'M15', name: tr('Farhi, Goldstone y Gutmann (2014), arXiv:1411.4028'), url: 'https://arxiv.org/abs/1411.4028', use: tr('Inspiración del planificador por corredor. Es un heurístico clásico.') },
      { id: 'M16', name: tr('Kasten y Young (1989), Applied Optics 28(22)'), url: '', use: tr('Masa de aire.') },
      { id: 'M17', name: 'MEDA (D6)', url: '', use: tr('Ajuste pendiente de la temperatura ambiente.') },
    ],
  },
  {
    title: tr('Lo que es arte y no dato'),
    items: [
      { id: '', name: tr('Rover de compañía'), url: '', use: tr('El rover sigue al astronauta al paso de una persona. Es una licencia del juego: el Perseverance real avanza a centímetros por segundo. Los datos que cuenta sí llevan su fuente.') },
      { id: '', name: tr('Base y objetivos propios'), url: '', use: tr('La estación es un diseño del equipo y los puntos que coloca el usuario no son datos de misión.') },
      { id: '', name: tr('Color del terreno'), url: '', use: tr('La textura base se tiñe con una paleta óxido elegida por el equipo. No es el color medido de la superficie ni un ortomosaico.') },
      { id: '', name: tr('Rocas'), url: '', use: tr('Su posición y tamaño se generan con una función fija, con más rocas en ladera. No vienen de datos del terreno.') },
      { id: '', name: tr('Microrrelieve'), url: '', use: tr('De cerca el suelo lleva ondulaciones de hasta 14 cm para que no se vea liso. La elevación y la pendiente que usan los modelos y el visor salen siempre del DEM.') },
      { id: '', name: tr('Cielo y atmósfera'), url: '', use: tr('Los colores siguen la altura del Sol (M16) y el polvo (M17), pero son dirección de arte, no un modelo radiativo. Fobos está fijo en el cielo.') },
      { id: '', name: tr('Astronauta'), url: '', use: tr('Modelo hecho por el equipo con geometría de three.js. Correr y saltar usan valores de diseño que el documento del proyecto no define.') },
    ],
  },
  {
    title: tr('Software'),
    items: [
      { id: '', name: tr('three.js (licencia MIT)'), url: 'https://threejs.org/', use: tr('Escena 3D, controles, carga de modelos glTF.') },
      { id: '', name: tr('Decodificador Draco de Google (Apache-2.0), distribuido con three.js'), url: 'https://github.com/google/draco', use: tr('Descompresión de los modelos 3D.') },
      { id: '', name: tr('Vite (licencia MIT)'), url: 'https://vite.dev/', use: tr('Servidor de desarrollo y empaquetado.') },
      { id: '', name: tr('IBM Plex Sans e IBM Plex Mono (licencia OFL)'), url: 'https://www.ibm.com/plex/', use: tr('Tipografía de la interfaz, incluida en la aplicación.') },
    ],
  },
];

export const NASA_DISCLAIMER =
  tr('Alone in Mars es un proyecto de estudiantes para NASA Space Apps Challenge. No está respaldado ni ') +
  tr('patrocinado por NASA. El contenido de NASA se usa con fines educativos e informativos, citando ') +
  tr('a NASA como fuente, según sus guías de uso de imágenes y medios.');
