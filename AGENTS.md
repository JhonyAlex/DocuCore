# DocuCore — AGENTS.md

## Propósito

DocuCore es una plataforma de gestión documental y de activos industriales. Convierte un prototipo HTML aprobado en una aplicación real: React + TypeScript + PostgreSQL + Docker, con un contrato visual protegido y baselines versionados para evoluciones funcionales aprobadas.

## Regla temporal de desarrollo pre-release

> Hasta que el usuario la revoque expresamente, DocuCore se considera un entorno de desarrollo sin información productiva que deba preservarse.

- Están autorizadas las migraciones destructivas, reinicios de base de datos, reseeds, eliminación o traslado de campos, tablas, archivos y datos obsoletos que sean necesarios para avanzar en la arquitectura correcta.
- No se debe bloquear, aplazar ni limitar un cambio únicamente por un riesgo de pérdida de información del entorno actual, ni exigir copias de seguridad preventivas para ejecutar trabajo solicitado dentro de DocuCore.
- Se debe priorizar el modelo final correcto sobre la compatibilidad con datos temporales, mocks, seeds o estructuras anteriores.
- Esta autorización no permite modificar el HTML protegido, desactivar pruebas, alterar migraciones ya aplicadas ni ampliar el alcance fuera de DocuCore; esos límites siguen vigentes.
- Toda eliminación o migración debe quedar documentada y validada, aunque no requiera confirmación previa por conservación de datos.

## Regla de fidelidad al HTML

> Ningún agente puede rediseñar, reinterpretar, simplificar o sustituir la interfaz del HTML de referencia sin autorización expresa del usuario.

> Antes de modificar una vista se debe revisar el contrato que le aplique: HTML protegido o baseline aprobado. Después de modificarla se debe ejecutar su comparación visual.

El HTML de referencia es un **contrato visual protegido**, no una inspiración. Dashboard, Proyectos, Ubicaciones e Historial se comparan directamente contra él. Las evoluciones funcionales aprobadas de Activos, Documentos, Calendario, Planos, Configuración y ficha de activo se comparan contra los baselines versionados de `tests/visual/baselines/release-01/`. En ambos casos el umbral es fijo: **0,5 %**. No se modifican el HTML, el umbral ni los baselines sin inspección y aprobación explícitas.

## Referencia

- **Archivo protegido**: `docs/reference/docucore-prototype.html`
- **SHA-256**: `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`
- **Tamaño**: 126104 bytes (1800 líneas)
- **Vistas identificadas**: 9 (dashboard, projects, items, docs, calendar, plans, locations, history, config)

## Arquitectura

```
DocuCore/
├── docs/reference/       # HTML protegido + docs de diseño
├── docs/progress/        # Estado y logs de sesión
├── src/                  # Frontend React + TypeScript
│   ├── components/       # Componentes compartidos
│   ├── views/            # Las 9 vistas
│   ├── layouts/          # Shell (sidebar + topbar)
│   ├── hooks/            # Custom hooks (theme, etc.)
│   ├── lib/              # API client, utils
│   ├── types/            # TypeScript types
│   └── data/             # Mock data (fase 2) → API (fase 3)
├── server/               # Express API + Prisma
├── prisma/               # Schema + migraciones + seed
├── tests/                # E2E + regresión visual (Playwright)
├── public/               # Assets estáticos (logo, avatar, plano)
├── docker-compose.yml
├── Dockerfile
├── AGENTS.md             # Este archivo
└── package.json
```

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v3 |
| Routing | React Router v6 |
| Backend | Express + Prisma + Zod |
| DB | PostgreSQL |
| Tests | Vitest (unit) + Playwright (E2E + visual) |
| Deploy | Docker + Docker Compose (Dokploy-ready) |

### Sistema de diseño (extraído del HTML)

- **Fuente**: Inter (vía `@fontsource/inter`, sin CDN)
- **Paleta brand**: 50 `#eef4ff` → 950 `#101c4e`, primario 500 `#3a64ff`
- **Dark mode**: estrategia `class` en `<html>`
- **Layout**: `flex h-screen`, sidebar `w-64`, topbar `h-16`
- **CSS custom**: scrollbar-thin, fade-in, pin hover, pulse-dot, kbd, chip, nav-link.active, cal-cell

## Comandos

```bash
pnpm install          # Instalar dependencias
pnpm dev             # Servidor de desarrollo (Vite)
pnpm build           # Build de producción (tsc + vite)
pnpm lint            # ESLint
pnpm typecheck       # TypeScript strict
pnpm test            # Vitest (unit)
pnpm test:e2e        # Playwright E2E
pnpm test:visual     # Playwright regresión visual
pnpm server          # Servidor Express (tsx watch)
pnpm db:migrate      # Prisma migrate dev
pnpm db:seed         # Seed canónico (142 activos, compatible con el HTML de referencia)
pnpm db:reset:manual-test  # Reset a cero para pruebas manuales (0 activos/docs/ubicaciones)
docker compose up    # Levantar todo (DB + app)
```

