# SESSION_LOG — Fase 4

## 2026-08-09 — UX-01: modales anclados arriba y menú de estado directo

- Todos los contenedores de modales (`ItemModal`, `ItemFormModal`, `DocumentModal`, `LocationFormModal` y el diálogo «Vincular documento») pasan de `items-center` a `items-start` (+ `overflow-y-auto`): el modal queda anclado al borde superior y ya no «baila» al cambiar de pestaña o de tamaño; el borde superior permanece fijo.
- El campo «Estado» de la ficha del activo abre **inmediatamente** un menú con las opciones (listbox con check en el estado actual, animación `fade-in`, cierre por click fuera y al seleccionar), con un chevron ▾ que rota como indicación de que es interactivo; desaparece el `<select>` intermedio que exigía un segundo control.
- E2E nuevo: el modal mantiene el mismo `y` al cambiar de pestaña (<64 px del top) y el menú de estado cambia y restaura el estado desde la ficha.
- Matriz: lint ✅, typecheck ✅, 66 unit/API ✅, 33 E2E ✅, build ✅. Visual 24/30: `item-modal` (2,5740 % / 13,6169 % / 1,6885 %) creció por el anclaje arriba y el chevron (cambio pedido por el usuario; el HTML de referencia centra el modal); sin elevación de umbral ni baselines.

## 2026-08-09 — DOC-02: documentos multi-activo y gestión documental

- Se sustituyó `Document.itemId` (1-N) por la tabla intermedia `DocumentItem` (N-N, `@@id([documentId, itemId])`, Cascade en ambas FKs). Migración `20260810000000_document_item_join`: copia las relaciones existentes y elimina la columna (pre-release autorizado). `prisma migrate diff` sin drift.
- `POST/PATCH /api/documents` aceptan `itemIds` (array; JSON string en multipart); el PATCH reemplaza el conjunto completo validando que todos los activos pertenezcan al proyecto, con auditoría `Activos X → Y`. El filtro por activo (`itemId`, `itemId=null`) y la búsqueda por código/nombre atraviesan la join. `GET /api/items` expone `documents`/`documentCount` por la join; los eventos derivados de vencimientos no cambian.
- UI: nuevo `SearchableMultiPicker` (chips con «×», debounce 250 ms, check en opciones) para el campo único «Activos asociados» de «Gestionar documento»; «Vincular documento» desde la ficha añade vínculo sin reasignar; «Subir nueva versión» es un único control (label con input oculto) que sube al elegir fichero; la fila completa de Documentos abre el documento; columna «Activos asociados»; tamaño con helper único `formatDocumentSize` (B/KB/MB) en lista y ficha — nunca «0 MB».
- ITEM-04 (duplicado): el duplicado nace con el estado por defecto de «Nuevo ítem» (Activo) en lugar de heredar el ciclo de vida del origen; código y serie quedan vacíos (únicos). E2E reescrito con origen «Fuera de servicio» (CP-02) que afirma el estado Activo del duplicado.
- Matriz final: lint ✅, typecheck ✅, 66 unit/API ✅ (7 casos nuevos de `itemIds`), 32 E2E ✅ (test nuevo multi-activo: 2 activos, apertura por fila, desvinculación parcial), build ✅. Regresión visual 24/30: `locations` 3/3 en verde; `documents` (1,9719 % / 1,4077 % / 0,7283 %) e `item-modal` (3) en desfase — el de `documents` creció por el header «Activos asociados» y el formato KB/MB (cambio pedido por el usuario); sin elevación de umbral ni baselines.

## 2026-08-06

- Se añadió Vitest con pruebas para los tokens CSS del mapeador de ítems y la validación HTTP real de Express/Zod.
- Se añadió Playwright con ciclo determinista: PostgreSQL Docker, `prisma migrate deploy`, seed inicial, servidores API/Vite/referencia y seed final.
- Se añadieron pruebas E2E de navegación, breadcrumbs, tema, modal, filtros, paginación, CRUD y errores de consola.
- Se añadió comparación visual directa con el HTML protegido; no usa ni modifica baselines. Las métricas y PNG de cada diff se generan bajo `test-results/visual/`.
- Se añadió Dockerfile de producción y Compose con healthchecks, migraciones al inicio y servicio de aplicación.
- Se sustituyó el README de Vite por documentación operativa y se añadieron instrucciones Dokploy.

## Estado de regresión visual

La anotación original de 25 fallos correspondía a una ejecución intermedia y quedó superada. La ejecución final verificada ejecuta 30 pares y todos quedan bajo el umbral de 0,5%; el máximo es Activos 1440 × 1000 oscuro con 0,2862%.

