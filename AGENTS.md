# DocuCore — AGENTS.md

## Propósito

DocuCore es una plataforma de gestión documental y de activos industriales. Convierte un prototipo HTML aprobado en una aplicación real: React + TypeScript + PostgreSQL + Docker, con fidelidad visual total al diseño original.

## Regla temporal de desarrollo pre-release

> Hasta que el usuario la revoque expresamente, DocuCore se considera un entorno de desarrollo sin información productiva que deba preservarse.

- Están autorizadas las migraciones destructivas, reinicios de base de datos, reseeds, eliminación o traslado de campos, tablas, archivos y datos obsoletos que sean necesarios para avanzar en la arquitectura correcta.
- No se debe bloquear, aplazar ni limitar un cambio únicamente por un riesgo de pérdida de información del entorno actual, ni exigir copias de seguridad preventivas para ejecutar trabajo solicitado dentro de DocuCore.
- Se debe priorizar el modelo final correcto sobre la compatibilidad con datos temporales, mocks, seeds o estructuras anteriores.
- Esta autorización no permite modificar el HTML protegido, desactivar pruebas, alterar migraciones ya aplicadas ni ampliar el alcance fuera de DocuCore; esos límites siguen vigentes.
- Toda eliminación o migración debe quedar documentada y validada, aunque no requiera confirmación previa por conservación de datos.

## Regla de fidelidad al HTML

> Ningún agente puede rediseñar, reinterpretar, simplificar o sustituir la interfaz del HTML de referencia sin autorización expresa del usuario.

> Antes de modificar una vista se debe abrir el HTML de referencia. Después de modificarla se debe ejecutar su comparación visual.

El HTML de referencia es un **contrato visual**. No es una inspiración. La aplicación debe verse como un espejo del HTML original.

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
- ✅ 9 vistas implementadas con datos mock
- ✅ Tipos centralizados en `src/types/index.ts`
- ✅ Datos mock centralizados en `src/data/mock.ts`
- ✅ Navegación con React Router v6
- ✅ Modal de activo funcional (6 pestañas)
- ✅ Calendario visual (grid mensual)
- ✅ Plano interactivo con marcadores arrastrables
- ✅ Modo claro/oscuro funcional
- ✅ `pnpm build` / `pnpm lint` / `pnpm typecheck` pasan

**Fase 3 — Funcionalidad real de Activos e ítems**: COMPLETADA

- ✅ Prisma schema con 13 entidades (PostgreSQL)
- ✅ Migración inicial aplicada
- ✅ Seed reproducible con reinicio de identidades (142 items, 5 proyectos, 5 tipos, 5 estados, 11 ubicaciones)
- ✅ Express API con Zod (GET/POST/PUT/PATCH /api/items)
- ✅ CRUD verificado: crear, editar, cambiar estado, filtrar, paginar
- ✅ Auditoría automática en operaciones de escritura
- ✅ API client en frontend (`src/lib/api.ts`)
- ✅ CSS class mapping (`src/lib/itemMappers.ts`) — fidelidad visual
- ✅ ItemsView conectada al API (lectura + filtros + paginación)
- ✅ UI: botón "Nuevo ítem" → POST
- ✅ UI: ItemModal "Editar" → PUT
- ✅ UI: ItemModal "Dar de baja" → PATCH status
- ✅ Próximos eventos derivados de eventos, documentos y campos dinámicos fechados; sin edición manual en `Item`
- ✅ E2E real: crear, editar, dar de baja y comprobar persistencia (Playwright, 1440 × 1000, 0 errores de consola)

**Fase 4 — Calidad y despliegue**: COMPLETADA

- ✅ Vitest: mapeo de ítems y validación HTTP real de Express/Zod
- ✅ Playwright E2E: navegación, tema, modal, filtros/paginación, CRUD y consola
- ✅ Dockerfile, Compose de aplicación, migraciones al inicio y healthchecks
- ✅ README, Dokploy, changelog y documentación operativa
- ✅ Regresión visual: 30 de 30 pares bajo el umbral explícito de 0.5% (máximo: Activos 1440 × 1000 oscuro, 0.3238%)

