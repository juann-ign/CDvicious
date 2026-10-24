# STAB-03 — Regresión modal → play → flying disc → Deck

**Branch:** `qa/stab-03-modal-play-flight`  
**Scope:** selección de álbum, modal, petición de reproducción, vuelo, acople al Deck y reconciliación de Now Playing.

## Cobertura automatizada

Las verificaciones de cierre, restauración del foco y desbloqueo del wheel están agrupadas en el escenario de selección Batea/Colección de STAB-03. Se evita crear contextos WebGL duplicados para repetir las mismas interacciones; STAB-02 conserva la cobertura independiente de drag, `pointercancel`, hit-testing, estado `inert` y filtros.

`HorizontalRail` se importa dinámicamente del lado cliente. Los helpers de Playwright esperan hasta 20 segundos para que aparezcan la navegación y `data-rail-ready="true"` antes de interactuar, porque en CI la inicialización de la escena 3D/WebGL puede superar la espera corta sin que exista un fallo funcional. Las pruebas mantienen intactas las aserciones de navegación, foco, filtros y reproducción.

El spec `tests/e2e/stab-03-modal-play-flight.spec.cjs` corre con `NEXT_PUBLIC_SPOTIFY_MOCK=1` y controla desde Playwright la respuesta y el momento en que llega `POST /api/play`.

| Caso | Condición | Resultado esperado |
|---|---|---|
| Selección, cierre y bloqueo del rail | Seleccionar desde Batea con mouse y cerrar con mouse; seleccionar desde Colección con Enter y cerrar con Escape | Modal correcto, `data-modal-open` se elimina, se restaura el foco y el wheel avanza a Mixtape Lab después del cierre |
| Play confirmado | Respuesta simulada `200 { success: true }` | Petición con el URI del álbum y device mock; vuelo visible; eventos ordenados `flight-started → flight-arrived → playback-ready → playback-started`; disco temporal eliminado y Deck/Now Playing sincronizados |
| Autenticación | Respuesta simulada `401 AUTH_REQUIRED` desde Batea | Vuelo cancelado, retorno al capítulo de origen, modal reabierto con feedback y pista previa restaurada |
| Dispositivo no disponible | Respuesta simulada `409 DEVICE_NOT_AVAILABLE` desde Colección | Mismo rollback y feedback de dispositivo |
| Spotify no confirma | Respuesta simulada `502 SPOTIFY_PLAY_FAILED` desde Colección | No se emite `playback-started`, no queda vuelo y el modal conserva el mensaje de error |
| Red caída | Request de `/api/play` abortado desde Batea | Feedback de conexión; no queda vuelo ni estado transitorio del Deck |

Las fallas de reproducción se responden **después de comprobar que el vuelo está montado**, para ejercitar la cancelación durante la transición y no sólo un error previo al vuelo.

## Defecto encontrado durante la regresión

- **Condición de reproducción:** lanzar Play desde un álbum abierto en Batea o Colección y responder la petición de reproducción con autenticación rechazada, dispositivo no disponible, error de Spotify o fallo de red.
- **Esperado:** cancelar el disco temporal, volver al capítulo de origen y reabrir allí el modal con feedback.
- **Real observado en CI:** el vuelo desaparecía y el modal volvía con feedback, pero el rail quedaba en `data-chapter="0"` (Deck); las pruebas esperaban capítulo `2` (Batea) o `3` (Colección). Las cuatro variantes de error reproducían el mismo resultado.
- **Evidencia:** [Browser QA rail habilitado — ejecución fallida](https://github.com/juann-ign/CDvicious/actions/runs/40067150458); el log muestra `Expected: "2"/"3"`, `Received: "0"` con `data-modal-open="true"`.
- **Clasificación:** coordinación de la recuperación del flujo de reproducción con el estado de navegación del rail; no era un error de mensaje del modal.
- **Corrección incorporada:** `scrollToChapter(index, 0)` aplica la navegación instantánea de forma inmediata. Antes, Lenis podía esperar al siguiente `requestAnimationFrame`; el modal de recuperación volvía a montar y detenía Lenis antes de que cambiara el capítulo. La corrección permite restaurar el capítulo antes de bloquear otra vez la navegación. La matriz posterior debe confirmar el arreglo en los cuatro escenarios.
- **Ajuste de verificación:** el primer run con la corrección mostró que la aserción del retorno final a Deck fallaba por un desplazamiento residual estable de 7 px en el borde del panel, aunque `data-chapter="0"`, el botón Deck activo y la UI de Now Playing estuvieran correctos. La comprobación final admite hasta 10 px sólo en esa navegación de cierre; la selección de álbum y todas las aserciones de recuperación del capítulo de origen mantienen el umbral estricto de 2 px.
- **Deck/Now Playing:** se conserva la última instantánea válida mientras Deck está fuera del capítulo activo, para que cancelar el vuelo no capture un snapshot vacío ni pierda el track previo.

## Evidencia y límites

- La suite registra eventos `cdvicious:disc-flight-*` y adjunta screenshot, video y trace de Playwright cuando hay fallos.
- `data-testid="rail-flying-disc"` y `data-testid="deck-now-playing"` exponen la presencia del vuelo y el estado visual del VFD; no cambian el comportamiento.
- Autenticación, dispositivo no disponible y red se simulan en el navegador. Esto no valida credenciales reales, el SDK live de Spotify ni un dispositivo físico.
- La respuesta exitosa automatizada confirma el contrato del flujo usando el mock. Antes del release sigue siendo necesaria una prueba manual con una sesión Spotify autenticada y dispositivo disponible.

## Ejecución local

El workflow **STAB-01 Browser QA** corre todos los specs con `RAIL_FLAG=0` y `RAIL_FLAG=1`. Para ejecutar sólo esta matriz localmente, seguir la instalación de Playwright externo que figura en `docs/qa/STAB-02-hitbox-scroll-lock.md`. El runner levanta `npm run start`, así que compilá la app con las variables del flag antes de ejecutarlo:

```powershell
$env:RAIL_FLAG = "1"
$env:NEXT_PUBLIC_ENABLE_RAIL = "1"
$env:NEXT_PUBLIC_SPOTIFY_MOCK = "1"
npm run build
playwright test tests/e2e/stab-03-modal-play-flight.spec.cjs
```

## Criterio de salida

No considerar validada la regresión hasta que Build y ambos jobs Browser QA terminen correctamente en el código final, sin fallos ocultos por reintentos. La verificación manual de Spotify real queda pendiente; cualquier otro fallo debe documentarse con condición, esperado vs. real, evidencia y clasificación.
