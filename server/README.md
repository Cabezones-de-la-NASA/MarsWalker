# Servidor del rover

Una función de Vercel que guarda la clave del LLM y responde a la web de MarsWalk. La web
sigue en GitHub Pages y solo conoce la URL de esta función.

## Desplegar

1. En [vercel.com](https://vercel.com) crea un proyecto nuevo a partir de este repositorio
   y, en **Root Directory**, elige `server`. No necesita comando de build.
2. En **Settings → Environment Variables** añade:
   - `GEMINI_API_KEY`: tu clave de la API de Gemini. Es un secreto: va solo aquí.
   - `GEMINI_MODEL` (opcional): el modelo a usar. Por defecto, `gemini-4-hydrogen`;
     comprueba en la documentación de Gemini que sigue disponible para tu clave.
   - `ALLOWED_ORIGINS` (opcional): orígenes que pueden llamar, separados por comas. Por
     defecto, `https://cabezones-de-la-nasa.github.io` y `http://localhost:5173`.
3. Despliega. La URL de la función será `https://<tu-proyecto>.vercel.app/api/rover`.
4. En GitHub, en **Settings → Secrets and variables → Actions → Variables**, crea la
   variable `VITE_ROVER_LLM_URL` con esa URL. Es una URL pública, no un secreto. El
   siguiente despliegue de la web ya la usa.
5. Para probar en local, pon la misma URL en `.env.local` (ver `.env.example`).

## Contrato

```
POST /api/rover
{ "kind": "chat" | "route", "context": "<texto>", "messages": [{ "role": "user" | "assistant", "content": "<texto>" }] }

200 { "text": "<respuesta>" }
```

El personaje del rover lo pone el servidor según `kind`; la web manda solo el contexto
(estado de la caminata o resumen de la ruta) y la conversación.

## Protecciones

- Solo responde a los orígenes permitidos.
- Limita el tamaño del contexto y de cada mensaje, el número de turnos y la longitud de
  la respuesta.
- Hasta 20 peticiones por minuto y visitante. La cuenta se lleva en memoria por instancia,
  así que es un freno aproximado, no una garantía.

Si el servidor falla o no está configurado, la web no muestra errores: el rover responde
con los datos de `src/shared/mars_facts.js` y las rutas conservan su resumen fijo.
