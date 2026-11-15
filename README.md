# MarsWalk

Mapa 3D interactivo del cráter Jezero para planear y recorrer una caminata (EVA) en Marte.

Este repositorio todavía no tiene código. Aquí solo está la estructura de carpetas y la planeación: qué va en cada carpeta, quién la trabaja y en qué orden armamos todo. Las fórmulas, las fuentes y los prompts de construcción están en un documento aparte y no se repiten aquí.

Este README está escrito para que lo entienda igual una persona del equipo que un modelo de lenguaje al que le pidamos ayuda. Si eres un modelo: lee completa la sección "Estructura" antes de crear o mover cualquier archivo.

## Qué vamos a construir

El proyecto tiene cinco partes, y cada una es una carpeta dentro de `src/`:

1. **Introducción**: las animaciones que se ven al abrir la aplicación.
2. **Dashboard del mapa**: la pantalla principal, con el mapa 3D de Jezero, sus capas y sus paneles.
3. **Modelos matemáticos**: los cálculos de terreno, rutas, salud del astronauta y entorno.
4. **Modelos 3D**: el astronauta, el rover, la estación y demás objetos de la escena.
5. **Gameplay**: el recorrido a pie en primera persona.

## Tecnología

- Vite con npm.
- JavaScript en módulos ES, sin framework de interfaz.
- three.js para todo lo 3D.
- Pruebas con el ejecutor de Node (`node --test`).
- Python solo para preparar los datos de terreno.

## Estructura

```
marswalk/
├── README.md
├── public/
│   ├── data/
│   ├── models3d/
│   └── media/
├── src/
│   ├── intro/
│   ├── dashboard/
│   │   ├── map/
│   │   ├── layers/
│   │   └── panels/
│   ├── models/
│   │   ├── terrain/
│   │   ├── routing/
│   │   ├── physiology/
│   │   ├── environment/
│   │   └── suits/
│   ├── models3d/
│   ├── gameplay/
│   │   ├── player/
│   │   ├── camera/
│   │   └── hud/
│   ├── world/
│   ├── shared/
│   ├── styles/
│   └── assets/
├── tests/
├── data_pipeline/
└── docs/
```

Al inicializar Vite aparecerán en la raíz `index.html`, `package.json`, `vite.config.js` y `src/main.js`. Son los archivos normales de Vite y se quedan ahí.

### Carpetas estándar de Vite

| Carpeta | Qué va aquí |
| --- | --- |
| `public/` | Archivos que Vite sirve tal cual, sin procesarlos. Se piden por ruta absoluta (`/data/...`). |
| `public/data/` | Los datos de terreno, una subcarpeta por zona: elevaciones, textura, puntos de interés y configuración. |
| `public/models3d/` | Los archivos binarios de los modelos 3D (`.glb`, `.gltf`) y sus texturas. |
| `public/media/` | Video y audio de la introducción. |
| `src/` | Todo el código de la aplicación. |
| `src/assets/` | Imágenes, iconos y fuentes que el código importa y que Vite sí procesa. |
| `src/styles/` | Hojas de estilo globales: variables de color, tipografía y base. Los estilos propios de una parte viven junto a esa parte. |

### Carpetas del proyecto

