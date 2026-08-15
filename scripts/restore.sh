#!/usr/bin/env bash
# ==============================================================================
# Script de Restauración para Report Map Online
# Ejecutado en el host Docker
# Restaura base de datos y archivos desde un directorio de backup específico.
# ==============================================================================

set -euo pipefail
export MSYS2_ARG_CONV_EXCL="*"
export MSYS_NO_PATHCONV=1

if [ "$#" -lt 1 ]; then
    echo "Uso: $0 /ruta/al/backup/YYYYMMDD_HHMMSS [--confirm]"
    echo "Nota: La restauración reemplaza los datos actuales en el entorno destino."
    exit 1
fi

BACKUP_SOURCE="$1"
CONFIRM_FLAG="${2:-${CONFIRM_RESTORE:-false}}"

if [ "${CONFIRM_FLAG}" != "--confirm" ] && [ "${CONFIRM_FLAG}" != "true" ]; then
    echo "ADVERTENCIA DE SEGURIDAD: La restauración sobreescribirá la base de datos."
    echo "Para proceder, añade el parámetro --confirm o define CONFIRM_RESTORE=true."
    exit 1
fi

APP_CONTAINER="${APP_CONTAINER:-reportmap-app-1}"
DB_CONTAINER="${DB_CONTAINER:-reportmap-db-1}"
DB_USER="${DB_USER:-docucore}"
DB_NAME="${DB_NAME:-docucore}"

echo "[$(date -Iseconds)] Iniciando restauración desde ${BACKUP_SOURCE}..."

# Verificar que los contenedores existen y están en ejecución
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "ERROR: El contenedor de base de datos '${DB_CONTAINER}' no está en ejecución." >&2
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
    echo "ERROR: El contenedor de aplicación '${APP_CONTAINER}' no está en ejecución." >&2
    exit 1
fi

# 1. Validar integridad de checksums
echo "[$(date -Iseconds)] Verificando checksums..."
if [ -f "${BACKUP_SOURCE}/SHA256SUMS" ]; then
    (cd "${BACKUP_SOURCE}" && sha256sum -c SHA256SUMS)
else
    echo "AVISO: No se encontró SHA256SUMS en el directorio de backup."
fi

# 2. Restaurar PostgreSQL mediante stream directo
echo "[$(date -Iseconds)] Restaurando base de datos PostgreSQL en ${DB_CONTAINER}..."
docker exec -i "${DB_CONTAINER}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists < "${BACKUP_SOURCE}/database.dump" || true

# 3. Restaurar documentos
if [ -f "${BACKUP_SOURCE}/documents.tar.gz" ]; then
    echo "[$(date -Iseconds)] Restaurando documentos en ${APP_CONTAINER}..."
    docker exec "${APP_CONTAINER}" mkdir -p "/app/storage/documents"
    tar -xzf "${BACKUP_SOURCE}/documents.tar.gz" -C "${BACKUP_SOURCE}"
    docker cp "${BACKUP_SOURCE}/documents/." "${APP_CONTAINER}:/app/storage/documents/"
    rm -rf "${BACKUP_SOURCE}/documents"
fi

# 4. Restaurar planos
if [ -f "${BACKUP_SOURCE}/floor_plans.tar.gz" ]; then
    echo "[$(date -Iseconds)] Restaurando planos en ${APP_CONTAINER}..."
    docker exec "${APP_CONTAINER}" mkdir -p "/app/storage/floor-plans"
    tar -xzf "${BACKUP_SOURCE}/floor_plans.tar.gz" -C "${BACKUP_SOURCE}"
    docker cp "${BACKUP_SOURCE}/floor-plans/." "${APP_CONTAINER}:/app/storage/floor-plans/"
    rm -rf "${BACKUP_SOURCE}/floor-plans"
fi

echo "[$(date -Iseconds)] Restauración completada con éxito."
