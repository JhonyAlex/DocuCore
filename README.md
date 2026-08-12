# DocuCore

DocuCore es una plataforma de gestión documental y activos industriales. La interfaz React replica el HTML aprobado y los activos se gestionan mediante Express, Prisma y PostgreSQL.

## Inicio rápido

1. Copia `.env.example` a `.env` y conserva `DATABASE_URL` con el puerto host `5435`.
2. Inicia PostgreSQL con `docker compose up -d db`.
3. Ejecuta `pnpm install`, `pnpm db:migrate`, `pnpm db:seed` y `pnpm dev`.
4. En otra terminal ejecuta `pnpm server` para la API en `http://localhost:3001`.

## Arquitectura

| Capa | Implementación |
|---|---|
| Cliente | React 18, TypeScript, Vite y Tailwind CSS |
| API | Express, Zod y Prisma |
| Datos | PostgreSQL 16 con migraciones Prisma |
| Calidad | Vitest, Playwright y comparación de píxeles |
| Producción | Docker Compose con aplicación y PostgreSQL |

El cliente de desarrollo usa Vite en `http://localhost:5173` y envía `/api` a Express en el puerto `3001`.

## Base de datos

El servicio Docker de desarrollo publica PostgreSQL en el puerto `5435`, no en `5432`, para no interferir con otros proyectos locales.

```bash
docker compose up -d db
pnpm db:migrate
pnpm db:seed
```

`pnpm db:seed` es determinista: reinicia las identidades, restaura los activos/eventos/documentos canónicos y crea ficheros locales mínimos para sus versiones. En este entorno pre-release puede regenerarse la base y los datos temporales.

## Documentos

`Document` es el registro lógico y `DocumentVersion` conserva cada fichero de forma inmutable. La versión con el número más alto es la actual: de ella se calculan el estado (`Vigente`, `Por vencer` o `Vencido`) y el vencimiento que alimenta los próximos eventos del activo. Los documentos sin vencimiento no generan eventos. Un documento puede estar asociado a **varios activos** (relación N-N `DocumentItem`); la ficha de cada activo refleja los documentos compartidos y sus eventos derivados.

La API expone listado paginado y filtrable, KPIs, detalle con historial, subida, nueva versión, edición de metadatos/relación, descarga actual o histórica y eliminación bajo `/api/documents`. Las subidas son `multipart/form-data`, aceptan PDF, XLSX, XLS y TXT, y se limitan a 10 MB. Los nombres internos se generan con UUID; nunca se usa el nombre proporcionado para construir una ruta.

## Comandos

```bash
pnpm dev             # Cliente Vite
pnpm server          # API Express con recarga
pnpm build           # Cliente de producción
pnpm lint            # ESLint sin warnings
pnpm typecheck       # TypeScript estricto
pnpm test            # Vitest: mapeos y validación HTTP real
pnpm test:e2e        # Playwright: aplicación y CRUD contra PostgreSQL Docker
pnpm test:visual     # Playwright: app vs. HTML protegido, sin baselines mutables
pnpm db:migrate      # Migraciones de desarrollo
pnpm db:deploy       # Migraciones pendientes, apto para despliegue
pnpm db:seed         # Datos canónicos reproducibles
```

Los flujos Playwright arrancan la API, Vite y un servidor de solo lectura del HTML de referencia. Exigen Docker para PostgreSQL, aplican `prisma migrate deploy`, siembran antes de ejecutar y vuelven a sembrar al finalizar. Usan el proyecto Compose aislado `docucore-e2e`, el contenedor `docucore-e2e-db`, el puerto `5436` y un volumen propio; no reinician ni siembran la base de desarrollo de `5435`.

## Regresión visual

`pnpm test:visual` captura Dashboard, Projects, Items, Documents, Calendar, Plans, Locations, History, Config y el modal de activo en `1440x1000` oscuro, `1440x1000` claro y `1920x1080` oscuro.

Las capturas de aplicación, referencia/baseline y diff se escriben en `test-results/visual/`, directorio ignorado por Git. `pixelmatch` falla si más de `0.5%` de los píxeles difiere: es un umbral deliberadamente estricto para detectar rediseños visibles.

Dashboard, Proyectos, Ubicaciones e Historial se comparan con el HTML protegido. Las evoluciones funcionales aprobadas de Activos, Documentos, Calendario, Planos, Configuración y ficha de activo se comparan con los baselines versionados de `tests/visual/baselines/release-01/`. Esos baselines no se actualizan durante una ejecución normal: solo se regeneran tras inspección explícita con `APPROVE_EVOLVED_VISUAL_BASELINES=1` (en PowerShell: `$env:APPROVE_EVOLVED_VISUAL_BASELINES='1'; pnpm test:visual; Remove-Item Env:APPROVE_EVOLVED_VISUAL_BASELINES`).

## Producción Docker

```bash
docker compose up --build -d
curl http://localhost:3001/api/health
```

La imagen compila `dist/`, ejecuta `prisma migrate deploy` al iniciar y sirve la SPA desde Express. Las rutas `/api/*` se resuelven antes del fallback de la SPA. Docker Compose espera el healthcheck de PostgreSQL y expone healthchecks para ambos servicios.

Variables principales:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | URL de Prisma; host `127.0.0.1:5435` en desarrollo o `db:5432` dentro de Compose |
| `DB_HOST_PORT` | Puerto host para PostgreSQL, por defecto `5435` |
| `APP_PORT` | Puerto host para la aplicación, por defecto `3001` |
| `POSTGRES_USER` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL |
| `POSTGRES_DB` | Base de datos PostgreSQL |
| `DOCUMENT_STORAGE_PATH` | Directorio local de versiones; por defecto `./data/documents` en host y `/app/data/documents` en Docker |

El health endpoint es `GET /api/health` y devuelve `{"status":"ok"}`.

Compose conserva las versiones en el volumen independiente `document_data`. Playwright usa `test-results/e2e-documents`, que se limpia antes y después de cada suite, además de su PostgreSQL aislado en `:5436`.

## Referencia y activos

`docs/reference/docucore-prototype.html` es un contrato visual protegido. No se edita ni se reemplaza. Las pruebas visuales lo sirven como archivo original de solo lectura para las superficies sin evolución aprobada; los assets de la aplicación viven en `public/`.

## Dokploy

Consulta `docs/deployment/DOKPLOY.md` para el procedimiento de Compose y las variables de despliegue.

## Aviso conocido

En runners locales de pruebas puede aparecer `DEP0205` de Node sobre `module.register()`. No se observa en la aplicación Docker ni en la consola de la UI; debe revisarse al actualizar Node/tsx.
