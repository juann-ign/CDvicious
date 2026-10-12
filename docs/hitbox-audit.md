# Ticket 1.1 — Mapa de hitboxes y zonas muertas

**Repositorio:** `juann-ign/CDvicious`  
**Base auditada:** `main` (`85262d030782519d907e7d68ba6dc92e179a5dd8`)  
**Tipo de revisión:** inspección estática de TSX/CSS; no se ejecutó navegador ni se modificó código de interacción.  
**Dependencia:** Ticket 0.1 tiene su PR abierto, pero sus cambios todavía no están integrados en `main`. Por lo tanto, los hallazgos de este documento describen el código actualmente integrado en `main`; la validación manual debe repetirse con la baseline mock integrada.

## Resumen ejecutivo

No aparece un bloqueo global evidente en el CSS de hit testing: el `DeckPinnedLayer` ocupa el viewport y tiene `z-index: 10`, pero su raíz usa `pointer-events: none`; el código re-habilita interacción solo en algunas zonas del deck y vuelve a bloquearlas según el capítulo. Los paneles inactivos reciben `inert` y el overlay pinned también queda `inert` desde Batea en adelante.

Los principales riesgos a comprobar son:

1. El overlay pinned está por encima de todos los paneles en el orden de pintado. Un descendiente con `pointer-events: auto` puede recibir eventos aunque la raíz tenga `pointer-events: none`; la corrección depende de que los selectores de gating y `inert` estén sincronizados.
2. El índice activo se estima mediante `round(scroll / wrapper.clientWidth)`, mientras los paneles se dimensionan con `100vw`. Normalmente coinciden en este layout, pero una diferencia de viewport de pocos píxeles podría cambiar qué panel está activo cerca de los límites.
3. La batea captura el arrastre en todo el viewport y permite que el evento comience en un botón `JewelSpine`. No se ve una supresión explícita del click posterior a un drag; es necesario probar si al soltar puede abrirse el modal accidentalmente.
4. Los capítulos de colección y Mixtape recortan contenido con `overflow: hidden`. Es intencional para el layout fijo, pero a poca altura de viewport o con zoom puede dejar controles parcialmente o totalmente fuera del área visible.
5. La caja visual `.stage` de la batea declara `height: 256px` y también padding vertical/bordes sin `box-sizing: border-box`; el área exterior real es mayor que 256 px y el viewport absoluto de drag cubre esa caja ampliada.

Ninguna de estas hipótesis se presenta como una traza de navegador. Para confirmar el elemento que realmente gana el hit-test hace falta inspección en runtime con `document.elementsFromPoint(x, y)`.

## Hallazgos detallados

### H1 — Deck pinned encima del rail: gating de eventos sensible al capítulo

**Estado:** riesgo de regresión / no se confirma un fallo actual por inspección estática.

- **Elementos relevantes:** `[data-rail-overlay]`, `.interactive`, `.discHitArea > *`; panel activo debajo.
- **Esperado:** en Deck/Split pueden funcionar los controles previstos del deck; desde Batea, Colección y Mixtape los clicks/drag deben llegar al contenido del panel activo.
- **Elemento que podría recibir el evento:** un descendiente interactivo del deck pinned (por ejemplo el CD, `NowPlayingCard`, el perfil o el booklet), por estar en una capa fija superior.
- **Causa probable:** stacking + `pointer-events` heredado o re-habilitado. `.layer` es `position: fixed; inset: 0; z-index: 10`, mientras la raíz del rail es un stacking context con `z-index: 0`. La raíz del deck usa `pointer-events: none`, pero `.interactive` y `.discHitArea > *` vuelven a permitir eventos.
- **Gating existente:** `RailProvider.module.css` anula esos eventos cuando `data-deck-interactive="false"`; `RailContext.tsx` pone `inert` en el overlay desde `activeChapterIndex >= 2`.
- **Referencias:** `DeckPinnedLayer.module.css:1-30`; `RailProvider.module.css:42-53`; `RailContext.tsx:261-288`; `DeckPinnedLayer.tsx:16-38, 49-87`.
- **Sugerencia de fix (no implementado):** conservar un único criterio de activación por capítulo para CSS y `inert`. Añadir una prueba manual con `elementsFromPoint` en zonas donde el CD/booklet se superpone visualmente a la batea y colección; no aumentar z-index de paneles a ciegas.

### H2 — Anchura de panel y cálculo del capítulo activo usan medidas distintas

**Estado:** riesgo de desincronización en límites; el CSS del panel sí usa `border-box`.