## 2026-08-06 — Auditoría funcional local

- Se confirmó `main` limpio en `4d4ea9a` y se reutilizó `test/local-dogfood`.
- Se verificaron Node 26.2.0, pnpm 9.15.9, Docker 29.5.3, Compose 5.1.4 y PostgreSQL local saludable.
- Se recorrieron por navegador las nueve rutas, sus recargas, controles visibles, tema, consola y red.
- Se clasificó Activos como `VALIDADO`, Planos como `PARCIAL` y las otras siete vistas de contenido como `VISUAL MOCK`.
- Se reprodujeron y corrigieron: carrera de filtros, fechas imposibles, accesibilidad/cierre de modales, warnings de Router y recuperación tras caída del API.
- Se añadió cobertura de regresión API y E2E; el commit funcional es `68f2cde`.
- Matriz final: lint ✅, typecheck ✅, 8 unit/API ✅, 9 E2E ✅, build ✅ y 30 visuales ✅.
- Se ejecutó seed final: 142 ítems, 0 `QA-*` y 5 registros de auditoría.
- Decisión: los módulos mock se documentan en `ROADMAP.md`; no se amplió su alcance durante esta auditoría.

## 2026-08-06 — Próximos eventos relacionales

- Se eliminaron de `Item` los campos manuales `nextEventLabel`, `nextEventDate` y `nextEventUrgency`; la migración nueva no modifica la migración inicial ya aplicada.
- La API deriva `nextEvents` desde eventos incompletos, fechas de vencimiento de documentos y valores asociados a definiciones dinámicas `DATE`.
- La fecha, los días restantes/atrasados y la urgencia se calculan en tiempo de lectura; los ítems sin relaciones fechadas muestran “Sin eventos programados”.
- El formulario de alta/edición deja de solicitar los tres campos y Zod rechaza que vuelvan a enviarse manualmente.
- Se conserva “Próximo evento” en la tabla y “Próximos eventos” dentro de la ficha, incluyendo el origen de cada relación.
- Playwright usa ahora PostgreSQL aislado en `docucore-e2e-db:5436`, sin modificar el volumen persistente de desarrollo.
- Validación final: lint, typecheck, build, 14 unit/API, 9 E2E y 30 comparaciones visuales pasan; el máximo visual es Activos 1440 × 1000 oscuro con 0,3238%.
- Tras la autorización pre-release del usuario, se registró en `AGENTS.md` la libertad temporal para migraciones destructivas, reseeds y eliminación de estructuras obsoletas dentro de DocuCore.
- Se aplicó `20260806120000_derive_item_events` a PostgreSQL persistente, se regeneró el seed y se reconstruyó `docucore-app`.
- Verificación real final: 2 migraciones aplicadas, 142 ítems, 4 eventos, 3 documentos, `CNC-05` con dos próximos eventos derivados y ambos servicios Docker saludables.

## 2026-08-06 — DOC-01 Documentos funcionales

- Se sustituyó el modelo plano de `Document` por la entidad lógica y `DocumentVersion`; la migración nueva `20260806190000_document_versions` elimina el modelo temporal anterior sin modificar migraciones aplicadas.
- Se añadió almacenamiento local configurable con `DOCUMENT_STORAGE_PATH`, UUID internos, comprobación anti path-traversal, límite de 10 MB y PDF/XLSX/XLS/TXT permitidos; Compose monta `document_data` y E2E usa un directorio aislado.
- La API implementa listado/filtros/paginación, KPIs calculados, detalle/versiones, subida multipart, nueva versión, edición de relación, descargas actual/histórica y eliminación, con auditoría en cada escritura.
- La vista Documentos y la ficha de Activos consumen los datos reales. La versión vigente controla los vencimientos y próximos eventos; un documento sin vencimiento no genera evento.
- E2E comprobó bytes de v1/v2, historial, relación con `AST-001`, actualización del vencimiento, persistencia tras recarga y retirada de la relación sin errores o warnings de consola.

## 2026-08-07 — LOC-01 Ubicaciones funcionales

