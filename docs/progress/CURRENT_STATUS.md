# Estado actual de DocuCore

Última auditoría documental: `2026-08-06`.

## Identificación auditada

| Dato | Valor |
|---|---|
| Rama | `feat/docucore-implementation`, con seguimiento de `origin/feat/docucore-implementation` |
| HEAD previo a esta tarea documental | `69dc2ae docs(agents): record pull request prerequisite` |
| Estado global | `PARCIAL` |
| Referencia visual | `docs/reference/docucore-prototype.html`, SHA-256 `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`, `126104` bytes, `1800` líneas |

Este documento no declara el producto ni una fase como terminados.

## Capacidad real

| Área | Estado | Realidad vigente |
|---|---|---|
| Shell, rutas y tema | `FUNCIONAL` | Existen el shell, la navegación de nueve vistas, breadcrumbs y el cambio claro/oscuro. No hay evidencia actual retenida para elevarlo a `VALIDADO`. |
| Panel general | `VISUAL MOCK` | KPIs, vencimientos, alertas, actividad, periodo y exportación usan datos estáticos o controles sin operación real. |
| Proyectos | `VISUAL MOCK` | La vista usa mock; crear, abrir y seleccionar contexto de proyecto no tienen flujo persistente. El modelo Prisma no equivale a una API funcional. |
| Activos e ítems | `FUNCIONAL` | Única vertical persistente: lista, detalle, alta, actualización, cambio de estado, filtros y paginación mediante PostgreSQL. No existe endpoint `DELETE`; no hay aislamiento por proyecto ni autorización. |
| Documentos | `VISUAL MOCK` | Lista, KPIs, subida y descarga son mock/no-op. Existe modelo Prisma, pero no API, almacenamiento ni flujo persistente. |
| Calendario | `VISUAL MOCK` | La cuadrícula y eventos son estáticos. Existe modelo `Event`, sin API ni CRUD. |
| Planos | `PARCIAL` | La apariencia existe y los marcadores se arrastran solo en memoria. Guardar, deshacer, rehacer y capas son simulados; los modelos no tienen API/UI persistente. |
| Ubicaciones | `VISUAL MOCK` | La vista es mock. `GET /api/locations` devuelve strings distintos de `Item.location`; no consulta la tabla `Location`. |
| Historial | `VISUAL MOCK` | La vista usa actividad estática. Items escribe `AuditLog`, pero no existe consulta funcional de historial y el actor está fijado a usuario `1`. |
| Configuración | `VISUAL MOCK` | Las tarjetas y accesos no ejecutan configuración. Tipos y estados solo se leen como metadatos; campos dinámicos permanecen en modelo/JSON sin flujo funcional. |
| Búsqueda global | `VISUAL MOCK` | El input y el atajo son visibles, pero no hay búsqueda transversal. |
| Importación y exportación | `NO INICIADO` | No existe procesamiento funcional; los controles visibles no prueban capacidad. |
| Integraciones | `NO INICIADO` | No hay conectores ni contrato aprobado. |
| Backup y restauración | `NO INICIADO` | No hay flujo, automatización ni prueba de restauración. |
| Observabilidad | `PARCIAL` | Hay healthcheck básico; faltan logging estructurado, métricas, trazas y alertas. |
| Despliegue | `PARCIAL` | Existen Dockerfile, Compose y guía Dokploy. La preparación de producción sigue limitada por seguridad, aislamiento, backups y falta de validación runtime en esta auditoría. |

## Backend y modelo

- Existen `13` modelos Prisma. Fuera de Items y metadatos de solo lectura, la mayoría no dispone de API/UI funcional.
- Flujo actual: React -> `fetch('/api')` -> routers Express -> Prisma -> PostgreSQL.
- `server/routes/items.ts` concentra transporte, validación, consultas, reglas de escritura y auditoría.
- No existen autenticación, sesión, RBAC ni aislamiento por proyecto. La API de Items ignora el proyecto activo en listados y accesos por ID.
- Riesgos de fuente de verdad: `Item.location` frente a `Location`; `Item.nextEvent*` frente a `Event`; definiciones dinámicas frente a `Item.dynamicFields`; actor fijo de auditoría; alcance de proyecto no aplicado.

