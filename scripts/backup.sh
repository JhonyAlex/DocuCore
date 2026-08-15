#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Automático para Report Map Online
# Ejecutado en el host Docker (o tarea cron del servidor)
# Realiza copia de seguridad atómica de:
# 1. Base de datos PostgreSQL (pg_dump con formato custom comprimido)
# 2. Archivos de documentos persistentes (/app/storage/documents)
# 3. Archivos de planos persistentes (/app/storage/floor-plans)
# ==============================================================================

set -euo pipefail
export MSYS2_ARG_CONV_EXCL="*"
export MSYS_NO_PATHCONV=1

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
TARGET_DIR="${BACKUP_DIR}/${TIMESTAMP}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

APP_CONTAINER="${APP_CONTAINER:-reportmap-app-1}"
DB_CONTAINER="${DB_CONTAINER:-reportmap-db-1}"
DB_USER="${DB_USER:-docucore}"
DB_NAME="${DB_NAME:-docucore}"

echo "[$(date -Iseconds)] Iniciando copia de seguridad en ${TARGET_DIR}..."

# Verificar que los contenedores existen y están en ejecución
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "ERROR: El contenedor de base de datos '${DB_CONTAINER}' no está en ejecución." >&2
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
    echo "ERROR: El contenedor de aplicación '${APP_CONTAINER}' no está en ejecución." >&2
    exit 1
fi

mkdir -p "${TARGET_DIR}"

# 1. Dump de PostgreSQL mediante stream directo
echo "[$(date -Iseconds)] Exportando base de datos PostgreSQL desde ${DB_CONTAINER}..."
docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" -F c -b "${DB_NAME}" > "${TARGET_DIR}/database.dump"

# 2. Copia de volumen de documentos desde el contenedor app
echo "[$(date -Iseconds)] Exportando archivos de documentos desde ${APP_CONTAINER}..."
if docker exec "${APP_CONTAINER}" test -d "/app/storage/documents"; then
    docker cp "${APP_CONTAINER}:/app/storage/documents" "${TARGET_DIR}/documents"
    tar -czf "${TARGET_DIR}/documents.tar.gz" -C "${TARGET_DIR}" documents
    rm -rf "${TARGET_DIR}/documents"
fi

# 3. Copia de volumen de planos desde el contenedor app
echo "[$(date -Iseconds)] Exportando archivos de planos desde ${APP_CONTAINER}..."
if docker exec "${APP_CONTAINER}" test -d "/app/storage/floor-plans"; then
    docker cp "${APP_CONTAINER}:/app/storage/floor-plans" "${TARGET_DIR}/floor-plans"
    tar -czf "${TARGET_DIR}/floor_plans.tar.gz" -C "${TARGET_DIR}" floor-plans
    rm -rf "${TARGET_DIR}/floor-plans"
fi

# 4. Generación de checksum SHA-256
echo "[$(date -Iseconds)] Calculando checksums de integridad..."
(cd "${TARGET_DIR}" && sha256sum * > SHA256SUMS)

# 5. Limpieza de backups antiguos
echo "[$(date -Iseconds)] Purgando backups locales anteriores a ${RETENTION_DAYS} días..."
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true

echo "[$(date -Iseconds)] Copia de seguridad completada con éxito en ${TARGET_DIR}."
