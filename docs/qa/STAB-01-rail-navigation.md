# STAB-01 — Matriz de QA manual del rail y la navegación

**Repositorio:** `juann-ign/CDvicious`  
**Branch:** `qa/stab-01-rail-navigation`  
**Base de revisión:** `main`, commit `3aa5a469305ba08f3de8c22b31144b5588a965c7` (navegación por capítulos)  
**Tipo:** QA manual / estabilización. No introduce features ni modifica runtime.  
**Estado:** matriz preparada; ejecución en navegador pendiente. No marcar como aprobado hasta guardar evidencia real de cada escenario.

## Objetivo

Validar que el panel visible, el índice activo, el indicador visual y el panel interactivo coincidan; que el snap sea consistente con wheel/trackpad; que navegación por click/teclado sea accesible; y que el rail solo esté habilitado en desktop cuando corresponde.

## Entorno y configuración

Usar un checkout limpio de esta branch con dependencias instaladas. Para evitar consumo de cuota, usar Spotify mock.

- **Rail habilitado:** `.env.local` con `NEXT_PUBLIC_ENABLE_RAIL=1` y `NEXT_PUBLIC_SPOTIFY_MOCK=1`.
- **Rail deshabilitado:** `.env.local` con `NEXT_PUBLIC_ENABLE_RAIL=0` y `NEXT_PUBLIC_SPOTIFY_MOCK=1` (o eliminar la primera variable; reiniciar el servidor).
- Ejecutar `npm run dev` y abrir `http://127.0.0.1:3002`.
- Reiniciar el servidor luego de modificar variables públicas.
- Registrar navegador/versión, SO, commit, resolución CSS, zoom y modo de configuración en cada sesión.
- Capturar pantalla/video de cada fallo; en DevTools guardar consola y, cuando aplique, valores de `data-chapter`, `data-chapter-active`, `inert`, `aria-current` y `document.elementsFromPoint(x, y)`.

## Criterios de resultado

- **PASS:** comportamiento observado cumple por completo el resultado esperado y hay evidencia adjunta.
- **FAIL:** se reproduce una divergencia; documentar pasos exactos y crear un issue independiente antes de proponer un fix.
- **BLOCKED:** no fue posible ejecutar el escenario o falta entorno/datos. No cuenta como PASS.
- **NOT RUN:** no se intentó todavía.

No inferir resultados de runtime a partir de revisión estática.

## Matriz de escenarios

| ID | Configuración / viewport | Pasos | Resultado esperado | Estado inicial |
|---|---|---|---|---|
| STAB-01-01 | Rail ON, desktop 1920×1080, zoom 100% | Recorrer Deck → Split → Batea → Colección → Mixtape Lab con wheel en dirección de avance. Esperar a que finalice cada snap. | Cada panel encaja en viewport; etiqueta/indicador activo corresponde al panel estable. | NOT RUN |
| STAB-01-02 | Rail ON, desktop | Repetir el recorrido completo en dirección inversa, incluyendo saltos de una posición. | Sin capítulos omitidos ni índice pegado/desfasado; navegación inversa estable. | NOT RUN |
| STAB-01-03 | Rail ON, desktop | Aplicar movimientos cortos (<20% del viewport) y luego movimientos largos (>20%); esperar más de 140 ms tras cada gesto. | Gesto corto vuelve al ancla; gesto que supera el umbral avanza/retrocede una posición conforme a la lógica definida; no hay saltos inesperados. | NOT RUN |
| STAB-01-04 | Rail ON, desktop con trackpad | Repetir movimientos lentos, rápidos y varios gestos seguidos. | Snap predecible; un gesto no deja el rail entre paneles ni produce doble avance accidental. | NOT RUN |
| STAB-01-05 | Rail ON, límites de paneles | Detener el scroll alrededor de 45%, 50%, 55% y después del snap de cada límite. Comparar panel visual, `data-chapter`, `data-chapter-active`, `inert` y `aria-current`. | Indicador y estado interactivo corresponden al panel previsto por la histéresis; paneles inactivos no reciben foco/teclado. Registrar la regla observada, no asumir que el centro geométrico es el criterio. | NOT RUN |
| STAB-01-06 | Rail ON, desktop | Hacer clic por separado en Deck, Split, Batea, Colección y Mixtape Lab en la barra de navegación. | Cada botón lleva al panel esperado y luego actualiza el indicador activo. | NOT RUN |
| STAB-01-07 | Rail ON, desktop, teclado | Usar Tab/Shift+Tab para enfocar los botones de navegación; probar Enter y Espacio. | Orden de foco lógico; foco visible; cada botón se activa una vez y tiene nombre accesible. | NOT RUN |
| STAB-01-08 | Rail ON, 1920×1080 y 1366×768 | Cambiar la resolución/tamaño de ventana repetidamente mientras el rail está en distintos capítulos. Recargar en cada tamaño. | No hay panel desfasado, indicador incorrecto, overflow accidental ni navegación inaccesible; se puede seguir recorriendo ambos sentidos. | NOT RUN |
| STAB-01-09 | Rail ON, límites de breakpoint | Probar anchos CSS exactos de 760 px, 761 px y 762 px, además de 900 px. | 761 px o más: rail desktop; 760 px o menos: fallback. No hay parpadeo ni rail montado parcialmente al redimensionar. | NOT RUN |
| STAB-01-10 | Rail OFF, desktop | Deshabilitar flag, reiniciar servidor y recargar. | Se muestra HomeContent convencional; no aparece barra de navegación por capítulos ni contenedor Lenis horizontal. La experiencia convencional sigue desplazándose verticalmente según su diseño. | NOT RUN |
| STAB-01-11 | Rail ON, móvil (390×844) y tablet estrecha (760 px) | Recargar con flag ON. Intentar desplazamiento táctil/vertical y revisar navegación. | El fallback móvil aparece; no se monta rail horizontal ni barra por capítulos. No hay bloqueos de scroll o controles fuera de pantalla introducidos por el rail. | NOT RUN |
| STAB-01-12 | Rail OFF, móvil | Recargar y recorrer la página con gesto vertical; probar el booklet y los controles visibles principales. | Fallback convencional disponible y desplazable; el flag apagado no causa errores. | NOT RUN |
| STAB-01-13 | Rail ON, desktop | Activar `prefers-reduced-motion: reduce`, hacer clic en navegación y usar wheel. | Saltos sin animación de scroll no esencial; el destino y el estado activo siguen siendo correctos. | NOT RUN |

