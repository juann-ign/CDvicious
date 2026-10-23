# STAB-02 — Matriz Playwright de hitboxes y scroll lock

**Branch:** qa/stab-02-playwright-matrix  
**Estado:** matriz agregada; pendiente de resultados de CI y validación manual en navegador visible. No se declara aprobado hasta revisar ambos.

## Cobertura agregada

El spec tests/e2e/stab-02-hitbox-scroll-lock.spec.cjs agrega pruebas para:

- Flag apagado y fallback.
- Sincronización de data-chapter, data-chapter-active, inert y data-deck-interactive en los cinco capítulos.
- Click corto en Batea: modal, Escape, cierre de data-modal-open, restauración de foco y recuperación del wheel.
- Drag de Batea superior al umbral de 6 px: no debe abrir el modal y debe liberar el bloqueo para que el wheel avance.
- Pointercancel mientras el shelf tiene un drag capturado y recuperación del wheel.
- Hit-testing con document.elementsFromPoint() sobre un lomo de Batea y una carátula de Colección; el stack se incluye en los mensajes de fallo.
- Búsqueda/filtro y controles de Colección con ventana baja y una simulación de escala CSS al 125%.
- Modal desde Colección: Escape, foco restaurado y devolución del scroll.

## Límites de la automatización

- Aplicar document.documentElement.style.zoom = "125%" aproxima la escala del layout; no modifica el zoom de la interfaz del navegador. El zoom real al 125% requiere verificación manual.
- El fixture mock contiene 18 álbumes, menos que el tamaño de página de Colección (32). Se valida que “Siguiente” esté deshabilitado con ese dataset; no se prueba el cambio real entre páginas. Hace falta un fixture de más de 32 álbumes para cubrirlo.
- El test de pointercancel despacha el evento al listener de ventana mientras un puntero real de Playwright está capturado. No reemplaza la validación con pantalla táctil/dispositivo físico.
- Chromium headless no valida fielmente todas las particularidades de trackpad, zoom del navegador o escalado del sistema operativo.
- Los tests de interacción del rail se omiten deliberadamente con RAIL_FLAG=0; en ese modo se valida el fallback.

## Cambios de producto

No se modificó lógica de producto. No se alteraron z-index, pointer-events ni RailContext.tsx: primero hay que reproducir y atribuir cualquier fallo mediante evidencia.

## Ejecución local en Windows / PowerShell

La configuración de Playwright levanta automáticamente npm run dev en http://127.0.0.1:3002. No inicies otro servidor en ese puerto al ejecutar el spec.

1. Instalar dependencias de la aplicación:

    npm ci

2. Instalar el runner externo sin agregarlo a las dependencias del producto:

    $env:PLAYWRIGHT_RUNNER = "$env:TEMP\playwright-runner"
    New-Item -ItemType Directory -Force $env:PLAYWRIGHT_RUNNER | Out-Null
    npm install --prefix $env:PLAYWRIGHT_RUNNER --no-save @playwright/test@1.64.1
    $env:NODE_PATH = "$env:PLAYWRIGHT_RUNNER\node_modules"
    $env:PATH = "$env:PLAYWRIGHT_RUNNER\node_modules\.bin;$env:PATH"
    npx playwright install chromium

3. Ejecutar con el rail habilitado:

    $env:RAIL_FLAG = "1"
    $env:NEXT_PUBLIC_ENABLE_RAIL = "1"
    $env:NEXT_PUBLIC_SPOTIFY_MOCK = "1"
    playwright test tests/e2e/stab-02-hitbox-scroll-lock.spec.cjs

4. Ejecutar el fallback:

    $env:RAIL_FLAG = "0"
    $env:NEXT_PUBLIC_ENABLE_RAIL = "0"
    $env:NEXT_PUBLIC_SPOTIFY_MOCK = "1"
    playwright test tests/e2e/stab-02-hitbox-scroll-lock.spec.cjs

## Prueba manual complementaria con npm run dev

Si se prueba sin Playwright, abrir una terminal en la raíz del repo y ejecutar:

    $env:NEXT_PUBLIC_ENABLE_RAIL = "1"
    $env:NEXT_PUBLIC_SPOTIFY_MOCK = "1"
    npm run dev

Abrir http://127.0.0.1:3002. Navegar a Batea y Colección; probar click corto, drag, Escape y wheel después de soltar/cancelar. En DevTools inspeccionar document.documentElement.dataset.chapter, document.documentElement.dataset.modalOpen, inert y data-deck-interactive. Para inspeccionar el hit target, ejecutar document.elementsFromPoint(x, y) con coordenadas dentro de la zona superpuesta.

Verificar también zoom real del navegador al 125%, ventanas de 600 px o menos, y trackpad/rueda física si está disponible.

## Criterio de cierre

No cerrar STAB-02 hasta que el job Playwright del PR termine en verde con RAIL_FLAG=0 y RAIL_FLAG=1, los fallos se corrijan o separen en tickets reproducibles, y el propietario confirme la prueba manual de trackpad/zoom real. Este PR no debe mergearse automáticamente.