## Convenciones

- TypeScript estricto, sin `any` sin justificación.
- Componentes pequeños y enfocados; sin bloques JSX gigantes.
- **Refactor al crecer**: si al añadir funcionalidad un archivo `.tsx`/`.ts` supera ~250 líneas, extraer la parte nueva a un componente, hook o módulo antes de seguir. Ningún archivo de componente o vista debe crecer indefinidamente.
- **Consistencia de interacción en todo el proyecto**: toda vista con selección múltiple debe usar el hook compartido `useSelection` (`src/hooks/useSelection.ts`) y el componente `BulkActionBar` (`src/components/BulkActionBar.tsx`); toda tabla con acciones por fila debe usar `RowActionsMenu` (`src/components/RowActionsMenu.tsx`); toda acción irreversible debe confirmar con `ConfirmDialog` (`src/components/ConfirmDialog.tsx`). Las acciones disponibles en el menú ⋯ de una fila deben estar también disponibles como acción masiva cuando aplique (ej.: si una fila permite «Eliminar», la selección múltiple también). Antes de añadir una acción a una vista, verificar que las demás vistas con el mismo patrón (tabla/árbol/lista) la ofrezcan de forma equivalente. Las confirmaciones de acciones destructivas o de baja (dar de baja, eliminar, quitar foto, descartar selección, quitar asociación, borrados masivos) usan `ConfirmDialog`/`AssetActionConfirmDialog` con estado ocupado (`busy`/`busyLabel`); se montan sobre el modal y Escape cierra solo esa capa sin cerrar el modal padre.
- Separación: presentación / negocio / datos.
- Sin assets externos temporales; todo en `public/` o `src/assets/`.
- Commits convencionales: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
- No modificar migraciones ya aplicadas.
- No desactivar lint ni pruebas.

## Fase actual

**Fase 1 — Recuperación e integridad**: COMPLETADA

- ✅ HTML protegido en `docs/reference/docucore-prototype.html`
- ✅ SHA-256 calculado y documentado
- ✅ Assets descargados localmente (logo, avatar, plano)
- ✅ Proyecto Vite + React + TS + Tailwind scaffoldeado
- ✅ `pnpm install` / `pnpm lint` / `pnpm build` pasan

**Fase 2 — Réplica visual completa**: COMPLETADA

- ✅ Shell: Sidebar + Topbar + Layout + ThemeToggle
- ✅ 9 vistas replicadas; las superficies operativas se conectaron después a API y PostgreSQL
- ✅ Tipos centralizados en `src/types/index.ts`
- ✅ Datos demostrativos centralizados para las superficies aún no conectadas
- ✅ Navegación con React Router v6
- ✅ Modal de activo funcional (6 pestañas)
- ✅ Calendario CAL-01 real (Mes/Semana/Día) con contrato funcional versionado
- ✅ Plano interactivo con marcadores arrastrables
- ✅ Modo claro/oscuro funcional
- ✅ `pnpm build` / `pnpm lint` / `pnpm typecheck` pasan

**Fase 3 — Funcionalidad real de Activos**: COMPLETADA

- ✅ Prisma schema con 13 entidades (PostgreSQL)
- ✅ Migración inicial aplicada
- ✅ Seed reproducible con reinicio de identidades (142 activos, 5 proyectos, 5 tipos, 5 estados, 11 ubicaciones)
- ✅ Express API con Zod (GET/POST/PUT/PATCH /api/assets)
- ✅ CRUD verificado: crear, editar, cambiar estado, filtrar, paginar
- ✅ Auditoría automática en operaciones de escritura
- ✅ API client en frontend (`src/lib/api.ts`)
- ✅ CSS class mapping (`src/lib/assetMappers.ts`) — fidelidad visual
- ✅ AssetsView conectada al API (lectura + filtros + paginación)
- ✅ UI: botón "Nuevo activo" → POST
- ✅ UI: AssetModal "Editar" → PUT
- ✅ UI: AssetModal "Dar de baja" → PATCH status
- ✅ Próximos eventos derivados de eventos, documentos y campos dinámicos fechados; sin edición manual en `Asset`
- ✅ E2E real: crear, editar, dar de baja y comprobar persistencia (Playwright, 1440 × 1000, 0 errores de consola)

**Fase 4 — Calidad y despliegue**: COMPLETADA

