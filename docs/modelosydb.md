# MarsWalk: modelos, fuentes y prompts de construcción
## 0. Cómo leer este documento (instrucciones para un LLM)

1. Este archivo es la fuente de verdad. Si algo de aquí contradice lo que sabes, gana este archivo.
2. Cada modelo tiene un identificador `M1`…`M17`. Los prompts los citan por ese identificador.
3. Cada constante dice de dónde sale:
   - **[publicado]**: cifra tomada de una fuente pública citada.
   - **[diseño]**: supuesto del proyecto, sin cifra publicada. Se puede ajustar. Nunca lo presentes como dato científico.
4. Las unidades van siempre en el nombre de la variable: `_m` metros, `_deg` grados, `_s` segundos, `_h` horas, `_l` litros, `_w` watts, `_ms` m/s, `_kg`, `_c` °C, `_usv` µSv.
5. Ejes de la escena: +X este, −Z norte, +Y arriba. Origen en el centro del DEM. 1 unidad = 1 metro.
6. Todo lo de `src/models/` es JavaScript puro: no importa three.js, no toca el DOM.
7. Si un prompt te pide consultar un enlace y no puedes abrirlo, dilo y pide que te peguen el contenido. No inventes datos de una página que no leíste.

---

## 1. Estructura del repositorio

```
marswalk/
├── public/
│   ├── data/<zona>/       datos de terreno ya convertidos
│   ├── models3d/          archivos .glb/.gltf
│   └── media/             video y audio de la intro
├── src/
│   ├── intro/             animación inicial
│   ├── dashboard/
│   │   ├── map/           escena orbital, cámara, clic, marcadores
│   │   ├── layers/        capas sobre el terreno
│   │   └── panels/        paneles de ruta, capas, tripulación, clima
│   ├── models/
│   │   ├── terrain/       M1, M2
│   │   ├── routing/       M3, M4, M14, M15
│   │   ├── physiology/    M5–M13
│   │   ├── environment/   M16, M17
│   │   └── suits/         catálogo de trajes (alimenta M6, M7, M10)
│   ├── models3d/          carga y armado de modelos 3D
│   ├── gameplay/
│   │   ├── player/        caminar, correr, saltar
│   │   ├── camera/        primera y tercera persona
│   │   └── hud/           visor del casco
│   ├── shared/            estado global, constantes, utilidades
│   ├── styles/
│   └── assets/
├── tests/                 una prueba por módulo de src/models/
├── data_pipeline/         scripts de Python para convertir datos
└── docs/                  este documento
```

Reglas de dependencia:

- `src/models/` solo importa de `src/shared/`.
- `src/dashboard/` y `src/gameplay/` importan de `src/models/`, `src/models3d/` y `src/shared/`, pero no entre sí.
- `src/intro/` solo conoce a `src/shared/`.

---

## 2. Fuentes de datos

### 2.1 Los enlaces base del proyecto

Estos son los seis enlaces que el equipo decidió usar como base. Esta tabla dice qué sirve de cada uno y qué no, para no buscar en ellos algo que no tienen.

| ID | Enlace | Qué tiene | Qué NO tiene | Para qué lo usamos |
| --- | --- | --- | --- | --- |
| F1 | https://www.jpl.nasa.gov/topics/mars/ | Portal de las misiones Perseverance, Curiosity, InSight, MRO y Odyssey, con noticias e imágenes | Datos de terreno, coordenadas u operaciones de superficie | Textos de contexto de misiones y POI |
| F2 | https://science.nasa.gov/mars/ y su subpágina https://science.nasa.gov/mars/facts/ | Datos del planeta: radio, día, año, inclinación, temperaturas, lunas; recursos de imagen y video | Gravedad, presión atmosférica, datos de terreno | Constantes planetarias (tabla 2.3) y textos de la intro |
| F3 | https://science.nasa.gov/photojournal/galleries/pj-mars/ | Catálogo de imágenes, videos y animaciones de Marte, con varias piezas de Jezero | Filtro por misión o instrumento (solo búsqueda por palabra y orden) | Imágenes de la intro y fotos de los POI |
| F4 | https://www.nasa.gov/directorates/smd/joint-agency-satellite-division/usgs-united-states-geological-survey/ | Colaboración NASA–USGS, con enfoque en la Tierra (nivel del mar, ríos) | Nada de Marte | Nos lleva a USGS; los datos de Marte salen de **USGS Astrogeology** (sección 2.2) |
| F5 | https://github.com/nasa/nos3 | Simulador operacional de NASA para naves: software de vuelo, estación de tierra, simulación de dinámica y entorno con el motor 42. Licencia NOSA 1.3 | Nada de superficie marciana ni de caminatas | Referencia de arquitectura: cómo separan simulación, tiempo y datos. Opcional |
| F6 | https://github.com/search?q=NASA&type=repositories | Buscador de repositorios de NASA | Es un buscador, no un dataset | Encontrar los repositorios de la tabla 2.4 |