## Procedimiento de evidencia para cualquier FAIL

1. Registrar ID del escenario, commit, config del flag, navegador/versión, viewport y zoom.
2. Capturar video o capturas antes, durante y después del gesto.
3. Anotar pasos mínimos para reproducir desde una recarga limpia.
4. Registrar resultado esperado y resultado real sin interpretaciones vagas.
5. En DevTools registrar el panel visual, atributos `data-chapter`, `data-chapter-active`, `inert`, `aria-current`, `document.activeElement` y `elementsFromPoint(x, y)` si el fallo implica activación/hit-testing.
6. Abrir un issue independiente por defecto con severidad y vínculo a esta matriz.
7. No modificar `RailContext`, `pointer-events` o `z-index` sin evidencia que identifique causa y elemento afectado.

### Plantilla de issue por defecto

- **Título:** `[STAB-01][<área>] <síntoma breve>`
- **Severidad:** S1 bloqueante / S2 alta / S3 media / S4 baja.
- **Entorno:** commit, browser, OS, viewport, zoom, flag y modo mock.
- **Precondiciones:** datos/capítulo/modal necesario.
- **Pasos exactos:** numerados y mínimos.
- **Esperado:**
- **Real:**
- **Evidencia:** capturas/video/consola/atributos del DOM.
- **Frecuencia:** reproducido N/N intentos.
- **Hipótesis:** separada de los hechos.
- **Criterio de aceptación del fix:**

## Revisión estática inicial (no reemplaza QA manual)

- `src/app/page.tsx`: `NEXT_PUBLIC_ENABLE_RAIL === "1"` selecciona `HorizontalRail`; en caso contrario renderiza `HomeContent`.
- `src/components/scroll/HorizontalRail.tsx`: `DESKTOP_QUERY = "(min-width: 761px)"`; en viewport móvil/estrecho se devuelve `fallback`. La estructura contiene cinco paneles.
- `src/components/scroll/RailContext.tsx`: snap tras 140 ms de inactividad, umbral 20% del viewport, índice de capítulo con histéresis hacia delante/atrás (0.55 / 0.45), y actualización de `inert`/atributos de capítulo.
- `src/components/scroll/ChapterNavigation.tsx`: botones con `aria-current="location"`, `aria-label` y `scrollToChapter(index)`.
- `src/components/scroll/ChapterNavigation.module.css`: estilo de foco `:focus-visible` explícito y transición reducida para preferencias de movimiento reducido.

Estos puntos describen el código leído, no demuestran que el comportamiento funcione en un navegador.

## Riesgos pendientes de runtime

- Indicador/estado activo en los umbrales de histéresis y durante el snap.
- Diferencias entre medidas del viewport, ancho real de paneles y posiciones tras resize.
- Fallback móvil y transición al cruzar 761 px.
- Enfoque/activación por teclado y foco visible en el navegador real.
- Consistencia del rail después de muchos gestos de wheel/trackpad y recarga en distintas resoluciones.

## Criterio de salida de STAB-01

- Todos los escenarios pertinentes tienen estado PASS con evidencia, o los FAIL cuentan con issue independiente y priorizado.
- Los BLOCKED/NOT RUN se mantienen explícitos y no se contabilizan como pruebas satisfactorias.
- Indicador, panel visible y panel interactivo coinciden tras navegación manual y automática.
- No se cierra este ticket con solo revisión estática.
