# Política y Procedimientos de Backup — Report Map Online

Este documento define la estrategia de copias de seguridad de **Report Map Online** para garantizar la integridad, durabilidad y recuperación de datos de clientes en producción.

---

## 1. Alcance de las Copias de Seguridad

Cada backup de Report Map Online consta de tres componentes atómicos:
1. **Base de Datos PostgreSQL**: Dump estructurado con compresión binaria (`pg_dump -F c`).
2. **Archivos Documentales**: Archivos almacenados en `/app/storage/documents`.
3. **Planos y Pirámides Deep Zoom**: Archivos almacenados en `/app/storage/floor-plans`.
4. **Verificación de Integridad**: Archivo `SHA256SUMS` generado tras cada exportación.

---

## 2. Automatización con Cron

En el servidor de producción, se debe configurar una tarea programada `cron` para ejecutar copias de seguridad cada 6 horas:

```bash
# Editar crontab del sistema
crontab -e

# Ejecutar backup cada 6 horas (00:00, 06:00, 12:00, 18:00)
0 */6 * * * /opt/reportmap/scripts/backup.sh >> /var/log/reportmap_backup.log 2>&1
```

---

## 3. Política de Retención

- **Backups diarios/intradiarios locales**: Retenidos durante **30 días** en el servidor VPS (`/backups`).
- **Backups remotos / offsite**: Sincronizados diariamente mediante `rclone` o `aws s3 sync` a un bucket seguro de AWS S3 o Cloudflare R2 con inmutabilidad (Object Lock) de 90 días.

---

## 4. Procedimiento de Ejecución Manual

Para forzar un backup manual antes de un mantenimiento o actualización:

```bash
cd /opt/reportmap
./scripts/backup.sh
```

El script creará un directorio fechado con el formato `YYYYMMDD_HHMMSS` conteniendo:
- `database.dump`
- `documents.tar.gz`
- `floor_plans.tar.gz`
- `SHA256SUMS`