- ✅ Vitest: mapeo de activos y validación HTTP real de Express/Zod
- ✅ Playwright E2E: navegación, tema, modal, filtros/paginación, CRUD y consola
- ✅ Dockerfile, Compose de aplicación, migraciones al inicio y healthchecks
- ✅ README, Dokploy, changelog y documentación operativa
- ✅ Regresión visual RELEASE-01: 30 de 30 pares bajo el umbral explícito de 0,5 %; HTML protegido para superficies sin evolución y baselines aprobados para las 15 capturas funcionales evolucionadas

**DOC-01 — Documentos funcionales**: FUNCIONAL

- ✅ `Document` + `DocumentVersion`, migración nueva, seed canónico y versión actual por número más alto
- ✅ Almacenamiento local seguro configurable, volumen Docker de documentos y directorio E2E aislado
- ✅ API multipart con versiones, metadatos/relación, descargas y auditoría
- ✅ Vista Documentos + ficha de activo conectadas a relaciones reales
- ✅ E2E de subida, versiones, descarga por bytes, persistencia y actualización/retiro de evento derivado
- ✅ Contrato visual RELEASE-01 aprobado para los tres objetivos de Documentos; conserva la comprobación pixel a pixel con umbral 0,5 % frente al baseline versionado

**DOC-02 — Documentos multi-activo y gestión**: FUNCIONAL

- ✅ Relación N-N `DocumentItem` (`@@id([documentId, assetId])`, `onDelete: Cascade` en ambas FKs) en lugar de `Document.assetId` (1-N); migración `20260810000000_document_item_join` conserva las relaciones existentes y elimina la columna (autorizado por la regla pre-release; `prisma migrate diff` limpio)
- ✅ API: `POST/PATCH /api/documents` aceptan `assetIds` (array; en multipart viaja como JSON string); el PATCH reemplaza el conjunto completo y valida que **todos** los activos pertenezcan al proyecto; el filtro `GET /api/documents?assetId=` (incluye `assetId=null` = sin activos) y la búsqueda por código/nombre de activo funcionan a través de la join; auditoría con detalle `Activos X → Y`
- ✅ `GET /api/assets` expone `documents`/`documentCount` a través de la join (mismo shape `ApiAssetDocument`); los próximos eventos derivados de vencimientos documentales no cambian
- ✅ «Gestionar documento»: campo único **«Activos asociados»** con `SearchableMultiPicker` (chips con «×», búsqueda con debounce y check en opciones), precargado con los del documento; «Vincular documento» desde la ficha del activo **añade** vínculo sin reasignar
- ✅ **Un único control de versión**: desaparece el campo «Nueva versión» del grid; el botón «Subir nueva versión» (label con input oculto) sube la versión al elegir el fichero, con las fechas actuales del formulario
- ✅ La fila completa de la tabla de Documentos abre «Gestionar documento» (columna «Activos asociados» con `COD · Nombre`); el tamaño de archivo usa el helper unificado `formatDocumentSize` (B/KB/MB, como el HTML: «840 KB», «2.4 MB») en la lista y en la ficha del activo — nunca «0 MB»
- ✅ La evolución visual de Documentos (multi-activo, periodicidad, selección y acciones) está cubierta por el baseline RELEASE-01, sin elevar el umbral de 0,5 %

**DOC-03 — Vista previa de documentos y formatos de imagen**: FUNCIONAL

- ✅ Al abrir «Gestionar documento», la **versión actual se muestra incrustada** justo debajo del campo Emisión — sin botón previo: PDF renderizado con **pdf.js en canvas propios** (`PdfPreview`: sin la barra de navegación del visor nativo del navegador — Chrome ignora `#toolbar=0` — y **siempre desde la primera página**: cada montaje renderiza de cero y el scroll es del contenedor propio, que arranca en 0; el blob se comparte con el visor sin volver a pedir el fichero y pdf.js viaja en un chunk aparte con su worker), imágenes en `<img>` y txt en `<pre>`; **al tocar la vista previa** se abre el visor ampliado (`DocumentPreviewModal`, `z-[60]`) con el contenido ya cargado (no vuelve a pedir el fichero). Escape/backdrop/✕ cierran solo el visor sin cerrar el modal padre (guardia `previewOpenRef` en el Escape de `DocumentModal`)
- ✅ **xlsx/xls muestran el área deshabilitada** («Sin vista previa para este formato. Descarga el archivo para visualizarlo.»), sin clic — no hay visor nativo y la descarga sigue en el modal padre (un solo control por concepto)
- ✅ **Formatos de imagen permitidos**: `ALLOWED_DOCUMENT_MIME_TYPES` y `MANAGED_STORAGE_KEY_PATTERN` aceptan `image/png`, `image/jpeg`, `image/webp` y `image/gif`; el `accept` de alta y de «Subir nueva versión» incluye `.png,.jpg,.jpeg,.webp,.gif` + MIME. `GET /api/documents/:id/preview` sirve la versión actual **inline** (`Content-Disposition: inline`; la descarga `/download` conserva `attachment`) con 404 si no hay versión; `fetchDocumentPreview` en `api.ts`. Sin migraciones
- ✅ Validación: lint ✅, typecheck ✅, 138 unit/API ✅ (5 tests API de DOC-03: imagen/PDF inline con bytes idénticos, xlsx servido con descarga attachment, 404, formato no permitido → 400) y 55 E2E ✅ (spec `z-document-preview`: subida de PNG por UI con `accept` verificado, vista previa incrustada `blob:` que abre el visor al tocarla y Escape que no cierra el modal padre; **PDF de 3 páginas que renderiza en canvas y verifica que el visor abre siempre arriba y no conserva el scroll al reabrir**, y área deshabilitada de xlsx). Visual: la vista previa solo aparece con interacción y el modal no está en los baselines — `documents` sin desfase nuevo

