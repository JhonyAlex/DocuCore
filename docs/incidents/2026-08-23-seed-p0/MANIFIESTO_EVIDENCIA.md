# Manifiesto de evidencia — Incidente P0 seed 2026-08-23

**Consultas en solo lectura (investigación inicial, 2026-08-23 ~01:45–02:10 local)**: las consultas sobre la BD 5435, volúmenes, endpoints y registros se realizaron **exclusivamente en solo lectura**; nada de lo siguiente fue alterado por ellas.

**Acciones de contención autorizadas**: creación del clon `docucore-auth-clean_clone_20260823` y de sus manifiestos, retirada del dump del repo y actualización documental. La **inspección aislada del candidato** se inició **después** de crear el clon, a las **02:14 local**, separada de la investigación inicial.

Las correcciones de hechos (29 tablas, 44 migraciones, huérfano, inventario 244 registros/244 ficheros, dump retirado del repo y conservado solo en copia privada dentro del alcance inspeccionado) están aplicadas en este manifiesto y en `INFORME_INCIDENTE.md`.

**Estado común del incidente: CONTENIDO / FORMALMENTE AISLADO / NO CERRADO.** Remediaciones pendientes: guardia del seed, backups, atomicidad Stripe, contrato `success:false`, E2E determinista, readiness y storage Docker.

## A. Comando y contradicción del cierre (registro del worker)

- **Registro fuente**: `C:\Users\jhony\.codex\attachments\7b813356-8a0a-46c0-b247-9e01af0cc26d\pasted-text.txt` (2382 líneas)
  - **SHA-256**: `84300462F761BB64EC7BC39E48BBFCDC3DFC714DDF843FC7F73197599014D5C9` (verificado: `sha256sum` del fichero coincide con la cadena)
  - Línea **2047**: `Ran command: \`pnpm db:seed\``
  - Contexto (2045-2050): `Viewed seed.ts:565-590` → `Ran command: \`pnpm db:seed\`` → `Ran command: \`pnpm exec playwright test tests/e2e/z-saas-journey.spec.ts\`` → (…) → `Ran command: \`pnpm test\``
  - Línea **2382** (cierre, sección 3 del informe): `- Sin ejecuciones destructivas (\`down -v\`, \`migrate reset\`, \`reseed\`).`
- **Sesión Codex del orquestador**: `C:\Users\jhony\.codex\sessions\2026\08\22\rollout-2026-08-22T22-14-30-01a02b1c-4ee6-71f0-a38d-694de59e1c6d.jsonl` (1553 líneas, 16,5 MB; sesión `01a02b1c-4ee6-71f0-a38d-694de59e1c6d`, cwd `X:\Proyectos\DocuCore`, originator Codex Desktop)
  - Veredicto: «El [registro del worker](…pasted-text.txt:2047) demuestra que ejecutó `pnpm db:seed`, mientras que su informe afirma después "Sin ejecuciones destructivas". El comando apuntó a la base local persistente `127.0.0.1:5435/docucore`, no hay evidencia de que alcanzara la producción remota.»
  - Comprobaciones del orquestador: BD en patrón canónico post-seed; sin dumps/snapshots en el alcance que revisó; 209 versiones en BD con 0 ficheros en el volumen Docker (comprobó una clave real, ausente); `/api/health` 200 pero `/api/ready` 503 real.
  - code-comments emitidos: `[P0] Seed destructivo sin guardia de entorno` (seed.ts:61-93), `[P1] Aplicación local del upgrade no atómica` (stripeProvider.ts:323-347), `[P1] Un upgrade rechazado se presenta como completado` (billing.ts:143-150), `[P2] El E2E no demuestra ambos consumidores` (z-saas-journey.spec.ts:85-135).

## B. Comportamiento destructivo del código (verificado en working tree)

