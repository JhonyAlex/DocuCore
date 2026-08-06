# Registro de sesiones de DocuCore

## 2026-08-06: auditoría de gobernanza documental

### Objetivo

Separar gobernanza estable, estado vivo, trabajo planificado, arquitectura y operación de pruebas sin modificar funcionalidad del producto.

### Cambios documentales

- Se redujo `AGENTS.md` a reglas estables y enlaces a fuentes de verdad.
- Se corrigió `CURRENT_STATUS.md` para distinguir capacidad persistente, mock, parcial y bloqueada.
- Se creó `ROADMAP.md` con `24` módulos, dependencias, aceptación y pruebas.
- Se documentaron arquitectura vigente, límites graduales en ADR-001 y riesgos de fuentes de verdad.
- Se centralizaron comandos, evidencia y seguridad de base de pruebas en `docs/testing/TESTING.md`.
- Se ajustaron README, changelog y Dokploy para evitar sobreafirmaciones.

### Validaciones y evidencia

- Auditoría delegada: `pnpm lint` correcto.
- Auditoría delegada: `pnpm typecheck` correcto.
- Auditoría delegada: `pnpm test` correcto, `2` archivos y `7/7` pruebas.
- Auditoría delegada: `docker compose config --quiet` correcto.
- No se ejecutaron `pnpm build`, `pnpm test:e2e`, `pnpm test:visual`, migraciones, seed ni runtime Docker.
- Se verificaron rama `feat/docucore-implementation`, seguimiento de origin y HEAD previo `69dc2ae`.
- Se verificó el HTML protegido: hash `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`, `126104` bytes y `1800` líneas.

### Decisiones

- `CURRENT_STATUS.md` es la única verdad viva; este log conserva historia y contradicciones.
- Se acepta modularización gradual mediante ADR-001; no se acepta una reescritura masiva.
- Identidad/sesión/RBAC y almacenamiento documental requieren ADR futuros; no se eligieron soluciones.
- La próxima tarea exacta es `AUTH-01`.

### Pendientes y riesgos

- La evidencia visual histórica es contradictoria: una afirmación indicó `30/30`, mientras la entrada histórica inferior registró `5` aprobados y `25` fallidos. Sin reportes retenidos, ninguna cifra se adopta como verdad vigente.
- `tests/helpers/database.ts` puede migrar y ejecutar un seed destructivo sobre `DATABASE_URL` sin una guarda de base de pruebas.
- Items carece de aislamiento por proyecto, autenticación/RBAC, actor real de auditoría y endpoint `DELETE`.
- `gh` no está instalado; el PR permanece bloqueado. No se hizo un push nuevo.

Commit: `Sin commit (no solicitado)`.

## 2026-08-06: registro histórico de calidad y despliegue

- Se añadió Vitest con pruebas para los tokens CSS del mapeador de ítems y la validación HTTP real de Express/Zod.
- Se añadió Playwright con ciclo determinista: PostgreSQL Docker, `prisma migrate deploy`, seed inicial, servidores API/Vite/referencia y seed final.
- Se añadieron pruebas E2E de navegación, breadcrumbs, tema, modal, filtros, paginación, escrituras persistentes y errores de consola.
- Se añadió comparación visual directa con el HTML protegido; las métricas y PNG se generaban bajo `test-results/visual/`.
- Se añadió Dockerfile de producción y Compose con healthchecks, migraciones al inicio y servicio de aplicación.
- Se sustituyó el README de Vite por documentación operativa y se añadieron instrucciones Dokploy.

### Evidencia visual histórica contradictoria

Esta sesión registró que `pnpm test:visual` ejecutó `30` pares, con `5` dentro del umbral de `0.5%` y `25` fallidos. Posteriormente, otros documentos afirmaron `30/30`. Como `test-results/visual/` está ignorado y no se retuvieron reportes, la auditoría documental del mismo día marca el resultado como no verificado hasta una repetición controlada. Se conserva esta entrada para no borrar evidencia útil.
