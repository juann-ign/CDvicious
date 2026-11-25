# CDvicious

Reproductor de discos con Deck, Split con booklet, Batea, Colección y Mixtape. El buscador del nav abre fichas de álbumes o la discografía de un artista.

## Desarrollo local

Instalá las dependencias del lockfile con `npm ci`. Elegí una configuración al preparar un checkout nuevo. Si ya tenés un `.env.local`, conservá sus credenciales y ajustá solo las variables que necesitás.

| Modo | Plantilla para `.env.local` | Datos y reproducción |
| --- | --- | --- |
| Mock | `.env.local.mock.example` | Catálogo, letras y transporte simulados localmente |
| Spotify | `.env.local.example` | Cuenta y dispositivo autorizados en Spotify |

Para el modo Spotify, completá `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` en el servidor. Registrá el valor exacto de `SPOTIFY_REDIRECT_URI` en el Dashboard de tu aplicación. La plantilla usa `http://127.0.0.1:3002/api/auth/callback`.

Ejecutá `npm run dev` y abrí [CDvicious local](http://127.0.0.1:3002). Los flags `NEXT_PUBLIC_SPOTIFY_MOCK` y `NEXT_PUBLIC_ENABLE_RAIL` se incorporan al compilar. Reiniciá el servidor de desarrollo o reconstruí producción después de cambiarlos. Para usar ambos modos a la vez, dales checkouts y puertos distintos para que cada uno tenga su propio `.next`.

## Verificación

- `npm test` comprueba los tipos. `npm run test:unit` ejecuta las pruebas de contratos y lógica.
- `npm run build` genera el build de producción.
- Para las pruebas de navegador, prepará un build mock, instalá Chromium con `npx playwright install chromium` y ejecutá `npm run test:e2e`. Por defecto el runner inicia el build en el puerto 3002.
- Para probar un mock que ya esté levantado, definí `CDV_TEST_BASE_URL` con su URL, por ejemplo `http://127.0.0.1:3020`. Podés elegir una spec con `npm run test:e2e -- tests/e2e/nav-catalog-search.spec.cjs`.
- Las trazas y capturas de pruebas fallidas quedan en `test-results/`. Para una revisión visual, usá `QA_EVIDENCE=1` al iniciar Playwright. Ese modo también graba video y conserva las corridas exitosas.

## Recorrido de prueba

En Colección, abrí **Neon Rooms**, reproducí el álbum y pasá a Split. **Track listing** permite elegir *Mapa de azoteas* para probar una letra larga. En Batea podés recorrer los discos con el mouse o el teclado. Para verificar en Spotify la salida de audio, el dispositivo y los álbumes guardados, iniciá sesión desde el perfil.
