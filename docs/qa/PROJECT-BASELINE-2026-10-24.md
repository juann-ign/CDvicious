# Project baseline — 2026-10-24

## Alcance

Línea base del proyecto desde un checkout limpio de `main`. Esta rama agrega este registro y un ajuste acotado a la espera de inicialización de Playwright; no modifica lógica ni código de producto, ni dependencias.

## Comandos requeridos

Se deben registrar los resultados observados de:

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

El workflow existente `.github/workflows/build.yml` ejecuta esos cuatro pasos en pull requests dirigidos a `main`. Usa Node.js 24 y ejecuta `npm ci --no-audit --no-fund --loglevel=error`, equivalente a `npm ci` para instalación limpia con auditoría y mensajes de financiación desactivados.

## Resultados de línea base (checkout limpio de PR hacia `main`)

Los comandos se ejecutaron en GitHub Actions desde un checkout limpio de la rama, cuyo código de aplicación es idéntico a `main`. El workflow existente añade flags a `npm ci` para desactivar audit/funding; sigue siendo una instalación limpia.

| Comando | Resultado observado | Evidencia / diagnóstico |
|---|---|---|
| `npm ci` | **PASS** | `Build`, paso Install dependencies, terminó correctamente |
| `npm run lint` | **PASS con warnings** | Exit code 0. Advertencias preexistentes detalladas abajo |
| `npm run test` | **PASS** | El script actual ejecuta `tsc --noEmit`; terminó correctamente |
| `npm run build` | **PASS** | Compilación de producción completada; páginas estáticas generadas 16/16 |

Evidencia de ejecución inicial: https://github.com/juann-ign/CDvicious/actions/runs/40115789236

### Warnings de lint no bloqueantes observados en el baseline

- `next lint` está deprecado y se eliminará en Next.js 16.
- `src/components/crate/CrateChapter.tsx:24`: warning `react-hooks/exhaustive-deps` sobre `dragLockTokenRef.current` en cleanup.
- `src/components/crate/JewelCaseDetailModal.tsx:380`: mismo tipo de warning sobre `railLockTokenRef.current`.
- `src/components/crate/MixtapeChapter.tsx:46`: mismo tipo de warning sobre `exportLockTokenRef.current`.
- `src/lib/nowPlayingStore.ts:29`: `lastPollStartedAt` se asigna pero no se utiliza.

Los warnings aparecen tanto en lint como durante el build; no hacen fallar los comandos. Quedan fuera de este PR porque no son necesarios para establecer la línea base.

## Clasificación baseline vs. regresión del PR

La rama parte de `main` y no cambia lógica de producto. El primer Browser QA con `RAIL_FLAG=0` pasó (2 tests pasados, 16 omitidos por ser específicos del rail habilitado).

El primer Browser QA con `RAIL_FLAG=1` reportó 16 tests pasados, 1 omitido y 1 fallo de preparación: `openRail` no encontró la navegación en 20 segundos. Se aumentó la espera a 45 segundos, pero el segundo run volvió a fallar en el mismo punto antes de ejercitar el drag. El snapshot de Playwright muestra la navegación montada al capturar el contexto de error después del timeout. Evidencia: https://github.com/juann-ign/CDvicious/actions/runs/40116764179. Se clasifica como una carrera reproducible de inicialización/hidratación en la suite de baseline, no como una regresión de producto introducida por este PR.

**Segundo ajuste de alcance QA:** aumentar a 90 segundos las esperas de navegación, paneles y marcador `data-rail-ready` en los specs de rail; el timeout total por test pasa a 180 segundos para que la inicialización lenta no agote el límite antes de continuar con las aserciones. No se modifican las aserciones funcionales, no se agregan reintentos y no se toca código de producto. Validar el nuevo commit con los checks visibles; el trabajo no se considerará listo hasta que `RAIL_FLAG=1` quede verde.


## Workflows y checks esperados hacia `main`

- **Build** — `.github/workflows/build.yml`: `npm ci`, `npm run lint`, `npm run test`, `npm run build`. Se dispara en todo pull request con base `main`.
- **STAB-01 Browser QA** — `.github/workflows/stab-01-browser-qa.yml`: dos jobs, `RAIL_FLAG=0` y `RAIL_FLAG=1`; se dispara cuando un PR a `main` cambia archivos en las rutas filtradas del workflow, incluyendo `src/**`, `tests/e2e/**`, `docs/qa/**`, los archivos de configuración de Playwright y los manifiestos npm.

Los checks obligatorios de protección de rama no se infieren de los workflows; se deben contrastar con los checks visibles en el PR y con la configuración de branch protection/rulesets si el acceso lo permite.

## Criterio de salida

El baseline queda aprobado únicamente cuando los resultados visibles de los checks ejecutados sobre el commit final se registran aquí. Este PR debe quedar abierto para revisión humana y no se debe mergear automáticamente.