Fuentes de lo que dice cada fila:

- F1: el portal enlaza a las páginas de misión de Perseverance, Curiosity, InSight, Mars Reconnaissance Orbiter y Mars Odyssey, con noticias e imágenes, y no contiene datos de terreno descargables, coordenadas ni detalles de operaciones de superficie.
- F2: enlaza una sección de datos de Marte (formación, estructura, atmósfera, tamaño, distancia y lunas) y un centro de recursos de imágenes y video, pero no da conjuntos de coordenadas ni de terreno.
- F3: se describe como un catálogo de imágenes, videos y animaciones de Marte, sobre todo de rovers, vistas orbitales y conceptos artísticos; no tiene filtro por misión o instrumento, solo búsqueda por palabra clave y orden por fecha, título o relevancia, y sí lista varias piezas de Jezero, como «Perseverance Drills a Rock on Jezero Crater Rim» y «Perseverance's Mid-Climb View of Jezero Crater».
- F4: la página trata la colaboración con USGS por medio de la Joint Agency Satellite Division, con temas como cambio climático, nivel del mar y océanos.
- F5: NOS3 da entorno de desarrollo, sistema de build, estación de tierra, simulaciones de entorno y modelos de software del hardware de la nave, con licencia NASA Open Source Agreement 1.3. Su motor de dinámica, 42, mantiene el estado de actitud, orientación y entorno de la nave.

### 2.2 Datos de terreno (USGS Astrogeology, la rama de USGS que cubre Marte)

| ID | Dato | Archivo o producto | Enlace |
| --- | --- | --- | --- |
| D1 | DEM CTX 20 m/px de Jezero (**el mínimo para arrancar**) | `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif` | https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic |
| D2 | DEM CTX del cráter completo | Mars 2020 Science Investigation CTX DEM Mosaic | https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic |
| D3 | DTM HiRISE ~1 m/px para la vista a pie | par ESP_045994_1985 / ESP_046060_1985 | https://hirise.lpl.arizona.edu/ESP_045994_1985 y https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/ |
| D4 | Ortomosaico CTX (textura base) | Mars 2020 TRN CTX Orthorectified Image Mosaic | https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_context_camera_orthorectified_image_mosaic |
| D5 | Pendientes oficiales (para validar M1) | `J03_045994_1986_J03_046060_1986_20m_slope_20m.tif` | https://astrogeology.usgs.gov/search/map/topographic_slopes_of_mars_2020_landing_site_jezero_west |
| D6 | Clima de Perseverance (MEDA) | Tablas CSV por sensor en PDS | https://pds-geosciences.wustl.edu/missions/mars2020/ |

Notas de las fuentes:

- D1: el archivo se descarga directamente de planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif. Su DOI es 10.5066/P906QQT8.
- D2: incluye el DEM TRN original y lo extiende a todo el cráter con DEM generados con Ames Stereo Pipeline; pesa 87 MB.
- D3: el catálogo incluye todos los DTM de HiRISE entregados a PDS, con espaciado de entre uno y dos metros. Todas las imágenes de HiRISE son de dominio público, y piden crédito donde sea posible.
- D5: el script de Python con el que se generó ese ráster de pendientes está publicado en el GitHub de USGS-Astrogeology.
- D6: el índice de Mars 2020 manda a MEDA al nodo de Atmósferas de PDS, y los productos científicos de MEDA son tablas CSV, un archivo por sensor.

### 2.3 Constantes planetarias

| Constante | Valor | Uso | Fuente |
| --- | --- | --- | --- |
| Radio | 3390 km | Escala de la intro | F2 |
| Duración del día | 24.6 h | Ciclo solar (M16) | F2 |
| Año | 669.6 soles = 687 días terrestres | Estaciones (M16) | F2 |
| Inclinación del eje | 25° (M16 usa 25.19°) | Declinación solar (M16) | F2 |
| Distancia media al Sol | 1.5 UA (M16 usa 1.52368) | Irradiancia (M16) | F2 |
| Temperatura de superficie | de 20 °C a −153 °C | Rango de validación de M17 | F2 |
| Lunas | Fobos y Deimos | Cielo nocturno | F2 |
| Gravedad | 3.71 m/s² | M6, salto en gameplay | NASA Mars Fact Sheet (https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html); F2 no la da |

De F2: radio de 3,390 km, distancia media de 228 millones de km (1.5 UA) y día de 24.6 horas; año de 669.6 soles, igual a 687 días terrestres, e inclinación del eje de 25 grados; temperatura de hasta 20 °C y de hasta unos −153 °C, y dos lunas, Fobos y Deimos. La página no da la gravedad, por eso esa fila sale de otra fuente.

### 2.4 Repositorios de NASA encontrados con F6

