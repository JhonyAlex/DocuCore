# Report Map Online

Report Map Online es una plataforma de gestión documental, inventario de activos industriales, mantenimiento preventivo y planos interactivos con Deep Zoom.

## Inicio rápido

1. Copia `.env.example` a `.env` y conserva `DATABASE_URL` con el puerto host `5435`.
2. Inicia PostgreSQL con `docker compose up -d db`.
3. Ejecuta `pnpm install`, `pnpm db:migrate` y `pnpm dev`.
4. En otra terminal ejecuta `pnpm server` para la API en `http://localhost:3001`.

El puerto `5435` es la BD persistente de desarrollo/pruebas manuales: **nunca** debe sembrarse ni resetearse (ver «Guardia destructiva» más abajo). En el entorno desechable ya sembrado (el que usan los flujos Playwright), inicia sesión con `maria@docucore.local` y `DocuCore!2026` (sólo desarrollo). La arquitectura y el bootstrap de producción se documentan en [AUTH-01.md](./docs/progress/AUTH-01.md).

## Arquitectura

| Capa | Implementación |
|---|---|
| Cliente | React 18, TypeScript, Vite y Tailwind CSS |
| API | Express, Zod y Prisma |
| Datos | PostgreSQL 16 con migraciones Prisma |
| Calidad | Vitest, Playwright y comparación de píxeles |
| Producción | Docker Compose con aplicación y PostgreSQL |

El cliente de desarrollo usa Vite en `http://localhost:5173` y envía `/api` a Express en el puerto `3001`.

## Ámbito multi-proyecto

Las superficies operativas usan rutas canónicas como `/projects/:projectId/assets` y la API equivalente `/api/projects/:projectId/assets`. El proyecto de la URL es autoritativo: no existe proyecto actual implícito, ni endpoint operativo global con un fallback silencioso. El selector del Sidebar conserva la sección al cambiar de proyecto.

Los proyectos archivados siguen siendo consultables, pero no aceptan escrituras ordinarias hasta reactivarse. La cartera usa contadores agregados en PostgreSQL, y los códigos/números de serie de activos y los códigos de ubicación son únicos dentro de cada proyecto. Consulta [PROJECT_SCOPE.md](./docs/architecture/PROJECT_SCOPE.md) para el contrato, la clonación de configuración y los límites de carga.

## Base de datos

El servicio Docker de desarrollo publica PostgreSQL en el puerto `5435`, no en `5432`, para no interferir con otros proyectos locales.

```bash
docker compose up -d db
pnpm db:migrate
```

### Guardia destructiva (P0-REM-01)

