# CURRENT_STATUS — DocuCore

## Fecha: 2026-08-14

## SHELL-01, DASH-01, HIST-01 y Estados — FUNCIONAL

- **Notificaciones y búsqueda global**: la campana consume notificaciones reales y permite marcar cada una o todas como leídas; el buscador global usa consulta remota con debounce y cancelación de respuestas obsoletas para encontrar activos, documentos, ubicaciones, planos, eventos, configuraciones e historial. Sus resultados enlazan a la vista o al detalle correspondiente. El selector de proyecto sigue fuera de alcance, por lo que `SHELL-01` permanece PARCIAL.
- **Panel general**: KPIs, serie temporal, alertas, actividad, próximos eventos y exportación CSV se calculan en PostgreSQL y cada tarjeta o fila navega a su recurso. No conserva fallback de datos mock.
- **Historial**: `AuditLog` queda segmentado por proyecto y se muestra con paginación y filtros remotos de texto, usuario, acción, entidad y fechas. Las escrituras de activos, documentos, ubicaciones, planos, preventivos y configuración registran su proyecto.
- **Configuración → Estados**: catálogo de estados por proyecto, con alta, edición, orden, color y selección de estado por defecto; la API aplica las mismas validaciones de pertenencia, límites y auditoría que el catálogo de tipos de activo.
- **Pruebas de esta entrega**: `pnpm prisma validate`, migraciones, lint, typecheck y build ✅; `pnpm test` **231/231** ✅; `pnpm test:e2e` **77/77** ✅. El stack Docker se reconstruyó con `docker compose up --build -d --wait` y, tras `pnpm db:seed`, expone health `ok` y los 142 activos canónicos.
- **Contrato visual**: HTML protegido sin cambios. La regresión focalizada de Panel general e Historial supera el 0,5 % en sus 6 capturas por sustituir contenido mock y añadir filtros autorizados; permanece como bloqueo visual explícito. No se modificaron baselines ni umbral.

## Fecha: 2026-08-12

## CAL-01 — Calendario operativo: COMPLETADO

- **Implementación realizada**: el Calendario ya consume PostgreSQL mediante `GET /api/calendar` (rango, fuente, estado, activo y búsqueda), consolida eventos manuales, vencimientos documentales, ocurrencias de fecha dinámica y ejecuciones preventivas en un DTO normalizado y estable. Las fechas, estados y cálculos salen del servidor; el frontend no duplica reglas de negocio.
- **Operativa**: Mes, Semana y Día sincronizan su contexto en URL; hay detalle por origen, alta/edición/borrado de eventos manuales con auditoría y confirmación, y completar delega en la fuente real. Un preventivo incompleto muestra progreso y no permite completarlo; los enlaces llevan a la ficha del activo o a su ejecución enfocada. La ficha del activo reutiliza el mismo servicio de agregación y de completado.
- **Contrato visual autorizado**: el usuario autorizó explícitamente que Calendario deje de compararse con los eventos mock del HTML protegido. Se inspeccionaron las tres capturas: la estructura, rejilla, dimensiones, espaciados, tipografía, paleta y estilo se conservan; las diferencias son los datos reales y los controles autorizados de CAL-01, más la terminología global de Activos ya aprobada. Se versionaron exclusivamente `calendar-1440x1000-dark.png`, `calendar-1440x1000-light.png` y `calendar-1920x1080-dark.png` en `tests/visual/baselines/release-01/`.
- **Pruebas**: `pnpm typecheck`, `pnpm lint` y `pnpm build` ✅; `pnpm test` **189/189** ✅ (incluye 4 API CAL-01 y 5 unitarias de fechas); `pnpm test:e2e` **62/62** ✅ (incluye 2 flujos CAL-01); `pnpm test:visual` **30/30** ✅, incluyendo los tres pares Calendar contra su baseline a **0 píxeles**. Se añade una espera funcional de «Nuevo evento» antes de capturar para excluir el estado transitorio de carga tras sincronizar la URL.
- **Protección respetada**: HTML protegido sin cambios (SHA-256 `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`), umbral inmutable de 0,5 % y ningún baseline ajeno a Calendario modificado. Las regresiones futuras de Calendario se comparan contra sus tres baselines aprobados.

