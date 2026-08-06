# Despliegue Dokploy

Dokploy puede desplegar DocuCore directamente desde el `docker-compose.yml` del repositorio. El stack contiene `app` y `db`; no requiere un servidor Vite externo.

## Configuración

1. Crea una aplicación Compose desde el repositorio y selecciona `docker-compose.yml`.
2. Define `POSTGRES_PASSWORD` con un valor fuerte y persistente.
3. Define `APP_PORT` solo si el proxy o el host requieren un puerto distinto de `3001`.
4. Define `DB_HOST_PORT` para elegir el puerto de PostgreSQL publicado en el host; Compose siempre publica ese puerto. El servicio `app` usa `db:5432` internamente y no depende de este valor.
5. Despliega el stack.

## Variables

| Variable | Requerida | Valor por defecto | Uso |
|---|---|---|---|
| `POSTGRES_USER` | No | `docucore` | Usuario de la base de datos |
| `POSTGRES_PASSWORD` | Sí en producción | `docucore` | Contraseña de PostgreSQL |
| `POSTGRES_DB` | No | `docucore` | Nombre de base de datos |
| `APP_PORT` | No | `3001` | Puerto host de Express y SPA |
| `DB_HOST_PORT` | No | `5435` | Puerto de PostgreSQL publicado en el host; no desactiva la publicación |

No definas `DATABASE_URL` para el servicio `app` en Dokploy salvo que reemplaces intencionalmente la base incluida: Compose la configura con el hostname interno `db` y el puerto `5432`.

## Ciclo de arranque

1. PostgreSQL inicia con un volumen nombrado `pgdata` y debe superar `pg_isready`.
2. `app` espera el estado saludable de `db`.
3. El contenedor de aplicación ejecuta `prisma migrate deploy`.
4. Express inicia en el puerto `3001`, sirve `dist/` y expone `GET /api/health`.

Las migraciones se aplican, pero el contenedor no ejecuta el seed. Realiza una carga inicial controlada desde una consola de la aplicación solo para entornos nuevos:

```bash
pnpm db:seed
```

El seed elimina y reconstruye los datos, por lo que no debe ejecutarse sobre producción con información real.

## Verificación

Tras el despliegue, configura el healthcheck HTTP de Dokploy en:

```text
/api/health
```

La respuesta esperada es HTTP 200 con `{"status":"ok"}`. Revisa los logs de `app` si `prisma migrate deploy` falla antes de que Express escuche el puerto.