- **Elementos relevantes:** cada `section.panel` y la lógica `activeChapterIndex`.
- **Esperado:** cinco paneles consecutivos de ancho efectivo 100vw; el panel visualmente activo debe coincidir con el que queda interactivo.
- **Elemento que podría recibir el evento:** el panel vecino, si el índice/inert cambia antes o después del límite visual esperado.
- **Causa probable:** `HorizontalRail.module.css` define `box-sizing: border-box; width: 100vw; min-width: 100vw`, por lo que padding y borde quedan incluidos. En cambio, `RailContext.tsx` estima el índice con `Math.round(scroll / wrapper.clientWidth)`. `clientWidth` y la unidad CSS `vw` pueden diferir en entornos donde la medición del viewport no coincida exactamente.
- **Referencias:** `HorizontalRail.module.css:1-11`; `HorizontalRail.tsx:11-21, 42-86`; `RailContext.tsx:261-288`.
- **Sugerencia de fix (no implementado):** comprobar en runtime `panel.getBoundingClientRect().width`, `wrapper.clientWidth`, `window.innerWidth` y offsets. Si no coinciden, derivar el panel activo de los `offsetLeft` reales de los hijos en vez de inferirlo solo dividiendo por el ancho.

### H3 — La zona de drag de la batea incluye toda la viewport de la cinta

**Estado:** el área es amplia por diseño; falta descartar click accidental al terminar un drag.

- **Elementos relevantes:** `.stage`, `.viewport`, `.fadeLeft`, `.fadeRight`, botones `JewelSpine` y hook `useMarqueeBelt`.
- **Esperado:** poder arrastrar sobre cualquier espacio de la cinta, pero un drag no debe seleccionar un disco ni abrir el modal al soltar.
- **Elemento que recibe inicialmente el evento:** puede ser el botón `.spine`; su `pointerdown` propaga al contenedor `.viewport`, que inicia el reconocimiento del drag.
- **Causa probable:** `.viewport` es absoluto con `inset: 0`, `touch-action: none`; los fades laterales están por encima con `z-index: 2`, pero usan `pointer-events: none`, así que no bloquean el drag. En `useMarqueeBelt` la captura comienza al superar 6 px, pero no hay un manejador explícito de `click` que ignore el click sintetizado después de arrastrar.
- **Recorte:** `.stage` usa `overflow: hidden`, por lo que la vista de los lomos se recorta a sus límites, aunque la captura del pointer permite seguir moviendo fuera de la caja.
- **Referencias:** `CrateShelf.tsx:96-158`; `CrateShelf.module.css:79-110, 131-149`; `useMarqueeBelt.ts:121-202`; `JewelSpine.module.css:1-20`.
- **Sugerencia de fix (no implementado):** probar pointerdown/move/up tanto en el centro del lomo como en los espacios; si se confirma selección posterior al drag, añadir supresión del click solo para gestos que cruzaron el umbral, conservando clicks normales y accesibilidad de teclado.

### H4 — Caja exterior de drag mayor que los 256 px declarados en la batea

**Estado:** diferencia de box model confirmada; que sea un defecto depende de si 256 px pretendía ser altura total o altura de contenido.

- **Elementos relevantes:** `.stage` y `.viewport`.
- **Esperado:** la zona de drag coincide exactamente con la región de la cinta que se pretende arrastrar.
- **Elemento que recibe el evento:** `.viewport`, que cubre la caja de posicionamiento de `.stage`, incluido el área de padding.
- **Causa probable:** `.stage` define `height: 256px`, padding vertical de `var(--space-3)` a ambos lados y dos bordes, pero no define `box-sizing: border-box`. Con el modelo `content-box`, la altura exterior es 256 px + padding superior/inferior + bordes. `.viewport { position: absolute; inset: 0 }` extiende la zona de captura sobre esa caja.
- **Referencias:** `CrateShelf.module.css:79-104`.
- **Sugerencia de fix (no implementado):** definir si 256 px es la altura exterior esperada. Si lo es, medir el rectángulo real y, tras confirmación visual, usar `box-sizing: border-box` o ajustar la altura. No cambiarlo en este ticket.

### H5 — Recortes del capítulo Colección y de sus controles

**Estado:** sin overlay bloqueante evidente mientras el capítulo está activo; riesgo de clipping vertical/horizontal en viewports pequeños.

- **Elementos relevantes:** botones `JewelCaseFront`, input de búsqueda, filas de filtros, grid y paginación.
- **Esperado:** carátulas, filtros y paginación deben seguir recibiendo click; los filtros largos deben poder desplazarse horizontalmente.
- **Elemento que podría quedar fuera del área visible:** una carátula o control en los bordes del grid/toolbar; el overflow no deja interactuar con partes que queden realmente recortadas.
- **Causa probable:** `.chapter`, `.filterBlock`, `.gridFrame` y `.grid` usan `overflow: hidden`; `.pillRow` sí define `overflow-x: auto`, que permite desplazar los filtros. La paginación queda en `.footer`, separada del grid, por lo que no se observa que esté cubierta por el grid.
- **Interacción actual:** `JewelCaseFront` es un elemento nativo `button` con `onClick`; las capas decorativas `.edge` y `.gloss` tienen `pointer-events: none`.
- **Referencias:** `CollectionChapter.tsx:204-336`; `CollectionChapter.module.css:1-8, 46-92, 115-197`; `JewelCaseFront.tsx:12-28`; `JewelCaseFront.module.css:1-18, 38-65`.
- **Sugerencia de fix (no implementado):** probar todos los botones en los bordes de la primera/última fila y el scroll horizontal de filtros a 1920×1080, 1366×768 y zoom 125%. Si existe clipping, corregir solo la caja responsable y mantener `overflow-x: auto` para las pills.

