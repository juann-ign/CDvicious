# Rail smoothness / VFD UX — 2026-10-24

## Clasificación de hallazgos

Los problemas de saltos, rueda y vuelo pertenecen a EPIC 2.4 (Playback transition) y EPIC 2.6 (Polish and validation), no a la tarea de baseline/CI. El menú que tapa el VFD también pertenece a EPIC 2.6. Esta rama aísla esos cambios en `feat/rail-smoothness-navigation-vfd`.

## Cambios de esta rama

- **Navegación por menú:** la duración se calcula según la distancia en anchuras de capítulo (aprox. 780 ms por capítulo, acotada a 720 ms–3,25 s) y usa easing sine-in-out. Un salto Deck → Mixtape queda animado durante varios segundos y permite ver los capítulos intermedios.
- **Rueda/trackpad:** el snap se agenda desde el gesto de rueda, no desde el flujo de eventos RAF de Lenis. Se conserva el avance de un capítulo por gesto, se reduce el retardo de debounce a 120 ms y se usa una transición easing de 620–920 ms. Los locks de modal y el soporte de reduced motion siguen vigentes.
- **Menú:** pasa de una barra horizontal inferior a un rail vertical compacto a la derecha; así deja libre la zona inferior/central del display. En ventanas estrechas de escritorio, los labels se ocultan visualmente y los nombres accesibles se mantienen.
- **VFD:** ancho máximo de 620 px y tipografía de lectura ligeramente mayor. El rediseño de hardware completo queda como follow-up de EPIC 2.6.2.
- **Vuelo del CD:** pasa a 4,6 s con tres giros completos deterministas ligados al progreso de la trayectoria, en lugar de acumular rotación por frame. La preferencia de movimiento reducido se conserva.

## Validación automatizada

- Playwright comprueba que la navegación larga observe el orden de capítulos `[0, 1, 2, 3, 4]`.
- Playwright comprueba que la navegación lateral no se superponga al VFD.
- El flujo de playback confirma que la animación del disco dura al menos 4,4 s antes de anunciar llegada.
- La configuración QA conserva `retries: 0`; no se convierten fallos en éxitos mediante reintentos.

## Validación manual recomendada

1. En escritorio, pulsar Mixtape desde Deck y verificar que se distingan Split, Batea y Colección durante el desplazamiento.
2. Repetir con rueda y trackpad: un gesto debe terminar en un capítulo estable y el gesto contrario debe interrumpir el movimiento sin tirones.
3. Reproducir un álbum desde Batea y Colección y observar el vuelo completo y la rotación antes del acople.
4. Comprobar que el rail lateral no tape VFD, controles ni botones de álbum a 761, 900, 1280 y 1920 px.
5. Activar `prefers-reduced-motion: reduce` y comprobar que la navegación directa siga funcionando sin animaciones largas.

## Alcance diferido

Esta pasada no hace un rediseño completo del VFD, no modifica la composición de los capítulos a fondo y no cambia lógica de reproducción de producción. Esos trabajos quedan sujetos a review visual en EPIC 2.6.2.


## Follow-up — Crossfade y rendimiento del Deck (2026-10-24)

### Causa encontrada
- `--pHideDeck` ya sigue el scroll frame a frame; `transition: opacity 120ms` agregaba una segunda interpolación y hacía que el overlay persiguiera el movimiento en lugar de acompañarlo.
- Al cambiar `data-deck-interactive` al llegar al punto medio de Split → Batea, el hook de Now Playing devuelve un snapshot vacío. Usarlo directamente reemplazaba la pista a mitad del fade, aunque el CD y el booklet todavía se veían parcialmente.
- El Canvas WebGL seguía en `frameloop="always"` aunque el overlay estuviera completamente transparente.

### Correcciones
- Mantener el último snapshot de pista durante el fade y cambiarlo solo cuando vuelve a haber un snapshot real.
- Vincular la opacidad exclusivamente al progreso del rail (sin transición CSS secundaria).
- Bajar temporalmente DPR a 1 y deshabilitar sombras durante cualquier movimiento del rail; restaurar calidad completa cuando se asienta.
- Detener el frame loop del CD cuando el overlay ya está visualmente oculto, manteniendo el canvas montado para conservar el destino del vuelo del disco.
- Batea pausa su RAF decorativo hasta que su capítulo está activo y el rail queda quieto.

### Criterios de aceptación manual
1. Split → Batea con menú: la pista se conserva durante todo el fade, sin salto del arte ni desaparición temprana del CD/booklet.
2. Split → Batea con rueda/trackpad: misma continuidad visual; la opacidad sigue el desplazamiento sin retraso adicional.
3. Al terminar de salir del Deck, el Canvas pasa a `frameloop="never"`; al volver a Deck/Split se reactiva.
4. Batea → Colección y los recorridos largos hacia Mixtape no producen tirones perceptibles al pasar por Batea.
5. Confirmar que reproducir desde Batea/Colección conserva el destino de vuelo del disco y que el modal sigue funcionando.
6. Confirmar que `prefers-reduced-motion: reduce` y `RAIL_FLAG=0` conservan su comportamiento previo.

### E2E
Se agregó cobertura Playwright para navegación y rueda que verifica el fade intermedio, la persistencia del snapshot, la pausa/reanudación del Canvas y la pausa/reanudación de la cinta de Batea. Debe pasar en ambos modos del feature flag, con `retries: 0`.


## CI follow-up — visual sampling and transition workload

The previous Browser QA run exposed two test assumptions that measured the wrong thing:
- The test relied on the discrete `data-chapter` value emitting every index. The test now samples each panel's actual position every animation frame, verifies intermediate panels cross the viewport, and bounds the largest frame-to-frame jump.
- The crossfade test checked intermediate opacity after waiting for the destination attribute, which could measure the completed fade. It now samples while the rail moves and checks that the track and booklet remain mounted during the midpoint.

During movement the Deck Canvas uses `frameloop="demand"` and lower render quality, returning to `always` after settling and `never` when fully hidden. Batea and Collection disable interactions and expensive cosmetic effects as they cross the viewport, restoring the full presentation at rest.


## Tercer loop — aislar los fallos del último Browser QA

- El test de navegación y el de crossfade fijan explícitamente `prefers-reduced-motion: no-preference`: miden interpolación, así que no dependen de la preferencia del host CI. La prueba específica de reduced-motion sigue validando el modo accesible por separado.
- Se revirtió el polling temporal adicional que se había agregado al Deck al confirmar playback; interfería con la sincronización del mock de Now Playing. Se conserva el gating normal por capítulo y la instantánea congelada durante el vuelo.