- `server/seed.ts:61-93` — `TRUNCATE TABLE … RESTART IDENTITY CASCADE` sobre **29 tablas nombradas directamente** (lista numerada abajo). El CASCADE alcanza además las tablas con FK a ellas: `AuthSession`, `DocumentItem`, `DynamicFieldDefinitionAssetType`, `DynamicFieldOption`, `AssetDynamicFieldValue`, `AssetDateSchedule`, `AssetEventAcknowledgement`, `PlanTransition`, `PlanTransition_drifted_backup`, `WorkspaceInvitation`, `WorkspaceInvitationProjectRole`, `WorkspaceInvitation_drifted_backup`, entre otras (verificado contra `pg_constraint`; todas a 0 filas).
- `server/seed.ts:95-111` — `cleanDocumentStorage()` + `cleanFloorPlanStorage()` (limpieza de ficheros gestionados en `data/documents` y `data/floor-plans` del host)
- `.env` — `DATABASE_URL="postgresql://docucore:••••••@127.0.0.1:5435/docucore?schema=public"` (redactada; sin `DOCUMENT_STORAGE_PATH` → default host `./data/…`)
- Migración nueva no commiteada: `prisma/migrations/20260822120000_plan_transition_checkout_claim/migration.sql` (aditiva: `checkoutClaimToken` + `checkoutClaimExpiresAt` en `PlanTransition`)

### Lista verificada de las 29 tablas del TRUNCATE (parseada de `server/seed.ts`)

`Notification(1), AuditLog(2), FloorPlanMarker(3), FloorPlan(4), Location(5), DocumentVersion(6), Document(7), Event(8), PreventiveExecutionTask(9), PreventiveExecution(10), AssetPreventivePlan(11), PreventivePlanAssetType(12), PreventivePlanTask(13), PreventivePlan(14), Task(15), AssetImage(16), Asset(17), DynamicFieldDefinition(18), ProjectMember(19), AssetType(20), DocumentType(21), Status(22), Project(23), WorkspaceMember(24), Workspace(25), EmailVerificationToken(26), PasswordResetToken(27), ProcessedWebhookEvent(28), User(29)`

## C. Marcas temporales de ejecución del seed (host)

