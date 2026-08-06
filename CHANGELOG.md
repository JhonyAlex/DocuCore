# Changelog

## Unreleased

### Added

- Configuración real de Vitest con pruebas de mapeo visual y validación HTTP de la API.
- Suite Playwright para navegación, tema, modal, filtros, paginación y ciclo CRUD persistente.
- Comparación visual directa contra el HTML protegido con artefactos app/referencia/diff y umbral explícito.
- Imagen Docker de producción, migración al arranque, SPA fallback seguro y healthchecks Compose.
- Documentación operativa para desarrollo, Docker y Dokploy.

### Changed

- Express puede servir `dist/` en producción sin capturar rutas `/api/*`.
- Las pruebas E2E reseed la base canónica antes y después de sus flujos.

### Fixed

- Se evita que respuestas antiguas de filtros sustituyan el estado más reciente del listado de activos.
- Las fechas de instalación imposibles devuelven HTTP 400 en lugar de normalizarse o provocar errores internos.
- Los modales soportan semántica de diálogo, Escape y restauración de foco.
- El listado de activos permite reintentar tras una caída temporal del API.
- La suite E2E detecta warnings de consola y cubre nueve flujos funcionales.
