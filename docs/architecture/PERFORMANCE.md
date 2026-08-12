# PERF-01 — Contratos de carga acotada

## Regla de diseño

Una pantalla limitada no puede ejecutar trabajo proporcional al tamaño completo de la base de datos. Cada endpoint declara página/límite, aplica filtros antes de materializar resultados y expone un DTO proporcionado al consumidor.

## Contratos actuales

| Superficie | Contrato |
|---|---|
| Activos | Lista paginada (máximo 100) y DTO de tabla acotado; detalle completo por id. Sugerencias remotas máximo 50. |
| Documentos | `GET /api/documents` pagina, filtra y clasifica en SQL; las versiones completas solo están en `GET /api/documents/:id`. |
| Planos | La carga del plano contiene metadatos y hasta 500 marcadores ligeros; `GET /api/floor-plans/:id/markers` añade chunks bajo demanda. `GET /api/floor-plans/:id/assets` busca activos de forma remota y máximo 50. |
| Ubicaciones | El detalle contiene tres activos de preview; `GET /api/locations/:id/assets` entrega el inventario directo paginado y buscable. La descendencia se resuelve con CTE recursiva. |
| Calendario | Rango máximo 93 días y máximo 500 ocurrencias; la respuesta marca `truncated` cuando el cliente debe acotar más el contexto. |

Tipos, estados, usuarios, tareas y definiciones son catálogos controlados por proyecto. Si dejan de ser pequeños deben evolucionar a endpoint paginado/remoto antes de ser usados como selector.

## Verificación

`pnpm test:perf` crea un proyecto temporal, genera 10.000 activos y documentos por defecto, mide p50/p95 y tamaño de respuesta de las páginas y búsquedas limitadas, y elimina el proyecto. Para preparar la prueba manual de 100.000 registros: `PERF_RECORDS=100000 pnpm test:perf`.

Antes de cerrar un cambio, buscar `findMany` en `server/`, justificar cada excepción de catálogo o detalle y ejecutar las suites de validación.