**DOC-04 — Periodicidad de documentos basada en el vencimiento**: FUNCIONAL

- ✅ Los documentos pueden tener una **periodicidad** (lista fija: Mensual, Bimestral, Trimestral, Cuatrimestral, Semestral, Anual; `Document.periodicity`/`Document.periodicityMode`, migración `20260810140000_document_periodicity`) con dos **modos de cálculo por documento**, elegidos en el formulario: **«Según calendario»** (el vencimiento salta desde el vencimiento vigente: 15/03 → 15/06 trimestral; sin vencimiento previo, desde la emisión) y **«Según subida»** (desde la emisión de la nueva versión: 20/04 → 20/07)
- ✅ **Cálculo automático al subir**: `POST /documents/:id/versions` calcula el vencimiento de la versión nueva cuando la petición no trae fecha; el alta (`POST /documents`) lo calcula desde la emisión en la primera versión. `calculateNextExpiry`/`addMonthsClamped` (clamp al último día del mes: 31/01 + 1 mes → 28/02) viven duplicados y probados en `server/lib/periodicity.ts` y `src/lib/periodicity.ts` (el servidor es la fuente autoritativa; el frontend precalcula el campo **editable**)
- ✅ **UI**: campos «Periodicidad» y «Modo» en `DocumentModal`; el campo «Vencimiento» se **precalcula en vivo** al cambiar la regla/modo/emisión (con hint «Automático: …»; una edición manual del campo deja de recalcularse) y «Subir nueva versión» envía el cálculo o el valor manual; columna **«Periodicidad»** en la tabla de Documentos (`Trimestral · Calendario`); `PATCH /documents/:id` guarda/quita la regla (null la quita; `periodicityMode` sin periodicidad → 400) con auditoría «Periodicidad de documento actualizada»; el seed canónico da periodicidad Anual a ITV, Calibración WIKA y Acta extintor (Calendario) y al Contrato Limpiezas (Subida)
- ✅ Validación: lint/typecheck/build ✅, 128 unit/API ✅ (12 unit de cálculo en server y frontend espejo, 7 de validación Zod, 8 API reales: cálculo en alta, salto Calendario, base Subida, fecha manual respetada, PATCH con null, 400) y 50 E2E ✅ (2 nuevos: trimestral calendario con salto en la subida; subida con fecha desde la emisión y edición manual respetada). Visual: la columna «Periodicidad» añade desfase al objetivo `documents` (ya en desfase autorizado); sin elevación de umbral ni cambios de baseline

**ITEM-04 — Duplicación y reversión de baja**: FUNCIONAL (pendiente de validación manual)

- ✅ Menú de acciones de cada fila con **Duplicar**: precarga solo los campos del modal de «Nuevo activo» (nombre, instalación, ubicación, tipo, responsable, iniciales, proyecto); código y nº de serie quedan vacíos (únicos, con 409 ante conflicto); el duplicado **nace con el estado por defecto** (Activo, primero de la lista) y no hereda el ciclo de vida del origen (p. ej. una baja); no copia documentos, eventos ni historial
- ✅ `Asset.serialNumber` único en PostgreSQL; `serialLabel` eliminada (migración `20260809190000_item_serial_unique_remove_label`); la presentación `SN`/`Lote`/`Mat` se deriva de tipo + serie
- ✅ Un activo `Fuera de servicio` muestra **Reactivar** (vuelve a `Activo`) con auditoría `Fuera de servicio → Activo`
- ✅ Validación: lint/typecheck/66 unit/33 E2E en verde; visual de Activos 3/3; pendiente de aceptación manual

**UX-01 — Modales anclados y menú de estado directo**: FUNCIONAL

