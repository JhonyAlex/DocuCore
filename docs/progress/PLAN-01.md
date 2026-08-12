# PLAN-01 — Planos funcionales versionados

## Arquitectura

- `FloorPlan` pertenece a un proyecto y una ubicación; una ubicación puede tener varios planos.
- `FloorPlanVersion` conserva el original gestionado y los metadatos de cada subida. La versión de mayor número es la actual.
- `FloorPlanMarker` solo persiste `floorPlanId`, `assetId`, `x` e `y` normalizados entre 0 y 1. El activo es la fuente de código, nombre, tipo y estado.
- `server/lib/floorPlanStorage.ts` usa un directorio y marcador propios (`FLOOR_PLAN_STORAGE_PATH`), claves UUID no adivinables y permite exclusivamente PNG, JPEG y WebP (50 MB). Sharp conserva el original y genera DZI/tiles Deep Zoom.
- `FloorPlanViewer` usa OpenSeadragon contra el manifiesto autenticado de DocuCore. Los overlays se derivan de las coordenadas normalizadas y no de la resolución del archivo.
- `useFloorPlanEditor` conserva borradores, deshacer/rehacer y aplica el diff al guardar. En edición se coloca tocando el plano; los marcadores ya colocados se recolocan de forma precisa con controles direccionales de 5 % antes de guardar.

## Migración

`20260812100000_floor_plan_versions` elimina el modelo temporal de un único plano por ubicación y sus campos de marcador derivados. Crea `FloorPlanVersion`, hace obligatorio `FloorPlan.projectId`, habilita varios planos por ubicación y añade la unicidad `(floorPlanId, assetId)`.

## Endpoints

- `GET/POST /api/floor-plans?projectId=&locationId=` y `GET/PATCH/DELETE /api/floor-plans/:id`
- `POST /api/floor-plans/:id/versions`
- `GET /api/floor-plans/:id/current`, `/current/image`, `/versions/:version/dzi` y `/versions/:version/tiles/:level/:tile`
- `POST /api/floor-plans/:id/markers`, `PATCH/DELETE /api/floor-plans/:id/markers/:markerId`

Las escrituras validan proyecto, ubicación y activo. Un activo solo puede colocarse sobre su misma ubicación o un ancestro; la base de datos impide duplicarlo en el mismo plano.

## Decisiones y deuda pendiente

- La primera fase no incorpora alertas visuales ni importación PDF, por alcance deliberado.
- El visor permite pan/zoom fluido, rueda/trackpad/táctil en modo Ver. El modo Editar prioriza colocación y recolocación deliberada para no confundir el gesto de pan con una escritura persistente.
- El warning de tamaño de bundle de Vite sigue siendo el aviso conocido del proyecto; OpenSeadragon no introduce una prueba desactivada ni un umbral visual nuevo.
