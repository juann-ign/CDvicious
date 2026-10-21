# Mixtape Lab — Especificación de producto

**Estado:** propuesta de producto previa a implementación  
**Ticket:** 4.1 — Definición de producto del Mixtape Lab  
**Alcance de este documento:** describir el comportamiento actual y proponer un MVP. No implementa cambios funcionales.

## Estado actual

### Ubicación e integración

- El componente vive en `src/components/crate/MixtapeChapter.tsx` y aparece como quinto capítulo del rail desktop, integrado desde `src/components/scroll/HorizontalRail.tsx`.
- Consume `useCollectionCache()` de `src/lib/collectionClient.ts`; no inicia por sí mismo una carga de colección.
- La colección se carga desde `/api/collection` al activar el capítulo de Colección y con sesión autenticada. Por eso, si el usuario navega directamente al Mixtape Lab sin haber poblado la caché, el selector puede mostrar `SIN MATERIAL` aunque la cuenta tenga álbumes guardados. El componente no distingue una caché todavía no cargada de una colección realmente vacía.
- También existe `GET /api/search?q=...`, que busca hasta 10 álbumes, pero no está conectado al selector del Mixtape Lab.

### Selección de álbumes

- `PICK_COUNT = 6`: el selector presenta los primeros seis elementos de `cachedAlbums`, en el orden en que llegan desde la caché.
- Cada tarjeta muestra portada, título, artistas y una acción para sumar el álbum.
- La selección se modela con `AlbumItem`, incluyendo el URI de álbum `spotify:album:...`.
- No hay búsqueda, paginación, filtro ni acceso independiente a todo el catálogo desde este componente.

### Cola local y límite

- `QUEUE_LIMIT = 8`: se pueden sumar hasta ocho álbumes.
- No se admite agregar dos veces el mismo álbum, usando `album.id` como clave. Al alcanzar el límite, se deshabilitan los botones de agregado.
- Se puede quitar un álbum individual o vaciar toda la cola.
- El orden es el de incorporación. No existen controles para reordenar.
- La cola se guarda solo en estado React local: no persiste en servidor ni en `localStorage`, y se pierde al desmontar el componente o recargar la página.

### `toSpotifyPlaylistPayload()`

La función transforma la cola a este contrato:

```ts
{
  name: "CDvicious — Mixtape Lab",
  uris: queue.map((album) => album.uri)
}
```

Su tipo es `MixtapePlaylistPayload`. La función solo prepara un nombre fijo y una lista de URI de álbumes; no consulta las pistas de esos álbumes, no crea una playlist y no hace llamadas de red.

**Incompatibilidad que hay que resolver antes de implementar la exportación:** la API de Spotify para añadir elementos a una playlist espera URI de pistas o episodios, no URI de álbumes. Para que la selección por álbum produzca una playlist de canciones, la implementación debe obtener las pistas de cada álbum y construir la lista de URI de pista preservando el orden elegido. Además, los elementos se envían en lotes de hasta 100 por solicitud. La API vigente usa `POST /playlists/{playlist_id}/items`; no se debe implementar con la antigua ruta `/tracks`, retirada en la migración de la Web API de febrero de 2026.