- ✅ Todos los modales (`AssetModal`, `AssetFormModal`, `DocumentModal`, `LocationFormModal`, diálogo «Vincular documento») anclados al borde superior (`items-start` + `overflow-y-auto`): el modal cambia de tamaño al navegar entre pestañas sin «bailar»; el borde superior permanece fijo
- ✅ El campo «Estado» de la ficha del activo abre **inmediatamente** el menú de opciones (listbox con check en el estado actual, `fade-in`, cierre por click fuera y al seleccionar) con chevron ▾ rotatorio como indicación; sin controles intermedios
- ✅ La ficha anclada y el selector directo de estado forman parte del baseline RELEASE-01 con umbral visual de 0,5 %

**ITEM-05 — Papelera de activos (soft delete 30 días)**: FUNCIONAL

- ✅ `Asset.deletedAt` (migración `20260810120000_asset_trash`); el DELETE mueve a la papelera, `POST /api/assets/:id/restore` la deshace y `POST /api/assets/:id/purge` borra físicamente (409 si no está en papelera); auditoría en las tres operaciones
- ✅ `GET /api/assets?trashed=true` lista la papelera con **purga perezosa**: los activos con más de 30 días se borran físicamente al consultarla (reloj `DOCUCORE_NOW`), con auditoría por purga
- ✅ Todo lo demás excluye la papelera: lista, GET/:id, PUT, PATCH estado, `assetCount` de sesión, ubicaciones (árbol y detalle alineados), `document.assets` y validación de activos asociados; el vínculo `DocumentItem` persiste y reaparece al restaurar; los únicos de código/serie siguen ocupados hasta purgar
- ✅ UI: botón «Papelera» con contador y modo papelera (buscador, columna «Eliminación» con fecha, **Restaurar** y **Eliminar definitivamente** con confirmación); «Eliminar» en el menú ⋯ de cada fila y en el pie de la ficha (sin confirmación, reversible; la ficha se cierra al eliminar)
- ✅ Validación: lint/typecheck/76 unit/36 E2E en verde (9 tests API de papelera, incluida la purga automática, y 3 E2E nuevos de ciclo completo por UI)

**ITEM-06 — Renombrado unificado «Activo» (ítem → activo)**: FUNCIONAL

- ✅ El término «ítem» desaparece de todo el proyecto: vista **«Activos»** (nav, breadcrumb y heading), «Nuevo activo», labels y mensajes; `/api/items` → `/api/assets`, `/api/item-types` → `/api/asset-types`; documentos usan `assetIds`/`assetId`
- ✅ Prisma: `Item` → `Asset`, `ItemType` → `AssetType`, `itemId` → `assetId` (DocumentItem, Event, FloorPlanMarker) y `itemTypeId` → `assetTypeId`; migraciones nuevas `20260810110000_rename_item_to_asset` / `20260810130000_rename_item_constraints` con RENAME (conservan datos); `prisma migrate diff` limpio
- ✅ Frontend renombrado: `AssetsView/Table/Filters/Modal/FormModal`, `assetMappers`, `AssetCreateContext`, tipos `Asset`/`ApiAsset`, ruta `/assets` (redirect de `/items`), ids `#asset-*`; mock, seed y reset-manual-test en «Activo»
- ✅ Activos y Configuración forman parte del baseline RELEASE-01, que recoge su terminología y controles funcionales aprobados

**UX-02 — Modales: pestaña Resumen y desplegables completos**: FUNCIONAL

- ✅ La ficha del activo (siempre montada en la vista) resetea la pestaña activa a **«Resumen»** al cambiar de activo o al reabrir: ya no hereda la pestaña del modal anterior
- ✅ `PortalListbox` compartido: los listbox de `SearchablePicker`/`SearchableMultiPicker` viajan en portal a `document.body` (posición fija bajo el campo, ancho del campo, alto limitado al viewport, cierre por click fuera/scroll/resize): el modal con `overflow` ya no recorta el desplegable de «Activos asociados»
- ✅ Validación: lint/typecheck/76 unit/36 E2E en verde (E2E nuevos: pestaña Resumen tras navegar, y listbox en portal con selección real)

**UX-03 — Alta de activos: crear ubicación desde el formulario y botón único**: FUNCIONAL

