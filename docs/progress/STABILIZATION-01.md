# STABILIZATION-01 — estabilización de PLAN-01…04 y ASSET-COHERENCE-01

**Fecha:** 2026-08-12
**Rama auditada:** `main`
**HEAD:** `9cab1df` — `docs: record PLAN-03, PLAN-04 and ASSET-COHERENCE-01 modules`

## Dictamen

La aceptación **funcional y técnica** es apta: instalación reproducible, migraciones, seed, aplicación Docker, pruebas unitarias/API y E2E están en verde. La aceptación **visual contra el HTML protegido** no está cerrada: 15 de 30 objetivos exceden el 0,5 %, todos clasificados como evolución intencional (B), por lo que requiere decidir y versionar explícitamente un nuevo contrato visual; no se ha elevado el umbral, alterado snapshots ni modificado el HTML protegido.

El HTML se verificó antes y después de la auditoría: SHA-256 `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`.

## Base revisada

- HEAD contiene `81227d5` (ASSET-COHERENCE-01), `a4f068a` (PLAN-03/04) y `be52c0f` (PLAN-01/02).
- Se revisaron `AGENTS.md`, PLAN-01, PLAN-02, PLAN-03, PLAN-04, ASSET-COHERENCE-01 y CHANGELOG antes de editar.
- Búsqueda de legado: no quedan usos funcionales de `hasPreventive`, el tipo dinámico antiguo `PREVENTIVE`, «Próximo mantenimiento», «Mant. preventivo» ni el antiguo PATCH genérico de campos dinámicos del activo. Las únicas coincidencias son migraciones y pruebas de retirada, que son evidencia histórica intencional.

## Problemas reales encontrados y correcciones

| Problema reproducido | Corrección | Cobertura añadida / evidencia |
| --- | --- | --- |
| La imagen Docker arrancaba en bucle: faltaba `shared/assetIconCatalog` en runtime; el seed también requiere `public/floor-plan.png`. | Runtime copia `shared/` y `public/`. | `docker compose up --build -d --wait`, health `ok`, seed en el contenedor. |
| El seed declaraba PDF, pero almacenaba texto; la previsualización de documentos seed fallaba. | Generador de PDF mínimo válido (`server/lib/seedPdf.ts`) para todas las versiones canónicas. | Prueba estructural de PDF y comprobación visual en Docker: canvas PDF visible. |
| Los popovers de marcador y de colocación de Planos no cerraban con Escape. | Listener de teclado con limpieza en ambos popovers. | E2E de Planos y comprobación manual de Escape sobre la imagen Docker. |
| Activos mostraba chips «Tipo: Máquina» y «Estado: Activo» sin filtros aplicados. | Los chips se derivan exclusivamente de filtros reales. | E2E de filtros iniciales y comprobación manual sobre Docker. |
| No había cobertura explícita de fuentes JPEG/WebP de plano. | Prueba API con Sharp para JPEG y WebP, preservando MIME y versión inicial. | `tests/api/floorPlans.test.ts`. |
| El bundle inicial incorporaba vistas pesadas. | Carga diferida por ruta y de la pestaña Plano de la ficha. | Build sin warning de chunk principal; índice local: 880,22 kB → 401,99 kB (226,60 → 119,09 kB gzip). |

## Aceptación funcional

Se comprobó con la aplicación Docker real el arranque, navegación, ficha de activo, preventivos, documentos y Planos. En particular:

- Creación de un plano PNG, visualización DZI, capas, búsqueda, colocación contextual, undo/redo, guardado y persistencia tras recarga.
- Popover de marcador, foco por búsqueda y por URL directa `/plans?assetId=1&planId=1`, y cierre con Escape. La ficha abre el preview DZI centrado y el enlace reproducible.
- PDF seed renderizado en canvas desde «Gestionar documento»; cierre del visor sin cerrar el diálogo padre.
- Ficha de CNC-05: un único «Editar», eventos preventivos sin checklist duplicado; confirmar «Completar todas», completar preventivo y generar la siguiente ejecución.
- Catálogo de tipos: apertura, grupos y búsqueda de iconos. La creación/edición, propagación de icono y marcadores se verifican también en E2E/API.

La cobertura automatizada complementa las variantes que requieren ficheros generados en memoria y ciclos destructivos aislados: importación PDF con selección de página/región, JPEG/WebP, versiones, zoom/pan/drag, múltiples colocaciones, traslado de activo que elimina el marcador inválido, LOD, documentos imagen/PDF/xlsx, preventivos, fechas dinámicas, tipos, ubicaciones y papelera.

No se observaron errores de consola de la aplicación, 4xx/5xx inesperados ni errores en logs del contenedor durante los flujos manuales. El servidor Docker queda `healthy` y registra las 23 migraciones sin pendientes.

## Base limpia y datos reproducibles

Se recrearon expresamente las BDs de auditoría `docucore_stabilization_01` y su shadow, sin tocar la BD de trabajo, y se aplicaron las 23 migraciones desde cero.