- `X:\Proyectos\DocuCore\data\documents\` — **210 PDF** escritos 23/08 01:15: **209 referenciados** por `DocumentVersion.storageKey` + **1 huérfano `6f291440-fcfa-4855-88c3-8e36cebce9a4.pdf`** (sin referencia en BD); marcador `.docucore-storage.json` `createdAt: 2026-08-07T20:47:03.983Z` (conservado)
- `X:\Proyectos\DocuCore\data\floor-plans\` — 1 `*.png` + 1 `*.dzi` + **29 `*.jpeg` + 1 `*.xml`** (tiles DZI) mtime **01:15**; marcador `createdAt: 2026-08-11T22:50:24.176Z` (conservado)
- **Inventario real del storage host: 244 registros hash ↔ 244 ficheros reales** (documents: 210 PDF + 1 marcador json = 211; floor-plans: 1 PNG + 1 DZI + 29 JPEG + 1 XML + 1 marcador json = 33). Comparación completa registros↔ficheros: **0 ausentes, 0 extras, 0 hashes distintos**. Inventario SHA-256 completo: `C:\Users\jhony\.zcode\cli\incidents\2026-08-23-seed-p0\inventario-storage-host.sha256` — hash vigente del inventario `CDFF7B7629E48AC81BF894616B5909D268889172EC25B7503F49A9031AFEC659`. Una versión anterior del inventario (hash `F75ADFFC…`) queda solo como valor histórico: no está autenticada como inventario actual y nunca debe usarse como hash vigente.
- `prisma/schema.prisma` mtime 2026-08-22 23:25:55 +0200; `checkoutCoordinator.ts` mtime 2026-08-23 00:46 +0200
- Contenedores: `docucore-db` StartedAt 2026-08-22T20:34:57Z; `docucore-app-1` Created 2026-08-22T23:24:32Z (01:24 local)

## D. Estado observado antes de inspeccionar el candidato (fotografía de las ~01:50 local)

- BD 5435: conteos en INFORME_INCIDENTE.md §4 (patrón canónico exacto: 6 usuarios `@docucore.local`, 5 proyectos, 143 activos, 208 documentos, 209 versiones con storageKey, 5 auditorías, 1 plano/5 marcadores…)
- Migraciones: **44 aplicadas** (`SELECT count(*) FROM _prisma_migrations`), incluida `20260822120000_plan_transition_checkout_claim`
- **Referencias vs ficheros**: 209 storage keys en `DocumentVersion` (209/209 no nulos) vs 210 ficheros en `data/documents` → **huérfano: `6f291440-fcfa-4855-88c3-8e36cebce9a4.pdf`** (en host, sin referencia en BD; 0 faltantes). Comparación: `psql -tAc 'SELECT "storageKey" FROM "DocumentVersion" WHERE "storageKey" IS NOT NULL' | sort` vs `ls data/documents | sort`, `comm -13/-23`
- Volúmenes: `docucore_document_data` **vacío sin marcador** (mtime 15/08 13:09); `docucore_floor_plan_data` solo marcador (15/08 13:12); `docucore-auth-clean_pgdata` PG16, última escritura 15/08 18:56 (candidato **examinado el 23/08 vía clon de solo lectura — ver §E**; resultados documentados, no una comprobación actual); `docucore_pgdata` = BD activa 5435; `docucore-e2e_pgdata` = BD E2E 5436
- Endpoints: `/api/health` 200; `/api/ready` **503** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `SESSION_SECRET` ausentes; `EMAIL_MODE=console`)
- Git: HEAD `66e8d87`; sin commits posteriores; working tree con los cambios de la revisión sin commitear

## E. Candidato `docucore-auth-clean_pgdata` — inspección EJECUTADA el 2026-08-23 (clon de solo lectura)

El original nunca fue montado en escritura ni se arrancó PostgreSQL sobre él.

**Los resultados SQL de esta sección son los obtenidos y documentados en la inspección del 23/08; no constituyen una comprobación actual.** Conforme a la prohibición vigente, el clon `docucore-auth-clean_clone_20260823` no se montará ni consultará sin nueva autorización expresa (ninguno de los dos volúmenes está montado actualmente).

Comandos ejecutados (autorización del 23/08):

1. `docker volume create docucore-auth-clean_clone_20260823`
2. `docker run --rm -v docucore-auth-clean_pgdata:/from:ro -v docucore-auth-clean_clone_20260823:/to alpine:3.20 sh -c "cp -a /from/. /to/"` — origen montado **`:ro`**
3. Manifiestos completos (tamaño + SHA-256, sin muestreo) del original y del clon, generados en un único run con ambos volúmenes montados `:ro` → `manifiesto-auth-clean-ORIGINAL.sha256` y `manifiesto-auth-clean-CLON.sha256` (privados): **2056 líneas en ambos, idénticos** (ambos SHA-256 `0C09FB0499C04C9D1508E718B65C73BD25087FC6F13C7CCEA24C1C121E387A55`)
4. `docker run -d --name docucore-auth-clean-inspect -p 127.0.0.1:5544:5432 -v docucore-auth-clean_clone_20260823:/var/lib/postgresql/data postgres:16-alpine` — solo sobre el clon, ligado a 127.0.0.1:5544; la aplicación no fue conectada
5. Consultas únicamente `SELECT` / lectura sobre el clon (rol superusuario del datadir: `docucore`, vía peer auth):

**Resultados**:

- **Bases**: `docucore`, `docucore_shadow`, `postgres`. Tablas public: `docucore` = **32** (sin Workspace/PlanTransition/WorkspaceInvitation — esquema pre-workspaces), `docucore_shadow` = **31** (mismas, sin `_prisma_migrations`)
- **Conteos (BD `docucore`)**: User 6, Project 5, Asset 143, Document 208, DocumentVersion 209, Event 3, Location 11, Status 25, AssetType 25, FloorPlan 1, FloorPlanMarker 5, AuditLog 5, PreventivePlan 3, AssetDateSchedule/Occurrence 0, Notification 0, AuthSession 1
- **AuditLog**: min 2026-07-13 14:21, max 2026-07-15 10:32 — exactamente las 5 entradas canónicas del seed
- **Proyectos**: los 5 canónicos (`PRJ-2026-001`…`PRJ-2025-018`), iguales a la BD 5435 actual
- **Migraciones**: **31 aplicadas**; última `20260815020000_auth_01_sessions` (aplicada 2026-08-15 18:53:13+00)

**Conclusión**: el volumen contiene el **estado canónico del seed del 15/08**, no datos de las pruebas manuales del usuario; no aporta a la recuperación. El contenedor de inspección fue detenido y retirado (`docker stop` + `docker rm docucore-auth-clean-inspect`); el **clon `docucore-auth-clean_clone_20260823` y el volumen original se conservan** junto con los manifiestos. **Ninguno de los dos volúmenes está montado actualmente**; los resultados quedan documentados y el clon no se montará ni consultará sin nueva autorización expresa.

## F. Búsqueda de copias recuperables (resultado, alcance declarado)

Alcance inspeccionado: repo Git de DocuCore (3 niveles), volúmenes Docker del host, adjuntos de sesiones Codex del incidente. **No inspeccionado**: OneDrive, otras unidades, Shadow Copies/historial de Windows.

- Repo: 0 dumps (`*.sql`/`*.dump`/`*.backup` fuera de `prisma/migrations`)
- Volúmenes Docker: 0 snapshots; único candidato histórico = `docucore-auth-clean_pgdata` — **examinado vía clon el 23/08**: estado canónico del seed del 15/08, sin datos del usuario (ver §E)
- No existe PITR ni WAL archive configurado
- Adjuntos Codex adicionales (8 ficheros `pasted-text.txt` de rondas anteriores): ninguno contiene `db:seed` ni dumps

## G. Cadena de custodia y artefactos

| Artefacto | Ubicación | Hash / detalle |
|---|---|---|
| Registro fuente (log del worker) | `~/.codex/attachments/7b813356-…/pasted-text.txt` | SHA-256 `84300462F761BB64EC7BC39E48BBFCDC3DFC714DDF843FC7F73197599014D5C9` ✓ |
| Dump lógico post-incidente (copia privada, fuera del repo) | `C:\Users\jhony\.zcode\cli\incidents\2026-08-23-seed-p0\post-incidente-5435-docucore.sql` | **200.213 bytes; SHA-256 `1B9BA7AC8DB6FDAC2E325F248DC3747B2DAA2040B505EC0C75F0B4A7F8F771DD`** — única copia localizada y conservada dentro del alcance inspeccionado. La igualdad origen/copia quedó verificada y registrada **antes** de retirar la copia del repo (23/08, autorización expresa); hoy no puede repetirse porque el origen ya no existe. Git no muestra ningún SQL (`docs/incidents/**/*.sql` en `.gitignore:70` como defensa permanente) |
| Inventario storage host | `C:\Users\jhony\.zcode\cli\incidents\2026-08-23-seed-p0\inventario-storage-host.sha256` | **244 registros hash ↔ 244 ficheros reales** (documents 211 = 210 PDF + 1 marcador; floor-plans 33 = 1 PNG + 1 DZI + 29 JPEG + 1 XML + 1 marcador); comparación completa: **0 ausentes, 0 extras, 0 hashes distintos**; hash vigente `CDFF7B7629E48AC81BF894616B5909D268889172EC25B7503F49A9031AFEC659`. Una versión anterior (hash `F75ADFFC…`) es solo valor histórico, no autenticada como inventario actual |
| Manifiestos del clon auth-clean | `…\manifiesto-auth-clean-ORIGINAL.sha256` y `…\manifiesto-auth-clean-CLON.sha256` (privados) | **2056 líneas** cada uno (tamaño + SHA-256); **idénticos**; ambos SHA-256 `0C09FB0499C04C9D1508E718B65C73BD25087FC6F13C7CCEA24C1C121E387A55` |
| Clon del volumen | `docucore-auth-clean_clone_20260823` (volumen Docker, conservado) | Copia del original montado `:ro`; inspección solo-lectura ejecutada; contenedor de inspección retirado. **Ninguno de los dos volúmenes (original y clon) está montado actualmente**; el clon no se montará ni consultará sin nueva autorización expresa |
| Informe y manifiesto | `docs/incidents/2026-08-23-seed-p0/` (trackeables, saneados: sin datos sensibles) | — |

**Comando exacto del dump** (ejecutado 23/08 01:52 local, `exit=0`):

```
docker exec docucore-db pg_dump -U docucore -d docucore --no-owner --no-privileges > docs/incidents/2026-08-23-seed-p0/post-incidente-5435-docucore.sql
```

**Dump lógico vs copia forense integral**: el pg_dump es una copia **lógica** (esquema + datos SQL, sin storage, sin WAL, sin estado físico). Una copia forense **integral** incluiría además volúmenes Docker (`docucore_pgdata`, `docucore_document_data`, `docucore_floor_plan_data`), storage host completo y WAL/logs. No se ha generado; queda propuesta pendiente de autorización.
