# CDvicious

Visualización del estado de reproducción de Spotify en un disco 3D.

## Setup local

1. `npm install`
2. Copiar `.env.local.example` a `.env.local` y completar credenciales
   (registrar la app en https://developer.spotify.com/dashboard)
3. `npm run dev`
4. Abrir http://127.0.0.1:3002

## Desarrollo con mock

Para levantar el rail en escritorio sin credenciales ni llamadas a la API de Spotify:

1. Copiar `.env.local.mock.example` a `.env.local`.
   - PowerShell: `Copy-Item .env.local.mock.example .env.local`
   - macOS/Linux: `cp .env.local.mock.example .env.local`
2. Ejecutar `npm install` si todavía no se instalaron las dependencias.
3. Ejecutar `npm run dev` y abrir http://127.0.0.1:3002.

El ejemplo activa `NEXT_PUBLIC_ENABLE_RAIL=1` y
`NEXT_PUBLIC_SPOTIFY_MOCK=1`. Reiniciar el servidor después de cambiar
variables de entorno.

Con el modo mock activo, la colección, el perfil, el reproductor, el progreso,
los controles de play/pausa, pista anterior/siguiente, volumen y letras funcionan
con datos locales de demostración. Al reproducir un álbum, el reproductor
simulado cambia a `DEMO TRACK 01` de ese álbum y mantiene el flujo de vuelo y
acople del CD. Las letras son texto ficticio generado para probar la paginación
del booklet. **No se reproduce audio real ni se realizan llamadas de playback a
Spotify**; para validar sonido, SDK y permisos hay que usar OAuth real.

Para OAuth real, usar `.env.local.example`, completar las credenciales y
registrar exactamente `http://127.0.0.1:3002/api/auth/callback` como Redirect URI
en el panel de Spotify.
