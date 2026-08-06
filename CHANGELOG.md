# Changelog

## Unreleased

### Documentation

- Auditoría de gobernanza que separa reglas estables, estado vivo, roadmap de 24 módulos, arquitectura y operación de pruebas.
- Corrección de afirmaciones de madurez: Items es la única vertical persistente y no incluye `DELETE`, autenticación, RBAC ni aislamiento por proyecto.
- Registro explícito de la evidencia visual histórica contradictoria y del riesgo destructivo del helper de base E2E.
- ADR-001 aceptado para límites modulares graduales, sin reescritura masiva ni decisiones implícitas de autenticación o almacenamiento.
- Aclaración de que `DB_HOST_PORT` selecciona el puerto publicado de PostgreSQL y no hace opcional su exposición en Compose.

Esta auditoría no cambia funcionalidad del producto.

### Added

- Configuración real de Vitest con pruebas de mapeo visual y validación HTTP de la API.
- Suite Playwright para navegación, tema, modal, filtros, paginación y flujos persistentes de creación, lectura, actualización y transición de estado.
- Comparación visual directa contra el HTML protegido con artefactos app/referencia/diff y umbral explícito.
- Imagen Docker de producción, migración al arranque, SPA fallback seguro y healthchecks Compose.
- Documentación operativa para desarrollo, Docker y Dokploy.

### Changed

- Express puede servir `dist/` en producción sin capturar rutas `/api/*`.
- Las pruebas E2E reseed la base canónica antes y después de sus flujos.
