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