## Affordances visibles sin operación real

Se han identificado, entre otras, búsqueda global, notificaciones, exportación del panel, creación/apertura de proyectos, subida/descarga de documentos, acciones de calendario, gestión de ubicaciones, tarjetas de configuración y controles de guardar/deshacer/rehacer/capas de planos. Deben convertirse en flujos reales o permanecer registrados como `VISUAL MOCK`; no deben simular éxito.

## Validación de esta auditoría

| Verificación | Estado | Evidencia actual |
|---|---|---|
| `pnpm lint` | `VALIDADO` | Ejecutado correctamente en la auditoría delegada del `2026-08-06`. |
| `pnpm typecheck` | `VALIDADO` | Ejecutado correctamente en la auditoría delegada del `2026-08-06`. |
| `pnpm test` | `VALIDADO` | `2` archivos y `7/7` pruebas correctas en la auditoría delegada. |
| `docker compose config --quiet` | `VALIDADO` | Configuración Compose válida en la auditoría delegada. |
| `pnpm build` | `NO INICIADO` | No ejecutado en esta auditoría. La evidencia histórica no sustituye una ejecución actual. |
| `pnpm test:e2e` | `NO INICIADO` | No ejecutado en esta auditoría; no hay reporte retenido. |
| `pnpm test:visual` | `PARCIAL` | Evidencia histórica contradictoria: una fuente declara `30/30` y otra `5/30`. No hay reportes retenidos; requiere repetición controlada. |
| Migraciones y `pnpm db:seed` | `NO INICIADO` | No ejecutados por el riesgo destructivo y la ausencia de una guarda que garantice una base de pruebas. |
| Runtime Docker y healthcheck | `NO INICIADO` | No ejecutados en esta auditoría. |

Ningún comando ejecutado en esta auditoría falló. El único fallo registrado es histórico y contradictorio: `25` comparaciones visuales fallidas en `SESSION_LOG.md` frente a otra afirmación histórica de `30/30`; no se adopta ninguna como evidencia vigente.

## Bloqueos

| Trabajo | Estado | Dependencia concreta |
|---|---|---|
| PR de `feat/docucore-implementation` | `BLOQUEADO` | `gh` no está instalado. El push fue verificado históricamente; esta auditoría no hizo un push nuevo. |
| Expansión segura de módulos persistentes | `BLOQUEADO` | Falta definir y aprobar identidad, sesión, membresía de proyecto y RBAC en `AUTH-01`. |
| E2E/visual con base de datos | `BLOQUEADO` | `tests/helpers/database.ts` acepta `DATABASE_URL` sin comprobar que sea una base aislada y puede migrar y ejecutar un seed que trunca datos. |
| Persistencia documental | `BLOQUEADO` | Falta un ADR específico de almacenamiento, retención y acceso; no se adopta una opción por inferencia. |

## Errores y riesgos conocidos

- Riesgo crítico de pérdida de datos: el helper E2E ejecuta migraciones y un seed destructivo sin guarda de entorno de pruebas.
- Riesgo crítico de exposición cruzada: Items no se filtra ni autoriza por proyecto.
- Riesgo alto de auditoría inválida: todas las escrituras usan el actor fijo `1`.
- Riesgo alto de fuentes de verdad divergentes en ubicación, próximos eventos y campos dinámicos.
- Evidencia visual contradictoria y no retenida; la fidelidad actual no está verificada.
- Affordances no-op pueden inducir a creer que una operación fue ejecutada.
- Compose siempre publica PostgreSQL; `DB_HOST_PORT` solo cambia el puerto del host.
- Observabilidad, backup/restauración y preparación de producción son insuficientes.
- Existe un aviso histórico de bundle Vite superior a `500 kB`; el build no se ejecutó en esta auditoría.

## Próxima acción exacta

`AUTH-01`: redactar y aprobar un ADR dedicado que defina los límites de identidad, sesión, membresía de proyecto y RBAC, incluidos actor de auditoría, contexto de proyecto y pruebas de autorización. No implementar autenticación dentro de esa misma tarea.

El orden completo y sus criterios están en [ROADMAP.md](ROADMAP.md).
