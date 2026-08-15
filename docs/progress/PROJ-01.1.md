# PROJ-01.1 — Estabilización final multi-proyecto

## Alcance completado

- `ProjectScope` define capacidades reutilizables: `OPERATE`, `MANAGE_PROJECT`, `MANAGE_MEMBERS` y `MANAGE_CONFIGURATION`.
- Las rutas operativas aplican `OPERATE` centralmente; los routers de configuración aplican `MANAGE_CONFIGURATION`; los endpoints de proyecto y miembros usan sus capacidades explícitas. OWNER y ADMIN tienen administración completa, EDITOR opera y VIEWER solo lee.
- La capacidad se valida antes del bloqueo por archivo: quien no tiene permiso recibe `403`; una persona autorizada recibe `409` al intentar escribir un proyecto archivado.
- `/api/session` permanece global hasta AUTH-01. `/api/projects/:projectId/users` es scoped y el residual `/api/users` devuelve `404`, sin depender de `ProjectScope`.
- `ProjectProvider` ya no vuelve a ejecutar `fetchProject()` después de almacenar el mismo proyecto: solo carga al cambiar el ID de URL o al invocar `refresh()`.
- Ubicaciones vuelve a consumir el preview acotado de tres activos incluido en su DTO de detalle; no descarga el inventario completo para el estado de reposo.
- Panel, Ubicaciones e Historial recuperan el estado de reposo del contrato protegido. Las comparaciones visuales inyectan solamente datos deterministas de contrato durante Playwright para esas tres superficies; la aplicación en ejecución sigue consumiendo sus APIs PostgreSQL reales.

## Evidencia de permisos

`tests/api/projects.scope.test.ts` crea un proyecto aislado con OWNER, ADMIN, EDITOR y VIEWER, y verifica lectura, operación, configuración, gestión de proyecto/miembros, usuario sin membresía, archivo/reactivación y el 404 residual.

## Validación

Barrido final secuencial completado el 15/08/2026 desde el árbol de trabajo de PROJ-01.1:

- `pnpm exec prisma validate` ✅
- `pnpm lint` ✅, `pnpm typecheck` ✅ y `pnpm build` ✅
- `pnpm test` ✅ — 36 archivos, 238 pruebas unitarias/API
- `pnpm test:e2e` ✅ — 79 pruebas Playwright; un `BrowserContext` por worker y una página nueva por prueba evita `net::ERR_NO_BUFFER_SPACE` en Windows sin compartir estado de página
- `pnpm test:perf` ✅ — perfil de 10.000 registros; p95 entre 112,5 ms y 285 ms para los contratos medidos
- `pnpm test:visual` ✅ — 30/30 objetivos por debajo del umbral inalterado de 0,5 %

No se modificaron `docs/reference/docucore-prototype.html`, los baselines aprobados ni el umbral visual.
