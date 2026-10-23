# STAB-02 — Hitboxes y scroll lock

**Rama:** \`qa/stab-02-hitbox-scroll-lock\`  
**Base:** \`main\` al crear la rama  
**Alcance:** Playwright Chromium, rail habilitado con \`NEXT_PUBLIC_ENABLE_RAIL=1\` y colección mock.  
**Regla de trabajo:** no se cambia CSS de stacking/eventos ni \`RailContext.tsx\` sin una falla reproducible y un hit-test que identifique al receptor real.

## Evidencia y estado

Esta matriz agrega pruebas reproducibles a \`tests/e2e/stab-02-hitbox-scroll-lock.spec.cjs\`. Las pruebas ejecutan contra el servidor lanzado por Playwright con \`npm run dev\`; la colección se intercepta con fixtures del proyecto para no depender de Spotify ni de credenciales externas.

| Caso | Aserción automatizada | Evidencia / límite |
|---|---|---|
| Click corto en Batea | Abre el diálogo; botón de cierre recibe foco; Escape cierra; se elimina \`data-modal-open\`; el foco vuelve al botón de origen. | Chromium verifica foco y estado observable. |
| Scroll lock del modal | Una rueda durante el modal no cambia el capítulo; tras cerrar, la rueda cambia de capítulo. | Verifica comportamiento extremo a extremo, no inspecciona internamente el objeto Lenis. |
| Drag en Batea y \`pointerup\` | El umbral de drag se activa, se limpia al soltar y no aparece un modal accidental. | El comportamiento natural de mouse se automatiza; falta validar touch/trackpad físico. |
| \`pointercancel\` | Se inyecta el evento con el pointerId observado, se comprueba el final del estado de drag y se exige que la rueda vuelva a mover el rail. | La cancelación es sintética sobre Chromium; confirmar además una cancelación real desde dispositivo táctil. |
| Deck pinned vs Batea/Colección | Verifica \`data-chapter\`, \`data-deck-interactive\`, \`inert\` y usa \`document.elementsFromPoint()\` en intersecciones de targets del overlay con el panel activo. | La prueba adjunta el resultado del hit-test al log de CI. Si no hay probes geométricos, no se considera evidencia suficiente de cobertura del solapamiento y requiere prueba manual. |
| Modal desde Colección | Escape devuelve foco a la carátula y libera el scroll lock. | Cobertura E2E con mock. |
| Búsqueda/filtros/paginación | Una fixture expandida a 36 álbumes cubre dos páginas; verifica búsqueda, década, archivo y paginación. | No usa contenido real de Spotify. |
| Recortes / tamaños | Comprueba bounding boxes de controles en 1920×1080, 1366×768, 1280×540 y 761×540 CSS px. | Es una comprobación de viewport, no emula de forma fiable el zoom del navegador al 125%. |

## Ejecución en CI

El workflow existente **STAB-01 Browser QA** se activa al cambiar \`tests/e2e/**\` o \`playwright.config.cjs\`; ejecuta la suite completa en Chromium con \`RAIL_FLAG=0\` y \`RAIL_FLAG=1\`. Los checks se deben leer desde el PR antes de considerar la matriz validada.

- [Suite STAB-02](../../tests/e2e/stab-02-hitbox-scroll-lock.spec.cjs)
- [Audit estático e histórico](../../docs/hitbox-audit.md)

## Pendiente de validación manual

1. Levantar el proyecto en Windows, abrir \`http://127.0.0.1:3002\`, seleccionar un álbum mediante click breve y repetir con un arrastre horizontal largo.
2. Repetir el drag usando trackpad; soltar fuera del shelf y comprobar que la rueda vuelve a desplazar el rail.
3. Verificar cancelación real de pointer (por ejemplo al salir de la ventana con un drag activo o en un dispositivo táctil); el test E2E de \`pointercancel\` es sintético.
4. En DevTools, recorrer Deck → Split → Batea → Colección mientras inspecciona \`document.documentElement.dataset.chapter\`, \`[data-rail-overlay]\` y el elemento superior de \`document.elementsFromPoint(x, y)\` sobre puntos donde el Deck cubra visualmente el panel.
5. Repetir el recorrido con zoom de navegador al 125%, una ventana baja y una resolución ancha.

## Comandos locales (PowerShell)

Primero detener cualquier servidor de desarrollo que ya esté ejecutándose. Playwright inicia su propia instancia mediante \`webServer\`; el puerto es 3002.

\`\`\`powershell
git switch qa/stab-02-hitbox-scroll-lock
npm ci

# Playwright se instala fuera del proyecto, igual que en CI.
$env:TEMP
npm install --prefix "$env:TEMP\cdvicious-playwright" --no-save @playwright/test@1.64.1
$env:NODE_PATH = "$env:TEMP\cdvicious-playwright\node_modules"
& "$env:TEMP\cdvicious-playwright\node_modules\.bin\playwright.cmd" install chromium

# Ejecuta STAB-02 y la suite E2E existente con el rail encendido.
$env:RAIL_FLAG = "1"
& "$env:TEMP\cdvicious-playwright\node_modules\.bin\playwright.cmd" test tests/e2e/stab-02-hitbox-scroll-lock.spec.cjs
\`\`\`

Para ejecutar la misma suite en el fallback sin rail, usar \`$env:RAIL_FLAG = "0"\`. Los tests de STAB-02 que requieren interacción de rail se omiten en ese modo; la matriz con flag 0 sirve para detectar regresiones en la experiencia fallback.

Para una inspección manual separada de la suite automatizada:

\`\`\`powershell
$env:NEXT_PUBLIC_ENABLE_RAIL = "1"
$env:NEXT_PUBLIC_SPOTIFY_MOCK = "1"
npm run dev
\`\`\`

Abrir \`http://127.0.0.1:3002\`. Detener con Ctrl+C antes de lanzar Playwright; el \`webServer\` de la configuración usa \`reuseExistingServer: false\`.

### Inspección manual con DevTools

Con el capítulo que se está auditando visible, ejecutar en la consola:

\`\`\`javascript
const root = document.querySelector("[data-rail-wrapper]")?.parentElement;
const overlay = root?.querySelector("[data-rail-overlay]");
const panel = document.querySelector('section[aria-label="La Batea"], section[aria-label="La Colección"]');
const rect = panel?.getBoundingClientRect();
const x = rect ? rect.left + rect.width / 2 : 0;
const y = rect ? rect.top + rect.height / 2 : 0;

console.table({
  chapter: root?.dataset.chapter,
  deckInteractive: root?.dataset.deckInteractive,
  overlayInert: overlay?.hasAttribute("inert"),
  panel: panel?.getAttribute("aria-label"),
  panelInert: panel?.hasAttribute("inert"),
  topHit: document.elementsFromPoint(x, y)[0]?.outerHTML.slice(0, 240),
});
\`\`\`

El punto del centro es sólo una sonda inicial: mover \`x\` e \`y\` a una zona real de superposición del Deck antes de sacar conclusiones. No cambiar \`z-index\`, \`pointer-events\` o \`RailContext.tsx\` sólo porque una capa parezca estar encima.

## Política para hallazgos

Un check rojo debe clasificarse primero como (a) bug de producto reproducido, (b) selector/fixture de prueba incorrecto, o (c) inestabilidad ambiental de Chromium. Adjuntar trace/screenshot de Playwright cuando exista. Corregir el test sólo si su premisa era incorrecta; corregir producto sólo cuando el receptor del evento y la causa hayan sido demostrados. Los defectos ajenos al alcance van a tickets separados y no se absorben en este PR.

**Estado al crear la rama:** pendiente de ejecutar CI. No declarar aprobado hasta revisar todos los jobs y repetir cualquier fallo después de la corrección.
