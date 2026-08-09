# CURRENT_STATUS — DocuCore

## Fecha: 2026-08-09

## ITEM-06 — Renombrado unificado «Activo»: FUNCIONAL

- El término «ítem» desaparece de todo el proyecto: la vista pasa a llamarse **Activos** («Activos e ítems» → «Activos» en nav, breadcrumb y heading), «Nuevo ítem» → «Nuevo activo», y los labels de formularios, tablas y mensajes usan «activo».
- Renombrado completo también en el modelo: Prisma `Item` → `Asset`, `ItemType` → `AssetType`, `DocumentItem.itemId` → `assetId`, `Event.itemId` → `assetId`, `FloorPlanMarker.itemId` → `assetId`, `DynamicFieldDefinition.itemTypeId` → `assetTypeId`. Tres migraciones nuevas (`20260810110000_rename_item_to_asset`, `20260810120000_asset_trash`, `20260810130000_rename_item_constraints`) con `RENAME TABLE`/`RENAME COLUMN` (conservan los datos; `prisma migrate diff` sin drift). La tabla de BD pasa a llamarse `Asset`.
- API: `/api/items` → `/api/assets`, `/api/item-types` → `/api/asset-types`; en documentos `itemIds` → `assetIds` (multipart JSON) y el filtro `itemId` → `assetId`; Zod (`createAssetSchema`…), auditoría con «Activo» y `deriveItemEvents` → `deriveAssetEvents`.
- Frontend: `ItemsView/Table/Filters/Modal/FormModal` → `Assets*`, `itemMappers` → `assetMappers`, `ItemCreateContext` → `AssetCreateContext`, tipos `Item` → `Asset`/`ApiAsset`; ruta `/items` → `/assets` (con redirect de `/items`); ids de formulario `#asset-*`. Mock (`assets`, «Tipos de activo», «creó activo»), seed y reset-manual-test renombrados.
- Matriz: lint ✅, typecheck ✅, 76 unit/API ✅, 36 E2E ✅, build ✅. Regresión visual 20/30, exit code 1: además de los desfases conocidos de `documents`/`item-modal`, `items` (0,6413 % / 0,5421 %; 1920×1080 oscuro 0,4374 % ✅) y `config` (1,2809 % / 0,9477 %; 1920×1080 oscuro 0,1188 % ✅) ganan desfase por el heading «Activos», el botón «Papelera» y los labels «Tipos de activo» — cambios pedidos por el usuario; sin elevación de umbral ni cambios de baseline.

## ITEM-05 — Papelera de activos (soft delete, 30 días): FUNCIONAL

- `Asset.deletedAt DateTime?` (migración `20260810120000_asset_trash` + índice). El DELETE ya no borra: **mueve a la papelera** (auditoría «Movido a la papelera»); `POST /api/assets/:id/restore` la deshace («Restaurado de la papelera») y `POST /api/assets/:id/purge` borra físicamente («Eliminado definitivamente», 409 si el activo no está en papelera).
- `GET /api/assets?trashed=true` lista la papelera (por `deletedAt desc`) con **purga perezosa**: antes de listar se eliminan físicamente los que superan 30 días (`TRASH_RETENTION_DAYS`), con auditoría por purga. Todo lo demás excluye la papelera: lista/GET/:id, PUT, PATCH estado, `assetCount` de sesión, conteos y detalle de ubicaciones (árbol y detalle alineados vía `_count` con filtro), pickers y `document.assets` (el vínculo `DocumentItem` persiste; al restaurar reaparece en el documento si no se editó mientras tanto), y `assertDocumentAssets` rechaza activos en papelera.
- Los únicos de código/serie siguen ocupados por un activo en papelera (409 al crear uno nuevo; se libera al purgar).
- UI: botón **«Papelera»** con contador en la vista Activos (toggle a modo papelera con buscador propio, columna «Eliminación» con fecha, acciones **Restaurar** y **Eliminar definitivamente** con diálogo de confirmación); **«Eliminar»** en el menú ⋯ de cada fila y en el pie de la ficha del activo (sin confirmación, es reversible; al eliminar desde la ficha se cierra).
- Matriz: lint ✅, typecheck ✅, 76 unit/API ✅ (9 tests nuevos de ciclo de papelera, incluida la purga automática con `DOCUCORE_NOW` y la exclusión de sesión/documentos), 36 E2E ✅ (3 tests nuevos: ciclo completo por UI, pestaña Resumen y listbox en portal), build ✅.

## UX-02 — Modales: pestaña Resumen por defecto y desplegables completos: FUNCIONAL