| Carpeta | Qué va aquí | Qué no va aquí |
| --- | --- | --- |
| `src/intro/` | La secuencia inicial: animaciones, transiciones y el paso hacia el dashboard. | Lógica del mapa o cálculos. |
| `src/dashboard/` | La interfaz principal. Es lo primero que ve el usuario después de la intro. | Fórmulas: se piden a `src/models/`. |
| `src/dashboard/map/` | La escena orbital: terreno en 3D, cámara, luces, clic sobre el terreno y marcadores. | |
| `src/dashboard/layers/` | Las capas que se pintan sobre el terreno (textura, pendiente, riesgo, mineralogía, inercia térmica) y su control. | |
| `src/dashboard/panels/` | Los paneles laterales: ruta, capas, tripulación, clima. | |
| `src/models/` | Los modelos matemáticos. Código puro: recibe números y devuelve números. | three.js, DOM, estilos o cualquier cosa visual. |
| `src/models/terrain/` | Lectura del modelo de elevación, pendiente y riesgo del terreno. | |
| `src/models/routing/` | Cálculo de rutas entre dos puntos, con sus distintos criterios de coste. | |
| `src/models/physiology/` | Salud del astronauta y del grupo: gasto de energía, oxígeno, pulso, temperatura, hidratación, radiación y ritmo. | |
| `src/models/environment/` | Posición del Sol, luz, temperatura ambiente y tormentas de polvo. | |
| `src/models/suits/` | Catálogo de trajes espaciales y cómo sus datos alimentan a `physiology/`. | |
| `src/models3d/` | El código que carga, arma y anima los modelos 3D. | Los archivos `.glb`: esos van en `public/models3d/`. |
| `src/gameplay/` | El modo a pie. | Cálculos de salud: se piden a `src/models/`. |
| `src/gameplay/player/` | Movimiento del astronauta: caminar, correr, saltar y seguir el suelo. | |
| `src/gameplay/camera/` | Cámara en primera y tercera persona. | |
| `src/gameplay/hud/` | El visor del casco: oxígeno, pulso, brújula y radar. | |
| `src/world/` | El mundo 3D que comparten el dashboard y el modo a pie: renderer y perfiles gráficos, cielo, atmósfera, material y malla del terreno, parche de detalle, rocas y polvo. | Interfaz, paneles o lógica de juego. |
| `src/shared/` | Lo que usan todas las partes: estado global, constantes y utilidades. | Código que solo usa una parte. |
| `tests/` | Pruebas de los modelos matemáticos, un archivo por módulo de `src/models/`. | |
| `data_pipeline/` | Scripts de Python que convierten los datos de terreno originales al formato de `public/data/`. No forman parte de la aplicación. | |
| `docs/` | Documentación del proyecto: el documento de modelos y prompts, acuerdos y capturas. | |

## Reglas de dependencia

Estas reglas son las que nos dejan trabajar en paralelo sin estorbarnos:

1. `src/models/` no importa nada de las otras carpetas de `src/`, salvo `src/shared/`.
2. `src/dashboard/` y `src/gameplay/` pueden importar de `src/models/`, `src/models3d/`, `src/world/` y `src/shared/`.
   `src/world/` importa de `src/models/` y `src/shared/`. `src/main.js` crea el mundo y decide qué pantalla está activa.
3. `src/dashboard/` y `src/gameplay/` no se importan entre sí. Si necesitan lo mismo, eso va en `src/shared/`.
4. `src/intro/` solo conoce a `src/shared/` y avisa cuando termina.
5. Un cambio en `src/shared/` lo revisa todo el equipo.

## Reparto del equipo

Somos cuatro. Cada quien es responsable de sus carpetas y revisa los cambios que las tocan.

| Persona | Carpetas | Entrega |
| --- | --- | --- |
| 1 | `src/intro/`, `src/models3d/`, `public/models3d/`, `public/media/` | La intro y todos los objetos 3D listos para usarse. |
| 2 | `src/dashboard/`, `src/styles/` | El mapa con sus capas y paneles. |
| 3 | `src/models/`, `tests/`, `data_pipeline/`, `public/data/` | Los modelos probados y los datos convertidos. |
| 4 | `src/gameplay/` | El recorrido a pie con su visor. |

`src/shared/` es de todos.

## Orden de trabajo

1. Inicializar Vite sobre esta estructura y dejar el proyecto arrancando.
2. Preparar los datos de terreno de una zona de prueba.
3. Modelos de terreno, para que el mapa y el gameplay tengan de dónde leer elevación y pendiente.
4. En paralelo: mapa del dashboard, resto de los modelos, modelos 3D e intro.
5. Gameplay, cuando ya existan el terreno y el astronauta en 3D.
6. Integración: la intro lleva al dashboard y el dashboard lleva al modo a pie.

## Cómo empezar

```
npm create vite@latest . -- --template vanilla
npm install
npm install three
npm run dev
```

Git no guarda carpetas vacías. Antes del primer commit hay que poner un archivo en cada una (por ejemplo `.gitkeep`) o se pierden.

## Convenciones

- Una unidad de la escena es un metro. Ángulos en grados, tiempo en segundos, oxígeno en litros, potencia en watts.
- Ejes: +X es este, −Z es norte, +Y es arriba. El origen está en el centro del terreno.
- Archivos en minúsculas con guion bajo: `orbit_controls.js`.
- Ramas por parte: `intro/...`, `dashboard/...`, `models/...`, `models3d/...`, `gameplay/...`.
- Nada entra a `main` sin que lo revise otra persona.
# MarsWalker
# MarsWalker
