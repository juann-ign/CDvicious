# Ticket 1.1 — Mapa de hitboxes y zonas muertas

**Repositorio:** `juann-ign/CDvicious`  
**Base auditada:** `main` (`761edfe3ca76047e7c366cb961f39f5079122fb0`)  
**Última revisión estática:** 2026-10-12.  
**Tipo de revisión:** inspección estática de TSX/CSS y revisión de cambios de Ticket 1.2; no se ejecutó navegador ni hit-testing en runtime.  
**Dependencia:** la baseline de desarrollo/mock está integrada en `main` mediante [PR #68](https://github.com/juann-ign/CDvicious/pull/68). Ticket 1.2 aplica correcciones estáticas derivadas de este audit; la validación funcional en navegador sigue pendiente.

## Resumen ejecutivo

Ticket 1.2 corrige el gating del Deck en su propio CSS Module: el atributo `data-deck-interactive` del rail se refleja en la raíz del overlay y las zonas con `pointer-events: auto` quedan desactivadas desde Batea. También se corrigió el box model de los wrappers revisados, se hizo desplazable la cola de Mixtape y se añadió supresión del click posterior a un drag real. No se cambiaron valores de `z-index` ni se modificó `RailContext.tsx`. La validación de hit-testing en navegador sigue pendiente.

Los principales riesgos a comprobar son:

1. El Deck continúa en una capa superior (`z-index: 10`) por diseño. Ticket 1.2 movió el gating de las clases locales al CSS Module de `DeckPinnedLayer`; hay que confirmar en navegador que el panel activo recibe los eventos en zonas superpuestas.
2. El índice activo continúa estimándose mediante `round(scroll / wrapper.clientWidth)`, mientras los paneles se dimensionan con `100vw`. No se modificó `RailContext.tsx`; queda pendiente verificar que `inert` y el capítulo visual coincidan en los límites.
3. El shelf sigue capturando drag sobre su viewport. Ahora se suprime el click que sigue a un drag que superó el umbral de 6 px; falta probar click vs drag y que el wheel vuelva a funcionar después de soltar o cancelar.
4. Colección y Mixtape conservan recortes intencionales para su layout. Ticket 1.2 añade `box-sizing: border-box` a los contenedores señalados y scroll vertical en la cola de Mixtape; los controles visibles y los bordes inferiores deben validarse a distintas alturas y zoom.
5. `.stage` ahora usa `box-sizing: border-box`, por lo que su altura exterior declarada es 256 px; comprobar en navegador que el área de captura del shelf coincide con la región visual esperada.

Ninguna de estas hipótesis se presenta como una traza de navegador. Para confirmar el elemento que realmente gana el hit-test hace falta inspección en runtime con `document.elementsFromPoint(x, y)`.

## Hallazgos detallados

### H1 — Deck pinned encima del rail: gating de eventos sensible al capítulo

**Estado Ticket 1.2:** corrección estática aplicada al gating CSS; falta confirmar el resultado del hit-test en navegador.

- **Elementos relevantes:** `[data-rail-overlay]`, `.interactive`, `.discHitArea > *`; panel activo debajo.
- **Esperado:** en Deck/Split pueden funcionar los controles previstos del deck; desde Batea, Colección y Mixtape los clicks/drag deben llegar al contenido del panel activo.
- **Elemento que podría recibir el evento:** un descendiente interactivo del deck pinned (por ejemplo el CD, `NowPlayingCard`, el perfil o el booklet), por estar en una capa fija superior.
- **Causa encontrada:** además del stacking, `RailProvider.module.css` intentaba seleccionar `.interactive` y `.discHitArea` desde otro CSS Module; las clases locales se compilan con nombres distintos. El selector anterior de `data-deck-hidden` también buscaba el atributo sobre el layer; se reemplazó por el gate `data-deck-interactive` reflejado en esa raíz.
- **Fix aplicado:** `DeckPinnedLayer.tsx` expone `data-deck-interactive` en su layer a partir del estado observado en la raíz; `DeckPinnedLayer.module.css` desactiva `.interactive` y los hijos de `.discHitArea` cuando el atributo es `false`. `RailProvider.module.css` deja el gating dentro del módulo propietario y conserva las reglas basadas en atributos globales. `RailContext.tsx` sigue aplicando `inert` desde `activeChapterIndex >= 2`.
- **Referencias:** `DeckPinnedLayer.module.css:1-34`; `RailProvider.module.css:42-51`; `RailContext.tsx:261-288`; `DeckPinnedLayer.tsx:18-36, 45-100`.
- **Validación pendiente:** conservar el mismo criterio de capítulo para el gating CSS y `inert`. Probar `document.elementsFromPoint(x, y)` donde el CD/booklet se superpone visualmente a Batea y Colección. No se modificó `z-index`: aumentar el de los paneles no es necesario para el fix planteado.

### H2 — Anchura de panel y cálculo del capítulo activo usan medidas distintas

**Estado:** riesgo potencial no modificado; el CSS del panel usa `border-box`, pero el cálculo del índice activo sigue dependiendo de `wrapper.clientWidth`.

- **Elementos relevantes:** cada `section.panel` y la lógica `activeChapterIndex`.
- **Esperado:** cinco paneles consecutivos de ancho efectivo 100vw; el panel visualmente activo debe coincidir con el que queda interactivo.
- **Elemento que podría recibir el evento:** el panel vecino, si el índice/inert cambia antes o después del límite visual esperado.
- **Causa probable:** `HorizontalRail.module.css` define `box-sizing: border-box; width: 100vw; min-width: 100vw`, por lo que padding y borde quedan incluidos. En cambio, `RailContext.tsx` estima el índice con `Math.round(scroll / wrapper.clientWidth)`. `clientWidth` y la unidad CSS `vw` pueden diferir en entornos donde la medición del viewport no coincida exactamente.
- **Referencias:** `HorizontalRail.module.css:1-11`; `HorizontalRail.tsx:11-21, 42-86`; `RailContext.tsx:261-288`.
- **Acción Ticket 1.2:** no se cambió `RailContext.tsx` porque no se confirmó una divergencia en runtime. Si la prueba revela desincronización, consultar antes de cambiar el cálculo y comparar `panel.getBoundingClientRect().width`, `wrapper.clientWidth`, `window.innerWidth` y los `offsetLeft` reales.

### H3 — La zona de drag de la batea incluye toda la viewport de la cinta

**Estado Ticket 1.2:** supresión del click post-drag aplicada estáticamente; validación del gesto y la reanudación del wheel pendientes.

- **Elementos relevantes:** `.stage`, `.viewport`, `.fadeLeft`, `.fadeRight`, botones `JewelSpine` y hook `useMarqueeBelt`.
- **Esperado:** poder arrastrar sobre cualquier espacio de la cinta, pero un drag no debe seleccionar un disco ni abrir el modal al soltar.
- **Elemento que recibe inicialmente el evento:** puede ser el botón `.spine`; su `pointerdown` propaga al contenedor `.viewport`, que inicia el reconocimiento del drag.
- **Comportamiento y fix:** `.viewport` sigue siendo absoluto con `inset: 0` y `touch-action: none`; los fades usan `pointer-events: none`. `useMarqueeBelt` reconoce el drag después de 6 px y ahora cancela en captura el click siguiente a un drag completado. La rutina existente `finish` sigue llamando `onGrabEnd`, que hace `start()` en `CrateChapter`; verificar en navegador que Lenis vuelve a aceptar wheel tras pointerup y pointercancel.
- **Recorte:** `.stage` usa `overflow: hidden`, por lo que la vista de los lomos se recorta a sus límites, aunque la captura del pointer permite seguir moviendo fuera de la caja.
- **Referencias:** `CrateShelf.tsx:96-158`; `CrateShelf.module.css:79-111, 132-150`; `useMarqueeBelt.ts:14, 145-230`; `CrateChapter.tsx:31-35`; `JewelSpine.module.css:1-20`.
- **Validación pendiente:** probar click corto y drag mayor a 6 px tanto en el centro del lomo como en los espacios; comprobar que solo el drag suprime el click, que el modal no se abre al soltar y que el wheel vuelve a desplazarse después de soltar/cancelar. Los clicks normales y la activación por teclado deben seguir funcionando.

### H4 — Caja exterior de drag de la batea definida en 256 px

**Estado Ticket 1.2:** box model corregido estáticamente; la coincidencia exacta del hitbox con la región visual debe confirmarse en navegador.

- **Elementos relevantes:** `.stage` y `.viewport`.
- **Esperado:** la zona de drag coincide exactamente con la región de la cinta que se pretende arrastrar.
- **Elemento que recibe el evento:** `.viewport`, que cubre la caja de posicionamiento de `.stage`, incluido el área de padding.
- **Fix aplicado:** `.stage` ahora declara `box-sizing: border-box`; la altura exterior incluye padding y bordes, por lo que `height: 256px` define el tamaño completo. `.viewport { position: absolute; inset: 0 }` sigue siendo el objetivo de drag dentro de esa caja.
- **Referencias:** `CrateShelf.module.css:79-105`.
- **Validación pendiente:** medir `stage.getBoundingClientRect()` y `viewport.getBoundingClientRect()` para confirmar que la región interactiva cubre solo el escenario visual previsto.

### H5 — Recortes del capítulo Colección y de sus controles

**Estado Ticket 1.2:** box sizing corregido estáticamente; el clipping residual a alturas/zoom pequeños requiere prueba en navegador.

- **Elementos relevantes:** botones `JewelCaseFront`, input de búsqueda, filas de filtros, grid y paginación.
- **Esperado:** carátulas, filtros y paginación deben seguir recibiendo click; los filtros largos deben poder desplazarse horizontalmente.
- **Elemento que podría quedar fuera del área visible:** una carátula o control en los bordes del grid/toolbar; el overflow no deja interactuar con partes que queden realmente recortadas.
- **Causa y fix aplicado:** los recortes de `.chapter`, `.filterBlock`, `.gridFrame` y `.grid` se conservan intencionalmente; `.chapter` y `.grid` ahora usan `box-sizing: border-box` para incluir el padding dentro de sus dimensiones. `.pillRow` mantiene `overflow-x: auto`; la paginación sigue fuera del grid, en `.footer`.
- **Interacción actual:** `JewelCaseFront` es un elemento nativo `button` con `onClick`; las capas decorativas `.edge` y `.gloss` tienen `pointer-events: none`.
- **Referencias:** `CollectionChapter.tsx:204-336`; `CollectionChapter.module.css:1-9, 47-93, 117-199`; `JewelCaseFront.tsx:12-28`; `JewelCaseFront.module.css:1-18, 38-65`.
- **Validación pendiente:** probar carátulas de la primera/última fila, filtros desplazados hasta ambos extremos y paginación a 1920×1080, 1366×768 y zoom 125%. Mantener `overflow-x: auto` en las pills.

### H6 — Mixtape Lab: botones nativos, pero contenido recortado por altura

**Estado Ticket 1.2:** sizing de capítulo corregido y scroll vertical agregado a la cola; verificar accesibilidad de las filas en ventanas bajas.

- **Elementos relevantes:** botones agregar, quitar, vaciar y exportar.
- **Esperado:** cada acción debe ser visible, recibir click y ser navegable por teclado cuando Mixtape sea el capítulo activo.
- **Elemento que podría quedar inaccesible:** filas bajas de la cola y sus botones de quitar, si superan la altura disponible.
- **Causa y fix aplicado:** `.chapter` ahora usa `box-sizing: border-box` para incluir el padding en su alto; `.queueList` mantiene `min-height: 0`, con `overflow-x: hidden` y `overflow-y: auto`. La cola puede desplazarse verticalmente cuando sus filas exceden el espacio asignado.
- **Interacción actual:** los controles son `button` nativos, los botones de agregar/quitar usan `aria-label`, y los de vaciar/exportar tienen `disabled` explícito según estado. No hay `pointer-events: none` ni `z-index` en las reglas de esos botones.
- **Referencias:** `MixtapeChapter.tsx:112-248`; `MixtapeChapter.module.css:1-10, 60-71, 180-224, 295-341`.
- **Validación pendiente:** cargar suficientes álbumes para llenar la cola y recorrer todas las filas por scroll a distintas alturas. Confirmar que el botón de quitar de cada fila sea alcanzable y que el footer permanezca utilizable.

### H7 — `inert` de paneles y overlay pinned

**Estado:** el mecanismo está implementado; hay una condición de borde que conviene probar.

- **Esperado:** solo el panel activo debe participar en navegación por teclado/hit testing; el deck pinned deja de ser interactivo al entrar en Batea y no recupera foco cuando está inactivo.
- **Comportamiento observado en código:** en `updateRailProgress`, el índice se calcula por distancia/viewport y se limita al rango de paneles. Cada hijo directo de `.content` recibe `inert` cuando su índice no coincide; se publica `data-chapter-active`; el overlay recibe `inert` para índices >= 2. La función corre al iniciar, en cada evento de scroll de Lenis y tras `ResizeObserver`.
- **Limpieza:** al desmontar `RailProvider`, se quita `inert` de todos los paneles y del overlay.
- **Causa probable si falla:** un desajuste entre el ancho real de paneles y `wrapper.clientWidth`, o una transición que cambia el índice justo en el punto medio del scroll. El cambio en el punto medio es consecuencia de `Math.round`, no prueba por sí mismo un defecto.
- **Referencias:** `RailContext.tsx:248-300, 302-355`; `RailProvider.module.css:42-51`.
- **Validación pendiente:** comprobar `document.activeElement`, `inert`, `data-chapter`, `data-deck-interactive` y `elementsFromPoint` durante un recorrido lento, tras redimensionar y al recuperar el wheel después del drag. El algoritmo de `inert` en `RailContext.tsx` no se modificó.

## Matriz breve para la prueba manual

| Zona | Elemento esperado | Verificación |
|---|---|---|
| Batea, centro de cada lomo | `JewelSpine` en click; viewport durante drag | Click abre modal; drag mueve cinta sin abrir modal accidentalmente |
| Batea, fades laterales y extremos | Viewport de drag | Drag inicia incluso sobre gradientes, sin que el fade capture el pointer |
| Después de soltar/cancelar drag | Lenis / wheel horizontal | Wheel vuelve a mover el rail y el drag no dispara selección accidental |
| Colección, extremos de carátulas | `JewelCaseFront` | Toda el área visible abre el modal |
| Colección, pills de filtro | Botón dentro de `.pillRow` | Click cambia el filtro; la fila puede desplazarse horizontalmente |
| Colección, paginación | Botones del footer | Click anterior/siguiente funciona sin quedar tapado |
| Mixtape, agregar/quitar | Botones `.addButton` / `.removeButton` | Actualiza cola; todos los botones de filas visibles son alcanzables |
| Entre capítulos | Panel activo | Solo un panel no está `inert`; Deck se vuelve `inert` al activar capítulo index 2 |
| Zona superpuesta Deck/panel | Elemento del panel activo desde Batea | `elementsFromPoint(x,y)` no devuelve como objetivo interactivo un control del deck |

## Alcance y conclusión

Ticket 1.2 modifica únicamente los módulos de estilos y el hook necesarios para corregir el gating local del Deck, las cajas de la Batea/Colección/Mixtape y el click posterior al drag. No se cambiaron valores de `z-index` y `RailContext.tsx` queda intacto. La lógica de `inert` ya existente se conserva.

Esta auditoría refleja una revisión estática, no una prueba de navegador. Los checks de lint, TypeScript y build deben ejecutarse en el PR; los escenarios de hit-testing, el click/drag y el retorno del wheel necesitan validación manual antes de considerar cerrada la estabilización.