**DOC-01 — Documentos funcionales**: FUNCIONAL

- ✅ `Document` + `DocumentVersion`, migración nueva, seed canónico y versión actual por número más alto
- ✅ Almacenamiento local seguro configurable, volumen Docker de documentos y directorio E2E aislado
- ✅ API multipart con versiones, metadatos/relación, descargas y auditoría
- ✅ Vista Documentos + ficha de activo conectadas a relaciones reales
- ✅ E2E de subida, versiones, descarga por bytes, persistencia y actualización/retiro de evento derivado
- ⏳ Regresión visual pendiente: `documents` (3 objetivos) mantiene el desfase contra el HTML de referencia; no se ha elevado el umbral de 0,5% ni modificado baselines

**DOC-02 — Documentos multi-activo y gestión**: FUNCIONAL

- ✅ Relación N-N `DocumentItem` (`@@id([documentId, itemId])`, `onDelete: Cascade` en ambas FKs) en lugar de `Document.itemId` (1-N); migración `20260810000000_document_item_join` conserva las relaciones existentes y elimina la columna (autorizado por la regla pre-release; `prisma migrate diff` limpio)
- ✅ API: `POST/PATCH /api/documents` aceptan `itemIds` (array; en multipart viaja como JSON string); el PATCH reemplaza el conjunto completo y valida que **todos** los activos pertenezcan al proyecto; el filtro `GET /api/documents?itemId=` (incluye `itemId=null` = sin activos) y la búsqueda por código/nombre de activo funcionan a través de la join; auditoría con detalle `Activos X → Y`
- ✅ `GET /api/items` expone `documents`/`documentCount` a través de la join (mismo shape `ApiItemDocument`); los próximos eventos derivados de vencimientos documentales no cambian
- ✅ «Gestionar documento»: campo único **«Activos asociados»** con `SearchableMultiPicker` (chips con «×», búsqueda con debounce y check en opciones), precargado con los del documento; «Vincular documento» desde la ficha del activo **añade** vínculo sin reasignar
- ✅ **Un único control de versión**: desaparece el campo «Nueva versión» del grid; el botón «Subir nueva versión» (label con input oculto) sube la versión al elegir el fichero, con las fechas actuales del formulario
- ✅ La fila completa de la tabla de Documentos abre «Gestionar documento» (columna «Activos asociados» con `COD · Nombre`); el tamaño de archivo usa el helper unificado `formatDocumentSize` (B/KB/MB, como el HTML: «840 KB», «2.4 MB») en la lista y en la ficha del activo — nunca «0 MB»
- ✅ Validación: lint ✅, typecheck ✅, 66 unit/API ✅ y 32 E2E ✅ (incluye test nuevo: documento con 2 activos, apertura por fila y desvinculación parcial). Visual: `documents` 1440×1000 oscuro 1,9719 %, claro 1,4077 %, 1920×1080 oscuro 0,7283 % — desfase esperado por el header «Activos asociados» y el formato KB/MB, pedido expresamente por el usuario; sin elevación de umbral ni cambios de baseline

**ITEM-04 — Duplicación y reversión de baja**: FUNCIONAL (pendiente de validación manual)

- ✅ Menú de acciones de cada fila con **Duplicar**: precarga solo los campos del modal de «Nuevo ítem» (nombre, instalación, ubicación, tipo, responsable, iniciales, proyecto); código y nº de serie quedan vacíos (únicos, con 409 ante conflicto); el duplicado **nace con el estado por defecto** (Activo, primero de la lista) y no hereda el ciclo de vida del origen (p. ej. una baja); no copia documentos, eventos ni historial
- ✅ `Item.serialNumber` único en PostgreSQL; `serialLabel` eliminada (migración `20260809190000_item_serial_unique_remove_label`); la presentación `SN`/`Lote`/`Mat` se deriva de tipo + serie
- ✅ Un ítem `Fuera de servicio` muestra **Reactivar** (vuelve a `Activo`) con auditoría `Fuera de servicio → Activo`
- ✅ Validación: lint/typecheck/66 unit/33 E2E en verde; visual de Activos 3/3; pendiente de aceptación manual

