# PERF-01 — Contratos de carga acotada

## Regla de diseño

Una pantalla limitada no puede ejecutar trabajo proporcional al tamaño completo de la base de datos. Los filtros, el orden y el límite se ejecutan en PostgreSQL antes de materializar DTOs; el detalle y el histórico se solicitan explícitamente.

## Límites directos y anidados

| Superficie | Límite directo | Límite anidado / DTO |
|---|---|---|
| Activos | página máxima 100 | La fila no incluye relaciones crecientes. `nextAssetEventsById` hace cuatro `LATERAL ... LIMIT 1` por activo de la página (manual, documento, fecha dinámica y preventivo) y devuelve un único siguiente evento. Los históricos siguen en detalle/endpoints paginados. |
| Documentos | página máxima 100 | SQL toma solo la versión actual y hasta 3 activos de presentación; el historial completo de versiones solo sale de `GET /api/documents/:id`. |
| Planos | 500 marcadores por chunk; búsqueda de activos máxima 50 | Marcadores y búsqueda hidratan como máximo un siguiente evento por activo. `GET /:id/facets` devuelve solo agregados por tipo, nunca `availableAssets`. |
| Ubicaciones | raíces/hijos máximos 100; preview 3; inventario máximo 100 por página | `bootstrap` carga raíces y hermanos de un único camino (profundidad máxima 12), no el árbol completo. |
| Calendario | rango máximo 93 días; respuesta máxima 500 | Cada fuente consulta como máximo 501 filas; `truncated` obliga a acotar cuando una fuente o la respuesta supera el contrato. |
| Autocomplete | activos y planos máximo 50; ubicaciones/documentos máximo 20 | Todos están filtrados por proyecto cuando el consumidor conoce el proyecto activo. |

## Jerarquías

- El filtro de Activos por ubicación integra `WITH RECURSIVE` y `EXISTS` en la consulta de página; no crea `locationId IN [...]` en Node.
- La búsqueda de activos y las facetas de un plano integran la misma CTE, filtro, orden y `LIMIT` en PostgreSQL.
- El contador de subárbol de la ficha de Ubicación se obtiene con CTE + `COUNT` en PostgreSQL.
- `descendantLocationIds()` queda exclusivamente para la mutación de borrado de una ubicación, que debe inspeccionar la subrama completa para conservar la restricción de integridad. No alimenta vistas limitadas.

## Catálogos y excepciones auditadas

Tipos, estados, usuarios, tareas, definiciones dinámicas y plantillas preventivas son catálogos de configuración acotados por proyecto. Sus `findMany` se justifican como selectores de configuración; si dejan de ser pequeños deben evolucionar a un endpoint remoto/paginado antes de usarse en una vista masiva.

Las lecturas no paginadas de versiones de un documento/plano, reglas dinámicas, asociaciones preventivas o marcadores afectados por una escritura son comprobaciones de detalle o integridad de una única entidad, no DTOs de lista. Las fuentes del calendario, historial de activo, purga, candidatos de plano, marcadores y listas operativas tienen límite, rango o página explícitos.

## Verificación

`pnpm test:perf` crea un proyecto temporal, genera 10.000 activos y documentos por defecto, un árbol profundo/ancho, 500 marcadores, calendario denso y un activo con 2.000 ocurrencias y 2.000 preventivos históricos. Mide p50/p95 y tamaño de respuesta de las superficies acotadas, y elimina el proyecto al terminar.

Para la comprobación manual de 100.000 registros:

```powershell
$env:PERF_RECORDS = '100000'; pnpm test:perf
```

Antes de cerrar un cambio, buscar `findMany` en `server/`, justificar cada excepción de catálogo/detalle y ejecutar lint, tipos, build, unit/API, E2E, visual y perfil.