| ID | Repositorio | Qué aporta | Carpeta |
| --- | --- | --- | --- |
| G1 | https://github.com/nasa/NASA-3D-Resources | Modelos 3D, texturas e imágenes de NASA, libres. Incluye Perseverance en .glb | `public/models3d/`, `src/models3d/` |
| G2 | https://github.com/NASA-AMMOS/3DTilesRendererJS | Renderizador de 3D Tiles para three.js, con ejemplo de Marte y capas de pendiente | `src/dashboard/map/` (opcional, para terreno grande) |
| G3 | https://github.com/NASA-AMMOS/MMGIS | Sistema de mapas web de JPL para misiones (Mars 2020), con perfil de elevación | Referencia de interfaz para `src/dashboard/` |
| G4 | https://github.com/nasa/nos3 (= F5) | Arquitectura de simulación con paso de tiempo | Referencia para `src/shared/` |

Notas:

- G1: es una colección de modelos 3D, texturas e imágenes de NASA, gratis para descargar y usar. El modelo de Perseverance existe como Perseverance.glb de 4.99 MB y como .blend de Blender. Los recursos siguen las guías de uso de imágenes y medios de NASA: en general libres de derechos, sin implicar respaldo de NASA y sin mal uso de sus insignias.
- G2: renderizador de 3D Tiles en JavaScript con three.js, con licencia Apache-2.0 y una demo de Marte como página principal. Puede cargar texturas alternas sobre el terreno, como un mapa de pendiente de imágenes marcianas. Se instala con `npm install 3d-tiles-renderer --save`.
- G3: herramienta de operaciones científicas del sistema AMMOS de NASA, publicada con licencia Apache 2.0; se ha usado en Curiosity, InSight, Perseverance e Ingenuity, y trae dibujo vectorial, perfil de elevación y proyecciones a medida.

### 2.5 Fuentes científicas de los modelos

| Modelo | Fuente |
| --- | --- |
| M1 | USGS, ráster D5 y su script |
| M4 | Hart, Nilsson y Raphael (1968), IEEE Trans. Systems Science and Cybernetics 4(2) |
| M5 | Pandolf, Givoni y Goldman (1977), J. Appl. Physiol. 43(4): https://journals.physiology.org/doi/abs/10.1152/jappl.1977.43.4.577 |
| M6 | Gravedad: tabla 2.3. Traje xEMU: NASA NTRS, https://ntrs.nasa.gov/api/citations/20240007384/downloads/xEMU%20Testing%20Overview%20ICES%20Updated1.pdf |
| M7 | Equivalente calórico del oxígeno según cociente respiratorio (tabla de Lusk) |
| M8 | ACSM, *Guidelines for Exercise Testing and Prescription* |
| M9 | Swain y Leutholtz (1997), Med. Sci. Sports Exerc. 29(3), DOI 10.1097/00005768-199703000-00018 |
| M10 | Balance de calor de Gagge, simplificado |
| M11 | Sawka et al. (2007), ACSM Position Stand, Med. Sci. Sports Exerc. 39(2) |
| M12 | Hassler et al. (2014), Science 343, DOI 10.1126/science.1244797; límite de NASA-STD-3001 |
| M15 | Farhi, Goldstone y Gutmann (2014), arXiv:1411.4028 |
| M16 | Kasten y Young (1989), Applied Optics 28(22) |
| M17 | MEDA (D6) para ajustar |

Notas:

- M5: la ecuación de Pandolf predice el costo metabólico de cargar peso al estar de pie o caminar despacio, y se publicó en 1977. Ojo: se sabe que subestima la tasa metabólica con cargas y velocidades altas.
- M9: con 63 adultos, la regresión de %FCR contra %VO₂R dio intercepto −0.1 y pendiente 1.00, indistinguible de la identidad; los autores concluyen que %FCR equivale a %VO₂R y no a %VO₂máx.
- M12: RAD midió una tasa media de dosis equivalente por rayos cósmicos de 0.67 mSv por día en la superficie, de agosto de 2012 a junio de 2013. La dosis efectiva total de carrera de un astronauta debe ser menor a 600 mSv, igual para todas las edades y sexos.
- M15: QAOA produce soluciones aproximadas de problemas de optimización combinatoria, depende de un entero p ≥ 1, y la calidad mejora al subir p.

---

## 3. Contrato de datos

Cada zona vive en `public/data/<dataset_id>/`.

| Archivo | Obligatorio | Contenido |
| --- | --- | --- |
| `metadata.json` | sí | ver esquema abajo |
| `heightmap.f32` | sí | Float32 little-endian, fila por fila (norte a sur), metros. Tamaño = filas × columnas × 4 bytes |
| `texture.png` | sí | Textura base, mismo encuadre que el DEM |
| `poi.json` | no | puntos de interés |
| `config_fisio.json` | no | parámetros de M3 |
| `config_health.json` | no | tripulación para M5–M13 |
| `route.json` | salida | ruta exportada |

