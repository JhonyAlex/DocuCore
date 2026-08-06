# DocuCore

DocuCore es una plataforma en desarrollo para gestión documental y activos industriales. La aplicación replica un prototipo HTML aprobado, pero su madurez funcional es parcial: Items es la única vertical conectada de extremo a extremo a PostgreSQL; las otras ocho vistas son principalmente mocks visuales o groundwork de modelo sin API/UI funcional.

## Estado y gobernanza

- [Gobernanza para agentes](AGENTS.md)
- [Estado actual](docs/progress/CURRENT_STATUS.md)
- [Roadmap](docs/progress/ROADMAP.md)
- [Arquitectura](docs/architecture/OVERVIEW.md)
- [Pruebas y evidencia](docs/testing/TESTING.md)

No se considera el producto listo para producción. Autenticación, sesión, RBAC, aislamiento por proyecto, backup/restauración y observabilidad suficiente permanecen pendientes.

## Capacidad persistente actual

Items usa React -> Express -> Prisma -> PostgreSQL para:

- listado y detalle;
- creación y actualización;
- cambio de estado;
- filtros y paginación.

No existe endpoint `DELETE`, por lo que no es CRUD completo. La API tampoco aplica usuario, membresía, permisos ni proyecto activo; el actor de auditoría está fijado al usuario `1`.

## Inicio rápido

1. Copia `.env.example` a `.env` y verifica que `DATABASE_URL` apunte a una base local aislada.
2. Inicia PostgreSQL con `docker compose up -d db`.
3. Ejecuta `pnpm install` y `pnpm db:migrate`.
4. Ejecuta `pnpm db:seed` solo si la base es desechable y está verificada.
5. Inicia `pnpm dev` y, en otra terminal, `pnpm server`.

El cliente Vite usa `http://localhost:5173` y envía `/api` a Express en `http://localhost:3001`.

## Arquitectura

| Capa | Implementación actual |
|---|---|
| Cliente | React 18, TypeScript, Vite y Tailwind CSS |
| API | Express, Zod y Prisma |
| Datos | PostgreSQL 16 con migraciones Prisma |
| Calidad | Vitest y Playwright; evidencia visual actual pendiente de repetición controlada |
| Despliegue | Dockerfile y Docker Compose; preparación de producción parcial |

Los límites actuales, brechas y dirección modular están en [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md).

## Comandos

```bash
pnpm dev
pnpm server
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:visual
pnpm db:migrate
pnpm db:deploy
pnpm db:seed
```

Los prerrequisitos y la matriz aplicable están en [docs/testing/TESTING.md](docs/testing/TESTING.md).

> `pnpm db:seed`, E2E y visual pueden migrar y truncar datos mediante el helper actual. Solo se ejecutan contra una base aislada de desarrollo/pruebas cuya URL haya sido verificada.

## Docker

```bash
docker compose up --build -d
curl http://localhost:3001/api/health
```

Compose publica la aplicación en `${APP_PORT:-3001}` y PostgreSQL en `${DB_HOST_PORT:-5435}`. `DB_HOST_PORT` cambia el puerto del host; no desactiva la publicación de PostgreSQL.

La guía de despliegue está en [docs/deployment/DOKPLOY.md](docs/deployment/DOKPLOY.md).

## Referencia visual

`docs/reference/docucore-prototype.html` es un contrato protegido. No se modifica, sustituye ni usa para regenerar baselines que oculten diferencias. Consulta [AGENTS.md](AGENTS.md) antes de cambiar una vista.