- ✅ El botón **«Nuevo activo» de la cabecera** (Topbar, `AssetCreateContext`) es el único punto de alta: desaparece el botón duplicado de la vista Activos (el header queda con «Papelera» y «Exportar CSV»)
- ✅ El campo **«Ubicación»** del formulario de activo permite **crear una ubicación nueva sin salir del formulario**: la opción «＋ Crear nueva ubicación…» (al final del select `#asset-location`) abre `LocationFormModal` en modo create encima del formulario; responsable precargado con el del activo y padre con la ubicación seleccionada; al crear, la ubicación queda seleccionada, el catálogo se refresca y el formulario de activo sigue abierto
- ✅ `LocationFormModal` acepta `initialParentId`/`initialResponsibleId` opcionales (solo modo create; el flujo de la vista Ubicaciones no cambia)
- ✅ Validación: lint/typecheck/90 unit/API ✅ y 40 E2E ✅ en verde (E2E nuevo: ciclo completo de crear ubicación desde el formulario de activo, y el test de foco/Escape adaptado al botón de cabecera)

**UX-04 — Sugerencias de valores en el formulario de activo (Código, Nombre, Iniciales)**: FUNCIONAL

- ✅ Al crear o editar un activo, los campos **Código**, **Nombre** e **Iniciales** muestran un desplegable con los valores actuales de otros activos; cada fila incluye el valor de los otros dos campos como contexto (p. ej. `CNC-05` con hint `Torno CNC Haas ST-20 · CN`). La selección (clic o ↑/↓ + Enter) rellena el campo, que sigue aceptando cualquier valor nuevo
- ✅ `GET /api/assets/suggestions?field=code|name|initials&q=&excludeId=` (registrada antes de `/:id`): valores `distinct` del campo pedido (máx. 20, orden ascendente), excluye la papelera y, con `excludeId`, el activo que se está editando; cada fila devuelve `code`/`name`/`initials` para los hints
- ✅ `SuggestInput` compartido (`src/components/SuggestInput.tsx`): input de texto libre con listbox en portal (`PortalListbox`), debounce 250 ms con guarda de secuencia, navegación por teclado, cierre con Escape (el primer Escape cierra solo el listbox) o al perder el foco; el listbox solo se renderiza **con opciones** (un panel «Sin resultados» flotante taparía el formulario y podría interceptar el clic en «Crear activo» — corregido tras un E2E flaky)
- ✅ Validación: lint/typecheck/98 unit/API ✅ y 46 E2E ✅ en verde (4 E2E nuevos de sugerencias); visual sin desfase nuevo (el desplegable solo aparece con interacción)

**LOC-02 — Ficha de activo accesible desde Ubicaciones**: FUNCIONAL

- ✅ En el detalle de una ubicación, los activos del preview (primeros 3) son **clicables**: al tocarlos se abre la misma ficha (`AssetModal`) que en Activos, sin salir de Ubicaciones, con paridad total: ver ficha, próximo evento, cambiar estado, **Editar** (`AssetFormModal` encima), eliminar (papelera) y gestionar documentos
- ✅ `useAssetFicha` (`src/hooks/useAssetFicha.ts`): control de la ficha + formulario de edición para vistas sin lista propia — carga el activo completo con `fetchAsset` (la ficha exige `nextEvents`/documentos, el `ApiLocationAsset` del detalle no basta), guarda de secuencia contra fetches desordenados, cierre que invalida fetches pendientes, y refresco posterior vía `onAssetChanged` (en Ubicaciones: detalle + árbol + sidebar)
- ✅ `LocationAsset`/`mapApiLocationAssetToDisplay` exponen `id` (antes se descartaba); `LocationsView` carga `types`/`statuses` para la ficha y el formulario, y el alta rápida de ubicación desde el formulario de activo funciona también aquí (crea y refresca el catálogo sin skeleton)
- ✅ Validación: lint/typecheck/98 unit/API ✅ y 46 E2E ✅ en verde (2 E2E nuevos: abrir la ficha de CNC-05 desde Nave A y volver sin navegar; editar BH-04 desde la ficha con refresco del detalle); visual en reposo idéntico (la fila solo gana hover/cursor; verificado con stash: `locations` 3/3 en verde, la subida de métrica es variación ambiental de la máquina, no del cambio)

**IMG-01 — Imagen del activo (ficha y alta)**: FUNCIONAL

