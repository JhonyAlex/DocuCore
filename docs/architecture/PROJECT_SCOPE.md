# PROJ-01 — Ámbito multi-proyecto

## Regla de autoridad

Toda operación operativa se dirige a `/api/projects/:projectId/...`. El parámetro de ruta es la única fuente de autoridad del proyecto: los identificadores recibidos en cuerpo o query se comprueban contra él y nunca pueden seleccionar otro proyecto. Las rutas antiguas de la aplicación redirigen solamente cuando el navegador ya conserva un proyecto seleccionado; si no lo hay, llevan a la cartera de proyectos.

`server/lib/projectScope.ts` resuelve el ámbito una vez por petición. Parte exclusivamente del usuario autenticado por sesión, comprueba existencia, membresía, capacidad central y estado de archivo para escrituras. Sus helpers comprueban las relaciones Asset, Location, Document y FloorPlan antes de asociarlas.

## Capacidades de ProjectMember

La autorización se declara una vez en `projectCapabilities` y se aplica al montar cada familia de router; ningún router operativo repite comprobaciones de rol.

| Capacidad | OWNER | ADMIN | EDITOR | VIEWER |
|---|:---:|:---:|:---:|:---:|
| Lectura scoped | Sí | Sí | Sí | Sí |
| Operar activos, documentos, ubicaciones, calendario, planos, ejecuciones y notificaciones | Sí | Sí | Sí | No |
| Configuración estructural (tipos, estados, campos, tareas y planes preventivos) | Sí | Sí | No | No |
| Gestionar proyecto (edición, archivo y reactivación) | Sí | Sí | No | No |
| Gestionar miembros | Sí | Sí | No | No |

Una persona sin membresía recibe `403`. En una escritura, primero se comprueba la capacidad: VIEWER y EDITOR en configuración reciben `403`; una persona autorizada obtiene `409` si el proyecto está archivado. Las lecturas de un proyecto archivado continúan disponibles.

AUTH-01 elimina el actor provisional. Las APIs protegidas no tienen fallback: sin sesión válida responden `401`; con sesión y sin membresía, `403`. El header de actor sólo existe como fixture explícita bajo `NODE_ENV=test`, nunca en producción.

## Rutas y navegación

Las áreas operativas canónicas son:

```
/projects/:projectId/dashboard
/projects/:projectId/assets
/projects/:projectId/docs
/projects/:projectId/calendar
/projects/:projectId/plans
/projects/:projectId/locations
/projects/:projectId/history
/projects/:projectId/config/*
```

La identidad global se consulta exclusivamente en `GET /api/auth/session`; sin cookie válida devuelve `401`. La gestión administrativa de cuentas usa `GET/POST/PATCH /api/users` con `projectId` explícito y exige la capacidad `MANAGE_MEMBERS`; las membresías siguen bajo `/api/projects/:projectId/members`.

El selector del Sidebar consulta proyectos activos de forma remota (máximo 20 y búsqueda con debounce) y cambia el mismo sufijo de sección. Un cambio de ruta desmonta los detalles, filtros y selección de la vista anterior; no se reutiliza ningún DTO de otro proyecto.

## Integridad y ciclo de vida

- `Asset.code`, `Asset.serialNumber` y `Location.code` son únicos por `projectId`.
- Un proyecto archivado puede leerse y reactivarse, pero el middleware rechaza las escrituras operativas con 409.
- Los contadores de la cartera se calculan en PostgreSQL con `_count`; los activos de papelera no cuentan.
- La clonación solo replica estados, tipos, campos/opciones/asociaciones, tareas y planes preventivos/asociaciones. El destino debe no tener datos operativos; no se copian activos, ubicaciones, documentos, planos, eventos, ejecuciones, auditoría ni notificaciones.

## Carga acotada

`GET /api/projects` usa búsqueda, estado, orden y paginación en base de datos; `Project_status_createdAt_id_idx` mantiene el orden de cartera sin cargar el conjunto completo. Los resúmenes contienen como máximo cuatro miembros y contadores agregados. Los recursos operativos conservan los límites definidos en [PERFORMANCE.md](./PERFORMANCE.md).

## Datos y pruebas

El seed crea cinco proyectos accesibles, con Planta Industrial Norte y Edificio Corporativo Centro utilizables y con datos operativos diferenciados. El mismo código y número de serie de activo se usan en ambos como comprobación deliberada de la unicidad por proyecto.

`tests/api/projects.scope.test.ts` comprueba CRUD/membresías, aislamiento por ID conocido, unicidad compuesta, protección de archivo, copia exclusiva de configuración y la matriz OWNER/ADMIN/EDITOR/VIEWER/sin membresía. `tests/api/auth.test.ts` cubre credenciales, sesiones y revocación; `tests/e2e/z-projects.spec.ts` cubre crear, abrir, archivar y reactivar desde la cartera, incluida una única carga de proyecto al entrar.