- `Location` se vuelve jerárquica: `parentId` auto-referenciada (`onDelete: SetNull`), `responsibleId` FK a `User`, `updatedAt`; se eliminan `parent`/`responsible` de texto y el contador denormalizado `assetCount` (los conteos se derivan de `Item`).
- `Item` sustituye `location` (texto libre) por `locationId` FK obligatoria con `onDelete: Restrict`. Migración nueva `20260807100000_location_hierarchy_and_item_fk` con backfill por nombre y borrado de filas sin coincidencia (autorizado por la regla pre-release).
- API nueva `/api/locations` (GET árbol con conteos de subrama, GET detalle con ancestros e ítems, POST/PUT con Zod `.strict()` y auditoría, DELETE protegido 409 si tiene ítems o hijas). `GET /api/items` acepta `locationId` e incluye la subrama; `GET /api/users` y `DELETE /api/items/:id` añadidos.
- Frontend: `LocationsView` conectada al API (árbol con buscador y ramas controladas, detalle con breadcrumb y primeros 3 activos), `LocationFormModal` (alta/edición con padre y responsable), selector de ubicación por id en el formulario de ítems y filtros.
- Seed canónico sin la jerarquía del HTML de referencia: solo las ubicaciones que referencian los ítems canónicos, para mantener la tabla de Activos fiel al contrato visual. `seed-minimal` queda sin ubicaciones (se crean bajo demanda).
- Tests: unit de schemas y del mapeador de activos de ubicación, API de validación de ubicaciones y E2E de árbol/detalle/alta/edición/jerarquía/asignación. 16 E2E y 36 unit/API en verde.
- Regresión visual: `locations` excluida de objetivos porque el HTML de referencia de la vista contradice la tabla de Activos (nombres y activos distintos); se documenta como pendiente. `documents` e `item-modal` permanecen con el mismo desfase preexistente de DOC-01, confirmado idéntico en un worktree sobre `HEAD`.

## 2026-08-07 — LOC-01 cerrado: dos estados de datos y Ubicaciones completas

- Seed canónico (`pnpm db:seed`) compatible con el HTML de referencia: 142 activos; árbol con conteos 98/42/31/8/17/32/12; CNC-05, BH-04 y BSC-11 en Planta 1 · Nave A; los seis canónicos conservan sus ubicaciones de tabla. BH-04 y BSC-11 sustituyen relleno para mantener el total.
- Filas `hidden` (`Location.hidden`, migración correctiva `20260807120000_location_hidden`): guardan el texto largo de la tabla sin aparecer en el árbol, sumando al contador del padre. Resuelve la contradicción tabla/árbol del prototipo sin tocar el HTML ni el umbral.
- `pnpm db:reset:manual-test` nuevo: deja 0 activos/documentos/versiones/eventos/ubicaciones, conserva proyecto base + administrador + tipos + estados, y limpia de forma segura `DOCUMENT_STORAGE_PATH` (verifica que la ruta pertenece al almacenamiento configurado). `db:seed` también limpia huérfanos.
- Shell sin mocks: `GET /api/session` + `SessionProvider`; Sidebar y formularios de ítems leen proyecto/usuario y nº de activos reales.
- Backend de ubicaciones: validaciones de ciclo (no autolink, no colgar de descendientes), mismo proyecto para padre/ubicación y responsable miembro; borrado bloqueado con activos o hijas con mensaje claro; `DELETE /api/items/:id`.
- `LocationsView`: selección y edición de hojas y padres, borrado con confirmación, «Ver plano» deshabilitado sin plano (PLAN-01), estados vacíos de ubicaciones/activos.
- E2E nuevos (`z-locations-lifecycle`): reset y conteos cero + storage vacío; raíz/hijo/nieto; editar padre con hijos; rechazo de ciclos y relaciones entre proyectos; crear activo y asignarlo; filtrar por rama; bloqueo de borrado; borrado de hoja vacía; persistencia tras recarga.
- Regresión visual: `locations` reincorporada (3 variantes, máx. 0,0163%). `documents` e `item-modal` mantienen el desfase preexistente de DOC-01 (idéntico al baseline `HEAD`). Matriz final: lint ✅, typecheck ✅, 36 unit/API ✅, 23 E2E ✅, build ✅.

## 2026-08-08 — LOC-01 cierre: jerarquía real sin nodos ocultos