- ✅ Una sola imagen por activo, guardada en el storage gestionado de DocuCore (mismo directorio marcado que los documentos — `storeDocumentBuffer`/`readDocumentFile`/`removeDocumentFile`; los MIME de imagen ya estaban permitidos); en BD solo la clave + MIME + tamaño: `Asset.imageStorageKey` (única)/`imageMimeType`/`imageSizeBytes` (migración `20260810140000_asset_image`)
- ✅ API: `POST /api/assets/:id/image` (multipart, campo `image`, solo PNG/JPEG/WebP/GIF, máx. 10 MB) sube o **reemplaza** — guarda la nueva primero y borra la anterior solo tras el éxito, con rollback del fichero si la BD falla (patrón documentos); `DELETE /api/assets/:id/image` la quita; `GET /api/assets/:id/image` la sirve inline con el MIME almacenado y `Cache-Control: private`. Auditoría en subida/eliminación; la **purga** (manual o perezosa) borra el fichero con el activo (sin huérfanos); papelera e inexistentes → 404; `withDerivedEvents` expone `imageUrl` (derivado) + MIME + tamaño, nunca `imageStorageKey`; POST/PUT de activos siguen siendo JSON puro (`.strict()` intacto)
- ✅ Ficha (`AssetModal`): el cuadro `aspect-square` (idéntico al HTML en reposo) muestra la foto con `AssetImageBox` (`src/components/AssetImageBox.tsx`) — «Subir foto»/«Cambiar foto»/«Quitar» desde el hover, subida inmediata al elegir el fichero, spinner y error visibles; los padres refrescan con `onImageChanged` (`AssetsView` actualiza ficha + lista; `useAssetFicha.replaceAsset` para Ubicaciones)
- ✅ Alta/edición (`AssetFormModal`): `AssetImagePicker` con preview local (blob) o imagen actual en edición; el fichero se sube **al guardar** (`onSubmit(values, imageFile)` → `createAsset`/`updateAsset` + `uploadAssetImage`); si la subida falla tras crear/actualizar, el error lo dice y la imagen queda subible desde la ficha; el duplicado no hereda la imagen (ITEM-04)
- ✅ La ficha y Activos quedan cubiertos por el baseline RELEASE-01; el componente conserva el placeholder del contrato cuando no hay imagen

**LOC-01 — Ubicaciones funcionales**: EN REVISIÓN (correcciones de integridad aplicadas; pendiente de validación final del usuario)

- ✅ `Location` jerárquica real (`parentId` auto-referenciada), responsable por FK a `User` miembro del proyecto, `label` de presentación para la tabla (sin filas ocultas duplicadas); migraciones `20260807100000_location_hierarchy_and_item_fk`, correctivas `20260807120000_location_hidden` (superseded) / `20260807140000_location_label_not_hidden` y `20260808100000_location_label_no_default` (DEFAULT `''` residual eliminado; `prisma migrate diff` limpio)
- ✅ `Asset.locationId` FK obligatoria (`onDelete: Restrict`); filtro de activos por ubicación incluye la subrama
- ✅ API `GET/POST/PUT/DELETE /api/locations` con Zod, auditoría y borrado protegido (bloquea cualquier hija y activos en toda la subrama); validaciones de ciclo, mismo proyecto y responsable miembro; `GET /api/users`; `DELETE /api/assets/:id`
- ✅ POST/PUT `/api/assets` validan antes de escribir: `location.projectId === projectId` y responsable miembro del proyecto; el PUT parcial valida el estado final (existentes + cambios)
- ✅ `Location.label` sincronizado al renombrar: sigue al nuevo nombre si coincidía con el anterior; se conserva si es personalizada; el `label` explícito del PUT tiene prioridad
- ✅ Dos estados de datos: `pnpm db:seed` canónico (142 activos; árbol, detalle, filtros y formulario comparten los mismos conteos; etiquetas largas de tabla derivadas de `label`) y `pnpm db:reset:manual-test` (0 activos/docs/ubicaciones; limpia el storage tras el reset de BD y solo con ruta+marcador válidos; termina con error si la limpieza segura falla)
- ✅ Almacenamiento documental endurecido: marcador `.docucore-storage.json` con provisión solo en directorio nuevo y vacío, marcador ausente distinguido del corrupto/otro propietario (bloqueante) y errores de `writeFile` no ocultados
- ✅ Shell sin mocks: `GET /api/session` (no-store) + `SessionProvider`. Alta por la UI: el Sidebar se actualiza sin recargar (recarga asíncrona de la sesión). Borrado directo por API (`DELETE /api/assets/:id`): el conteo se actualiza al recargar la página, que es cuando la sesión se vuelve a cargar (E2E verifica ambos)
- ✅ `LocationsView`: selección de hojas y padres, alta/edición, borrado con confirmación y mensaje, «Ver plano» deshabilitado sin plano, estados vacíos; regresión visual de `locations` en verde (máx. 0,069236%)

## Vistas

| Vista | Estado | Validada |
|-------|--------|----------|
| Panel general (dashboard) | Implementada (mock) | Visual (3 objetivos) |
| Proyectos | Implementada (mock) | Visual (3 objetivos) |
| Activos | Implementada (PostgreSQL + papelera) | Visual + E2E |
| Documentos | Implementada (PostgreSQL + almacenamiento local, multi-activo) | E2E + visual RELEASE-01 |
| Calendario | API real CAL-01 | Unit/API + E2E + visual RELEASE-01 |
| Planos | Implementada (FloorPlan/FloorPlanVersion + DZI) | E2E + visual RELEASE-01 |
| Ubicaciones | Implementada (PostgreSQL, jerarquía + CRUD) | Visual (3 objetivos) + E2E |
| Historial | Implementada (mock) | Visual (3 objetivos) |
| Configuración | Implementada (mock) | Visual (3 objetivos) |