- La ficha del activo (siempre montada en la vista) **resetea la pestaña activa a «Resumen»** al cambiar de activo (o al cerrar y reabrir): ya no hereda la pestaña del modal anterior. Se resetean también el selector de estado y los errores.
- Los desplegables de `SearchablePicker` y `SearchableMultiPicker` («Activos asociados», «Vincular documento») se renderizan en un **portal a `document.body`** (`PortalListbox` compartido, `position: fixed` bajo el campo, ancho del campo y alto limitado al espacio visible; cierre por click fuera, scroll y resize): el modal con `overflow` ya no los recorta por abajo.
- Matriz: lint ✅, typecheck ✅, 76 unit/API ✅, 36 E2E ✅ (tests nuevos: el modal abre en Resumen tras navegar pestañas, y el listbox viaja en portal con selección real), build ✅.

## UX-01 — Modales anclados arriba y menú de estado directo: FUNCIONAL

- Todos los modales (`AssetModal`, `AssetFormModal`, `DocumentModal`, `LocationFormModal`, diálogo «Vincular documento») quedan anclados al borde superior (`items-start` + `overflow-y-auto` en el contenedor): al cambiar de pestaña o de tamaño el modal ya no se recentra; el borde superior permanece fijo.
- El campo «Estado» de la ficha del activo abre inmediatamente el menú de opciones (listbox con check en el estado actual, `fade-in`, cierre por click fuera y al seleccionar) con un chevron ▾ que rota como indicación; se elimina el `<select>` que obligaba a un segundo control.
- Matriz: lint ✅, typecheck ✅, 76 unit/API ✅, 36 E2E ✅ (test nuevo: modal con el mismo `y` al cambiar de pestaña y cambio de estado desde el menú), build ✅. Regresión visual 20/30: `item-modal` (2,6212 % / 13,7055 % / 1,8212 %) — desfase por el anclaje arriba y el chevron (cambio pedido por el usuario; el HTML de referencia centra el modal); sin elevación de umbral ni cambios de baseline.

## DOC-02 — Documentos multi-activo y gestión: FUNCIONAL

- Relación N-N `DocumentItem` (`@@id([documentId, assetId])`, `onDelete: Cascade` en ambas FKs) sustituye a `Document.itemId` (1-N); la migración `20260810000000_document_item_join` copia las relaciones existentes a la tabla intermedia y elimina la columna (pre-release autorizado; `prisma migrate diff` sin drift).
- `POST/PATCH /api/documents` aceptan `assetIds` (array; en FormData multipart viaja como JSON string); el PATCH reemplaza el conjunto completo en transacción, valida que todos los activos pertenezcan al proyecto y audita `Activos X → Y`. `GET /api/documents` filtra por activo (`assetId`, incluye `assetId=null` = sin activos) y busca por código/nombre de activo a través de la join. `GET /api/assets` expone `documents`/`documentCount` por la join sin cambiar el shape; los próximos eventos derivados de vencimientos documentales no cambian. ITEM-05: los activos en papelera no aparecen como asociados.
- «Gestionar documento»: campo único **«Activos asociados»** con `SearchableMultiPicker` (chips con «×», búsqueda con debounce 250 ms y check en opciones), precargado con los del documento; «Vincular documento» desde la ficha del activo **añade** vínculo (ya no reasigna).
- **Un único control de versión**: el campo «Nueva versión» del grid desaparece; «Subir nueva versión» (label con input oculto `aria-label="Nueva versión"`) sube la versión al elegir el fichero con las fechas actuales del formulario.
- La fila completa de la tabla de Documentos abre «Gestionar documento»; la columna pasa a «Activos asociados» (`COD · Nombre`). Tamaño de archivo con helper único `formatDocumentSize` (B/KB/MB como el HTML: «840 KB», «2.4 MB») en lista y ficha — nunca «0 MB».
- Matriz: lint ✅, typecheck ✅, 76 unit/API ✅ (casos de `assetIds`), 36 E2E ✅ (documento con 2 activos, apertura por fila, desvinculación parcial), build ✅. Regresión visual 20/30, exit code 1: `documents` (2,1167 % / 1,5392 % / 0,8288 %) fuera de umbral — desfase por el header «Activos asociados» y el formato KB/MB (cambio pedido por el usuario); sin elevación de umbral ni cambios de baseline.

## ITEM-04 — Duplicación y reversión de baja: FUNCIONAL (pendiente de validación manual)