- Se eliminó `Location.hidden` (migración correctiva `20260807140000_location_label_not_hidden`): todas las ubicaciones son administrables y visibles al expandir su rama. La etiqueta larga de la tabla de Activos pasa a `label` (campo de presentación), inicializado con `name`; el seed lo ajusta al texto del prototipo (`Planta 1 · Sala compresores`, `Planta 1 · Nave B · Pasillo 3`, …) sin duplicar filas. Árbol, detalle, filtros y formulario comparten los mismos conteos (el detalle devuelve el conteo de subrama).
- `DELETE /api/locations/:id` bloquea cualquier hija y activos en toda la subrama, con mensajes claros; validaciones de ciclo, mismo proyecto y responsable miembro.
- Almacenamiento documental endurecido: marcador `.docucore-storage.json` con propietario, provisión automática, limpieza SOLO tras finalizar el reset de BD, y rechazo si la ruta o el marcador no son válidos (tests unitarios de orden, marcador y ruta mal configurada). `db:seed` limpia huérfanos tras el TRUNCATE.
- `GET /api/session` con `Cache-Control: no-store`; el Sidebar recarga la sesión al crear activos por la UI (E2E: el conteo sube sin recargar la página); un borrado directo por API se refleja al recargar, cuando la sesión se vuelve a cargar.
- `pnpm db:reset:manual-test` conserva dos proyectos y membresías reales (María en ambos; J. Ramírez solo en el proyecto 1) para probar la separación entre proyectos; se eliminó `server/seed-minimal.ts` (sustituido por el reset).
- E2E nuevos: reset y conteos cero + storage sin ficheros; raíz/hijo/nieto; editar padre con hijos; rechazo de ciclos y cross-project con membresías reales; crear activo y filtrar por rama; conteo idéntico árbol/detalle; actualización inmediata del Sidebar; bloqueo de borrado con hija o activos; borrado de hoja vacía; persistencia y ausencia de ubicaciones inaccesibles.
- LOC-01 en revisión (no validado): lint ✅, typecheck ✅, 41 unit/API ✅, 25 E2E ✅, build ✅; regresión visual 24/30 con `locations` en verde (máx. 0,069236%). `documents` e `item-modal` mantienen el desfase preexistente de DOC-01.

## 2026-08-08 — LOC-01 correcciones de integridad (pendiente de validación final)

- Migración nueva `20260808100000_location_label_no_default`: elimina el DEFAULT `''` residual de `Location.label` (la migración anterior lo dejó al añadir el campo). `prisma migrate diff` de migraciones contra schema: sin drift; aplicada a la BD local y a la de E2E vía `db:deploy`.
- POST/PUT `/api/items` validan antes de escribir (helper `assertItemRelationsValid`): `location.projectId === projectId` y responsable miembro del proyecto (membresías reales). El PUT parcial valida el estado final combinando lo recibido con lo existente: mover solo el proyecto o solo la ubicación con relaciones incoherentes devuelve 400. Pruebas API (8 casos positivos/negativos con BD real de E2E) y E2E (`rejects items whose location or responsible belongs to another project`).
- `Location.label` sincronizado al renombrar en el PUT: si coincidía con el nombre anterior sigue al nuevo nombre; si es personalizada se conserva; el `label` explícito del PUT tiene prioridad. Pruebas API y E2E (`keeps the location label in sync when renamed, preserving custom labels`).
- Almacenamiento documental endurecido: `StorageMarkerError` distingue `MISSING_MARKER` (recuperable solo en directorio nuevo y vacío) de `INVALID_MARKER` (corrupto u otro propietario; bloqueante) y `NOT_EMPTY`; errores de `writeFile` ya no se ocultan; `cleanDocumentStorage` propaga fallos de `readdir`. `pnpm db:reset:manual-test` termina con error si la limpieza segura falla (el seed solo ignora marcador ausente). Tests unit (corrupto, propietario, no vacío, `ENOSPC`) y E2E (`reset fails with an error when the storage cannot be safely cleaned`, verifica el reset parcial y el storage intacto).
- E2E del Sidebar ampliado: `updates the sidebar count when creating and deleting an asset` verifica el incremento por la UI y la disminución tras el borrado real (`DELETE /api/items/:id`, el mismo endpoint que expone la aplicación) con recarga de sesión.
- Matriz final: lint ✅, typecheck ✅, 55 unit/API ✅ (46 unit + 9 API de integración con BD E2E), 29 E2E ✅, build ✅, `prisma migrate diff` sin drift ✅. Regresión visual `pnpm test:visual` → 24/30, exit code 1: `locations` 3/3 en verde (máx. 0,069236% en 1440×1000 oscuro; 0,0570% claro; 0,0481% 1920×1080 oscuro); `documents` e `item-modal` (6 objetivos) mantienen el desfase preexistente de DOC-01 (idéntico al baseline `HEAD`). Sin cambios en umbrales ni baselines.
- LOC-01 NO está marcado VALIDADO (permanece EN REVISIÓN hasta validación final del usuario): matriz con lint ✅, typecheck ✅, 55 unit/API ✅, 29 E2E ✅, build ✅, `prisma migrate diff` sin drift ✅ y `pnpm test:visual` 24/30 con exit code 1 (`locations` 3/3 en verde, máx. 0,069236 %; `documents` e `item-modal` mantienen el desfase preexistente de DOC-01). Documentación corregida: el máximo visual de `locations` es 0,069236 %, no 0,057 %.