```json
{
  "dataset_id": "jezero_ctx",
  "label": "Jezero CTX 20 m/px",
  "source": "CTX",
  "crs": "IAU_2015:49900",
  "size_m": [ancho_m, fondo_m],
  "resolution_m": 20,
  "shape": [filas, columnas],
  "elevation_range_m": [min, max],
  "heightmap": { "file": "heightmap.f32", "format": "float32-le", "units": "m" },
  "layers": [{ "id": "base", "file": "texture.png", "type": "base" }],
  "acquisition_date": "AAAA-MM",
  "uncertainty_note": "producto, resolución y procesado"
}
```

```json
{ "dataset_id": "jezero_ctx",
  "points": [{ "id": "poi_01", "name": "...", "position_m": [x, z],
               "type": "shelter | sampling | hazard", "description": "...",
               "source": "...", "image_url": "enlace de F3 (opcional)" }] }
```

```json
{ "dataset_id": "jezero_ctx", "algorithm": "astar | health | qaoa",
  "path_m": [[x, z], ...],
  "metrics": { "distance_m": 0, "oxygen_l": 0, "max_slope_deg": 0, "risk_score": 0 } }
```

---

## 4. Modelos

Formato de cada ficha: **Propósito · Carpeta · Entradas · Salidas · Fórmula · Constantes · Explicación · Pruebas · Depende de**.

### Grupo A · Terreno

#### M1 · Pendiente del terreno

- **Propósito:** saber qué tan inclinado está el suelo en cualquier punto.
- **Carpeta:** `src/models/terrain/`
- **Entradas:** DEM (`heightmap.f32` + `metadata.json`), punto `x_m, z_m`.
- **Salidas:** `elevation_m`, `slope_deg`.

$$\theta = \arctan\sqrt{\left(\frac{z_{i+1,j}-z_{i-1,j}}{2\,\Delta x}\right)^2+\left(\frac{z_{i,j+1}-z_{i,j-1}}{2\,\Delta y}\right)^2}$$

- **Explicación:** se mide cuánto sube el terreno entre el vecino izquierdo y el derecho, y entre el de arriba y el de abajo. Las dos subidas se combinan y el arcotangente las convierte en grados. La elevación en un punto que cae entre celdas se interpola de forma bilineal entre las cuatro celdas más cercanas. En los bordes se usa la diferencia hacia un solo lado.
- **Pruebas:** plano horizontal → 0°; plano con inclinación conocida → ese ángulo con error < 0.1°; comparar contra D5 en una ventana.
- **Depende de:** nada.

#### M2 · Índice de riesgo

- **Propósito:** pintar el mapa en verde, amarillo o rojo según el peligro de caminar ahí.
- **Carpeta:** `src/models/terrain/`

$$R = \mathrm{clamp}\left(\frac{\theta}{\theta_{seg}},\,0,\,1\right)$$

- **Constantes:** θ_seg = 25° [diseño]; cortes de color 0.45 y 0.85 [diseño].
- **Explicación:** el riesgo es qué tan cerca está la pendiente del límite seguro. A partir de 25° se considera intransitable.
- **Pruebas:** siempre en [0, 1]; 0° → 0; 25° o más → 1.
- **Depende de:** M1.

### Grupo B · Ruta clásica

#### M3 · Coste de oxígeno por tramo

- **Propósito:** cuántos litros de O₂ cuesta caminar de un nodo de la malla al vecino.
- **Carpeta:** `src/models/routing/`
- **Entradas:** distancia `d`, desnivel `Δz`, pendiente θ (la mayor entre la del nodo y arctan(|Δz|/d)), velocidad `v`.

$$C_{O_2} = \frac{q_{base}}{3600}\; f(\theta)\; c(g)\; \frac{d}{v}\; P(\theta),\qquad g = \frac{\Delta z}{d}$$

$$c(g)=\begin{cases}1+4.5\,g & g>0\\ \max(0.8,\;1+0.8\,g) & g\le 0\end{cases}$$

$$P(\theta)=\begin{cases}45+8\,(\theta-\theta_{seg})^2 & \theta>\theta_{seg}\\ 1+2.5\left(\dfrac{\theta-0.75\,\theta_{seg}}{0.25\,\theta_{seg}}\right)^2 & 0.75\,\theta_{seg}<\theta\le\theta_{seg}\\ 1 & \text{en otro caso}\end{cases}$$

| Pendiente | 0–5° | 5–10° | 10–15° | 15–20° | 20–25° | > 25° |
| --- | --- | --- | --- | --- | --- | --- |
| f(θ) subiendo | 1.0 | 1.35 | 1.85 | 2.6 | 3.6 | 5.0 |

- **Constantes:** q_base = 50 L/h [diseño, ≈ 0.83 L/min a ~250 W]; v = 1.2 m/s [diseño]; tabla f(θ), c(g) y P(θ) [diseño]. Bajando: f = max(0.85, 1 + 0.25·(f − 1)) [diseño].
- **Explicación:** el coste base es el O₂ que se respira en el tiempo que dura el tramo. Se multiplica por tres castigos: la tabla por pendiente, la subida o bajada real, y una penalización enorme si se pasa del límite seguro, para que el buscador lo evite siempre que haya otra opción.
- **Pruebas:** en plano, `C = q_base·d/(v·3600)`; subir cuesta más que bajar; > 25° cuesta al menos 45 veces más.
- **Depende de:** M1.

