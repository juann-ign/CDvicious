# Spotify App Rotation (Dev / Staging)

## Alcance

Esta rotación está pensada para desarrollo o staging. Desde GitHub puedo verificar el código y la rama actual, pero no tengo acceso a la configuración de Vercel para confirmar el destino de producción. Antes de usar credenciales nuevas, verificar que esta rotación no esté conectada a un deployment productivo.

## Variables de entorno actuales

### Credenciales Spotify

Se consumen en:

- `src/lib/spotify.ts`
  - `SPOTIFY_CLIENT_ID`
  - `SPOTIFY_CLIENT_SECRET`
  - `SPOTIFY_REDIRECT_URI`
- `src/app/api/auth/login/route.ts`
  - registra `SPOTIFY_REDIRECT_URI` para diagnóstico.
- `src/app/api/auth/callback/route.ts`
  - usa `APP_URL` para redirigir al finalizar el OAuth.

Para desarrollo local, los valores se definen en `.env.local`, que está excluido por `.gitignore`.

El archivo `.env.local.example` existe como plantilla. Su Redirect URI histórico apunta a puerto 3000, mientras que el script actual de desarrollo usa puerto 3002; para esta rama se debe usar 3002.

### Flags de desarrollo relacionadas

- `NEXT_PUBLIC_ENABLE_RAIL=1`: habilita el rail horizontal.
- `NEXT_PUBLIC_SPOTIFY_MOCK=1`: evita depender de Spotify durante desarrollo de UI.

`SPOTIFY_APP_LABEL` no está consumida actualmente por el código y no es necesaria para la rotación.

## Redirect URIs

Con el servidor actual:

```text
http://127.0.0.1:3002/api/auth/callback
```

Si también se usa explícitamente `localhost`:

```text
http://localhost:3002/api/auth/callback
```

Spotify considera `127.0.0.1` y `localhost` como URIs distintas. La URI registrada en la nueva app debe coincidir exactamente con `SPOTIFY_REDIRECT_URI`.

El `APP_URL` local recomendado para este proyecto es:

```text
http://127.0.0.1:3002
```

No incluir rutas adicionales ni una barra final en el Redirect URI.

## Rotación de Client ID / Secret

1. Crear una nueva app en [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Copiar el nuevo Client ID y Client Secret.
3. Configurar los Redirect URIs de la sección anterior.
4. En Development Mode, agregar en Users and Access los emails de las cuentas que se vayan a probar.
5. Actualizar únicamente el entorno local o staging:

```env
SPOTIFY_CLIENT_ID=<NEW_CLIENT_ID>
SPOTIFY_CLIENT_SECRET=<NEW_CLIENT_SECRET>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3002/api/auth/callback
APP_URL=http://127.0.0.1:3002
```

6. Reiniciar `npm run dev` para que Next.js relea `.env.local`.

Nunca colocar Client Secret en código, logs, commits o variables `NEXT_PUBLIC_*`.

## Invalidación de sesiones viejas

La aplicación guarda ahora una cookie adicional:

```text
sp_client_version
```

Su valor es un SHA-256 del `SPOTIFY_CLIENT_ID` configurado en el servidor.

Al crear una sesión nueva, el hash actual queda asociado a los tokens. En cada `getSession()`, el hash de la cookie debe coincidir con el Client ID configurado actualmente.

Por lo tanto, cuando se cambia el Client ID:

- las cookies de la app anterior quedan inválidas;
- `getValidAccessToken()` no intenta refrescar tokens de la app anterior;
- no se envían tokens "zombie" a Spotify;
- el siguiente login crea una sesión con la nueva versión.

No hace falta una migración de storage porque los tokens se almacenan en cookies httpOnly, no en una base de datos.

## Limpieza manual recomendada

Aunque la invalidación automática ya protege el backend:

1. Usar el logout de la UI o hacer un POST a:

```text
/api/auth/logout
```

> El endpoint de logout es `POST`, no un GET directo desde la barra del navegador.

2. Borrar las cookies del sitio `127.0.0.1:3002` desde DevTools si se quiere empezar completamente limpio.
3. Reiniciar el servidor de desarrollo.
4. Evitar conservar pestañas viejas con un callback OAuth pendiente.

## Forzar selector de cuenta

El endpoint de login acepta:

```text
/api/auth/login?force=1
```

Cuando `force=1`, se agrega `show_dialog=true` al authorize URL de Spotify.

Esto sirve para probar otra cuenta sin depender del último usuario recordado por Spotify.

Login normal:

```text
/api/auth/login
```

Login forzado:

```text
/api/auth/login?force=1
```

## Smoke test OAuth

Con el servidor en:

```text
http://127.0.0.1:3002
```

1. Abrir `/api/auth/login?force=1`.
2. Seleccionar la cuenta deseada.
3. Completar autorización.
4. Verificar en logs:

```text
GET /api/auth/login 307
GET /api/auth/callback?... 307
GET /api/auth/session 200
GET /api/auth/me 200
```

5. En la UI, `UserProfileChip` debe mostrar el `display_name` y avatar del usuario.

Si `/api/auth/me` devuelve 429, no seguir repitiendo login: el proyecto ya respeta `Retry-After` y tiene circuit breaker para evitar seguir consumiendo cuota.

## Probar switching de cuentas

1. Entrar con cuenta A usando `/api/auth/login?force=1`.
2. Hacer logout.
3. Volver a entrar con `/api/auth/login?force=1`.
4. Elegir cuenta B.
5. Confirmar que `/api/auth/me` muestra el perfil B.

Cambiar de usuario de Spotify no elimina por sí mismo la cuota de una app en Development Mode; el objetivo de este flujo es validar el OAuth y el switching, no resetear límites de API.

## Mitigaciones ya presentes

- `/api/now-playing`: polling de 5 segundos y pausa cuando la pestaña no está visible.
- `/api/auth/me`: cache TTL de 10 minutos + dedupe de requests concurrentes.
- `/api/collection`: lazy-load desde los capítulos del rail + cache + in-flight dedupe.
- Spotify Web API: circuit breaker basado en `Retry-After`.
- `QUOTA_EXCEEDED`: no se reintenta automáticamente en el frontend.

## Desarrollo de UI sin Spotify

Para trabajar sin consumir cuota:

```env
NEXT_PUBLIC_SPOTIFY_MOCK=1
```

Esto permite probar perfil, colección, rail, búsqueda, filtros, click, drag y modal sin depender de Spotify.

Para volver a OAuth real:

```env
NEXT_PUBLIC_SPOTIFY_MOCK=0
```

y reiniciar el servidor.

## Vercel / staging

Si la app se despliega en Vercel:

- configurar `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` y `APP_URL` en Environment Variables;
- no copiar secretos al repositorio;
- usar Redirect URIs específicas del deployment;
- no reutilizar accidentalmente Client Secret de producción en desarrollo ni viceversa.

La configuración de Vercel no es inspeccionable desde esta integración de GitHub, así que debe verificarse manualmente antes de desplegar la rotación.