### H6 — Mixtape Lab: botones nativos, pero contenido recortado por altura

**Estado:** no se detecta una capa CSS interna que bloquee los botones; el riesgo es el recorte del contenido en poco espacio vertical.

- **Elementos relevantes:** botones agregar, quitar, vaciar y exportar.
- **Esperado:** cada acción debe ser visible, recibir click y ser navegable por teclado cuando Mixtape sea el capítulo activo.
- **Elemento que podría quedar inaccesible:** filas bajas de la cola y sus botones de quitar, si superan la altura disponible.
- **Causa probable:** `.chapter` aplica `overflow: hidden`; `.lab` reduce su altura al espacio restante y `.queueList` tiene `min-height: 0; overflow: hidden` sin scroll vertical. La cola limita la cantidad de álbumes, pero el layout no adapta su altura al viewport.
- **Interacción actual:** los controles son `button` nativos, los botones de agregar/quitar usan `aria-label`, y los de vaciar/exportar tienen `disabled` explícito según estado. No hay `pointer-events: none` ni `z-index` en las reglas de esos botones.
- **Referencias:** `MixtapeChapter.tsx:112-248`; `MixtapeChapter.module.css:1-9, 59-70, 179-220, 294-340`.
- **Sugerencia de fix (no implementado):** probar la cola llena a varias alturas de ventana. Si quedan filas cortadas, habilitar `overflow-y: auto` en `.queueList` o ajustar el reparto vertical sin alterar el aspecto de escritorio.

### H7 — `inert` de paneles y overlay pinned

**Estado:** el mecanismo está implementado; hay una condición de borde que conviene probar.

- **Esperado:** solo el panel activo debe participar en navegación por teclado/hit testing; el deck pinned deja de ser interactivo al entrar en Batea y no recupera foco cuando está inactivo.
- **Comportamiento observado en código:** en `updateRailProgress`, el índice se calcula por distancia/viewport y se limita al rango de paneles. Cada hijo directo de `.content` recibe `inert` cuando su índice no coincide; se publica `data-chapter-active`; el overlay recibe `inert` para índices >= 2. La función corre al iniciar, en cada evento de scroll de Lenis y tras `ResizeObserver`.
- **Limpieza:** al desmontar `RailProvider`, se quita `inert` de todos los paneles y del overlay.
- **Causa probable si falla:** un desajuste entre el ancho real de paneles y `wrapper.clientWidth`, o una transición que cambia el índice justo en el punto medio del scroll. El cambio en el punto medio es consecuencia de `Math.round`, no prueba por sí mismo un defecto.
- **Referencias:** `RailContext.tsx:248-299, 333-353`; `RailProvider.module.css:42-53`.
- **Sugerencia de fix (no implementado):** comprobar `document.activeElement`, el atributo `inert`, `data-chapter`, `data-deck-interactive` y el resultado de `elementsFromPoint` durante un recorrido lento y después de redimensionar. Solo cambiar el algoritmo si se reproduce una divergencia.

## Matriz breve para la prueba manual

| Zona | Elemento esperado | Verificación |
|---|---|---|
| Batea, centro de cada lomo | `JewelSpine` en click; viewport durante drag | Click abre modal; drag mueve cinta sin abrir modal accidentalmente |
| Batea, fades laterales y extremos | Viewport de drag | Drag inicia incluso sobre gradientes, sin que el fade capture el pointer |
| Colección, extremos de carátulas | `JewelCaseFront` | Toda el área visible abre el modal |
| Colección, pills de filtro | Botón dentro de `.pillRow` | Click cambia el filtro; la fila puede desplazarse horizontalmente |
| Colección, paginación | Botones del footer | Click anterior/siguiente funciona sin quedar tapado |
| Mixtape, agregar/quitar | Botones `.addButton` / `.removeButton` | Actualiza cola; todos los botones de filas visibles son alcanzables |
| Entre capítulos | Panel activo | Solo un panel no está `inert`; Deck se vuelve `inert` al activar capítulo index 2 |
| Zona superpuesta Deck/panel | Elemento del panel activo desde Batea | `elementsFromPoint(x,y)` no devuelve como objetivo interactivo un control del deck |

## Alcance y conclusión

Este ticket es documental. No se modifican TSX, CSS, comportamiento de interacción ni z-index. La anchura de los paneles usa `border-box` y no muestra un desborde por padding/borde en CSS estático. Los bloqueos más plausibles a investigar en navegador son la sincronización del gating del deck con `inert`, el click después del drag y el clipping vertical en capítulos con altura fija.

No se afirma que la auditoría esté validada por runtime: falta la prueba real del hit-test en navegador y Ticket 0.1 aún no está integrado en `main`.