#### M4 · Búsqueda A\*

- **Propósito:** encontrar el camino de menor coste entre A y B.
- **Carpeta:** `src/models/routing/`

$$f(n) = g(n) + h(n),\qquad h(n) = \text{distancia recta}(n, B)\cdot \frac{q_{base}}{3600\,v}$$

- **Explicación:** g es lo que ya costó llegar a n; h es una estimación optimista de lo que falta (lo que costaría en línea recta y en plano). Como h nunca sobreestima, A\* encuentra el óptimo. Malla de 8 vecinos (diagonales con d·√2), montículo binario, máximo 256 nodos por lado.
- **Salidas:** `route.json` (sección 3). `risk_score` = promedio de M2 ponderado por distancia.
- **Pruebas:** en plano la ruta es casi recta; con una pared de 40° entre A y B, la rodea y `max_slope_deg ≤ 25`.
- **Depende de:** M1, M2, M3.

### Grupo C · Fisiología del astronauta

#### M5 · Tasa metabólica (Pandolf)

- **Propósito:** cuántos watts gasta el cuerpo caminando.
- **Carpeta:** `src/models/physiology/`
- **Entradas:** W masa corporal (kg), L carga (kg), V velocidad (m/s), θ pendiente con signo, η factor de terreno.

$$M = 1.5\,W + 2.0\,(W+L)\left(\frac{L}{W}\right)^2 + \eta\,(W+L)\left(1.5\,V^2 + 0.35\,V\,G\right),\qquad G = 100\tan\theta$$

- **Constantes:** η = 1.1 solo, 1.2 quien abre camino, 1.05 quien sigue [diseño]. Piso: M ≥ 0.5 · (dos primeros términos) [diseño].
- **Explicación:** el primer término es estar de pie; el segundo, sostener la carga; el tercero, moverse, que crece con el cuadrado de la velocidad y con la pendiente (G en %). El piso evita valores absurdos cuesta abajo.
- **Pruebas:** subir > plano > bajar; M crece con V.
- **Depende de:** nada.

#### M6 · Corrección a Marte y al traje presurizado

- **Propósito:** adaptar Pandolf, que está medido en la Tierra, a la gravedad de Marte y al traje.

$$L = m_{traje}\,\frac{g_M}{g_T}$$

$$M_{Marte} = M_{reposo} + 0.80\,\eta\,(W+L)\,1.5\,V^2 + \eta\,(W+m_{traje})\,0.35\,V\,G\,\frac{g_M}{g_T}$$

$$M_{total} = M_{Marte}\,(1+f_p)$$

- **Constantes:** g_M = 3.71 m/s² [publicado, tabla 2.3]; g_T = 9.81 m/s²; xEMU: m_traje = 170 kg, presión 29.6 kPa [publicado, 2.5]; factor 0.80 de marcha [diseño]; f_p = 0.30 por presión [diseño].
- **Explicación:** en Marte el traje pesa menos, así que la carga equivalente se escala por la razón de gravedades. La marcha plana se reduce un 20 %. El trabajo de subir se hace contra la gravedad marciana con la masa real. El traje presurizado cuesta un 30 % extra porque doblar articulaciones infladas cansa.
- **Pruebas:** con g_M = g_T, f_p = 0 y factor 1, debe dar M5.
- **Depende de:** M5, catálogo de trajes.

#### M7 · Oxígeno, CO₂ y tanque

$$E_{O_2} = 19.6 + \frac{RER-0.7}{0.3}\cdot 1.5\ \ [\mathrm{kJ/L}]$$

$$\dot V_{O_2} = \frac{60\,M}{1000\,E_{O_2}}\ \ [\mathrm{L/min}],\qquad \dot V_{CO_2} = RER\cdot\dot V_{O_2}$$

$$O_2(t) = O_{2,0} - \int \dot V_{O_2}\,dt,\qquad t_{aut} = \frac{O_2}{\dot V_{O_2}},\qquad P_{tanque} = P_{lleno}\,\frac{O_2}{O_{2,0}}$$

- **Constantes:** RER = 0.82 [diseño]; O₂,₀ = 580 L equivalentes en xEMU [diseño: 8 h + margen]; alerta al 10 % del tanque [diseño].
- **Explicación:** cada litro de O₂ libera unos 20 kJ, según qué se esté quemando (RER). Dividir la potencia entre esa energía da el consumo. El tanque se vacía con la integral del consumo; la presión baja en proporción (gas ideal a temperatura constante).
- **Pruebas:** RER 0.82 → E_O₂ = 20.2 kJ/L.
- **Depende de:** M5, M6.

#### M8 · Capacidad aeróbica por persona

$$\dot V_{O_2max}(a) = \dot V_{O_2max}(25)\,\bigl(1 - 0.01\,\max(0,\,a-25)\bigr)$$

