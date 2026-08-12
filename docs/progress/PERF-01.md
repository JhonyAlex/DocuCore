# PERF-01 — Escalabilidad, carga diferida y contratos acotados

## Arquitectura aplicada

- Documentos: paginación, búsqueda, tipo, activo y estado se resuelven con la versión actual mediante `LATERAL` SQL; KPI se agrega en PostgreSQL.
- Planos: marcadores ligeros y límite de 500; activos candidatos se consultan por endpoint remoto máximo 50 con debounce en búsqueda y colocación.
- Activos: la lista usa relaciones limitadas para la fila y el detalle mantiene la carga completa bajo demanda; búsqueda y sugerencias se acotan.
- Ubicaciones: el preview se limita a tres y el inventario directo tiene endpoint paginado. Las consultas de subárbol usan CTE recursiva, no un `findMany` de todas las ubicaciones.
- Calendario: máximo 93 días y 500 ocurrencias, con señal `truncated`.

## Índices

La migración `20260812150000_perf_01_bounded_query_indexes` añade índices compuestos para listas/rangos y `pg_trgm` para `ILIKE` de Activos y Documentos. Revisar el `EXPLAIN (ANALYZE, BUFFERS)` del despliegue real antes de añadir índices adicionales.

## Perfil reproducible

`pnpm test:perf` crea un proyecto temporal, inserta activos y documentos por
lotes, mide doce peticiones de página/búsqueda y elimina el proyecto al
terminar. Para la comprobación manual de 100.000 registros:

```powershell
$env:PERF_RECORDS = '100000'; pnpm test:perf
```

Resultado local de 10.000 registros por entidad (2026-08-12):

| Consulta | p50 | p95 | Respuesta |
|---|---:|---:|---:|
| Página de activos (20) | 22,8 ms | 121,2 ms | 15.410 B |
| Página de documentos (20) | 109,3 ms | 158,9 ms | 5.670 B |
| Búsqueda de activo | 42,2 ms | 116,9 ms | 815 B |
| Búsqueda de documento | 21,4 ms | 89,0 ms | 325 B |

No se ejecutó el modo manual de 100.000 registros: queda preparado, pero no
se debe convertir el perfil local en una métrica de capacidad de producción.

## Auditoría final de `findMany`

### Corregidos o acotados

- Listas de activos, documentos, ubicaciones, inventario de ubicación,
  historial de activo, candidatos de plano, marcadores por chunk y fuentes del
  calendario tienen `take`, página o rango máximos.
- La purga perezosa de papelera procesa como máximo 1.000 activos por visita.
- La lista de planos se limita a 100 elementos por petición; el detalle de
  plano carga 500 marcadores y puede añadir chunks explícitos.
- Las confirmaciones de asociación documental reciben como máximo 20 ids por
  Zod y la hidratación posterior solo reconsulta la página de ids ya limitada.

### Excepciones seguras o deliberadas

- Versiones de un documento, versiones que se borran junto con un plano y
  marcadores que se validan al cambiar la ubicación de un activo son lecturas
  de detalle/mutación: deben inspeccionar el conjunto de esa única entidad para
  preservar integridad, no alimentan una lista.
- Las confirmaciones de opciones de campos dinámicos y de planes preventivos
  son validaciones de escritura sobre una única definición/activo.
- Los acknowledgements de calendario quedan acotados indirectamente por 501
  fuentes por tipo y 20 activos por documento.
- Tipos, estados, usuarios, tareas, definiciones dinámicas y plantillas
  preventivas son catálogos de configuración controlados por proyecto. Siguen
  cargándose completos; si dejan de ser pequeños, su siguiente evolución es un
  endpoint remoto/paginado antes de usarlos como selector. Esta excepción está
  reflejada en `docs/architecture/PERFORMANCE.md` y `AGENTS.md`.

## Validación ejecutada

- `pnpm lint` ✅
- `pnpm typecheck` ✅
- `pnpm build` ✅
- `pnpm test` ✅ — 192 pruebas
- `pnpm test:e2e` ✅ — 62 pruebas
- `pnpm test:perf` ✅ — perfil de 10.000 registros arriba descrito
- `pnpm prisma validate` ✅
- `pnpm db:deploy` ✅ — sin migraciones pendientes

### Bloqueo visual pendiente

`pnpm test:visual` mantiene el umbral protegido de 0,5 % y falló en 8 de 30
pares: Documentos, Planos y Ubicaciones. No se modificó el HTML protegido, los
baselines ni el umbral para ocultarlo. Los fallos son visibles frente a los
baselines RELEASE-01 y deben inspeccionarse/aceptarse por separado antes de
declarar PERF-01 completamente cerrado.