Referencias oficiales:
- [Get Album Tracks](https://developer.spotify.com/documentation/web-api/reference/get-an-albums-tracks)
- [Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist)
- [Migración de febrero de 2026 de Spotify Web API](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)

### Estado de `spotifyBridge` y exportación

- `MixtapeSpotifyBridge` define una interfaz opcional con un método: `exportPlaylist(payload): Promise<void>`.
- `MixtapeChapter` recibe `spotifyBridge` como prop opcional. `HorizontalRail.tsx` lo renderiza sin esa prop; por lo tanto, el botón de exportación aparece deshabilitado en la integración actual.
- El botón lleva la etiqueta `EXPORTAR A SPOTIFY · POST-MVP`. No existe en `main` una ruta dedicada a crear playlists.
- Si el puente estuviera disponible, `handleExport()` enviaría el payload, deshabilitaría el botón durante la operación y detendría temporalmente el rail. Un bloque `finally` restaura el estado y el rail, pero no hay manejo de error ni mensaje visible de éxito o fracaso.
- Los estados `loading`, `rateLimitSeconds` y `quotaExceeded` están fijados en sus valores iniciales en este componente. No representan actualmente un flujo real de carga, rate limit ni cuota.

### Autenticación y permisos existentes

La autenticación OAuth y las cookies de sesión se gestionan en las rutas `/api/auth/*` y en `src/lib/session.ts`. El alcance OAuth definido en `src/lib/constants.ts` incluye lectura de biblioteca y permisos de reproducción, pero **no incluye scopes de escritura de playlists**. Para crear una playlist privada y añadir elementos, el usuario debe conceder `playlist-modify-private`; ese permiso debe incorporarse al flujo OAuth antes de desarrollar la exportación. Agregar un scope al código no actualiza retroactivamente una sesión concedida: el usuario debe pasar otra vez por la autorización para concederlo.

Referencias oficiales:
- [Create Playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist)
- [Scopes de Spotify](https://developer.spotify.com/documentation/web-api/concepts/scopes)

## Decisiones pendientes

Las opciones siguientes son recomendaciones para cerrar el alcance antes de implementar. No describen funcionalidad ya existente.

### a) ¿Álbum completo o tracks individuales?

**Recomendación MVP:** el álbum completo es la unidad principal de selección. Encaja con la metáfora de colección física y con las tarjetas de álbum ya construidas.

Al exportar, cada álbum se expande a sus pistas mediante la Web API; las pistas se añaden en el orden original del álbum, y los álbumes en el orden de la cola. La selección de pistas individuales queda como mejora posterior, porque requiere otra interacción de selección y más estados de interfaz.

La implementación debe decidir y documentar cómo tratar pistas repetidas entre álbumes distintos (por ejemplo, una compilación): recomendación inicial, preservar el contenido y orden de cada álbum y no deduplicar pistas silenciosamente.

### b) ¿Cómo se accede al selector: colección, búsqueda o batea?

**Recomendación MVP:** selector dentro del propio Mixtape Lab con:
1. álbumes de la colección guardada del usuario;
2. búsqueda por álbum o artista, reutilizando o adaptando la ruta existente `/api/search`;
3. estados claros de carga, ausencia de resultados, error y sesión no autenticada.

El componente no debe depender de que el usuario haya visitado antes el capítulo Colección. Se puede reutilizar la caché compartida, pero el selector debe disparar o solicitar una carga cuando la caché todavía no esté disponible.

La incorporación directa desde Batea o Colección puede evaluarse luego. Para el MVP, un único punto de entrada y una única cola hacen el flujo más fácil de probar.

### c) ¿Cómo se exporta?

**Recomendación MVP:** crear una playlist nueva en Spotify en cada exportación confirmada, con nombre editable y un valor inicial como `CDvicious — Mixtape Lab`. Crear la playlist como privada (`public: false`) por defecto y mostrar un enlace de Spotify después de completar la operación.

Flujo de API esperado:

1. Validar sesión y cola en el servidor.
2. Obtener las pistas de los álbumes elegidos y preparar los URI de pista.
3. Crear la playlist mediante `POST /me/playlists`.
4. Añadir las pistas con `POST /playlists/{playlist_id}/items`, en bloques de hasta 100 URI.
5. Devolver al frontend el enlace de la playlist y el resultado.

Crear una playlist nueva en cada acción expresa mejor el contrato del botón y evita modificar una playlist preexistente del usuario. No reutilizar ni sobrescribir playlists por coincidencia de nombre.

### d) ¿Qué pasa si falla?

**Recomendación MVP:** el error no debe vaciar la cola. Mostrar un estado entendible, permitir reintentar y no afirmar éxito hasta completar la exportación.

Distinguir al menos:
- sesión ausente, token rechazado o autorización pendiente: pedir volver a iniciar sesión / conceder permisos;
- límite de solicitudes (HTTP 429): respetar `Retry-After` si está disponible y evitar reintentos automáticos agresivos;
- error de red o fallo de Spotify: mantener la cola y permitir reintento manual;
- exportación parcial: explicar qué se logró y qué quedó pendiente, si puede determinarse con certeza.

Hay una ventana de fallo entre crear la playlist y añadir todos sus elementos. En ese caso puede quedar una playlist vacía o parcial. La interfaz debe conservar el ID/enlace de la playlist creada e intentar completar esa misma playlist al reintentar, en lugar de crear duplicados sin advertencia. Evitar prometer recuperación automática si no se dispone de estado suficiente para saber qué elementos se añadieron.

### e) ¿Cuál es el límite de la cola?

**Recomendación MVP:** mantener el límite existente de ocho álbumes para reducir complejidad y mantener una composición visual manejable. Mostrar el contador y explicar cuando el límite impida agregar más.

El límite de ocho álbumes no garantiza que la exportación quepa en una única solicitud: un álbum puede aportar muchas pistas. La exportación debe paginar la lectura si corresponde y dividir las pistas en solicitudes de hasta 100 elementos. Para una futura versión con selección de tracks, revisar el límite por cantidad total de canciones además del límite de álbumes.

### f) ¿Se puede reordenar?

**Recomendación MVP:** sí. Incluir acciones accesibles de mover arriba / mover abajo en cada fila de la cola, deshabilitadas en los extremos. Es suficiente para que el orden de exportación sea explícito sin sumar complejidad de drag-and-drop.

El orden final de la playlist debe seguir ese orden de álbumes y, dentro de cada álbum, el orden de las pistas devuelto por Spotify. Drag-and-drop queda fuera del MVP.

## Propuesta de UX mínima viable

1. **Elegir:** una lista acotada de álbumes guardados y una búsqueda por álbum/artista. Cada resultado muestra portada, nombre, artista y un botón claro para agregar.
2. **Armar la cola:** panel persistente con número de posición, portada, álbum/artista y controles para mover, quitar y vaciar. Mostrar el contador `n/8` y evitar duplicados del mismo álbum.
3. **Revisar antes de exportar:** mostrar el nombre editable de la playlist, confirmar que se exportarán canciones de los álbumes seleccionados y deshabilitar acciones mientras la operación está en curso.
4. **Exportar:** una acción primaria, etiquetada como crear playlist en Spotify. Si falta autenticación o permiso, guiar al usuario para autorizar en vez de fallar silenciosamente.
5. **Resultado:** al completar, mostrar confirmación y enlace a Spotify. Si falla, conservar la cola y mostrar qué hacer a continuación.

### Estados mínimos de interfaz

- Cargando colección / búsqueda.
- Sin sesión o permisos de escritura insuficientes.
- Sin álbumes disponibles / sin resultados de búsqueda.
- Cola vacía.
- Cola lista para exportar.
- Exportando (acción bloqueada y progreso legible).
- Exportación completa con enlace a Spotify.
- Error recuperable, con cola conservada.
- Exportación parcial, solo cuando la API permita afirmar con precisión qué parte se completó.

## Dependencias técnicas

### OAuth y sesión

- Añadir el scope `playlist-modify-private` a `SPOTIFY_SCOPES` en `src/lib/constants.ts` y definir cómo renovar el consentimiento de usuarios existentes.
- Verificar la sesión y resolver / refrescar el token en el servidor; las llamadas de escritura a Spotify deben hacerse desde una ruta de servidor de CDvicious, no desde un componente cliente.
- Asegurar que el flujo devuelva errores normalizados (401, 403, 429, red/5xx) con mensajes seguros para la UI.

### Web API y rutas de aplicación

- Reutilizar la sesión y utilidades actuales, pero añadir una ruta específica para la operación de exportación o endpoints de servidor bien delimitados.
- Leer tracks por álbum y convertir la cola de `AlbumItem` en URI de tracks; la función actual `toSpotifyPlaylistPayload()` necesita evolucionar o separarse en una etapa explícita de expansión.
- Crear la playlist con `POST /me/playlists`, enviando `public: false`.
- Añadir canciones con el endpoint vigente `POST /playlists/{playlist_id}/items`. No usar el endpoint antiguo `/playlists/{playlist_id}/tracks`, retirado en la migración de febrero de 2026.
- Respetar el máximo de 100 elementos por solicitud, el orden y las respuestas de error de Spotify.
- Tomar el enlace final del campo `external_urls.spotify` devuelto por Spotify.

### Integración frontend

- Pasar explícitamente el bridge o reemplazarlo por una llamada a una ruta propia. Actualmente no se inyecta en `HorizontalRail.tsx`.
- Conectar el estado real de exportación y errores con los indicadores visuales; hoy varios indicadores son placeholders fijos.
- Preservar la cola y evitar dobles envíos cuando el usuario hace clic repetidamente o reintenta una exportación parcial.
- Definir el comportamiento con `NEXT_PUBLIC_SPOTIFY_MOCK=1`: simular éxito y fallos previsibles sin contactar Spotify, e indicar que el resultado es simulado.

## Criterios de aceptación para la futura implementación

- [ ] Entrar al Mixtape Lab directamente no produce un falso estado de colección vacía mientras la carga está pendiente.
- [ ] Se puede buscar y agregar álbumes sin duplicar la misma entidad.
- [ ] La cola respeta el límite de ocho, permite quitar, vaciar y reordenar.
- [ ] La exportación convierte álbumes a URI de pistas, manteniendo el orden esperado.
- [ ] Se crea una playlist privada nueva y se presenta un enlace real al terminar.
- [ ] Se usan endpoints vigentes de Spotify y lotes de no más de 100 URI.
- [ ] Se puede distinguir el éxito, el fallo y una exportación parcial; los errores no vacían la cola ni generan duplicados silenciosos.
- [ ] Los scopes faltantes se solicitan mediante OAuth y la aplicación recupera correctamente una sesión con los nuevos permisos.
- [ ] El flujo mock puede probarse sin llamadas reales a Spotify.
- [ ] Build, lint, TypeScript y las pruebas del flujo de exportación quedan verificados antes de dar por terminada la implementación.

## Fuera de alcance de este ticket

Este ticket solo define el producto y documenta el comportamiento de `main`. No modifica componentes, rutas, permisos OAuth, estilos ni lógica de reproducción; tampoco implementa búsqueda, reordenamiento ni exportación.