$$M_{sost} = 0.60\,\dot V_{O_2max}\,\frac{1000\,E_{O_2}}{60},\qquad FC_{max} = 220 - a$$

| Condición | baja | nominal | buena | élite |
| --- | --- | --- | --- | --- |
| VO₂máx a los 25, hombre (mL/kg/min) | 38 | 45 | 52 | 60 |
| VO₂máx a los 25, mujer (mL/kg/min) | 32 | 38 | 44 | 51 |
| FC en reposo (lpm) | 76 | 68 | 60 | 52 |

- **Constantes:** declive 1 %/año [ACSM]; 60 % sostenible durante horas [diseño]; tabla [diseño, inspirada en normas ACSM]. VO₂máx en L/min = mL/kg/min × masa / 1000.
- **Explicación:** cada persona tiene un techo de oxígeno que baja con la edad. Durante una EVA larga solo se sostiene el 60 % de ese techo; eso fija los watts máximos de cada quien.
- **Pruebas:** 45 años, condición buena → 41.6 mL/kg/min y FC máx 175.
- **Depende de:** M7.

#### M9 · Frecuencia cardíaca

$$FC = FC_{rep} + (FC_{max}-FC_{rep})\,\frac{\dot V_{O_2}-\dot V_{O_2,rep}}{\dot V_{O_2max}-\dot V_{O_2,rep}},\qquad \dot V_{O_2,rep}=3.5\ \mathrm{mL/kg/min}$$

- **Explicación:** el pulso recorre su rango (reposo a máximo) en la misma proporción en que el consumo de O₂ recorre el suyo. Alerta si FC > 85 % del máximo [diseño].
- **Pruebas:** en reposo da FC_rep; en VO₂máx da FC_max; recortar a [FC_rep, FC_max].
- **Depende de:** M7, M8.

#### M10 · Temperatura corporal

$$\Delta T = \frac{M\,(1-\varepsilon) - k\,(T-T_{amb})}{m\,c_p}\,\Delta t$$

- **Constantes:** ε = 0.85 eficiencia de la prenda de enfriamiento [diseño]; k = 0.5 W/K [diseño]; c_p = 3500 J/(kg·K); alertas 38.5 °C y 39.5 °C [diseño].
- **Explicación:** lo que el traje no logra retirar del calor que produce el cuerpo se queda dentro y sube la temperatura. Esta fórmula aplica cuando falla el enfriamiento. En modo nominal la temperatura tiende a 37 + min(0.4, 0.4·max(0, (M − 300)/1500)).
- **Pruebas:** con ε = 1 y T = T_amb, ΔT = 0.
- **Depende de:** M5, M6.

#### M11 · Hidratación

$$\dot s = 0.4\,\frac{M}{600}\,\bigl(1+0.2\,\max(0,\,T-37)\bigr)\ \ [\mathrm{L/h}],\qquad D(t)=\int(\dot s - \dot w)\,dt$$

- **Constantes:** 0.4 L/h a 600 W [diseño]; agua disponible ẇ = 0.24 L/h [diseño]; alerta 2 % y crítico 4 % de la masa corporal [Sawka 2007].
- **Explicación:** se suda más con más esfuerzo y más calor. El déficit es el sudor menos el agua que se bebe, nunca negativo.
- **Pruebas:** a 0 W el déficit no crece.
- **Depende de:** M5, M10.

#### M12 · Radiación

$$D = \dot D\,t,\qquad F_{carrera} = \frac{D_{previa}+D}{600\ \mathrm{mSv}}$$

- **Constantes:** Ḋ = 27.9 µSv/h (= 0.67 mSv/día ÷ 24) [publicado, Hassler 2014]; límite 600 mSv [publicado, NASA-STD-3001].
- **Explicación:** la dosis crece en línea recta con el tiempo afuera. Solo cubre rayos cósmicos de fondo; las tormentas solares no están modeladas, y hay que decirlo en la interfaz.
- **Pruebas:** 8 h → 223 µSv.
- **Depende de:** nada.

#### M13 · Ritmo sostenible y grupo

$$v_i = \max\{\,v\le v_{max} : M_i(v,\theta)\le M_{sost,i}\,\}$$

$$v_{grupo}=\min_i v_i$$

- **Constantes:** v entre 0.3 y 1.2 m/s; bisección de 24 iteraciones; rotación del líder cada 20 min; suavizado exponencial α = 0.12 de pendiente y velocidad [diseño todas]. Tripulación de 1 a 6.
- **Explicación:** cada persona camina lo más rápido que puede sin pasar su límite sostenible en esa pendiente. El grupo va al paso del más lento. Quien abre camino gasta más (η = 1.2) y se rota.
- **Estado agregado:** el peor valor de cada variable y quién lo tiene; estado global, de mejor a peor: `nominal` < `low_o2` < `elevated` < `at_risk_over_sustainable` < `critical`.
- **Pruebas:** el grupo nunca va más rápido que su miembro más lento; más pendiente → menor ritmo; a los 20 min cambia el líder.
- **Depende de:** M5–M12.

