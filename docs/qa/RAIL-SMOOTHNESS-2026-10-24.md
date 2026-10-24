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