## 2026-08-08 — LOC-01 pendientes cerrados (permanece EN REVISIÓN)

- El `beforeAll` de integración vuelve a un solo `ensureTestDatabase()` (ya reintenta 60 s internamente) y amplía el timeout del hook a 120 s: se eliminó el reintento redundante que además rompía el lint por una variable sin usar.
- `cleanDocumentStorage` reestructurado: valida primero si la entrada es una clave gestionada (UUID canónico v4 + extensión permitida), ignora únicamente nombres no gestionados, ejecuta `rm` fuera de cualquier catch y propaga EACCES/EBUSY/ENOTEMPTY y cualquier otro fallo. Tests: unit con `rm` mockeado (`EBUSY` se propaga, la limpieza parcial no se silencia) y E2E `reset fails when a managed file cannot be removed (rm error reaches the script)`: directorio con nombre de clave gestionada y contenido (rm → ENOTEMPTY determinista en Windows y POSIX) → `db:reset:manual-test` termina con exit code != 0, BD vacía (reset parcial) y entrada intacta.
- Documentación del Sidebar corregida: alta por la UI → contador sin recarga (recarga asíncrona de la sesión); borrado directo por API (`DELETE /api/items/:id`) → contador actualizado después de recargar, cuando la sesión se vuelve a cargar. Ya no se afirma que ambos ocurren sin recargar.
- AGENTS.md corregido: HTML protegido 126104 bytes (1800 líneas); seed canónico con 11 ubicaciones.
- Regresión visual registrada como `pnpm test:visual` → 24/30 con exit code 1, y `locations` 3/3 en verde por separado (máx. 0,069236 %).
- Matriz final: lint ✅, typecheck ✅, 55 unit/API ✅, 29 E2E ✅, build ✅, `prisma migrate diff` sin drift ✅, `pnpm test:visual` 24/30 (exit 1; `locations` 3/3 en verde). LOC-01 NO marcado VALIDADO: permanece EN REVISIÓN.

## 2026-08-09 — Handoff y publicación de la etapa LOC-01

- Auditoría final independiente: lint, typecheck, 55/55 unit/API, build, 29/29 E2E y Prisma sin drift; `locations` 3/3 visual en verde (máx. 0,069236%). La suite visual completa permanece 24/30 con exit 1 exclusivamente por los 6 objetivos pendientes de DOC-01.
- El teardown de `tests/api/items.relations.test.ts` conserva el error original si falla el `beforeAll` y usa una referencia local estrechada por TypeScript para cerrar el servidor sin `TS18048`.
- Se añade `LOC-01_MANUAL_TEST.md` como checklist editable de aceptación. LOC-01 permanece EN REVISIÓN hasta confirmación expresa del usuario; cualquier cambio a VALIDADO debe ser un commit documental posterior.
- Para retomar: leer `AGENTS.md`, `CURRENT_STATUS.md`, `ROADMAP.md` y el checklist manual. Próximo paso: ejecutar la validación manual; después decidir DOC-01 visual, CAL-01 o ITEM-02.
- `.zcode/` queda ignorado por ser metadato local de agentes y no forma parte del producto ni del handoff versionado.

## 2026-08-09 — ITEM-04 duplicación, serie normalizada y reversión de baja

- Se implementa **Duplicar** en el menú de acciones de la tabla: precarga las propiedades editables del origen, vacía código/serie y crea una identidad independiente sin copiar documentos, eventos ni auditoría.
- Migración destructiva autorizada `20260809190000_item_serial_unique_remove_label`: elimina `Item.serialLabel` y crea el índice único `Item_serialNumber_key`. La etiqueta visible se deriva del tipo (`SN`, `Lote`, `Mat`) y conserva la tabla canónica sin duplicar información.
- La ficha sustituye **Dar de baja** por **Reactivar** cuando el estado es `Fuera de servicio`; el backend audita nombre de estado anterior y nuevo.
- Evidencia: 0 series duplicadas antes de migrar; Docker aplica 9/9 migraciones y queda saludable; Prisma sin drift; lint, typecheck, build, 59/59 unit/API y 31/31 E2E en verde. Visual: Activos 3/3 bajo 0,5 %; suite completa 24/30 por `documents`/`item-modal`, sin cambiar HTML, baseline ni umbral.
- ITEM-04 queda **FUNCIONAL**, pendiente de validación manual del usuario antes de declararlo VALIDADO.
