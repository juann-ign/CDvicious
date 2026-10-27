# EP2-T2 / EP2-T4 — Contrato de estado del playback

**Estado:** coordinador y consumidores conectados; la aceptación final depende de Build y Browser QA sin retries.

## Fuente de verdad

`src/lib/playbackSnapshotCoordinator.ts` centraliza la promoción de snapshots y el estado del intento. Mantiene `confirmedSnapshot` por separado de `attempt` y solo permite confirmar un intento pendiente cuando una observación:
- tiene identidad de álbum coincidente (URI, con ID como fallback);
- se solicitó después del inicio del intento vigente;
- llega dentro del plazo de confirmación;
- tiene una pista válida y `isPlaying: true`;
- y lleva un `requestSeq` más nuevo que la última observación procesada.

La aceptación de `POST /api/play` es solo `commandAccepted`, no una confirmación. Los snapshots pausados o de otro álbum durante un intento pendiente no reemplazan el último snapshot confirmado. Cada nuevo intento invalida el anterior; los eventos de otra generación y los callbacks tardíos no pueden cambiarlo. Los errores preservan el snapshot confirmado y el timeout termina en `degraded` sin resucitar el intento.

## Integración en la aplicación

- `nowPlayingStore` expone `requestSeq`, `requestStartedAt` y `receivedAt`. Ignora respuestas fuera de orden y permite solicitar una lectura de confirmación posterior al comando incluso si otra consulta estaba en curso.
- `mockSpotifyStore` expone los mismos metadatos y conserva URI/ID del álbum, para que el contrato se pruebe con la misma identidad estable que en producción.
- `JewelCaseDetailModal` crea un `attemptId` por Play. Los eventos de comando y vuelo llevan ese ID. El evento de acople de una animación solo habilita la coreografía de la UI; no confirma playback.
- `DeckPinnedLayer` alimenta el CD persistente, el booklet y el VFD únicamente desde el snapshot promovido por el coordinador. Durante un intento pendiente conserva la pista confirmada previa y marca el estado de sincronización como `pending`; no usa el evento visual ni el HTTP 200 para promover la pista.
- `NowPlayingCard` expone `data-playback-status`: `unavailable`, `confirmed`, `pending`, `failed` o `degraded`. `data-is-playing` no es una señal de confirmación del intento.

## Cobertura

### Pruebas deterministas: `tests/contracts/playback-snapshot-contract.test.mjs`

14 casos cubren carga inicial, comando aceptado sin confirmación, snapshot objetivo fresco, objetivo pausado, pausa, cambio de pista, consulta iniciada antes de Play, respuestas fuera de orden, álbum equivocado, intentos superpuestos, error de autenticación, dispositivo no disponible, error de red con reintento y timeout con evento tardío.

### Pruebas E2E: `tests/e2e/playback-state-contract.spec.cjs`

Cubre la carga inicial, pausa/reanudación, Next/Previous y recuperación luego de un fallo de red con un nuevo intento exitoso. Las aserciones verifican contenido del VFD, estado de reproducción y recuperación.

### Regresión existente: STAB-03 e issue #88

La prueba `play confirmado desde Colección: vuelo, acople y Now Playing terminan sincronizados` en `tests/e2e/stab-03-modal-play-flight.spec.cjs` permanece activa y exige que el VFD pase de `pending` a `confirmed` solo después de un snapshot objetivo con `isPlaying: true`. Se omite únicamente en el job de matriz `RAIL_FLAG=0`; corre con `RAIL_FLAG=1`. Playwright mantiene `retries: 0`.

Issue [#88 — desfasaje intermitente Deck/Now Playing](https://github.com/juann-ign/CDvicious/issues/88) se aborda con esta cobertura. No se relaja ni se reemplaza la aserción original.

## Validación

- `npm run test:playback-contract`: ejecuta la suite determinista sin dependencias adicionales.
- `npm run test`: TypeScript.
- `npm run build`: build de producción.
- STAB-01 Browser QA: ejecutar con `RAIL_FLAG=0` y `RAIL_FLAG=1`.

El modo mock no sustituye una prueba de release con sesión Spotify real y dispositivo activo. Si una observación en live no confirma el álbum dentro de quince segundos, la UI debe quedar en `degraded`, conservar la última pista confirmada y permitir un intento nuevo.
