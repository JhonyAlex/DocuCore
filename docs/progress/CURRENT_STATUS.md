# CURRENT_STATUS — DocuCore

## Fecha: 2026-08-06

## Estado verificado

- `main`: `4d4ea9a` (`Merge pull request #1 from JhonyAlex/feat/docucore-implementation`). El PR inicial ya está fusionado.
- Rama de auditoría: `test/local-dogfood`.
- Commit funcional de la auditoría: `68f2cde` (`fix(items): harden audited asset workflows`).
- HTML protegido: 126104 bytes; SHA-256 `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`.
- PostgreSQL local: `127.0.0.1:5435/docucore`, contenedor `docucore-db` saludable.
- Base regenerada al finalizar: 142 ítems, 4 eventos relacionados, 3 documentos fechados, 0 códigos `QA-*` y 5 auditorías canónicas.
- Regla pre-release activa: las migraciones destructivas, reseeds y retiradas de estructuras obsoletas necesarias están autorizadas hasta revocación expresa del usuario.

## Entorno auditado

| Componente | Versión/estado |
|---|---|
| Node | 26.2.0 |
| pnpm | 9.15.9, coincide con `packageManager` |
| Docker | 29.5.3 |
| Docker Compose | 5.1.4 |
| Migraciones | 2 aplicadas, 0 pendientes |
| Seed | Reproducible y verificado |
| API | Healthcheck `{"status":"ok"}` y `/api/items` real con `nextEvents` derivados |
| Frontend | Imagen Docker reconstruida y servicio de producción saludable en `:3001` |

## Inventario funcional real

| Vista | Estado | Evidencia y alcance |
|---|---|---|
| Panel general | VISUAL MOCK | Ruta, tema y fidelidad validados; KPIs, periodo, exportación y accesos son demostrativos. |
| Proyectos | VISUAL MOCK | Ruta y tarjetas validadas; alta/apertura no tienen persistencia. |
| Activos e ítems | VALIDADO | PostgreSQL, filtros, paginación, alta, edición, estado, persistencia, auditoría, errores y reintento. |
| Documentos | VISUAL MOCK | Tabla y fidelidad validadas; subida/descarga no tienen backend funcional. |
| Calendario | VISUAL MOCK | Calendario y fidelidad validados; vistas/eventos no persisten. |
| Planos | PARCIAL | Marcadores arrastrables en memoria; guardar, deshacer/rehacer, capas y versiones no persisten. |
| Ubicaciones | VISUAL MOCK | Jerarquía y enlaces visuales; CRUD y navegación de plano no están conectados. |
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

## Matriz automática final

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

- `ITEM-03` ya deriva próximos eventos en lectura y está validado con relaciones canónicas, pero sigue `PARCIAL` hasta disponer de CRUD funcional para documentos, calendario y campos dinámicos que permita crear todas las relaciones desde la interfaz.
- El bundle de producción es de 569,03 kB y mantiene el aviso no bloqueante de Vite sobre chunks de más de 500 kB.
- Node 26 muestra `DEP0205` desde el cargador de `tsx`; no falla las pruebas, pero conviene validar el proyecto también con la versión LTS soportada.
- Los controles declarados como `VISUAL MOCK` o `PARCIAL` no deben presentarse como funcionales.
- El formulario actual no permite seleccionar responsable ni expone campos dinámicos, aunque el modelo/API almacenan esos identificadores/datos.

## Próximo paso exacto

1. Revisar y publicar los cambios pendientes del árbol de trabajo.
2. Priorizar `DOC-01`, `CAL-01` o `ITEM-02` para crear desde la interfaz las relaciones que alimentan `ITEM-03`.
3. Evaluar code splitting en Node local y una matriz CI con Node LTS sin alterar el contrato visual.