### Grupo D · Ruta por salud

#### M14 · Coste multidimensional

$$C_{arista} = d\left(1+\frac{\sum_{k\in A} w_k\,f_k}{\sum_{k\in A} w_k}\right)$$

| Dimensión k | Peso w | Factor f |
| --- | --- | --- |
| pendiente | 0.15 | 1 + (θ/θ_seg)² hasta θ_seg; 5 + 0.5·(θ − θ_seg) arriba |
| metabólico | 0.20 | x² si x ≤ 1; 1 + 10·(x − 1) si no; x = M / M_sost del más limitado |
| frecuencia cardíaca | 0.15 | (FC / FC_max)² |
| oxígeno | 0.25 | (M / v) / (600 / 1.2) |
| térmico | 0.10 | max(0, (T − 37) / 1.5) |
| hidratación | 0.10 | % de deshidratación / 2 |
| radiación | 0.05 | (Ḋ / 27.9) · (1.2 / v) |

- **Constantes:** pesos y factores [diseño].
- **Preajustes:** clásico = {pendiente}; científico = {pendiente, oxígeno}; balanceado = {pendiente, metabólico, FC, oxígeno}; seguridad = las siete.
- **Explicación:** es el mismo A\* de M4 con otro coste. Cada tramo se simula con M13 al ritmo sostenible del grupo, y cada dimensión activa suma un castigo. El oxígeno se mide por metro y no por minuto, porque ir más lento también cuesta aire.
- **Optimización:** guardar en caché el factor por grado entero de pendiente con signo; limitar la búsqueda a una ventana alrededor de A y B con 40 % de margen.
- **Pruebas:** con solo «pendiente» activa se parece a M4; con las siete, el pico metabólico no supera al de la ruta clásica.
- **Depende de:** M4, M13.

### Grupo E · Planificador inspirado en QAOA

#### M15 · Corredor por capas

**Aviso obligatorio:** esto es un heurístico clásico inspirado en QAOA. No ejecuta un circuito cuántico ni promete ventaja cuántica. Así hay que decirlo en el código y en la interfaz.

- **Construcción:** entre A y B, S capas transversales (de 18 a 48) con K = 25 candidatos por capa, repartidos en un corredor cuya mitad de ancho es min(max(0.42·d_AB, 400 m), 0.38·lado del mapa) · sen(πt). Las capas 0 y S tienen un solo nodo (A y B).

$$H_{ab} = \frac{C_{O_2}}{P}\,\Bigl[1+1.35\left(\tfrac{\theta}{\theta_{seg}}\right)^2 + Q(\theta)\Bigr]\,\bigl(1+0.45\,\Delta u^2\bigr)$$

$$Q(\theta)=\begin{cases}55+9.5\,(\theta-\theta_{seg})^2 & \theta>\theta_{seg}\\ 3.8\left(\dfrac{\theta-0.7\,\theta_{seg}}{0.3\,\theta_{seg}}\right)^2 & 0.7\,\theta_{seg}<\theta\le\theta_{seg}\\ 0 & \text{en otro caso}\end{cases}$$

Δu es el salto lateral normalizado entre las dos capas, en [−1, 1].

- **Iteración:** pesos uniformes al inicio; p = 4 rondas con (γ, β) = (0.45, 0.65), (0.85, 0.45), (1.35, 0.28), (2.10, 0.12):

$$E_k = \sum_j w^{(s-1)}_j H_{jk} + \sum_m w^{(s+1)}_m H_{km}$$

$$w_k \leftarrow w_k\,\exp\!\left(-\gamma\,\frac{E_k-E_{min}}{\max(E_{min},\,0.5)}\right)$$

Luego mezclar cada peso con sus vecinos laterales en proporción β y normalizar. Al final, programación dinámica sobre las capas para tomar el camino de menor energía total.

- **Explicación:** imita la alternancia de QAOA entre «aplicar el coste» (γ empuja los pesos hacia los candidatos baratos) y «mezclar» (β reparte entre vecinos para no atorarse). γ crece y β baja ronda a ronda: primero explora, luego se concentra.
- **Constantes:** todas [diseño].
- **Pruebas:** en plano da casi la recta; rodea un obstáculo de 40°; O₂ total a menos de 15 % del de M4 en el dataset sintético; resultado determinista.
- **Depende de:** M1, M3.

### Grupo F · Entorno

#### M16 · Posición del Sol e irradiancia

$$r = \frac{a\,(1-e^2)}{1+e\cos(L_s-251^\circ)},\qquad I_0=\frac{1361}{r^2}\ \ [\mathrm{W/m^2}]$$

$$\sin\delta=\sin(25.19^\circ)\,\sin L_s,\qquad h = 15^\circ\,(LTST-12)$$

$$\sin\alpha = \sin\varphi\,\sin\delta+\cos\varphi\,\cos\delta\,\cos h$$