- El menú de tres puntos de cada fila ofrece **Duplicar** y abre el formulario con nombre, instalación, ubicación, tipo, estado, iniciales, proyecto y responsable del origen. Código y número de serie quedan vacíos; documentos, eventos e historial no se copian porque son relaciones del activo original.
- `Asset.serialNumber` es único en PostgreSQL. La migración `20260809190000_item_serial_unique_remove_label` elimina destructivamente `Item.serialLabel`; la tabla deriva `SN`, `Lote` o `Mat` desde tipo + serie, manteniendo la presentación canónica sin un segundo campo editable.
- Un activo `Fuera de servicio` muestra **Reactivar** y vuelve a `Activo`; la auditoría registra transiciones legibles como `Fuera de servicio → Activo`.
- Validación: sin series duplicadas antes de migrar; migración local aplicada; Prisma sin drift; lint ✅, typecheck ✅, 76 unit/API ✅, build ✅ y 36 E2E ✅. Activos visual 3/3 bajo 0,5 %; la suite completa permanece 20/30 por los desfases pedidos de `documents`/`item-modal`/`items`/`config`.

## LOC-01 — Ubicaciones: EN REVISIÓN (no validado)

- `Location` jerárquica real (`parentId` auto-referenciada), responsable por FK a `User` miembro del proyecto y `label` de presentación para la tabla de Activos (el texto largo del prototipo, p. ej. `Planta 1 · Sala compresores`, vive en `label`; el árbol muestra `name`). Sin filas ocultas duplicadas: todas las ubicaciones son administrables y visibles al expandir su rama. Migraciones `20260807100000_location_hierarchy_and_item_fk`, `20260807120000_location_hidden`, `20260807140000_location_label_not_hidden` y `20260808100000_location_label_no_default` (elimina el DEFAULT `''` residual de `label`; `prisma migrate diff` sin drift).
- `Asset.locationId` FK obligatoria con `onDelete: Restrict`; el filtro de activos por ubicación incluye toda la subrama; `GET /api/assets` expone `location.label` para la tabla.
- API `GET/POST/PUT/DELETE /api/locations` con Zod, auditoría y borrado protegido: bloquea **cualquier hija** y **activos en toda la subrama** (incluida la papelera, por la FK Restrict) con mensaje claro. Validaciones de ciclo (no autolink, no colgar de descendientes), mismo proyecto para padre/ubicación y responsable miembro. `GET /api/users` y `DELETE /api/assets/:id`.
- POST/PUT `/api/assets` validan antes de escribir que la ubicación pertenece al proyecto del activo y que el responsable es miembro del proyecto; el PUT parcial valida el estado final (existentes + cambios), de modo que cambiar solo una relación nunca deja las demás incoherentes.
- `Location.label` nunca queda obsoleto al renombrar: si coincidía con el nombre anterior sigue al nuevo nombre; si es una etiqueta personalizada se conserva; un `label` explícito en el PUT siempre tiene prioridad.
- Dos estados de datos: `pnpm db:seed` canónico (142 activos; conteos 98/42/31/8/17/32/12; CNC-05/BH-04/BSC-11 en Nave A; árbol, detalle, filtros y formulario comparten los mismos conteos) y `pnpm db:reset:manual-test` (0 activos/documentos/versiones/eventos/ubicaciones; conserva 2 proyectos + usuarios + membresías reales para pruebas de separación).
- Almacenamiento documental endurecido: marcador `.docucore-storage.json` (provisión solo en directorio nuevo y vacío), limpieza solo tras finalizar el reset de BD, marcador ausente distinguido del corrupto o de otro propietario (errores bloqueantes), fallos de `writeFile` no ocultados, y `db:reset:manual-test` termina con error si la limpieza segura falla.
- Shell sin mocks: `GET /api/session` (con `Cache-Control: no-store`) + `SessionProvider`. Alta por la UI: el Sidebar se actualiza sin recargar la página (recarga asíncrona de la sesión tras crear). Eliminación por API (`DELETE /api/assets/:id`, ahora soft delete a papelera): el conteo del sidebar excluye la papelera y se actualiza al recargar (E2E verifica el incremento sin recarga y la disminución tras recargar).
- `LocationsView`: selección y edición de hojas y padres, borrado con confirmación y mensaje, «Ver plano» deshabilitado sin plano (PLAN-01), estados vacíos.
- Matriz: lint ✅, typecheck ✅, 76 unit/API ✅, 36 E2E ✅, build ✅, `prisma migrate diff` sin drift ✅. Regresión visual `pnpm test:visual` → 20/30, exit code 1: `locations` 3/3 en verde (máx. 0,069236%); los desfases restantes son los pedidos por el usuario (ver abajo). Sin cambios en umbrales ni baselines.

## Handoff vigente — 2026-08-09