## Módulos

| Módulo | Estado |
|--------|--------|
| Shell (sidebar + topbar + theme) | Implementado |
| Navegación | Implementado |
| Datos demostrativos | Implementado (mock) |
| CRUD Activos → PostgreSQL | Implementado y verificado E2E |
| Papelera de activos (soft delete 30 días + restauración) | Implementado y verificado E2E |
| Documentos → PostgreSQL + archivos (N-N multi-activo) | Implementado y verificado E2E |
| Imagen del activo (ficha + alta, storage gestionado) | Implementado y verificado E2E |
| Ubicaciones → PostgreSQL (jerarquía + CRUD + asignación) | Implementado y verificado E2E |
| Docker | Producción validada (app + PostgreSQL) |
| Planos → PostgreSQL + storage gestionado | Versiones, DZI/OpenSeadragon, PDF local, marcadores normalizados, capas/filtros/búsqueda/alertas y navegación Activo ↔ Plano |
| Tipos de activo | `AssetType.iconKey` y catálogo industrial compartido por activos y marcadores |
| Preventivos | `AssetPreventivePlan` como fuente de verdad, independiente de campos dinámicos |

## Errores conocidos

El build ya no emite el aviso de chunk de aplicación superior a 500 kB: las rutas pesadas, OpenSeadragon y el selector de iconos se cargan bajo demanda. En runners locales de pruebas queda el aviso deprecado `DEP0205` de Node sobre `module.register()`; no aparece en la aplicación Docker ni en la consola de la UI y debe revisarse al actualizar Node/tsx.

## Estado de release

RELEASE-01 aprobó y versionó el contrato visual actual: 12 objetivos siguen el HTML protegido y 18 evoluciones funcionales usan baselines inspeccionados de `tests/visual/baselines/release-01/`, todos al 0,5 %. Los módulos operativos de Planos, Preventivos y Calendario están integrados en la arquitectura real. CAL-01 queda `COMPLETADO`: con autorización explícita usa sus tres baselines funcionales, sin modificar el HTML protegido ni el umbral. LOC-01 continúa `EN REVISIÓN` hasta aceptación manual expresa del usuario.

## Próximo paso exacto

1. Ejecutar con el usuario `docs/progress/LOC-01_MANUAL_TEST.md` y registrar el resultado observado.
2. Solo si el usuario acepta la prueba, cambiar LOC-01 de `EN REVISIÓN` a `VALIDADO` en `AGENTS.md`, `CURRENT_STATUS.md`, `ROADMAP.md` y `SESSION_LOG.md` mediante un commit documental separado.
3. Validar manualmente ITEM-05 (eliminar desde ficha y menú de fila → papelera → restaurar / eliminar definitivo, con el contador y el recuento del sidebar), ITEM-06 (todo «Activos» en la UI) y UX-02 (la ficha abre en «Resumen» y el desplegable de «Activos asociados» se ve completo); también ITEM-04 (duplicar un activo de baja), UX-03 (crear un activo eligiendo ubicación existente y creando una nueva desde el campo «Ubicación»; el alta solo desde la cabecera), UX-04 (las sugerencias de Código/Nombre/Iniciales muestran valores actuales con contexto y rellenan al seleccionar), LOC-02 (tocar un activo del detalle de una ubicación abre su ficha y permite editarlo), DOC-03 (abrir un documento y ver la versión actual incrustada bajo Emisión — PDF, imagen, txt; tocar la vista previa amplía el visor; xlsx/xls muestran el área deshabilitada), DOC-04 (crear un documento con periodicidad trimestral «Según calendario» y ver el vencimiento calculado; subir una nueva versión y comprobar que salta +3 meses desde el vigente; probar «Según subida» — el vencimiento sale de la emisión — y corregir el vencimiento a mano) e IMG-01 (subir una foto desde la ficha y desde el alta de un activo nuevo, cambiarla y quitarla; comprobar que la imagen persiste al recargar y que se purga con el activo) si el usuario lo desea.
4. Pendientes de roadmap: `HIST-01`, `CONF-01`, `DASH-01`, `PROJ-01`, `SHELL-01` y `QA-01` (warning DEP0205 de Node/tsx en las suites).

## Archivos protegidos

- `docs/reference/docucore-prototype.html` — **NUNCA MODIFICAR**
- `docs/reference/REFERENCE.md` — solo actualizar con autorización
- `docs/reference/DESIGN_SYSTEM.md` — solo actualizar con autorización
