# CURRENT_STATUS — DocuCore

## Fecha: 2026-08-09

## LOC-01 — Ubicaciones: EN REVISIÓN (no validado)

- `Location` jerárquica real (`parentId` auto-referenciada), responsable por FK a `User` miembro del proyecto y `label` de presentación para la tabla de Activos (el texto largo del prototipo, p. ej. `Planta 1 · Sala compresores`, vive en `label`; el árbol muestra `name`). Sin filas ocultas duplicadas: todas las ubicaciones son administrables y visibles al expandir su rama. Migraciones `20260807100000_location_hierarchy_and_item_fk`, `20260807120000_location_hidden`, `20260807140000_location_label_not_hidden` y `20260808100000_location_label_no_default` (elimina el DEFAULT `''` residual de `label`; `prisma migrate diff` sin drift).
- `Item.location` (texto) → `locationId` FK obligatoria con `onDelete: Restrict`; el filtro de ítems por ubicación incluye toda la subrama; `GET /api/items` expone `location.label` para la tabla.
- API `GET/POST/PUT/DELETE /api/locations` con Zod, auditoría y borrado protegido: bloquea **cualquier hija** y **activos en toda la subrama** con mensaje claro. Validaciones de ciclo (no autolink, no colgar de descendientes), mismo proyecto para padre/ubicación y responsable miembro. `GET /api/users` y `DELETE /api/items/:id`.
- POST/PUT `/api/items` validan antes de escribir que la ubicación pertenece al proyecto del ítem y que el responsable es miembro del proyecto; el PUT parcial valida el estado final (existentes + cambios), de modo que cambiar solo una relación nunca deja las demás incoherentes.
- `Location.label` nunca queda obsoleto al renombrar: si coincidía con el nombre anterior sigue al nuevo nombre; si es una etiqueta personalizada se conserva; un `label` explícito en el PUT siempre tiene prioridad.
- Dos estados de datos: `pnpm db:seed` canónico (142 activos; conteos 98/42/31/8/17/32/12; CNC-05/BH-04/BSC-11 en Nave A; árbol, detalle, filtros y formulario comparten los mismos conteos) y `pnpm db:reset:manual-test` (0 activos/documentos/versiones/eventos/ubicaciones; conserva 2 proyectos + usuarios + membresías reales para pruebas de separación).
- Almacenamiento documental endurecido: marcador `.docucore-storage.json` (provisión solo en directorio nuevo y vacío), limpieza solo tras finalizar el reset de BD, marcador ausente distinguido del corrupto o de otro propietario (errores bloqueantes), fallos de `writeFile` no ocultados, y `db:reset:manual-test` termina con error si la limpieza segura falla.
- Shell sin mocks: `GET /api/session` (con `Cache-Control: no-store`) + `SessionProvider`. Alta por la UI: el Sidebar se actualiza sin recargar la página (recarga asíncrona de la sesión tras crear). Borrado directo por API (`DELETE /api/items/:id`): el conteo se actualiza después de recargar la página, que es cuando la sesión se vuelve a cargar (E2E verifica el incremento sin recarga y la disminución tras recargar).
- `LocationsView`: selección y edición de hojas y padres, borrado con confirmación y mensaje, «Ver plano» deshabilitado sin plano (PLAN-01), estados vacíos.
- Matriz: lint ✅, typecheck ✅, 55 unit/API ✅, 29 E2E ✅, build ✅, `prisma migrate diff` sin drift ✅. Regresión visual `pnpm test:visual` → 24/30, exit code 1: `locations` 3/3 en verde (máx. 0,069236%); `documents` e `item-modal` (6 objetivos) fallan con el desfase preexistente de DOC-01 (idéntico al baseline `HEAD`). Sin cambios en umbrales ni baselines.

## Handoff vigente — 2026-08-09

- Rama de entrega: `main`; el commit de relevo se obtiene con `git log -1 --oneline`.
- Estado funcional: la implementación y la matriz automática de LOC-01 están completas, pero el módulo permanece **EN REVISIÓN** hasta la aceptación manual expresa del usuario.
- Punto de entrada para otro agente: leer `AGENTS.md`, este archivo, `ROADMAP.md` y ejecutar `LOC-01_MANUAL_TEST.md`.
- Próxima acción obligatoria: completar el checklist manual de Ubicaciones; no iniciar otro rediseño ni cambiar el HTML, los baselines o el umbral visual.
- Riesgos/pending separados: los 6 fallos visuales de `documents`/`item-modal` pertenecen a DOC-01; el aviso del bundle >500 kB pertenece a PERF-01.

## Estado verificado histórico (auditoría 2026-08-06)

- `main`: punto de partida `4188d9d` (`feat(items): derive upcoming events from relations`).
- HTML protegido: 126104 bytes; SHA-256 `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`.
- PostgreSQL local: `127.0.0.1:5435/docucore`, contenedor `docucore-db` saludable.
- Base regenerada: 142 ítems, 4 eventos relacionados y 207 documentos lógicos (cinco asociados y un conjunto documental canónico), 0 códigos `QA-*` y 5 auditorías canónicas.
- Regla pre-release activa: las migraciones destructivas, reseeds y retiradas de estructuras obsoletas necesarias están autorizadas hasta revocación expresa del usuario.

