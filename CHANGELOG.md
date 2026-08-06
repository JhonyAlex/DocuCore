# Changelog

## Unreleased

### Added

- Módulo documental real: entidad lógica `Document`, historial inmutable `DocumentVersion`, almacenamiento local seguro, API multipart y descargas actual/históricas.
- Relación Documento-Activo desde la interfaz, edición de metadatos, nueva versión e historial accesible.
- E2E Documento ↔ Activo que verifica bytes descargados, versiones, persistencia, auditoría implícita y actualización/retiro de próximos eventos.
- Volumen Docker `document_data` y almacenamiento E2E aislado para ficheros documentales.
- Derivación de próximos eventos desde relaciones `Event`, vencimientos de `Document` y campos dinámicos de tipo fecha.
- Lista relacional de “Próximos eventos” dentro de la ficha del activo, con origen, fecha, días y urgencia calculados.
- PostgreSQL E2E aislado del volumen y puerto de desarrollo.
- Configuración real de Vitest con pruebas de mapeo visual y validación HTTP de la API.
- Suite Playwright para navegación, tema, modal, filtros, paginación y ciclo CRUD persistente.
- Comparación visual directa contra el HTML protegido con artefactos app/referencia/diff y umbral explícito.
- Imagen Docker de producción, migración al arranque, SPA fallback seguro y healthchecks Compose.
- Documentación operativa para desarrollo, Docker y Dokploy.

### Changed

- El vencimiento y estado del documento se calculan exclusivamente desde la versión más reciente; los próximos eventos del activo ya consultan esa versión.
- El alta y la edición de ítems ya no aceptan “Próximo evento”, “Fecha del evento” ni “Urgencia”; son datos derivados de solo lectura.
- La respuesta de ítems expone `nextEvents`, `documentCount` y `eventCount` calculados desde relaciones vigentes.
- Express puede servir `dist/` en producción sin capturar rutas `/api/*`.
- Las pruebas E2E reseed la base canónica antes y después de sus flujos.

### Fixed

- Se evita que respuestas antiguas de filtros sustituyan el estado más reciente del listado de activos.
- Las fechas de instalación imposibles devuelven HTTP 400 en lugar de normalizarse o provocar errores internos.
- Los modales soportan semántica de diálogo, Escape y restauración de foco.
- El listado de activos permite reintentar tras una caída temporal del API.
- La suite E2E detecta warnings de consola y cubre nueve flujos funcionales.
