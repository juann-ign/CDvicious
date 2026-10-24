# Project baseline — 2026-10-24

## Alcance

Línea base del proyecto desde un checkout limpio de `main`. Esta rama sólo agrega este registro; no modifica código de producto, dependencias ni configuración funcional. La ejecución de CI sobre el PR instala las dependencias y valida el árbol de la aplicación, que es idéntico a `main` en este baseline.

## Comandos requeridos

Se deben registrar los resultados observados de:

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

El workflow existente `.github/workflows/build.yml` ejecuta esos cuatro pasos en pull requests dirigidos a `main`. Usa Node.js 24 y ejecuta `npm ci --no-audit --no-fund --loglevel=error`, equivalente a `npm ci` para instalación limpia con auditoría y mensajes de financiación desactivados.

## Estado de la ejecución

Pendiente de verificar los checks de GitHub Actions de este PR. No se considera exitoso ningún comando hasta observar el resultado del paso correspondiente.

| Comando | Resultado | Evidencia / diagnóstico |
|---|---|---|
| `npm ci` | Pendiente | CI: Install dependencies |
| `npm run lint` | Pendiente | CI: Lint |
| `npm run test` | Pendiente | CI: Typecheck |
| `npm run build` | Pendiente | CI: Production build |

## Clasificación baseline vs. regresión

Como el único cambio de esta rama es este documento, cualquier fallo de lint, typecheck o build será preexistente en el código que parte de `main`, salvo que la evidencia muestre que la documentación o el cambio de rama afecta al workflow. No se deben introducir correcciones de producto ni refactors en este PR. Si se encuentra un error reproducible, registrar el comando, mensaje completo y clasificación; corregirlo sólo si es una corrección estrictamente necesaria para hacer ejecutable el baseline y separar ese cambio del registro.

## Workflows y checks esperados hacia `main`

- **Build** — `.github/workflows/build.yml`: `npm ci`, `npm run lint`, `npm run test`, `npm run build`. Se dispara en todo pull request con base `main`.
- **STAB-01 Browser QA** — `.github/workflows/stab-01-browser-qa.yml`: dos jobs, `RAIL_FLAG=0` y `RAIL_FLAG=1`; se dispara cuando un PR a `main` cambia archivos en las rutas filtradas del workflow, incluyendo `src/**`, `tests/e2e/**`, `docs/qa/**`, los archivos de configuración de Playwright y los manifiestos npm.

Los checks obligatorios de protección de rama no se infieren de los workflows; se deben contrastar con los checks visibles en el PR y con la configuración de branch protection/rulesets si el acceso lo permite.

## Criterio de salida

El baseline queda aprobado únicamente cuando los resultados visibles de los checks ejecutados sobre el commit final se registran aquí. Este PR debe quedar abierto para revisión humana y no se debe mergear automáticamente.