$$m = \frac{1}{\sin\alpha + 0.095\,(\alpha+3.2)^{-1.22}},\quad 1\le m\le 14$$

$$I_{dir} = I_0\,\sin\alpha\;e^{-0.68\,\tau m},\qquad I_{dif} = 0.34\,I_0\,\sin\alpha\,\bigl(1-e^{-0.68\,\tau m}\bigr)\,e^{-0.18\,\tau}$$

- **Entradas:** longitud solar L_s (°), hora solar local LTST (h), latitud φ (Jezero ≈ 18.4° N), opacidad de polvo τ.
- **Constantes:** a = 1.52368 UA, e = 0.0934, perihelio en L_s = 251°, oblicuidad 25.19° [publicado; ver tabla 2.3]; 1361 W/m² a 1 UA [publicado]; 0.68, 0.34, 0.18 [diseño]. α va en grados dentro de la potencia.
- **Explicación:** primero se calcula qué tan lejos está Marte del Sol (órbita elíptica), luego la altura del Sol en el cielo según estación, hora y latitud. El polvo atenúa la luz directa y parte vuelve como luz difusa. Fases: día (α > 7.5°), crepúsculo (−6.5° < α ≤ 7.5°), noche.
- **Acimut:** atan2(−cos δ · sen h, sen δ · cos φ − cos δ · sen φ · cos h), medido desde el norte.
- **Pruebas:** mediodía, equinoccio, latitud 0 → α = 90°; perihelio > afelio; de noche, irradiancia 0.
- **Depende de:** nada.

#### M17 · Temperatura ambiente y tormenta

$$T_{amb} = \bar T + 95\left(\frac{a}{r}-1\right) + A\cos\!\left(2\pi\,\frac{LTST-14.2}{24}\right)$$

- **Constantes:** día nominal: media −56 °C, amplitud 31 °C; tormenta de polvo: −68 °C y 14 °C [diseño]. Máximo hacia las 14:12 hora local [diseño].
- **Explicación:** onda diaria con pico en la tarde, más fría en el afelio. Con tormenta la amplitud baja porque el polvo frena el calentamiento y el enfriamiento. Debe quedar dentro del rango de la tabla 2.3. Al activar la tormenta se traza con M4 una ruta de evacuación al POI `shelter` más cercano.
- **Mejora pendiente:** ajustar media y amplitud con datos reales de MEDA (D6).
- **Depende de:** M16, M4.

### Catálogo de trajes (`src/models/suits/`)

| Campo | xEMU | Origen |
| --- | --- | --- |
| masa total | 170 kg | [publicado, 2.5] |
| presión de operación | 4.3 psi = 29.6 kPa, O₂ puro | [publicado] |
| O₂ primario | 580 L equivalentes | [diseño] |
| O₂ secundario | 30 min | [diseño] |
| eliminación de CO₂ | continua | [publicado] |
| eficiencia de enfriamiento ε | 0.85 | [diseño] |
| agua potable | 2.0 L | [diseño] |
| sobrecoste por presión f_p | 0.30 | [diseño] |

`suitToConfig(suit, g_M, g_T)` devuelve: `suit_mass_kg = masa × g_M/g_T`, `suit_true_mass_kg = masa`, `o2_capacity_l`, `o2_critical_l = 10 %`, `pressure_overhead`, `lcvg_efficiency`.

### Orden de cálculo por tramo de caminata

```
segmento → M13 (ritmo) → M5 → M6 → M7 → M8/M9 → M10 → M11 → M12 → estado nuevo → agregado del grupo
```

Cada tramo devuelve un estado nuevo y no modifica el anterior.

## 6. Glosario

| Término | Significado |
| --- | --- |
| DEM / DTM | Modelo digital de elevación: una malla de alturas del terreno |
| CTX | Cámara de contexto de la sonda MRO; da DEM de unos 20 m/px |
| HiRISE | Cámara de alta resolución de MRO; da DTM de unos 1 m/px |
| MEDA | Estación meteorológica de Perseverance |
| CRISM | Espectrómetro de MRO; mapas de minerales |
| THEMIS | Cámara térmica de Mars Odyssey; inercia térmica |
| RAD | Detector de radiación de Curiosity |
| EVA | Actividad extravehicular, la caminata fuera del vehículo |
| PLSS | Mochila de soporte vital del traje |
| xEMU | Traje de exploración de NASA para superficie |
| RER | Cociente respiratorio: CO₂ producido / O₂ consumido |
| VO₂máx | Máximo consumo de oxígeno de una persona |
| FC | Frecuencia cardíaca, en latidos por minuto |
| L_s | Longitud solar: posición de Marte en su órbita, de 0° a 360° |
| LTST | Hora solar local verdadera |
| τ | Opacidad del polvo atmosférico |
| POI | Punto de interés |
| A\* | Algoritmo de búsqueda del camino más barato con heurística |
| QAOA | Algoritmo cuántico de optimización aproximada |
