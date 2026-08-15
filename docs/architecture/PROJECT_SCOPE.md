# PROJ-01 — Ámbito multi-proyecto

## Regla de autoridad

Toda operación operativa se dirige a `/api/projects/:projectId/...`. El parámetro de ruta es la única fuente de autoridad del proyecto: los identificadores recibidos en cuerpo o query se comprueban contra él y nunca pueden seleccionar otro proyecto. Las rutas antiguas de la aplicación redirigen solamente cuando el navegador ya conserva un proyecto seleccionado; si no lo hay, llevan a la cartera de proyectos.

`server/lib/projectScope.ts` resuelve el ámbito una vez por petición. Comprueba existencia, membresía del actor local provisional, rol cuando una gestión lo exige y estado de archivo para escrituras. Sus helpers comprueban las relaciones Asset, Location, Document y FloorPlan antes de asociarlas.

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

`tests/api/projects.scope.test.ts` comprueba CRUD/membresías, lectura y escritura por ID conocido entre proyectos, unicidad compuesta, protección de archivo y copia exclusiva de configuración. `tests/e2e/z-projects.spec.ts` cubre crear, abrir, archivar y reactivar desde la cartera.
