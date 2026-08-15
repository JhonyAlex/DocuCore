# Plan de Recuperación ante Desastres (Disaster Recovery) — Report Map Online

Este plan describe las acciones a seguir ante pérdidas de datos, fallos de infraestructura o corrupción en el entorno de producción de **Report Map Online**.

---

## 1. Objetivos de Recuperación

- **RPO (Recovery Point Objective)**: Menor a **6 horas** (tiempo transcurrido desde el último backup programado).
- **RTO (Recovery Time Objective)**: Menor a **30 minutos** (tiempo necesario para restaurar la base de datos y archivos en un entorno limpio).

---

## 2. Procedimiento de Restauración Paso a Paso

### Paso 1: Identificar el Backup a Restaurar

Listar los backups disponibles ordenados por fecha:

```bash
ls -la /backups/
```

Seleccionar la carpeta del backup deseado, por ejemplo `/backups/20260816_120000`.

### Paso 2: Detener Temporalmente el Contenedor de Aplicación

Para evitar escrituras concurrentes durante la restauración:

```bash
docker compose -f docker-compose.prod.yml stop app
```

### Paso 3: Ejecutar el Script de Restauración

```bash
./scripts/restore.sh /backups/20260816_120000 --confirm
```

El script:
1. Comprobará la integridad del archivo `SHA256SUMS`.
2. Restaurará el esquema y los datos completos de PostgreSQL (`pg_restore --clean`).
3. Descomprimirá los volúmenes de documentos y planos en sus directorios correspondientes.

### Paso 4: Levantar la Aplicación y Ejecutar Migraciones

```bash
docker compose -f docker-compose.prod.yml start app
docker exec -it reportmap-app-1 pnpm db:deploy
```

### Paso 5: Validar la Salud del Sistema

```bash
curl -i https://report-map.online/api/ready
```

Comprobar que responde `HTTP 200` con `{"status":"ready","database":"connected"}`. Iniciar sesión en la plataforma y comprobar la coherencia de los proyectos y documentos.
