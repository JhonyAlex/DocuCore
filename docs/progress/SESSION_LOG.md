# SESSION_LOG — Fase 4

## 2026-08-06

- Se añadió Vitest con pruebas para los tokens CSS del mapeador de ítems y la validación HTTP real de Express/Zod.
- Se añadió Playwright con ciclo determinista: PostgreSQL Docker, `prisma migrate deploy`, seed inicial, servidores API/Vite/referencia y seed final.
- Se añadieron pruebas E2E de navegación, breadcrumbs, tema, modal, filtros, paginación, CRUD y errores de consola.
- Se añadió comparación visual directa con el HTML protegido; no usa ni modifica baselines. Las métricas y PNG de cada diff se generan bajo `test-results/visual/`.
- Se añadió Dockerfile de producción y Compose con healthchecks, migraciones al inicio y servicio de aplicación.
- Se sustituyó el README de Vite por documentación operativa y se añadieron instrucciones Dokploy.

## Estado de regresión visual

`pnpm test:visual` ejecutó los 30 pares requeridos. Cinco quedaron dentro del umbral de 0.5%: Calendario en los tres tamaños/temas, Planos a 1920×1080 oscuro y Ubicaciones a 1920×1080 oscuro. Los otros 25 pares fallaron y conservaron sus PNG app/referencia/diff bajo `test-results/visual/`. No se declara fidelidad pixel-perfect.
