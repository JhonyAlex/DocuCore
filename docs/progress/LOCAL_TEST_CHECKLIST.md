# LOCAL_TEST_CHECKLIST — 2026-08-06

Rama auditada: `test/local-dogfood`. Commit de correcciones: `68f2cde`.

| Flujo | Resultado esperado | Resultado obtenido | Estado | Evidencia | Error asociado | Commit |
|---|---|---|---|---|---|---|
| Integridad HTML | Hash y tamaño protegidos | 126104 bytes; SHA-256 correcto | ✅ | `Get-FileHash` | — | — |
| Arranque PostgreSQL | Contenedor saludable en 5435 | Healthy | ✅ | `docker compose ps` | — | — |
| Migraciones | Sin pendientes | 1 aplicada, 0 pendientes | ✅ | `pnpm db:deploy` | — | — |
| Seed | 142 activos canónicos | 142 activos, 5 auditorías | ✅ | `pnpm db:seed` + SQL | — | — |
| Rutas y recarga | Nueve vistas accesibles | Nueve headings y rutas directas correctas | ✅ | Navegador + E2E | — | 68f2cde |
| Tema | Alterna sin consola | Claro/oscuro correctos; 0 issues en flujo normal | ✅ | Navegador + E2E | DC-004 | 68f2cde |
| Filtros individuales | Código, nombre, tipo, estado y ubicación coherentes | Resultados correctos | ✅ | Navegador | — | 68f2cde |
| Filtros combinados | El último filtro siempre prevalece | Corregida carrera de respuestas | ✅ | E2E con respuesta demorada | DC-001 | 68f2cde |
| Paginación | 142 registros en páginas de 6 | Conteos y navegación correctos | ✅ | Navegador + E2E | — | 68f2cde |
| Alta de activo | Validación y persistencia | Alta E2E persistente | ✅ | E2E CRUD | — | 68f2cde |
| Código duplicado | HTTP 409 y mensaje recuperable | Rechazado por API/UI | ✅ | API + navegador | — | 68f2cde |
| Fecha imposible | HTTP 400 | Rechazada por Zod; antes podía ser 500/normalizarse | ✅ | Unit/API | DC-002 | 68f2cde |
| Edición | Nombre y datos persisten | Persistencia tras recarga | ✅ | E2E CRUD | — | 68f2cde |
| Cambio/baja | Estado persiste y se audita | `Fuera de servicio` tras recarga | ✅ | E2E + SQL | — | 68f2cde |
| Modal consulta | Botón, fondo y Escape | Diálogo accesible; Escape verificado | ✅ | Navegador + E2E | DC-003 | 68f2cde |
| Modal formulario | Foco, Escape y bloqueo durante guardado | Foco inicial/restaurado y Escape | ✅ | Navegador + E2E | DC-003 | 68f2cde |
| API detenida | Error comprensible y reintento | `role=alert`; recupera sin recarga | ✅ | Navegador + E2E | DC-005 | 68f2cde |
| API 400/404 | JSON y estado correctos | 400 id inválido; 404 inexistente | ✅ | HTTP + unit/E2E | — | 68f2cde |
| Consola/red normal | 0 errores/warnings; 0 HTTP fallidos | Cumplido tras flags v7 | ✅ | Navegador + fixture E2E | DC-004 | 68f2cde |
| Regresión visual | 30 pares ≤0,5% | 30/30; máximo 0,2862% | ✅ | `test-results/visual/` | — | 68f2cde |
| Limpieza QA | 0 registros `QA-*` | 0 tras seed final | ✅ | Consulta SQL | — | — |

## Problemas registrados

| ID | Severidad | Resultado anterior | Resultado corregido |
|---|---|---|---|
| DC-001 | Alta | Una respuesta antigua podía sobrescribir filtros recientes | Solo la solicitud más reciente actualiza el listado |
| DC-002 | Alta | Fecha imposible podía normalizarse o producir HTTP 500 | Zod devuelve HTTP 400 |
| DC-003 | Media | Modales sin semántica, Escape ni restauración de foco | Diálogos accesibles y cierre por teclado |
| DC-004 | Baja | Warnings de compatibilidad de React Router no detectados | Flags v7 activos y fixture vigila warnings/errores |
| DC-005 | Media | Error visible sin anuncio ni acción de recuperación | Alerta accesible y botón Reintentar |