## Fecha: 2026-08-10

## IMG-01 — Imagen del activo (ficha y alta): FUNCIONAL

- El cuadro `aspect-square` de la ficha del activo (idéntico al HTML de referencia en reposo) muestra ahora la foto del activo y permite **subirla, cambiarla y quitarla** desde el hover (`AssetImageBox`, `src/components/AssetImageBox.tsx`); el formulario de alta/edición (`AssetImagePicker`) permite **elegir la imagen al añadir un activo desde cero** (preview local; se sube al guardar). Un activo = una imagen reemplazable; el duplicado no la hereda (ITEM-04).
- Backend: una sola imagen por activo en el storage gestionado de DocuCore (mismo directorio marcado que los documentos); `Asset.imageStorageKey` (única)/`imageMimeType`/`imageSizeBytes` (migración `20260810140000_asset_image`). `POST /api/assets/:id/image` (multipart, campo `image`, PNG/JPEG/WebP/GIF, máx. 10 MB) sube o reemplaza — guarda la nueva primero, borra la anterior solo tras el éxito y hace rollback del fichero si la BD falla; `DELETE /api/assets/:id/image` la quita; `GET /api/assets/:id/image` la sirve inline con el MIME almacenado. Auditoría en subida/eliminación; la purga (manual o perezosa) borra el fichero con el activo; papelera → 404; la API expone `imageUrl` derivado + MIME + tamaño, nunca `imageStorageKey`; POST/PUT de activos siguen siendo JSON puro.
- Matriz: lint ✅, typecheck ✅, build ✅, 137 unit/API ✅ (128 + 9 API nuevos en `tests/api/assets.image.test.ts`), 52 E2E ✅ (50 + 2 nuevos en `z-asset-image.spec.ts`: alta desde cero con imagen elegida en el form → ficha con `<img src=/api/assets/:id/image>`; subir/cambiar/quitar desde la ficha por UI). Visual: el cuadro sin imagen pinta **0 píxeles** de diferencia — aislado con el bloque crudo del HTML: `item-modal` 14,0002 % idéntico con y sin `AssetImageBox`; la subida de `items`/`item-modal` frente al histórico (≈ +0,2 %) es variación ambiental del día (la vista Activos en reposo no renderiza la imagen y `items` 1920×1080 oscuro sigue en 0,5783 % exacto); sin elevación de umbral ni cambios de baseline.

## DOC-04 — Periodicidad de documentos basada en el vencimiento: FUNCIONAL

- Los documentos pueden tener una **periodicidad** (lista fija: Mensual, Bimestral, Trimestral, Cuatrimestral, Semestral, Anual) con dos **modos de cálculo por documento**, elegidos en el formulario: **«Según calendario»** (el vencimiento salta desde el vencimiento vigente: 15/03 → 15/06 trimestral; sin vencimiento previo, desde la emisión) y **«Según subida»** (desde la emisión de la nueva versión: 20/04 → 20/07). `Document.periodicity`/`Document.periodicityMode` (migración `20260810140000_document_periodicity`); los próximos eventos de la ficha del activo siguen derivándose del vencimiento de la versión vigente, sin cambios.
- **Cálculo automático al subir**: `POST /documents/:id/versions` calcula el vencimiento de la versión nueva cuando la petición no trae fecha (el alta `POST /documents` lo calcula desde la emisión en la primera versión); un vencimiento explícito siempre tiene prioridad. `calculateNextExpiry`/`addMonthsClamped` (clamp al último día del mes) viven duplicados y probados en `server/lib/periodicity.ts` y `src/lib/periodicity.ts` — el servidor es la fuente autoritativa y el frontend precalcula el campo **editable**.
- **UI**: campos «Periodicidad» y «Modo» en `DocumentModal`; el campo «Vencimiento» se **precalcula en vivo** al cambiar la regla/modo/emisión (hint «Automático: …»; una edición manual del campo deja de recalcularse) y «Subir nueva versión» envía el cálculo o el valor manual. Columna «Periodicidad» en la tabla (`Trimestral · Calendario`). `PATCH /documents/:id` guarda o quita la regla (null la quita; `periodicityMode` sin periodicidad → 400) con auditoría «Periodicidad de documento actualizada». El seed canónico da periodicidad Anual a ITV, Calibración WIKA y Acta extintor (Calendario) y al Contrato Limpiezas (Subida).
- Matriz: lint ✅, typecheck ✅, build ✅, 128 unit/API ✅ (12 unit de cálculo en server + frontend espejo, 7 de validación Zod, 8 API reales en `tests/api/documents.periodicity.test.ts`: cálculo en alta, salto Calendario, base Subida, fecha manual respetada, PATCH con null, 400), 50 E2E ✅ (2 nuevos: trimestral calendario con salto en la subida; subida con fecha desde la emisión y edición manual respetada). Visual: la columna «Periodicidad» añade desfase al objetivo `documents` (ya en desfase autorizado por DOC-02/BULK-01); sin elevación de umbral ni cambios de baseline.