- Rama de entrega: `main`; el commit de relevo es `0823a8b` (LOC-01 publicado EN REVISIÓN). El trabajo posterior —ITEM-04, DOC-02, UX-01, ITEM-05, ITEM-06 y UX-02— está implementado, verificado y documentado en el working tree **sin commitear** (no commitear sin petición expresa).
- Estado funcional: LOC-01 permanece **EN REVISIÓN** hasta la aceptación manual expresa del usuario. ITEM-05, ITEM-06 y UX-02 quedan **FUNCIONAL** (pendientes de validación manual del usuario: papelera, renombrado «Activos» y modales).
- Punto de entrada para otro agente: leer `AGENTS.md`, este archivo, `ROADMAP.md` y ejecutar `LOC-01_MANUAL_TEST.md`.
- Próxima acción obligatoria: completar el checklist manual de Ubicaciones y validar manualmente ITEM-05 (eliminar → papelera → restaurar/eliminar definitivo), ITEM-06 (todo «Activos») y UX-02 (pestaña Resumen y desplegable de «Activos asociados» completo); no cambiar estados a VALIDADO sin confirmación expresa ni commitear sin petición.
- Riesgos/pending separados: 10 objetivos visuales fuera de umbral, todos por cambios pedidos por el usuario — `documents` (2,1167 % / 1,5392 % / 0,8288 %), `item-modal` (2,6212 % / 13,7055 % / 1,8212 %), `items` (0,6413 % / 0,5421 %; 1920×1080 oscuro ✅) y `config` (1,2809 % / 0,9477 %; 1920×1080 oscuro ✅). El aviso del bundle >500 kB pertenece a PERF-01; el warning DEP0205 de Node 26 en las suites pertenece a QA-01.

## Estado verificado histórico (auditoría 2026-08-06)

- `main`: punto de partida `4188d9d` (`feat(items): derive upcoming events from relations`).
- HTML protegido: 126104 bytes; SHA-256 `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`.
- PostgreSQL local: `127.0.0.1:5435/docucore`, contenedor `docucore-db` saludable.
- Base regenerada: 142 activos, 4 eventos relacionados y 207 documentos lógicos (cinco asociados y un conjunto documental canónico), 0 códigos `QA-*` y 5 auditorías canónicas.
- Regla pre-release activa: las migraciones destructivas, reseeds y retiradas de estructuras obsoletas necesarias están autorizadas hasta revocación expresa del usuario.

## Entorno auditado

| Componente | Versión/estado |
|---|---|
| Node | 26.2.0 |
| pnpm | 9.15.9, coincide con `packageManager` |
| Docker | 29.5.3 |
| Docker Compose | 5.1.4 |
| Migraciones | 13 aplicadas, 0 pendientes |
| Seed | Reproducible y verificado (142 activos) |
| API | Healthcheck `{"status":"ok"}` y `/api/assets` real con `nextEvents` derivados y papelera (`?trashed=true`) |
| Frontend | Imagen Docker reconstruida y servicio de producción saludable en `:3001` |

## Inventario funcional real

| Vista | Estado | Evidencia y alcance |
|---|---|---|
| Panel general | VISUAL MOCK | Ruta, tema y fidelidad validados; KPIs, periodo, exportación y accesos son demostrativos. |
| Proyectos | VISUAL MOCK | Ruta y tarjetas validadas; alta/apertura no tienen persistencia. |
| Activos | VALIDADO (base) + ITEM-04/05/06 FUNCIONAL | PostgreSQL, filtros, paginación, alta, edición, estado, persistencia, auditoría, errores y reintento. Duplicación, serie única/derivada, reactivación, papelera (30 días con restaurar/purgar) y renombrado «Activo» automatizados; pendientes de aceptación manual. |
| Documentos | FUNCIONAL | PostgreSQL, versiones inmutables, subida multipart, edición/relación multi-activo, descarga y almacenamiento local persistente; E2E Documento-Activo verde. La regresión visual sigue pendiente. |
| Calendario | VISUAL MOCK | Calendario y fidelidad validados; vistas/eventos no persisten. |
| Planos | PARCIAL | Marcadores arrastrables en memoria; guardar, deshacer/rehacer, capas y versiones no persisten. |
| Ubicaciones | EN REVISIÓN | Jerarquía real (`parentId` + `label` de presentación, sin duplicados ocultos); CRUD con auditoría, selección de hojas y padres, borrado protegido (cualquier hija o activos en subrama), «Ver plano» condicionado a PLAN-01, estados vacíos y reset manual. Relaciones de activos validadas contra el proyecto, `label` sincronizado al renombrar y almacenamiento documental endurecido. Regresión visual de la vista en verde; módulo pendiente de validación final (no marcado VALIDADO). |
| Historial | VISUAL MOCK | Tabla estática; no consulta `AuditLog`. |
| Configuración | VISUAL MOCK | Presentación validada; controles sin persistencia. |

