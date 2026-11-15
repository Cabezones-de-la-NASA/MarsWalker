// Fuentes de la sección 2 de docs/modelosydb.md, para la vista "Créditos".
// Cada grupo: { title, note?, items: [{ id, name, url, use }] }.

export const CREDIT_GROUPS = [
  {
    title: 'Enlaces base del proyecto (2.1)',
    items: [
      { id: 'F1', name: 'JPL · Mars', url: 'https://www.jpl.nasa.gov/topics/mars/', use: 'Textos de contexto de misiones y POI.' },
      { id: 'F2', name: 'NASA Science · Mars y Mars Facts', url: 'https://science.nasa.gov/mars/facts/', use: 'Constantes planetarias y textos de la intro.' },
      { id: 'F3', name: 'NASA Photojournal · galería de Marte', url: 'https://science.nasa.gov/photojournal/galleries/pj-mars/', use: 'Imágenes de los POI.' },
      { id: 'F4', name: 'NASA–USGS, Joint Agency Satellite Division', url: 'https://www.nasa.gov/directorates/smd/joint-agency-satellite-division/usgs-united-states-geological-survey/', use: 'Nos lleva a USGS; los datos de Marte salen de USGS Astrogeology.' },
      { id: 'F5', name: 'NASA NOS3', url: 'https://github.com/nasa/nos3', use: 'Referencia de arquitectura para el reloj de simulación. No se copió código.' },
      { id: 'F6', name: 'Repositorios de NASA en GitHub', url: 'https://github.com/search?q=NASA&type=repositories', use: 'Buscador con el que se encontraron los repositorios de 2.4.' },
    ],
  },
  {
    title: 'Datos de terreno, USGS Astrogeology (2.2)',
    items: [
      { id: 'D1', name: 'Mars 2020 TRN CTX DTM Mosaic, 20 m/px (DOI 10.5066/P906QQT8)', url: 'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic', use: 'DEM del dataset jezero_ctx.' },
      { id: 'D2', name: 'Mars 2020 Science Investigation CTX DEM Mosaic', url: 'https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic', use: 'DEM del cráter completo. Aún no se usa.' },
      { id: 'D3', name: 'DTM HiRISE DTEEC_045994_1985_046060_1985_U01 (USGS/UA)', url: 'https://hirise.lpl.arizona.edu/ESP_045994_1985', use: 'Zona hirise_jezero: ventana de 2 km a 1 m/px, preparada por el equipo.' },
      { id: 'D4', name: 'Mars 2020 TRN CTX Orthorectified Image Mosaic', url: 'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_context_camera_orthorectified_image_mosaic', use: 'Textura base. Aún no se usa: el mapa muestra un sombreado calculado.' },
      { id: 'D5', name: 'Topographic Slopes of Mars 2020 Landing Site, Jezero West', url: 'https://astrogeology.usgs.gov/search/map/topographic_slopes_of_mars_2020_landing_site_jezero_west', use: 'Validación de la pendiente M1.' },
      { id: 'D6', name: 'MEDA, clima de Perseverance (PDS)', url: 'https://pds-geosciences.wustl.edu/missions/mars2020/', use: 'Ajuste de M17. Aún no se usa con datos reales.' },
    ],
  },
  {
    title: 'Constantes planetarias (2.3)',
    items: [
      { id: 'F2', name: 'NASA Science · Mars Facts', url: 'https://science.nasa.gov/mars/facts/', use: 'Radio, día, año, inclinación, distancia al Sol, temperaturas y lunas.' },
      { id: '', name: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html', use: 'Gravedad, 3.71 m/s².' },
    ],
  },
  {
    title: 'Repositorios de NASA (2.4)',
    items: [
      { id: 'G1', name: 'NASA 3D Resources', url: 'https://github.com/nasa/NASA-3D-Resources', use: 'Modelo del rover Perseverance (NASA/JPL-Caltech).' },
      { id: 'G2', name: 'NASA-AMMOS 3DTilesRendererJS', url: 'https://github.com/NASA-AMMOS/3DTilesRendererJS', use: 'Referencia para terreno grande. No está instalado.' },
      { id: 'G3', name: 'NASA-AMMOS MMGIS', url: 'https://github.com/NASA-AMMOS/MMGIS', use: 'Referencia de interfaz: capas, leyendas y perfil de elevación.' },
      { id: 'G4', name: 'NASA NOS3', url: 'https://github.com/nasa/nos3', use: 'Referencia de arquitectura de simulación con paso de tiempo.' },
    ],
  },
  {
    title: 'Fuentes científicas de los modelos (2.5)',
    items: [
      { id: 'M1', name: 'USGS, ráster de pendientes D5 y su script', url: '', use: 'Pendiente del terreno.' },
      { id: 'M4', name: 'Hart, Nilsson y Raphael (1968), IEEE Trans. Systems Science and Cybernetics 4(2)', url: '', use: 'Búsqueda A*.' },
      { id: 'M5', name: 'Pandolf, Givoni y Goldman (1977), J. Appl. Physiol. 43(4)', url: 'https://journals.physiology.org/doi/abs/10.1152/jappl.1977.43.4.577', use: 'Tasa metabólica.' },
      { id: 'M6', name: 'NASA NTRS 20240007384, xEMU Testing Overview', url: 'https://ntrs.nasa.gov/api/citations/20240007384/downloads/xEMU%20Testing%20Overview%20ICES%20Updated1.pdf', use: 'Masa y presión del traje xEMU.' },
      { id: 'M7', name: 'Equivalente calórico del oxígeno según el cociente respiratorio (tabla de Lusk)', url: '', use: 'Consumo de oxígeno.' },
      { id: 'M8', name: 'ACSM, Guidelines for Exercise Testing and Prescription', url: '', use: 'Capacidad aeróbica.' },
      { id: 'M9', name: 'Swain y Leutholtz (1997), Med. Sci. Sports Exerc. 29(3), DOI 10.1097/00005768-199703000-00018', url: '', use: 'Frecuencia cardíaca.' },
      { id: 'M10', name: 'Balance de calor de Gagge, simplificado', url: '', use: 'Temperatura corporal.' },
      { id: 'M11', name: 'Sawka et al. (2007), ACSM Position Stand, Med. Sci. Sports Exerc. 39(2)', url: '', use: 'Hidratación.' },
      { id: 'M12', name: 'Hassler et al. (2014), Science 343, DOI 10.1126/science.1244797; NASA-STD-3001', url: '', use: 'Radiación y límite de carrera.' },
      { id: 'M15', name: 'Farhi, Goldstone y Gutmann (2014), arXiv:1411.4028', url: 'https://arxiv.org/abs/1411.4028', use: 'Inspiración del planificador por corredor. Es un heurístico clásico.' },
      { id: 'M16', name: 'Kasten y Young (1989), Applied Optics 28(22)', url: '', use: 'Masa de aire.' },
      { id: 'M17', name: 'MEDA (D6)', url: '', use: 'Ajuste pendiente de la temperatura ambiente.' },
    ],
  },
  {
    title: 'Lo que es arte y no dato',
    items: [
      { id: '', name: 'Color del terreno', url: '', use: 'La textura base se tiñe con una paleta óxido elegida por el equipo. No es el color medido de la superficie ni un ortomosaico.' },
      { id: '', name: 'Rocas', url: '', use: 'Su posición y tamaño se generan con una función fija, con más rocas en ladera. No vienen de datos del terreno.' },
      { id: '', name: 'Microrrelieve', url: '', use: 'De cerca el suelo lleva ondulaciones de hasta 14 cm para que no se vea liso. La elevación y la pendiente que usan los modelos y el visor salen siempre del DEM.' },
      { id: '', name: 'Cielo y atmósfera', url: '', use: 'Los colores siguen la altura del Sol (M16) y el polvo (M17), pero son dirección de arte, no un modelo radiativo. Fobos está fijo en el cielo.' },
      { id: '', name: 'Astronauta', url: '', use: 'Modelo hecho por el equipo con geometría de three.js. Correr y saltar usan valores de diseño que el documento del proyecto no define.' },
    ],
  },
  {
    title: 'Software',
    items: [
      { id: '', name: 'three.js (licencia MIT)', url: 'https://threejs.org/', use: 'Escena 3D, controles, carga de modelos glTF.' },
      { id: '', name: 'Decodificador Draco de Google (Apache-2.0), distribuido con three.js', url: 'https://github.com/google/draco', use: 'Descompresión de los modelos 3D.' },
      { id: '', name: 'Vite (licencia MIT)', url: 'https://vite.dev/', use: 'Servidor de desarrollo y empaquetado.' },
      { id: '', name: 'IBM Plex Sans e IBM Plex Mono (licencia OFL)', url: 'https://www.ibm.com/plex/', use: 'Tipografía de la interfaz, incluida en la aplicación.' },
    ],
  },
];

export const NASA_DISCLAIMER =
  'MarsWalk es un proyecto de estudiantes para NASA Space Apps Challenge. No está respaldado ni ' +
  'patrocinado por NASA. El contenido de NASA se usa con fines educativos e informativos, citando ' +
  'a NASA como fuente, según sus guías de uso de imágenes y medios.';
