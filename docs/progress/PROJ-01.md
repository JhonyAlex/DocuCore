# PROJ-01 — Sistema multi-proyecto real

## Resultado

`Project` es la frontera de datos de DocuCore. Las áreas operativas requieren una URL canónica `/projects/:projectId/...`; las APIs equivalentes usan `/api/projects/:projectId/...`. No existe una selección silenciosa de proyecto en el cliente ni en el servidor.

## Arquitectura

- `ProjectProvider` carga el proyecto indicado por la ruta, ofrece estado, error y refresco, y fuerza el desmontaje de vistas cuando cambia el ID. El Sidebar consulta de forma remota un máximo de 20 proyectos activos, con debounce, y conserva el sufijo de sección al cambiar de proyecto.
- `server/lib/projectScope.ts` concentra la existencia, membresía del actor actual provisional, comprobación de rol, bloqueo de escrituras en proyectos archivados y la pertenencia de entidades relacionadas. La URL siempre prevalece sobre `projectId` de body o query.
- `server/routes/projects.ts` ofrece cartera paginada y buscable, CRUD, archivo/reactivación, membresías y clonación. El resumen utiliza `_count` de PostgreSQL y solo devuelve cuatro miembros por tarjeta.
- Las operaciones de activos, documentos, calendario, planos, ubicaciones, historial, búsqueda, notificaciones y configuración se montan bajo el scope canónico. Las rutas de interfaz antiguas se redirigen solo a una selección persistida existente; sin ella llevan a `/projects`.

## Modelo y migraciones

- `20260815010000_proj_01_multi_project`: roles `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`; tema semántico cerrado; eliminación de contadores persistidos; unicidad compuesta de `Asset.code`, `Asset.serialNumber` y `Location.code` por proyecto.
- `20260815011000_proj_01_project_created_order_index`: índice para la cartera ordenada por creación.

Los proyectos archivados conservan íntegramente su información y admiten lectura/reactivación, pero cualquier escritura ordinaria devuelve 409. La clonación remapea IDs y copia estados, tipos, campos y opciones, relaciones campo-tipo, tareas, planes preventivos y relaciones plan-tarea/tipo; no copia información operativa.

## Aislamiento y escala

Las pruebas de integración comprueban que un ID conocido de Activo o Documento de otro proyecto devuelve 404, que una relación de estado cruzada devuelve 400, que el body no puede cambiar el scope de ruta y que las claves repetidas solo fallan dentro del mismo proyecto. También cubren proyectos archivados, clonación y ciclo de miembros.

La cartera se pagina, busca y ordena en PostgreSQL. Los DTO de tarjeta tienen contadores agregados y cuatro miembros como máximo; el selector remoto se limita a 20 resultados. `pnpm test:perf` valida los contratos acotados con 10.000 registros por entidad.

## Validación final

- `pnpm exec prisma validate`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- `pnpm test`: 236 pruebas unitarias/API.
- `pnpm test:e2e`: 79 escenarios.
- `pnpm test:perf`: 10.000 registros por entidad.
- `pnpm db:seed`, `docker compose up --build -d --wait` y `GET /api/health` 200.

El contrato visual de Proyectos cumple las tres capturas (0,3045 %–0,4385 %, límite 0,5 %). El barrido visual completo conserva nueve fallos existentes de Panel, Ubicaciones e Historial frente a sus contratos HTML protegidos; no se elevó el umbral ni se alteraron HTML o baselines.