## Fecha: 2026-08-10

## DOC-03 — Vista previa de documentos y formatos de imagen: FUNCIONAL

- Al abrir «Gestionar documento» (se abre al tocar cualquier fila de Documentos), **la versión actual se muestra incrustada justo debajo del campo Emisión — sin botón previo**: PDF en iframe con blob URL (visor nativo del navegador), `image/*` en `<img>` y `text/plain` en `<pre>`; **al tocar la vista previa** se abre el visor ampliado (`DocumentPreviewModal`, `z-[60]`) que comparte el contenido ya cargado (no vuelve a pedir el fichero). **xlsx/xls muestran el área deshabilitada** («Sin vista previa para este formato. Descarga el archivo para visualizarlo.») sin clic — no hay visor nativo y la descarga sigue siendo el único control de descarga en el modal padre (consistencia: un solo control por concepto). Escape/backdrop/✕ cierran solo el visor sin cerrar el modal padre (guardia `previewOpenRef` en el handler de Escape de `DocumentModal`, mismo patrón que el diálogo «Vincular documento» de la ficha).
- **Formatos de imagen permitidos**: `ALLOWED_DOCUMENT_MIME_TYPES` y `MANAGED_STORAGE_KEY_PATTERN` aceptan `image/png`, `image/jpeg`, `image/webp` y `image/gif`; el `accept` de ambos selectores de fichero (alta y nueva versión) incluye `.png,.jpg,.jpeg,.webp,.gif` + MIME. Sin migraciones (no hace falta BD).
- **API**: `GET /api/documents/:id/preview` sirve la versión actual con `Content-Disposition: inline` (el iframe necesita inline; la descarga `/download` conserva `attachment`), `Content-Type` del MIME real y 404 si no hay versión. `fetchDocumentPreview(id)` en `src/lib/api.ts`. Los E2E suben PDFs mínimos válidos (`tests/e2e/pdf.ts`) porque la vista previa incrustada carga los PDFs en el visor nativo de Chromium (los bytes arbitrarios podían emitir errores de consola).
- Matriz: lint ✅, typecheck ✅, 103 unit/API ✅ (5 tests API nuevos: imagen inline con bytes idénticos, PDF inline, xlsx servido con descarga attachment, 404 de documento inexistente, formato no permitido → 400), 48 E2E ✅ (46 + 2 en `z-document-preview.spec.ts`: subida de PNG por UI con `accept` verificado, vista previa incrustada `blob:` que abre el visor al tocarla y Escape que no cierra el modal padre; PDF incrustado en iframe y área deshabilitada de xlsx). Visual: la vista previa solo aparece con interacción y el modal no está en los baselines — `documents` sin desfase nuevo (2,5163 % / 1,0694 % / 1,7242 %, banda del desfase conocido).

## Fecha: 2026-08-10

## LOC-02 — Ficha de activo accesible desde Ubicaciones: FUNCIONAL