## Entorno auditado

| Componente | Versión/estado |
|---|---|
| Node | 26.2.0 |
| pnpm | 9.15.9, coincide con `packageManager` |
| Docker | 29.5.3 |
| Docker Compose | 5.1.4 |
| Migraciones | 7 aplicadas, 0 pendientes |
| Seed | Reproducible y verificado |
| API | Healthcheck `{"status":"ok"}` y `/api/items` real con `nextEvents` derivados |
| Frontend | Imagen Docker reconstruida y servicio de producción saludable en `:3001` |

## Inventario funcional real

| Vista | Estado | Evidencia y alcance |
|---|---|---|
| Panel general | VISUAL MOCK | Ruta, tema y fidelidad validados; KPIs, periodo, exportación y accesos son demostrativos. |
| Proyectos | VISUAL MOCK | Ruta y tarjetas validadas; alta/apertura no tienen persistencia. |
| Activos e ítems | VALIDADO | PostgreSQL, filtros, paginación, alta, edición, estado, persistencia, auditoría, errores y reintento. |
| Documentos | FUNCIONAL | PostgreSQL, versiones inmutables, subida multipart, edición/relación, descarga y almacenamiento local persistente; E2E Documento-Activo verde. La regresión visual sigue pendiente. |
| Calendario | VISUAL MOCK | Calendario y fidelidad validados; vistas/eventos no persisten. |
| Planos | PARCIAL | Marcadores arrastrables en memoria; guardar, deshacer/rehacer, capas y versiones no persisten. |
| Ubicaciones | EN REVISIÓN | Jerarquía real (`parentId` + `label` de presentación, sin duplicados ocultos); CRUD con auditoría, selección de hojas y padres, borrado protegido (cualquier hija o activos en subrama), «Ver plano» condicionado a PLAN-01, estados vacíos y reset manual. Relaciones de ítems validadas contra el proyecto, `label` sincronizado al renombrar y almacenamiento documental endurecido. Regresión visual de la vista en verde; módulo pendiente de validación final (no marcado VALIDADO). |
| Historial | VISUAL MOCK | Tabla estática; no consulta `AuditLog`. |
| Configuración | VISUAL MOCK | Presentación validada; controles sin persistencia. |

El shell es parcial: navegación, rutas directas, recarga, tema y “Nuevo ítem” funcionan; buscador global, selector de proyecto y notificaciones siguen siendo demostrativos. El tema cambia correctamente pero vuelve al modo oscuro tras una recarga; no existe requisito confirmado de persistencia entre sesiones.

## Correcciones de la auditoría local

1. Se impidió que respuestas antiguas de filtros sobrescriban el resultado más reciente.
2. `installDate` exige una fecha ISO real; fechas imposibles devuelven HTTP 400 y ya no se normalizan silenciosamente ni producen HTTP 500.
3. Los modales de consulta y formulario exponen `role="dialog"`, nombre accesible, foco inicial/restaurado y cierre mediante Escape.
4. El listado muestra errores de API mediante `role="alert"` y permite reintentar sin recargar la página.
5. Se activaron los flags de compatibilidad de React Router v7 y la suite falla ante errores o warnings de consola.
6. Se añadieron regresiones para fechas inválidas, respuestas fuera de orden, recuperación de API y accesibilidad de diálogos.

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

La mayor diferencia visual actual es Activos 1440 × 1000 oscuro: 0,3238%, por debajo del umbral de 0,5%.

## Limitaciones y avisos conocidos

- `ITEM-03` está VALIDADO para la fuente documental: el E2E crea, versiona y retira una relación documental y comprueba que los próximos eventos cambian de forma persistente. Calendario y campos dinámicos siguen pendientes de sus módulos propios.
- Los documentos se guardan bajo `DOCUMENT_STORAGE_PATH`; Compose monta el volumen persistente `document_data` y Playwright usa un directorio temporal aislado.
- El bundle de producción es de 569,03 kB y mantiene el aviso no bloqueante de Vite sobre chunks de más de 500 kB.
- Node 26 muestra `DEP0205` desde el cargador de `tsx`; no falla las pruebas, pero conviene validar el proyecto también con la versión LTS soportada.
- Los controles declarados como `VISUAL MOCK` o `PARCIAL` no deben presentarse como funcionales.
- El formulario actual no permite seleccionar responsable ni expone campos dinámicos, aunque el modelo/API almacenan esos identificadores/datos.

## Próximo paso exacto

1. Ejecutar y completar `docs/progress/LOC-01_MANUAL_TEST.md` con el usuario.
2. Si el usuario acepta LOC-01, actualizar su estado a VALIDADO mediante un commit documental separado.
3. Priorizar después la regresión visual de `DOC-01`, `CAL-01` o `ITEM-02`; evaluar code splitting y una matriz CI con Node LTS sin alterar el contrato visual.