**UX-01 — Modales anclados y menú de estado directo**: FUNCIONAL

- ✅ Todos los modales (`ItemModal`, `ItemFormModal`, `DocumentModal`, `LocationFormModal`, diálogo «Vincular documento») anclados al borde superior (`items-start` + `overflow-y-auto`): el modal cambia de tamaño al navegar entre pestañas sin «bailar»; el borde superior permanece fijo
- ✅ El campo «Estado» de la ficha del activo abre **inmediatamente** el menú de opciones (listbox con check en el estado actual, `fade-in`, cierre por click fuera y al seleccionar) con chevron ▾ rotatorio como indicación; sin controles intermedios
- ✅ Validación: lint/typecheck/66 unit/33 E2E en verde (E2E nuevo: el modal mantiene el mismo `y` al cambiar de pestaña y cambia/restaura estado desde el menú); visual: `item-modal` (2,5740 % / 13,6169 % / 1,6885 %) en desfase por el anclaje y el chevron (cambio pedido por el usuario; el HTML de referencia centra el modal)

**LOC-01 — Ubicaciones funcionales**: EN REVISIÓN (correcciones de integridad aplicadas; pendiente de validación final del usuario)

- ✅ `Location` jerárquica real (`parentId` auto-referenciada), responsable por FK a `User` miembro del proyecto, `label` de presentación para la tabla (sin filas ocultas duplicadas); migraciones `20260807100000_location_hierarchy_and_item_fk`, correctivas `20260807120000_location_hidden` (superseded) / `20260807140000_location_label_not_hidden` y `20260808100000_location_label_no_default` (DEFAULT `''` residual eliminado; `prisma migrate diff` limpio)
- ✅ `Item.location` (texto) → `locationId` FK obligatoria (`onDelete: Restrict`); filtro de ítems por ubicación incluye la subrama
- ✅ API `GET/POST/PUT/DELETE /api/locations` con Zod, auditoría y borrado protegido (bloquea cualquier hija y activos en toda la subrama); validaciones de ciclo, mismo proyecto y responsable miembro; `GET /api/users`; `DELETE /api/items/:id`
- ✅ POST/PUT `/api/items` validan antes de escribir: `location.projectId === projectId` y responsable miembro del proyecto; el PUT parcial valida el estado final (existentes + cambios)
- ✅ `Location.label` sincronizado al renombrar: sigue al nuevo nombre si coincidía con el anterior; se conserva si es personalizada; el `label` explícito del PUT tiene prioridad
- ✅ Dos estados de datos: `pnpm db:seed` canónico (142 activos; árbol, detalle, filtros y formulario comparten los mismos conteos; etiquetas largas de tabla derivadas de `label`) y `pnpm db:reset:manual-test` (0 activos/docs/ubicaciones; limpia el storage tras el reset de BD y solo con ruta+marcador válidos; termina con error si la limpieza segura falla)
- ✅ Almacenamiento documental endurecido: marcador `.docucore-storage.json` con provisión solo en directorio nuevo y vacío, marcador ausente distinguido del corrupto/otro propietario (bloqueante) y errores de `writeFile` no ocultados
- ✅ Shell sin mocks: `GET /api/session` (no-store) + `SessionProvider`. Alta por la UI: el Sidebar se actualiza sin recargar (recarga asíncrona de la sesión). Borrado directo por API (`DELETE /api/items/:id`): el conteo se actualiza al recargar la página, que es cuando la sesión se vuelve a cargar (E2E verifica ambos)
- ✅ `LocationsView`: selección de hojas y padres, alta/edición, borrado con confirmación y mensaje, «Ver plano» deshabilitado sin plano, estados vacíos; regresión visual de `locations` en verde (máx. 0,069236%)

