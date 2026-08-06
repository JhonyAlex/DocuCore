# DocuCore

DocuCore es una plataforma de gestión documental y activos industriales. La interfaz React replica el HTML aprobado y los activos e ítems se gestionan mediante Express, Prisma y PostgreSQL.

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

`pnpm db:seed` es determinista: reinicia las identidades y restaura los datos canónicos. No lo ejecutes contra una base de datos con datos no respaldados.

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

`pnpm test:visual` captura Dashboard, Projects, Items, Documents, Calendar, Plans, Locations, History, Config y el modal de ítem en `1440x1000` oscuro, `1440x1000` claro y `1920x1080` oscuro.

Las capturas de aplicación, referencia y diff se escriben en `test-results/visual/`, directorio ignorado por Git. `pixelmatch` falla si más de `0.5%` de los píxeles difiere: es un umbral deliberadamente estricto para detectar rediseños visibles, no una aprobación automática de baselines.

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

El health endpoint es `GET /api/health` y devuelve `{"status":"ok"}`.

## Referencia y activos

`docs/reference/docucore-prototype.html` es un contrato visual protegido. No se edita ni se reemplaza. Las pruebas visuales lo sirven como archivo original de solo lectura. Los assets de la aplicación viven en `public/`.

## Dokploy

Consulta `docs/deployment/DOKPLOY.md` para el procedimiento de Compose y las variables de despliegue.

## Aviso conocido

Vite informa que el bundle de producción supera 500 kB. No bloquea el build actual; queda pendiente evaluar code splitting sin alterar la fidelidad visual aprobada.