- Los activos del detalle de una ubicación (preview de los 3 primeros) son **clicables** y abren la misma ficha (`AssetModal`) que en Activos, sin salir de la vista: ver ficha, próximo evento, cambiar estado, **Editar** (formulario encima), eliminar (papelera) y gestionar documentos. El HTML de referencia no tiene esta interactividad (fila plana); pedida por el usuario, se conserva el diseño en reposo (la fila solo gana hover/cursor).
- `useAssetFicha` (`src/hooks/useAssetFicha.ts`) nuevo: control de ficha + formulario de edición para vistas que muestran activos sin lista propia. Carga el activo completo con `fetchAsset` (la ficha exige `nextEvents`/documentos, que el `ApiLocationAsset` del detalle no trae), guarda de secuencia contra respuestas desordenadas, cierre que invalida fetches pendientes (un refetch de documentos no reabre la ficha tras cerrar) y refresco posterior vía `onAssetChanged` — en Ubicaciones: `detailVersion + 1` (detalle), `loadCatalog` (árbol) y `reloadSession` (sidebar).
- `LocationAsset`/`mapApiLocationAssetToDisplay` exponen ahora `id` (se descartaba); `LocationsView` carga `types`/`statuses` (mismo patrón que `AssetsView`) y el alta rápida de ubicación desde el formulario de activo funciona también aquí (crea con el proyecto de la vista y refresca el catálogo con `fetchLocations` sin skeleton).
- Matriz: lint ✅, typecheck ✅, 98 unit/API ✅ (mapper con `id`), 46 E2E ✅ (2 nuevos: ficha de CNC-05 desde Nave A y vuelta sin navegar; edición de BH-04 desde la ficha con refresco del detalle y restauración del nombre), build ✅. Visual: `locations` 3/3 en verde (0,2140 % / 0,1885 % / 0,1486 %); la subida frente al histórico 0,069236 % es variación ambiental de la máquina — verificado con stash: métricas idénticas sin los archivos de LOC-02/UX-04.

## UX-04 — Sugerencias de valores en el formulario de activo: FUNCIONAL

- Al crear o editar un activo, los campos **Código**, **Nombre** e **Iniciales** muestran un desplegable con los valores actuales de otros activos; cada fila incluye el valor de los otros dos campos como contexto (p. ej. al escribir en Código: `CNC-05` con hint `Torno CNC Haas ST-20 · CN`). La selección (clic, o ↑/↓ + Enter) rellena el campo; el campo sigue siendo de texto libre (las sugerencias son opcionales, nunca bloquean un valor nuevo).
- API nueva `GET /api/assets/suggestions?field=code|name|initials&q=&excludeId=` (registrada antes de `/:id`): valores `distinct` del campo pedido (máx. 20, orden ascendente), excluye la papelera y, con `excludeId`, el activo que se está editando; cada fila devuelve `code`/`name`/`initials` para los hints. 400 con `field` inválido.
- `SuggestInput` compartido (`src/components/SuggestInput.tsx`): input de texto libre con listbox en portal (`PortalListbox`), debounce 250 ms con guarda de secuencia, navegación por teclado y cierre con Escape (el primer Escape cierra solo el listbox; el segundo, el modal) o al perder el foco (nunca intercepta clics en otros campos ni en guardar). El listbox solo se renderiza **con opciones**: un panel «Sin resultados» flotante tapaba el formulario y podía interceptar el clic en «Crear activo» (E2E flaky del ciclo CRUD de Activos — snapshot con el listbox abierto sobre el botón; corregido y suite 46/46 estable). El mapeo API→fila vive en `src/lib/assetSuggestions.ts` (`buildAssetSuggestionSearch`/`mapAssetSuggestion`) para no engordar `AssetFormModal`.
- Matriz: lint ✅, typecheck ✅, 98 unit/API ✅ (4 unit de mapeo + 4 API de integración), 46 E2E ✅ (4 nuevos de sugerencias), build ✅. Visual: el modal cerrado no cambia y el desplegable solo aparece con interacción — sin desfase nuevo por UX-04 (verificado con stash: `items` 1920×1080 oscuro mide 0,5783 % idéntico sin los archivos de UX-04; el paso de ✅ 0,4374 % a desfase corresponde al header de UX-03).

