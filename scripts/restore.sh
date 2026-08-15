#!/usr/bin/env bash
# ==============================================================================
# Script de Restauración para Report Map Online
# Ejecutado en el host Docker
# Restaura base de datos y archivos desde un directorio de backup específico.
# ==============================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Uso: $0 /ruta/al/backup/YYYYMMDD_HHMMSS"
    exit 1
fi

BACKUP_SOURCE="$1"
APP_CONTAINER="${APP_CONTAINER:-reportmap-app-1}"
DB_CONTAINER="${DB_CONTAINER:-reportmap-db-1}"
DB_USER="${DB_USER:-docucore}"
DB_NAME="${DB_NAME:-docucore}"

echo "[$(date -Iseconds)] Iniciando restauración desde ${BACKUP_SOURCE}..."

# 1. Validar integridad de checksums
echo "[$(date -Iseconds)] Verificando checksums..."
(cd "${BACKUP_SOURCE}" && sha256sum -c SHA256SUMS)

# 2. Restaurar PostgreSQL
echo "[$(date -Iseconds)] Restaurando base de datos PostgreSQL en ${DB_CONTAINER}..."
docker cp "${BACKUP_SOURCE}/database.dump" "${DB_CONTAINER}:/tmp/restore.dump"
docker exec "${DB_CONTAINER}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists -v "/tmp/restore.dump" || true
docker exec "${DB_CONTAINER}" rm -f "/tmp/restore.dump"

# 3. Restaurar documentos
if [ -f "${BACKUP_SOURCE}/documents.tar.gz" ]; then
    echo "[$(date -Iseconds)] Restaurando documentos en ${APP_CONTAINER}..."
    TEMP_EXTRACT="$(mktemp -d)"
    tar -xzf "${BACKUP_SOURCE}/documents.tar.gz" -C "${TEMP_EXTRACT}"
    docker exec "${APP_CONTAINER}" mkdir -p "/app/storage/documents"
    docker cp "${TEMP_EXTRACT}/documents/." "${APP_CONTAINER}:/app/storage/documents/"
    rm -rf "${TEMP_EXTRACT}"
fi

# 4. Restaurar planos
if [ -f "${BACKUP_SOURCE}/floor_plans.tar.gz" ]; then
    echo "[$(date -Iseconds)] Restaurando planos en ${APP_CONTAINER}..."
    TEMP_EXTRACT="$(mktemp -d)"
    tar -xzf "${BACKUP_SOURCE}/floor_plans.tar.gz" -C "${TEMP_EXTRACT}"
    docker exec "${APP_CONTAINER}" mkdir -p "/app/storage/floor-plans"
    docker cp "${TEMP_EXTRACT}/floor-plans/." "${APP_CONTAINER}:/app/storage/floor-plans/"
    rm -rf "${TEMP_EXTRACT}"
fi

echo "[$(date -Iseconds)] Restauración completada con éxito."
