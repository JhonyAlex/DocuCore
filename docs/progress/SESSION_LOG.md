# SESSION_LOG — Fase 4

## 2026-08-06

- Se añadió Vitest con pruebas para los tokens CSS del mapeador de ítems y la validación HTTP real de Express/Zod.
- Se añadió Playwright con ciclo determinista: PostgreSQL Docker, `prisma migrate deploy`, seed inicial, servidores API/Vite/referencia y seed final.
- Se añadieron pruebas E2E de navegación, breadcrumbs, tema, modal, filtros, paginación, CRUD y errores de consola.
- Se añadió comparación visual directa con el HTML protegido; no usa ni modifica baselines. Las métricas y PNG de cada diff se generan bajo `test-results/visual/`.
- Se añadió Dockerfile de producción y Compose con healthchecks, migraciones al inicio y servicio de aplicación.
- Se sustituyó el README de Vite por documentación operativa y se añadieron instrucciones Dokploy.

## Estado de regresión visual

La anotación original de 25 fallos correspondía a una ejecución intermedia y quedó superada. La ejecución final verificada ejecuta 30 pares y todos quedan bajo el umbral de 0,5%; el máximo es Activos 1440 × 1000 oscuro con 0,2862%.

## 2026-08-06 — Auditoría funcional local

- Se confirmó `main` limpio en `4d4ea9a` y se reutilizó `test/local-dogfood`.
- Se verificaron Node 26.2.0, pnpm 9.15.9, Docker 29.5.3, Compose 5.1.4 y PostgreSQL local saludable.
- Se recorrieron por navegador las nueve rutas, sus recargas, controles visibles, tema, consola y red.
- Se clasificó Activos como `VALIDADO`, Planos como `PARCIAL` y las otras siete vistas de contenido como `VISUAL MOCK`.
- Se reprodujeron y corrigieron: carrera de filtros, fechas imposibles, accesibilidad/cierre de modales, warnings de Router y recuperación tras caída del API.
- Se añadió cobertura de regresión API y E2E; el commit funcional es `68f2cde`.
- Matriz final: lint ✅, typecheck ✅, 8 unit/API ✅, 9 E2E ✅, build ✅ y 30 visuales ✅.
- Se ejecutó seed final: 142 ítems, 0 `QA-*` y 5 registros de auditoría.
- Decisión: los módulos mock se documentan en `ROADMAP.md`; no se amplió su alcance durante esta auditoría.

## 2026-08-06 — Próximos eventos relacionales

- Se eliminaron de `Item` los campos manuales `nextEventLabel`, `nextEventDate` y `nextEventUrgency`; la migración nueva no modifica la migración inicial ya aplicada.
- La API deriva `nextEvents` desde eventos incompletos, fechas de vencimiento de documentos y valores asociados a definiciones dinámicas `DATE`.
- La fecha, los días restantes/atrasados y la urgencia se calculan en tiempo de lectura; los ítems sin relaciones fechadas muestran “Sin eventos programados”.
- El formulario de alta/edición deja de solicitar los tres campos y Zod rechaza que vuelvan a enviarse manualmente.
- Se conserva “Próximo evento” en la tabla y “Próximos eventos” dentro de la ficha, incluyendo el origen de cada relación.
- Playwright usa ahora PostgreSQL aislado en `docucore-e2e-db:5436`, sin modificar el volumen persistente de desarrollo.
- Validación final: lint, typecheck, build, 14 unit/API, 9 E2E y 30 comparaciones visuales pasan; el máximo visual es Activos 1440 × 1000 oscuro con 0,3238%.
- Tras la autorización pre-release del usuario, se registró en `AGENTS.md` la libertad temporal para migraciones destructivas, reseeds y eliminación de estructuras obsoletas dentro de DocuCore.
- Se aplicó `20260806120000_derive_item_events` a PostgreSQL persistente, se regeneró el seed y se reconstruyó `docucore-app`.
- Verificación real final: 2 migraciones aplicadas, 142 ítems, 4 eventos, 3 documentos, `CNC-05` con dos próximos eventos derivados y ambos servicios Docker saludables.