## Fecha: 2026-08-09

## UX-03 — Alta de activos: crear ubicación desde el formulario y botón único: FUNCIONAL

- **Botón único de alta**: el botón «Nuevo activo» de la vista Activos desaparece; la cabecera (Topbar, `AssetCreateContext`) es el único punto de alta y funciona desde cualquier vista. El header de Activos queda con «Papelera» y «Exportar CSV».
- **Crear ubicación desde el formulario de activo**: el campo «Ubicación» añade la opción «＋ Crear nueva ubicación…» (al final del select, value `__new__`) que abre `LocationFormModal` en modo create encima del formulario sin perder la selección previa. Responsable precargado con el del formulario de activo y padre con la ubicación seleccionada (`initialResponsibleId`/`initialParentId` opcionales en `LocationFormModal`, solo modo create). Al crear: la vista refresca el catálogo de ubicaciones, la nueva queda seleccionada y el formulario de activo continúa abierto; el activo se guarda con `locationId` de la nueva ubicación (mismo proyecto, validación del server intacta).
- Matriz: lint ✅, typecheck ✅, 90 unit/API ✅, 40 E2E ✅ (test nuevo de ciclo completo + test de foco adaptado al botón de cabecera), build ✅. Visual: el header de `items` cambia (sin botón «Nuevo activo» — cambio pedido por el usuario); sin elevación de umbral ni cambios de baseline.

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

## Handoff histórico — 2026-08-10