## Vistas

| Vista | Estado | Validada |
|-------|--------|----------|
| Panel general (dashboard) | Implementada (mock) | Visual (3 objetivos) |
| Proyectos | Implementada (mock) | Visual (3 objetivos) |
| Activos e ítems | Implementada (PostgreSQL) | Visual + E2E |
| Documentos | Implementada (PostgreSQL + almacenamiento local, multi-activo) | E2E; visual pendiente |
| Calendario | Implementada (mock) | Visual (3 objetivos) |
| Planos | Implementada (mock) | Visual (3 objetivos) |
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
| Documentos → PostgreSQL + archivos (N-N multi-activo) | Implementado y verificado E2E |
| Ubicaciones → PostgreSQL (jerarquía + CRUD + asignación) | Implementado y verificado E2E |
| Docker | Producción validada (app + PostgreSQL) |

## Errores conocidos

Aviso no bloqueante: Vite informa que el bundle de producción supera 500 kB; evaluar code splitting en una mejora posterior.

Regresión visual: `pnpm test:visual` registra 24/30 con exit code 1; `locations` está 3/3 en verde (máx. 0,069236%). `documents` (3 objetivos: 1,9719 % / 1,4077 % / 0,7283 %) e `item-modal` (3 objetivos: 2,5740 % / 13,6169 % / 1,6885 %) fallan contra el HTML de referencia: el desfase de `documents` creció con DOC-02 (header «Activos asociados» y formato de tamaño B/KB/MB, pedidos expresamente por el usuario) y el de `item-modal` con UX-01 (modal anclado arriba en lugar de centrado, y chevron en el campo Estado — ambos pedidos por el usuario). No se ha elevado el umbral de 0,5% ni modificado baselines.

## Último commit estable

La etapa LOC-01 se publica en `main` con el estado **EN REVISIÓN** (HEAD: `0823a8b`). El trabajo posterior —ITEM-04 (duplicado), DOC-02 (multi-activo) y UX-01 (modales/estado)— está implementado, verificado y documentado en el working tree **sin commitear** (no commitear sin petición expresa del usuario). No cambiar ningún estado a VALIDADO sin confirmación expresa del usuario.

## Próximo paso exacto

1. Ejecutar con el usuario `docs/progress/LOC-01_MANUAL_TEST.md` y registrar el resultado observado.
2. Solo si el usuario acepta la prueba, cambiar LOC-01 de `EN REVISIÓN` a `VALIDADO` en `AGENTS.md`, `CURRENT_STATUS.md`, `ROADMAP.md` y `SESSION_LOG.md` mediante un commit documental separado.
3. Validar manualmente ITEM-04 (duplicar un activo de baja y comprobar que nace Activo con código/serie nuevos) y, si el usuario lo desea, probar DOC-02 (asociar un documento a dos activos) y UX-01 (cambiar estado desde la ficha).
4. Decidir con el usuario el destino del desfase visual de `documents`/`item-modal` (cambios pedidos por el usuario; no se eleva el umbral ni se tocan baselines sin su autorización).
5. Pendientes de roadmap: `CAL-01`, `HIST-01`, `CONF-01`, `DASH-01`, `PROJ-01`, `SHELL-01`, `PLAN-01`, `PERF-01` (bundle >500 kB) y `QA-01` (warning DEP0205 de Node 26 en las suites).

## Archivos protegidos

- `docs/reference/docucore-prototype.html` — **NUNCA MODIFICAR**
- `docs/reference/REFERENCE.md` — solo actualizar con autorización
- `docs/reference/DESIGN_SYSTEM.md` — solo actualizar con autorización
