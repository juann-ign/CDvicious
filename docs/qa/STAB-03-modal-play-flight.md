# STAB-03 — Regresión modal → play → flying disc → Deck

**Branch:** \`qa/stab-03-modal-play-flight\`  
**Scope:** sólo selección de álbum, modal, petición de reproducción, vuelo, acople al Deck y reconciliación de Now Playing.  
**Producto:** no se cambió lógica de reproducción. Se añadieron selectores \`data-testid\` de observabilidad para que Playwright pueda verificar el estado visual real.

## Cobertura automatizada

El spec \`tests/e2e/stab-03-modal-play-flight.spec.cjs\` corre con \`NEXT_PUBLIC_SPOTIFY_MOCK=1\` y reemplaza \`POST /api/play\` desde Playwright para controlar la respuesta y el momento en que llega.

| Caso | Condición | Resultado exigido |
|---|---|---|
| Selección y cierre | Seleccionar desde Batea con mouse; seleccionar desde Colección con Enter | Modal correcto, cierre por mouse/Escape, atributo \`data-modal-open\` eliminado y foco restaurado a la tarjeta original |
| Play confirmado | Respuesta \`200 { success: true }\` | La petición contiene el URI del álbum y el device mock; el disco vuela; eventos en orden \`flight-started → flight-arrived → playback-ready → playback-started\`; el disco temporal desaparece, el Deck vuelve al capítulo 0 y Now Playing refleja el álbum elegido con estado playing |
| Autenticación | Respuesta simulada \`401 AUTH_REQUIRED\` desde Batea | Vuelo cancelado, modal reabierto con feedback, retorno al capítulo de origen y reproducción/track visuales anteriores restaurados |
| Dispositivo no disponible | Respuesta simulada \`409 DEVICE_NOT_AVAILABLE\` desde Colección | Mismo rollback; feedback de dispositivo en el modal |
| Spotify no confirma | Respuesta simulada \`502 SPOTIFY_PLAY_FAILED\` desde Colección | No se emite \`playback-started\`, no queda vuelo y el modal conserva el feedback de fallo |
| Red caída | Request de \`/api/play\` abortado por Playwright desde Batea | Feedback de conexión; no queda vuelo ni estado de Deck en transición |

Las fallas de reproducción se responden deliberadamente **después de comprobar que el vuelo ya está montado**. Esto ejercita la cancelación durante el vuelo, no solamente los errores previos al inicio.

## Ejecución en CI

El workflow existente **STAB-01 Browser QA** ejecuta todos los specs \`tests/e2e/**/*.spec.cjs\` con \`RAIL_FLAG=0\` y \`RAIL_FLAG=1\`. Este spec marca los escenarios del rail como omitidos si el flag está apagado; el resto de la matriz de fallback sigue ejecutándose.

El workflow instala Playwright fuera de las dependencias de la aplicación, usando la versión fijada en la configuración del workflow. En local, seguir los comandos de ejecución definidos en \`docs/qa/STAB-02-hitbox-scroll-lock.md\` y ejecutar:

\`\`\`powershell
$env:RAIL_FLAG = "1"
$env:NEXT_PUBLIC_ENABLE_RAIL = "1"
$env:NEXT_PUBLIC_SPOTIFY_MOCK = "1"
playwright test tests/e2e/stab-03-modal-play-flight.spec.cjs
\`\`\`

## Evidencia y clasificación

- La suite guarda la secuencia de eventos \`cdvicious:disc-flight-*\` dentro del contexto del navegador; las aserciones incluyen el array de eventos al fallar.
- Los marcadores \`data-testid="rail-flying-disc"\` y \`data-testid="deck-now-playing"\` permiten comprobar presencia del vuelo, artista actual y estado \`data-is-playing\`. Son atributos de test, sin efecto de comportamiento.
- Los errores de autenticación, disponibilidad de dispositivo y red son **simulados desde el navegador** para probar la reacción de UI. No prueban credenciales reales, el SDK real de Spotify, hardware/dispositivo físico ni la respuesta live de Spotify.
- El éxito automatizado verifica la confirmación simulada de \`/api/play\` y el contrato de eventos; la confirmación real en una sesión autenticada de Spotify queda como validación manual antes de release.
- Si un test encuentra una diferencia entre el estado visual y el esperado, clasificarla como modal, playback/API o estado del Deck/Now Playing según la primera aserción que falla; adjuntar los artefactos Playwright del job y no enmascarar el fallo ampliando timeouts sin atribuir su causa.

## Criterio de salida

La regresión se considera validada sólo si el build y ambos jobs de Browser QA terminan en verde en el commit final, sin fallos ocultos por reintentos, y si la prueba de reproducción real con Spotify se confirma manualmente. Los defectos de entorno live que no puedan reproducirse con el mock deben quedar como tickets separados con condición de reproducción, esperado vs. real, evidencia y módulo responsable.
