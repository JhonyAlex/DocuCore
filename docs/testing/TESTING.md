# Pruebas y evidencia de DocuCore

Este documento define cómo verificar cambios sin sobreafirmar resultados ni poner datos en riesgo. El estado de la última auditoría se registra en [CURRENT_STATUS.md](../progress/CURRENT_STATUS.md).

## Matriz de comandos

| Objetivo | Comando | Prerrequisito | Evidencia esperada |
|---|---|---|---|
| Lint | `pnpm lint` | Dependencias instaladas | Salida completa, código de salida `0`, sin warnings |
| Tipos | `pnpm typecheck` | Dependencias instaladas y Prisma Client disponible | Ambos proyectos TypeScript terminan con código `0` |
| Unit/integración enfocada | `pnpm test` | Variables requeridas por la prueba | Archivos/casos ejecutados y conteo de éxitos/fallos |
| Build | `pnpm build` | Dependencias instaladas | Código `0`, warnings conservados y artefacto `dist/` |
| E2E no visual | `pnpm test:e2e` | Docker y base aislada verificada | Reporte Playwright, casos HTTP/UI y errores de consola |
| Regresión visual | `pnpm test:visual` | Docker, base aislada y referencia protegida | Resultado de los `30` pares y artefactos app/referencia/diff |
| Migración de desarrollo | `pnpm db:migrate` | `DATABASE_URL` de desarrollo aislada y verificada | Migración nueva aplicada hacia adelante |
| Migración de despliegue | `pnpm db:deploy` | Base objetivo verificada y backup/plan de rollback aplicable | Migraciones pendientes aplicadas sin seed |
| Seed | `pnpm db:seed` | Base desechable de desarrollo/pruebas verificada | Datos esperados y confirmación de que no era producción |
| Compose estático | `docker compose config --quiet` | Docker Compose | Código `0` |
| Runtime Compose | `docker compose up --build -d` y healthcheck | Puertos, secretos y entorno controlado | Servicios healthy, migración y `GET /api/health` HTTP `200` |

## Matriz por cambio

| Cambio | Mínimo aplicable |
|---|---|
| Solo documentación | Enlaces/rutas, conteos, consistencia y `git diff --check` |
| Frontend sin persistencia | `lint`, `typecheck`, prueba enfocada y comparación visual de cada vista afectada |
| API o reglas | `lint`, `typecheck`, unit/integración enfocada y casos HTTP negativos |
| Persistencia o migración | Lo anterior, migración hacia adelante y verificación de datos en base aislada |
| Flujo vertical | Capas, E2E feliz/fallos, permisos y comparación visual |
| Despliegue | `build`, Compose estático, arranque y healthcheck en entorno controlado |

## Prerrequisitos

- Usar la versión de `pnpm` declarada en `package.json`.
- Instalar navegadores de Playwright cuando proceda.
- Verificar Docker, puertos y variables antes de levantar servicios.
- Confirmar explícitamente que `DATABASE_URL` apunta a una base desechable de desarrollo/pruebas antes de migrar, sembrar o ejecutar Playwright.
- No reutilizar una base con datos reales, compartidos o sin respaldo.
- Registrar rama, HEAD, fecha, comando y resultado para evidencia reproducible.

## Advertencia crítica sobre datos

> Los comandos de reset, migración o seed y las suites que los invocan requieren una base de desarrollo/pruebas aislada y verificada. No se ejecutan por conveniencia contra una URL de origen desconocido.

`tests/helpers/database.ts` toma `DATABASE_URL` del entorno, ejecuta `prisma migrate deploy` y llama a `pnpm db:seed`. El seed trunca datos. Actualmente no existe una guarda que demuestre que la URL corresponde a una base de pruebas; por eso E2E, visual, migraciones y seed permanecen bloqueados en una auditoría hasta verificar el entorno o implementar `SEC-03`.

## Referencia visual protegida

- Archivo: `docs/reference/docucore-prototype.html`.
- SHA-256: `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`.
- Tamaño: `126104` bytes y `1800` líneas físicas.
- La prueba debe servir el archivo original en modo de solo lectura.
- Está prohibido modificar la referencia, sustituirla, regenerarla, actualizar baselines o relajar umbrales/objetivos para ocultar diferencias.
- Un fallo visual se corrige en la aplicación o se documenta y autoriza como cambio del contrato.

La evidencia histórica actual es contradictoria (`30/30` frente a `5/30`) y no existen reportes retenidos. Hasta una repetición controlada, el resultado visual vigente no está verificado.

## Evidencia mínima

Toda afirmación de éxito debe incluir:

- comando exacto y fecha;
- entorno y dependencias externas relevantes;
- conteo de pruebas ejecutadas, aprobadas y fallidas;
- código de salida o respuesta observable;
- warnings, omisiones y fallos, sin ocultarlos;
- ruta de reporte/artefactos cuando exista;
- confirmación de base aislada para operaciones de datos.

No se declara una prueba como ejecutada a partir de configuración, código existente o un resultado histórico. Si no se ejecutó, se indica de forma explícita.