- Referencia de relevo: `main` en `0823a8b` (LOC-01 publicado EN REVISIÓN). El trabajo posterior de ese relevo se mantenía sin commit por instrucción de entonces; este bloque es contexto histórico y no describe el estado publicado actual.
- Estado funcional: LOC-01 permanece **EN REVISIÓN** hasta la aceptación manual expresa del usuario. ITEM-05, ITEM-06, UX-02, UX-03, UX-04, LOC-02 e IMG-01 quedan **FUNCIONAL** (pendientes de validación manual del usuario).
- Punto de entrada para otro agente: leer `AGENTS.md`, este archivo, `ROADMAP.md` y ejecutar `LOC-01_MANUAL_TEST.md`.
- Próxima acción obligatoria: completar el checklist manual de Ubicaciones y validar manualmente ITEM-05 (eliminar → papelera → restaurar/eliminar definitivo), ITEM-06 (todo «Activos»), UX-02 (pestaña Resumen y desplegable de «Activos asociados» completo), UX-03 (crear activo eligiendo ubicación y creando una nueva desde el formulario; alta solo desde la cabecera), UX-04 (sugerencias de Código/Nombre/Iniciales con contexto y relleno al seleccionar), LOC-02 (tocar un activo del detalle de una ubicación abre su ficha y permite editarlo), DOC-03 (vista previa incrustada bajo Emisión y visor al tocarla), DOC-04 (periodicidad en dos modos con vencimiento calculado) e IMG-01 (subir foto desde la ficha y desde el alta de un activo nuevo; cambiarla, quitarla y comprobar persistencia y purga); no cambiar estados a VALIDADO sin confirmación expresa ni commitear sin petición.
- Riesgos/pending separados: 11 objetivos visuales fuera de umbral, todos por cambios pedidos por el usuario — `documents` (2,4638 % / 1,6337 % / 1,5681 %), `item-modal` (2,8465 % / 14,0002 % / 1,9496 % en la ejecución con IMG-01; la subida frente al histórico es variación ambiental del día, aislada: idéntico con y sin `AssetImageBox`), `items` (0,8442 % / 0,7419 % / 0,5783 %; +0,20 frente al histórico es variación ambiental — la vista en reposo no renderiza la imagen — y el 1920×1080 oscuro sigue en 0,5783 % preexistente de UX-03) y `config` (1,2809 % / 0,9477 %; 1920×1080 oscuro ✅). El aviso del bundle >500 kB pertenece a PERF-01; el warning DEP0205 de Node 26 en las suites pertenece a QA-01.

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
| Panel general | FUNCIONAL | KPIs, alertas, actividad, próximos eventos, serie temporal y exportación CSV provienen de PostgreSQL; las tarjetas y filas navegan a su recurso. La aceptación visual sigue bloqueada por 3 capturas fuera de umbral. |
| Proyectos | VISUAL MOCK | Ruta y tarjetas validadas; alta/apertura no tienen persistencia. |
| Activos | VALIDADO (base) + ITEM-04/05/06 FUNCIONAL + UX-04 FUNCIONAL + IMG-01 FUNCIONAL | PostgreSQL, filtros, paginación, alta, edición, estado, persistencia, auditoría, errores y reintento. Duplicación, serie única/derivada, reactivación, papelera (30 días con restaurar/purgar), renombrado «Activo», sugerencias de valores en el formulario e imagen del activo (subir/cambiar/quitar desde la ficha y elegirla en el alta, con persistencia en el storage gestionado y purga del fichero) automatizados; pendientes de aceptación manual. |
| Documentos | FUNCIONAL | PostgreSQL, versiones inmutables, subida multipart, edición/relación multi-activo, descarga y almacenamiento local persistente; E2E Documento-Activo verde. La regresión visual sigue pendiente. |
| Calendario | COMPLETADO | API PostgreSQL real que consolida eventos, documentos, fechas dinámicas y preventivos; Mes/Semana/Día y CRUD manual persisten; 189 unit/API + 62 E2E + visual 30/30. Tres baselines funcionales versionados con autorización explícita. |
| Planos | PARCIAL | Marcadores arrastrables en memoria; guardar, deshacer/rehacer, capas y versiones no persisten. |
| Ubicaciones | EN REVISIÓN | Jerarquía real (`parentId` + `label` de presentación, sin duplicados ocultos); CRUD con auditoría, selección de hojas y padres, borrado protegido (cualquier hija o activos en subrama), «Ver plano» condicionado a PLAN-01, estados vacíos y reset manual. Relaciones de activos validadas contra el proyecto, `label` sincronizado al renombrar y almacenamiento documental endurecido. LOC-02: los activos del detalle abren la misma ficha que en Activos (editar, estado, eliminar, documentos) sin salir de la vista. Regresión visual de la vista en verde; módulo pendiente de validación final (no marcado VALIDADO). |
| Historial | FUNCIONAL | Consulta paginada real de `AuditLog`, filtrable por texto, usuario, acción, entidad y fechas; contiene auditoría segmentada por proyecto. La aceptación visual sigue bloqueada por 3 capturas fuera de umbral. |
| Configuración | PARCIAL | Tipos, campos dinámicos, preventivos y Estados tienen persistencia; Estados cuenta con CRUD, orden, color y estado predeterminado por proyecto. |

El shell es parcial: navegación, rutas directas, recarga, tema, “Nuevo activo”, búsqueda global y notificaciones funcionan con datos reales; el selector de proyecto sigue demostrativo. El tema cambia correctamente pero vuelve al modo oscuro tras una recarga; no existe requisito confirmado de persistencia entre sesiones.

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

Matriz vigente (2026-08-10): lint ✅, typecheck ✅, 137 unit/API ✅, build ✅, 52 E2E ✅, `prisma migrate diff` sin drift ✅. Regresión visual 19/30 con los desfases pedidos por el usuario (11 objetivos; ver Handoff vigente); `locations` 3/3 en verde (máx. 0,069236%).

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
3. Validar manualmente ITEM-05 (eliminar desde ficha y menú, papelera, restaurar, eliminar definitivo y recuento del sidebar), ITEM-06 (todo «Activos» en la UI), UX-02 (pestaña Resumen y desplegable de «Activos asociados» sin recorte), DOC-04 (periodicidad en dos modos), DOC-03 (vista previa incrustada y visor), LOC-02 (ficha desde Ubicaciones) e IMG-01 (subir/cambiar/quitar foto desde la ficha y elegirla en el alta de un activo nuevo; persistencia al recargar y purga con el activo).
4. Priorizar la regresión visual de `DOC-01` o `ITEM-02` y evaluar una matriz CI con Node LTS sin alterar los contratos visuales aprobados.