El shell es parcial: navegación, rutas directas, recarga, tema y “Nuevo activo” funcionan; buscador global, selector de proyecto y notificaciones siguen siendo demostrativos. El tema cambia correctamente pero vuelve al modo oscuro tras una recarga; no existe requisito confirmado de persistencia entre sesiones.

## Correcciones de la auditoría local

1. Se impidió que respuestas antiguas de filtros sobrescriban el resultado más reciente.
2. `installDate` exige una fecha ISO real; fechas imposibles devuelven HTTP 400 y ya no se normalizan silenciosamente ni producen HTTP 500.
3. Los modales de consulta y formulario exponen `role="dialog"`, nombre accesible, foco inicial/restaurado y cierre mediante Escape.
4. El listado muestra errores de API mediante `role="alert"` y permite reintentar sin recargar la página.
5. Se activaron los flags de compatibilidad de React Router v7 y la suite falla ante errores o warnings de consola.
6. Se añadieron regresiones para fechas inválidas, respuestas fuera de orden, recuperación de API y accesibilidad de diálogos.
7. (UX-02) La ficha del activo vuelve a «Resumen» al abrirse y los desplegables de búsqueda viajan en portal: ya no se hereda la pestaña ni se recorta el listbox.
8. (ITEM-05) El DELETE de activos es soft delete con purga a los 30 días; árbol y detalle de ubicaciones cuentan solo activos vivos.

## Matriz automática histórica de 2026-08-06

| Comando | Resultado | Duración aproximada |
|---|---:|---:|
| `pnpm lint` | ✅ | 4,6 s |
| `pnpm typecheck` | ✅ | 6,1 s |
| `pnpm test` | ✅ 3 archivos, 14 pruebas | 1,2 s |
| `pnpm build` | ✅ | 8,3 s |
| `pnpm test:e2e` | ✅ 9/9 | 20,8 s |
| `pnpm test:visual` | ✅ 30/30 | 70,3 s |
| `pnpm db:seed` final | ✅ | 1,4 s |

Matriz vigente (2026-08-09): lint ✅, typecheck ✅, 76 unit/API ✅ (9 archivos), build ✅, 36 E2E ✅, `prisma migrate diff` sin drift ✅. Regresión visual 20/30 con los desfases pedidos por el usuario (ver Handoff vigente); la mayor diferencia en verde es Activos 1920 × 1080 oscuro: 0,4374 %.

## Limitaciones y avisos conocidos

- `ITEM-03` está VALIDADO para la fuente documental: el E2E crea, versiona y retira una relación documental y comprueba que los próximos eventos cambian de forma persistente. Calendario y campos dinámicos siguen pendientes de sus módulos propios.
- Los documentos se guardan bajo `DOCUMENT_STORAGE_PATH`; Compose monta el volumen persistente `document_data` y Playwright usa un directorio temporal aislado.
- El bundle de producción mantiene el aviso no bloqueante de Vite sobre chunks de más de 500 kB (PERF-01).
- Node 26 muestra `DEP0205` desde el cargador de `tsx`; no falla las pruebas, pero conviene validar el proyecto también con la versión LTS soportada (QA-01).
- Los controles declarados como `VISUAL MOCK` o `PARCIAL` no deben presentarse como funcionales.
- El formulario actual no permite seleccionar responsable ni expone campos dinámicos, aunque el modelo/API almacenan esos identificadores/datos.
- Papelera: un activo en papelera sigue ocupando su código y número de serie (409 al crear uno nuevo) hasta purgarlo o restaurarlo; los activos en papelera no aparecen como asociados de documentos hasta restaurarse.

## Próximo paso exacto

1. Ejecutar y completar `docs/progress/LOC-01_MANUAL_TEST.md` con el usuario.
2. Si el usuario acepta LOC-01, actualizar su estado a VALIDADO mediante un commit documental separado.
3. Validar manualmente ITEM-05 (eliminar desde ficha y menú, papelera, restaurar, eliminar definitivo y recuento del sidebar), ITEM-06 (todo «Activos» en la UI) y UX-02 (pestaña Resumen y desplegable de «Activos asociados» sin recorte).
4. Priorizar después la regresión visual de `DOC-01`, `CAL-01` o `ITEM-02`; evaluar code splitting y una matriz CI con Node LTS sin alterar el contrato visual.