| Comprobación | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` y `pnpm prisma generate` | OK |
| `pnpm db:deploy` desde BD vacía | 23/23 aplicadas |
| `pnpm prisma migrate status` | Schema al día |
| `prisma migrate diff` BD → schema y migraciones → schema | Sin diferencias |
| `pnpm db:seed` limpio | OK |
| Conteos tras seed | 142 activos, 207 documentos lógicos, 1 plano, 1 versión, 5 marcadores, 1 asignación preventiva activa |
| Docker final | app y PostgreSQL `healthy`; `/api/health` = `ok` |

## Pruebas finales ejecutadas

| Comando | Resultado actual |
| --- | --- |
| `pnpm lint` | OK |
| `pnpm typecheck` | OK |
| `pnpm build` | OK; sin aviso de chunk de aplicación >500 kB |
| `pnpm test` | **25 archivos, 180 pruebas OK** |
| `pnpm test:e2e` | **60/60 OK** |
| `pnpm test:visual` | 15/30 OK; 15 B pendientes, exit 1 por umbral protegido |

## Visual: resultado y clasificación

No se usaron conteos históricos como baseline. La primera ejecución visual realizada ya incluía las correcciones de coherencia; la comparación reproducida antes/después del code splitting confirma que éste no introdujo una regresión visual.

| Momento | OK | Fuera de 0,5 % | Lectura |
| --- | ---: | ---: | --- |
| Antes del rerun final (UI ya corregida) | 15/30 | 15/30 | Clasificación B de los cinco objetivos funcionales. |
| Rerun final | 15/30 | 15/30 | Misma clasificación; no hay categoría A nueva. |

Las pequeñas variaciones de píxel entre ejecuciones no se usan como evidencia de cambio visual; se conserva el resultado actual. No se detectó una diferencia de categoría A nueva en las comparativas inspeccionadas.

| Captura | Diferencia actual | Categoría B: motivo concreto |
| --- | ---: | --- |
| items 1440×1000 dark | 4,2760 % | Renombrado Activos, papelera, selección/acciones reales y eliminación de chips falsos. |
| items 1440×1000 light | 3,7088 % | Igual que la variante dark. |
| items 1920×1080 dark | 2,9254 % | Igual que la variante dark. |
| documents 1440×1000 dark | 2,1346 % | N-N de activos, periodicidad, selección y menú de acciones funcionales. |
| documents 1440×1000 light | 1,6768 % | Igual que la variante dark. |
| documents 1920×1080 dark | 1,5621 % | Igual que la variante dark. |
| plans 1440×1000 dark | 14,6496 % | Visor DZI, capas y búsqueda/interacción directa sustituyen al plano estático. |
| plans 1440×1000 light | 8,0840 % | Igual que la variante dark. |
| plans 1920×1080 dark | 6,9538 % | Igual que la variante dark. |
| config 1440×1000 dark | 2,0679 % | Superficies reales de tipos, dinámicos y preventivos. |
| config 1440×1000 light | 1,5310 % | Igual que la variante dark. |
| config 1920×1080 dark | 1,1651 % | Igual que la variante dark. |
| item-modal 1440×1000 dark | 3,3790 % | Modal anclado, pestañas funcionales y selector de estado directo. |
| item-modal 1440×1000 light | 14,6634 % | Igual; el anclaje superior difiere especialmente del prototipo centrado. |
| item-modal 1920×1080 dark | 2,7466 % | Igual que la variante dark. |

## Warnings y deuda pendiente

1. **P1 — contrato visual:** decidir explícitamente los nuevos baselines para las 15 capturas B; hasta entonces `pnpm test:visual` debe seguir bloqueando una aceptación visual estricta.
2. **P2 — aviso de Node en runners locales:** E2E/visual emiten `DEP0205` sobre `module.register()` desde el loader/runtimes de prueba. No aparece en el log del contenedor Node 22 ni en la consola de la aplicación. Investigar al actualizar Node/tsx, sin ocultarlo.
3. **P2 — documentación de estado:** `AGENTS.md` conserva referencias históricas a Planos como mock y a resultados visuales antiguos; actualizarlo junto con la decisión de baseline para no presentar estado contradictorio.
4. **P3 — peso diferido:** `pdf.worker` (1,26 MB) y el chunk PDF (479,35 kB) se cargan solo al previsualizar. No bloquean la carga inicial ni producen warning ahora; vigilar si aumenta la superficie documental.

No se modificaron migraciones aplicadas, el HTML protegido ni el umbral del 0,5 %.

## Cierre RELEASE-01 — contrato visual aprobado y versionado

Tras una nueva captura limpia e inspección visual de los 15 objetivos de categoría B, se aprobó su estado funcional de reposo: Activos, Documentos, Planos, Configuración y ficha de activo en `1440×1000` dark/light y `1920×1080` dark. No había cortes, solapamientos, estados de carga, popovers abiertos, diferencias de timing ni incoherencias de tema.

Se versionaron exclusivamente esos 15 baselines en `tests/visual/baselines/release-01/`. La comparación mantiene `pixelmatch` y el umbral fijo del **0,5 %**: los 15 objetivos no evolucionados siguen contra `docs/reference/docucore-prototype.html` y los 15 evolucionados contra su baseline aprobado. La actualización está protegida detrás de `APPROVE_EVOLVED_VISUAL_BASELINES=1`; una ejecución normal nunca reescribe el contrato.

Con este contrato, `pnpm test:visual` alcanza **30/30**. La deuda P1 de baseline y la contradicción documental P2 quedan cerradas; permanece únicamente el aviso local `DEP0205` de Node/tsx y la vigilancia del peso diferido de PDF.
