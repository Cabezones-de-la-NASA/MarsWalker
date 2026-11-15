# Créditos de los modelos 3D

El modelo del rover viene del repositorio NASA 3D Resources
(https://github.com/nasa/NASA-3D-Resources), que describe sus recursos como "free and
without copyright". Su uso sigue las guías de uso de imágenes y medios de NASA
(https://www.nasa.gov/nasa-brand-center/images-and-media/): fines educativos o
informativos, citando a NASA como fuente y sin implicar respaldo de NASA.

| Archivo | Nombre original | Enlace | Crédito |
| --- | --- | --- | --- |
| `perseverance.glb` | Mars 2020 Perseverance Rover.glb | https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Mars%202020%20Perseverance%20Rover | NASA/JPL-Caltech |

El archivo se copió sin modificar; solo se cambió el nombre a minúsculas. La escala y
el origen se ajustan al cargarlos, en `src/models3d/`.

MarsWalk no está respaldado ni patrocinado por NASA.

## Decodificador Draco

`public/draco/` contiene el decodificador de Draco que distribuye three.js
(`node_modules/three/examples/jsm/libs/draco/gltf/`), con licencia Apache-2.0 de Google.
Hace falta porque el modelo viene comprimido con Draco. Si se actualiza three.js,
hay que volver a copiar esos tres archivos.

## Astronauta

El astronauta del modo a pie no es un archivo: se genera con geometría de three.js en
`src/models3d/explorer.js`, a partir del modelo hecho por el equipo (`character1.js`).
