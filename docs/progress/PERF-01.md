# PERF-01 — Escalabilidad, carga diferida y contratos acotados

**Estado: COMPLETADO el 2026-08-13.** No se modificaron el HTML protegido, los baselines de RELEASE-01 ni el umbral visual de 0,5 %.

## Arquitectura aplicada

### Límites directos

- Activos: página máxima 100; sugerencias remotas máximas 50 y filtradas por proyecto.
- Documentos: página máxima 100, búsqueda/filtros/estado y KPI calculados en PostgreSQL.
- Planos: 500 marcadores iniciales o por chunk; búsqueda de candidatos máxima 50; facetas agregadas por tipo.
- Ubicaciones: raíces/hijos máximos 100, preview de 3 activos e inventario paginado máximo 100.
- Calendario: rango máximo 93 días, 500 eventos de respuesta y señal `truncated`.

### Límites anidados

- La fila de Activo ya no carga `dateSchedules`, ejecuciones preventivas, tareas, documentos ni campos dinámicos. `nextAssetEventsById` consulta una sola ocurrencia pendiente por fuente/activo mediante `LATERAL ... LIMIT 1`; solo devuelve el siguiente evento de la fila.
- El DTO de marcador conserva la urgencia real (`overdue`, `soon <=21 días`, `normal`) y, como máximo, un próximo evento. No reintroduce el selector pesado ni históricos.
- El listado de Documento obtiene solo la versión actual y tres activos de presentación. Historial de versiones, detalle del activo e inventarios completos se solicitan en endpoints propios.

### Consultas de jerarquía

- Activos filtrados por subárbol, candidatos de plano, facetas de plano y conteo de la ficha de Ubicación incorporan `WITH RECURSIVE` en SQL y aplican `EXISTS`/agregación/filtro/límite en PostgreSQL.
- El bootstrap de Ubicaciones obtiene raíces y solo los hijos de las ramas necesarias para la primera hoja relevante; restaura su camino abierto visualmente y el resto sigue bajo demanda.
- `descendantLocationIds()` queda limitado a la mutación de borrado de ubicación; no alimenta listados ni búsquedas.

### Contratos funcionales restaurados

- Planos recupera halos/filtros de vencido y próximo con hidratación ligera, y el panel de capas usa `GET /api/floor-plans/:id/facets` (conteos por tipo) en vez de `availableAssets` masivo.
- Documentos conserva filtros/búsqueda/paginación en servidor dentro de un control contextual de cabecera; en reposo vuelve a la composición aprobada.
- Autocompletes de Activos, Ubicaciones y Documentos respetan el proyecto activo/recibido.

## Índices

La migración `20260812150000_perf_01_bounded_query_indexes` añade índices compuestos para listas/rangos y `pg_trgm` para `ILIKE` de Activos y Documentos. En producción corresponde revisar `EXPLAIN (ANALYZE, BUFFERS)` con distribución real antes de añadir índices adicionales.

## Benchmark reproducible

`pnpm test:perf` crea y elimina un proyecto temporal. El modo por defecto es 10.000 activos y 10.000 documentos; añade árbol profundo/ancho, 500 marcadores, calendario denso y 2.000 históricos de fecha + 2.000 preventivos para un activo. El modo manual de 100.000 permanece disponible:

```powershell
$env:PERF_RECORDS = '100000'; pnpm test:perf
```

Resultado local de 10.000 registros por entidad (2026-08-13):

| Superficie | p50 | p95 | Respuesta |
|---|---:|---:|---:|
| Página de activos (20) | 39,2 ms | 131,3 ms | 16.454 B |
| Página de documentos (20) | 136,1 ms | 255,4 ms | 5.650 B |
| Búsqueda de activo | 48,2 ms | 156,8 ms | 711 B |
| Búsqueda de documento | 43,8 ms | 141,4 ms | 324 B |
| Bootstrap de árbol | 146,8 ms | 290,3 ms | 39.416 B |
| Activos por subárbol grande | 90,2 ms | 180,5 ms | 16.454 B |
| Búsqueda remota de plano | 110,7 ms | 247,1 ms | 5.590 B |
| Facetas de plano | 92,0 ms | 161,2 ms | 88 B |
| Plano con 500 marcadores | 73,3 ms | 158,8 ms | 271.498 B |
| Calendario denso | 51,0 ms | 152,9 ms | 209.731 B |
| Fila con 2.000 + 2.000 históricos | 56,7 ms | 160,8 ms | 862 B |

El modo de 100.000 no se ejecutó localmente: está preparado para una medición específica, no para extrapolar capacidad de producción.

## Auditoría final de `findMany`

- **Listas operativas:** Activos, Documentos, candidatos de plano, marcadores, inventario de ubicación e historial tienen página/límite. Calendar limita cada fuente a 501 y la respuesta a 500.
- **DTOs de detalle/mutación:** versiones, limpieza de archivos de un plano, validación de opciones/planes y marcadores de una escritura inspeccionan una única entidad para conservar integridad; no son rutas de lista.
- **Catálogos controlados:** tipos, estados, usuarios, tareas, definiciones y plantillas se consultan completos por proyecto para selectores de configuración. Están documentados como excepción y deberán paginarse/remotizarse si dejan de ser pequeños.
- **Purgado:** procesa como máximo 1.000 activos por visita.

## Validación final

- `pnpm prisma validate` ✅
- `pnpm db:deploy` ✅ — migraciones al día
- `pnpm lint` ✅
- `pnpm typecheck` ✅
- `pnpm build` ✅
- `pnpm test` ✅ — 194 pruebas
- `pnpm test:e2e` ✅ — 62 pruebas
- `pnpm test:visual` ✅ — 30/30 bajo 0,5 %
- `pnpm test:perf` ✅ — perfil de 10.000 registros de esta revisión

Aviso conocido no bloqueante: Node/tsx emite `DEP0205` durante pruebas; no aparece en Docker ni en la consola de la UI.
