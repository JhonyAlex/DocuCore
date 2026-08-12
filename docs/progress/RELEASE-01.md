# RELEASE-01 — Cierre de estabilización y contrato visual

**Base auditada:** `9cab1df` (`main` antes de este cierre)
**Fecha:** 2026-08-12
**Alcance:** estabilización de runtime, seed, interacciones de Planos, carga diferida y formalización del contrato visual. No se añadió funcionalidad de producto ni se modificó el HTML protegido.

## Cambios incluidos

- Docker copia los módulos compartidos y `public/` necesarios en runtime; el build y el arranque ya no dependen de archivos ausentes.
- El seed genera PDFs válidos, limpia almacenamiento gestionado huérfano y conserva el dataset canónico.
- Los popovers de colocación y marcador de Planos cierran con Escape; los filtros de Activos no muestran chips iniciales inexistentes; los tests cubren JPEG y WebP.
- Las rutas pesadas y la previsualización de plano se cargan bajo demanda. El entry inicial queda en 401,99 kB (119,08 kB gzip).
- Los marcadores de Planos usan captura Pointer nativa y liberan la captura pendiente antes de destruir el visor. Se eliminan las carreras de OpenSeadragon detectadas al navegar, recargar y retirar marcadores, sin relajar las aserciones de consola.

## Contrato visual RELEASE-01

- El HTML protegido sigue siendo la referencia de Dashboard, Proyectos, Calendario, Ubicaciones e Historial.
- Activos, Documentos, Planos, Configuración y ficha de activo usan los 15 PNG aprobados en `tests/visual/baselines/release-01/` (3 viewport/tema por superficie).
- El umbral sigue fijado en **0,5 %** para todos los pares. Los baselines no se reescriben en una ejecución normal.
- La aprobación requiere expresamente `APPROVE_EVOLVED_VISUAL_BASELINES=1`. Durante el cierre se corrigieron capturas tomadas antes de terminar la carga: Documentos oscuro 1440×1000 ahora espera el documento canónico `Certificado ITV 2025`; Planos espera la señal nativa de carga completa del visor, el marcador compuesto y dos frames de renderizado antes de capturar las tres variantes. Cada PNG regenerado fue inspeccionado antes de aprobarse.

## Evidencia final

| Comprobación | Resultado |
|---|---|
| `pnpm lint` | OK |
| `pnpm typecheck` | OK |
| `pnpm build` | OK |
| `pnpm test` | 180/180 OK |
| `pnpm test:e2e` | 60/60 OK |
| `pnpm test:visual` | 30/30 OK |
| `pnpm prisma generate` | OK |
| `pnpm prisma migrate status` | 23 migraciones, schema al día |
| `pnpm db:seed` | 5 proyectos, 11 ubicaciones, 142 activos, 207 documentos, 1 plano, 1 versión y 5 marcadores |
| Docker | `docker compose up --build -d --wait` OK; `app` y `db` healthy; `/api/health` = `ok` |
| HTML protegido | SHA-256 `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112` |

## Advertencias y deuda conocida

- Node/tsx emite `DEP0205` (`module.register()` deprecado) en runners locales; no hay error de aplicación ni afecta al contenedor de producción.
- El worker de pdf.js (1,26 MB) y el visor de Planos se mantienen como chunks diferidos. El bundle inicial ya no emite el aviso de Vite por superar 500 kB.
- LOC-01 continúa en revisión funcional de aceptación manual; no representa una regresión de esta entrega.
