# Project baseline — 2026-10-24

## Alcance

Línea base ejecutada en GitHub Actions sobre un checkout limpio del PR contra \`main\`. La rama añade este informe y contiene ajustes acotados a la estabilidad de la suite Playwright; no modifica lógica ni código de producto, ni dependencias.

## Comandos solicitados

El workflow existente \`.github/workflows/build.yml\` ejecuta los cuatro comandos en PRs dirigidos a \`main\`. Usa Node.js 24 y ejecuta \`npm ci --no-audit --no-fund --loglevel=error\`, que sigue siendo una instalación limpia; solo desactiva audit/funding y reduce mensajes.

Resultados observados sobre el commit \`b35a47090670339d3222f46fc294e5e71d17545f\`:

| Comando | Resultado | Evidencia |
|---|---|---|
| \`npm ci\` | **PASS** | Paso Install dependencies del workflow Build |
| \`npm run lint\` | **PASS con warnings** | Exit code 0; warnings no bloqueantes enumerados abajo |
| \`npm run test\` | **PASS** | El script actual ejecuta \`tsc --noEmit\`; no es una suite de tests unitarios |
| \`npm run build\` | **PASS** | Compilación completada; generación estática 16/16 |

Build sobre el commit validado: https://github.com/juann-ign/CDvicious/actions/runs/40122014571

### Warnings no bloqueantes de lint/build

- \`next lint\` está deprecado y se eliminará en Next.js 16.
- \`src/components/crate/CrateChapter.tsx:24\`: warning \`react-hooks/exhaustive-deps\` sobre \`dragLockTokenRef.current\` durante cleanup.
- \`src/components/crate/JewelCaseDetailModal.tsx:380\`: warning del mismo tipo sobre \`railLockTokenRef.current\`.
- \`src/components/crate/MixtapeChapter.tsx:46\`: warning del mismo tipo sobre \`exportLockTokenRef.current\`.
- \`src/lib/nowPlayingStore.ts:29\`: \`lastPollStartedAt\` se asigna pero no se utiliza.

Los mismos warnings aparecen en lint y build y no hacen fallar el pipeline. Se dejan fuera de alcance porque no impiden establecer la línea base y no forman parte de los cambios de QA.

## Browser QA: ciclos y diagnóstico

Los primeros ciclos detectaron fallos en la suite Playwright con \`RAIL_FLAG=1\`. Se corrigió la instrumentación del test sin eliminar tests, debilitar las aserciones funcionales ni activar retries:

- Inicialización del rail: la navegación/paneles client-only podían tardar más que el timeout anterior de CI. Las esperas de navegación, paneles y \`data-rail-ready\` se ampliaron a 90 s; el timeout total por test se ajustó a 180 s. \`retries: 0\` se mantiene.
- Hit-testing de Batea: el marquee se desplazaba entre tomar el bounding box y comprobar \`elementsFromPoint\`. El test pausa el marquee antes de medir y elige un botón cuyo centro esté dentro del viewport y del área visible del panel.
- Rechazo de reproducción: el test esperaba el modal restaurado solo 8 s. Se amplió esa espera a 20 s, manteniendo las aserciones sobre modal, alerta, capítulo de origen, vuelo y eventos de cancelación.
- Reproducción confirmada: el mock E2E de \`/api/now-playing\` siempre devolvía el álbum inicial. El test ahora simula el álbum confirmado después de una respuesta de reproducción exitosa, para verificar correctamente sincronización entre vuelo y Now Playing sin tocar comportamiento de producción.

La evidencia del ciclo inicial de fallos se conserva en https://github.com/juann-ign/CDvicious/actions/runs/40117697191. Se trata de problemas reproducibles en la configuración/fixture de Browser QA de esta rama; la evidencia final demuestra que los tests funcionales vuelven a pasar con las aserciones intactas. No se atribuye una regresión a código de producto porque este PR no lo modifica.

### Resultado final de Browser QA

Commit validado: \`b35a47090670339d3222f46fc294e5e71d17545f\`.

- **\`RAIL_FLAG=0\`: PASS** — 2 tests pasaron y 16 se omitieron porque cubren comportamiento exclusivo del rail habilitado.
- **\`RAIL_FLAG=1\`: PASS** — 17 tests pasaron y 1 se omitió por su condición de ejecución.
- No hubo fallos en los dos jobs. No se habilitaron retries.

Evidencia: https://github.com/juann-ign/CDvicious/actions/runs/40122014570

## Workflows y checks hacia \`main\`

- **Build** — \`.github/workflows/build.yml\`: instalación limpia, lint, typecheck mediante \`npm run test\` y build de producción; se dispara para todo PR hacia \`main\`.
- **STAB-01 Browser QA** — \`.github/workflows/stab-01-browser-qa.yml\`: jobs separados con \`RAIL_FLAG=0\` y \`RAIL_FLAG=1\`; los filtros de rutas incluyen \`src/**\`, \`tests/e2e/**\`, \`docs/qa/**\`, configuración de Playwright y manifiestos npm.

Los workflows definen qué ejecuciones se disparan; no se deben confundir con una regla de checks obligatorios. La configuración de protección de rama consultada no declara checks requeridos. El informe registra los resultados visibles de los workflows.

## Estado de salida

Sobre el commit \`b35a47090670339d3222f46fc294e5e71d17545f\`, **Build y ambos jobs de Browser QA terminaron en verde**. No queda un fallo reproducible pendiente en esos checks. Las advertencias de lint son no bloqueantes y se distinguen de fallas.

Este PR debe permanecer abierto para revisión humana. No se debe mergear automáticamente.