`pnpm db:seed` y `pnpm db:reset:manual-test` son **operaciones destructivas** y solo se admiten contra el **entorno desechable de pruebas**: PostgreSQL local `127.0.0.1:5436/docucore` y rutas de almacenamiento **dentro de `test-results\`**. Ambas exigen, simultáneamente:

- `NODE_ENV` que, tras `trim().toLowerCase()`, sea exactamente `test` (la ausencia también deniega);
- `DATABASE_URL` válida con host `127.0.0.1` o `localhost`, puerto **exactamente `5436`** y base **`docucore`** con schema efectivo `public` (`?schema=public` explícito o ausente, el valor por defecto de PostgreSQL; se rechazan otros schemas, parámetros `schema` duplicados, `currentSchema` y `options` con `search_path`);
- `DOCUCORE_DESTRUCTIVE_TARGET=127.0.0.1:5436/docucore` — confirmación explícita e independiente de la URL, nunca calculada automáticamente;
- `DOCUMENT_STORAGE_PATH` y `FLOOR_PLAN_STORAGE_PATH` explícitas y realmente dentro de `<workspace>\test-results\`, sin escapes `..` ni enlaces simbólicos (la propia raíz `test-results` debe ser la ruta real del workspace: un symlink/junction que escape se rechaza).

El puerto `5435` —la BD persistente de desarrollo/pruebas manuales— está **terminantemente prohibido**: **nunca debe sembrarse ni resetearse**, ni siquiera con la confirmación presente. Playwright proporciona automáticamente estas variables para su PostgreSQL aislado en `:5436` y sus storages bajo `test-results/`.

`pnpm db:reset:manual-test` y `pnpm db:seed` ejecutan además una **prevalidación READ-ONLY de ambos storages** (ruta, marcador, owner y estructura de las entradas gestionadas) **antes de tocar la base de datos**: un marcador corrupto o de otro propietario, o una entrada con nombre de clave gestionada que no sea un archivo (p. ej. un directorio), bloquean la operación sin ejecutar el TRUNCATE. El reset es el modo estricto: exige un storage ya gestionado con marcador válido. El seed admite también un storage **nuevo** (inexistente o directorio vacío sin marcador) únicamente cuando la provisión posterior (creación del directorio y del marcador al guardar el primer fichero) puede completarse de forma segura; un directorio no vacío sin marcador se rechaza igualmente. La prevalidación elimina los errores de limpieza previsibles, pero **no garantiza atomicidad entre PostgreSQL y el filesystem**: una carrera o un fallo I/O tardío posterior al precheck (TOCTOU) puede dejar un seed/reset parcial.

La inspección de rutas es **estricta (fail-closed)**: los errores de permisos o de I/O (EACCES/EPERM y similares) en la lectura del marcador o en la inspección de los componentes del camino se propagan y bloquean la operación; **nunca** se tratan como «storage nuevo». Los storages destructivos **no atraviesan enlaces**: si cualquier componente existente del camino es un symlink/junction —válido o roto, incluso apuntando dentro del workspace— la operación se bloquea (en Windows los junction/reparse point se reportan como symlink). Una ruta inexistente solo es provisionable cuando sus ancestros existentes son **directorios normales y verificables**. La misma regla aplica a los objetos gestionados: el marcador `.docucore-storage.json` y cada clave gestionada deben ser **archivos normales** (los directorios de teselas `*_files` de planos, **directorios normales**); un symlink/junction —válido o roto— o un directorio en cualquiera de ellos bloquea la prevalidación antes de tocar la base de datos.

## Documentos

`Document` es el registro lógico y `DocumentVersion` conserva cada fichero de forma inmutable. La versión con el número más alto es la actual: de ella se calculan el estado (`Vigente`, `Por vencer` o `Vencido`) y el vencimiento que alimenta los próximos eventos del activo. Los documentos sin vencimiento no generan eventos. Un documento puede estar asociado a **varios activos** (relación N-N `DocumentItem`); la ficha de cada activo refleja los documentos compartidos y sus eventos derivados.

La API expone listado paginado y filtrable, KPIs, detalle con historial, subida, nueva versión, edición de metadatos/relación, descarga actual o histórica y eliminación bajo `/api/projects/:projectId/documents`. Las subidas son `multipart/form-data`, aceptan PDF, XLSX, XLS y TXT, y se limitan a 10 MB. Los nombres internos se generan con UUID; nunca se usa el nombre proporcionado para construir una ruta.

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
pnpm db:seed         # Datos canónicos, SOLO contra 127.0.0.1:5436 (desechable)
pnpm db:reset:manual-test # Reset a cero, SOLO contra 127.0.0.1:5436 (desechable)
pnpm db:bootstrap-admin # Crea el primer usuario sólo en una BD sin usuarios
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
| `SESSION_COOKIE_NAME` / `SESSION_TTL_DAYS` | Nombre y duración (por defecto 14 días) de la sesión HTTP-only |
| `TRUST_PROXY` | `true` detrás de Dokploy/Traefik para cookies Secure y IP correcta |
| `CORS_ORIGIN` | Orígenes UI permitidos, separados por coma, si no se usa el mismo origen |
| `BOOTSTRAP_ADMIN_*` | Variables de una sola vez para crear el primer administrador en una BD vacía |

El health endpoint es `GET /api/health` y devuelve `{"status":"ok"}`.

Compose conserva las versiones en el volumen independiente `document_data`. Playwright usa `test-results/e2e-documents`, que se limpia antes y después de cada suite, además de su PostgreSQL aislado en `:5436`.

## Referencia y activos

`docs/reference/docucore-prototype.html` es un contrato visual protegido. No se edita ni se reemplaza. Las pruebas visuales lo sirven como archivo original de solo lectura para las superficies sin evolución aprobada; los assets de la aplicación viven en `public/`.

## Dokploy

Consulta `docs/deployment/DOKPLOY.md` para el procedimiento de Compose y las variables de despliegue.

## Aviso conocido

En runners locales de pruebas puede aparecer `DEP0205` de Node sobre `module.register()`. No se observa en la aplicación Docker ni en la consola de la UI; debe revisarse al actualizar Node/tsx.
