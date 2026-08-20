# Runbook de Release — Report Map Online

Procedimientos exactos para operar producción (Dokploy + Docker Compose).
No contiene secretos. Los valores entre `< >` se sustituyen por el valor real
del entorno.

> **Reglas de producción (inviolables):** nunca `docker compose down -v`,
> `pnpm db:seed`, `pnpm db:reset:manual-test` ni ninguna operación destructiva
> contra datos de clientes. Las migraciones son solo *forward* (`prisma migrate
> deploy`), no destructivas.

---

## 1. Procedimiento exacto de Backup

Se ejecuta en el **host** que tiene acceso a Docker (VPS/Dokploy). Produce una
copia atómica de PostgreSQL + documentos + planos con checksum SHA-256.

```bash
# 1. Backup completo (crea /backups/YYYYMMDD_HHMMSS con database.dump,
#    documents.tar.gz, floor_plans.tar.gz y SHA256SUMS)
cd /opt/reportmap
./scripts/backup.sh

# 2. Verificar que el checksum valida
cd /backups/$(ls -1 /backups | tail -1)
sha256sum -c SHA256SUMS

# 3. (Obligatorio antes de un mantenimiento) copiar el backup off-site
rclone copy /backups/ <remote>:docucore-backups/
```

- `BACKUP_DIR` (def. `./backups`), `RETENTION_DAYS` (def. 30), y
  `APP_CONTAINER`/`DB_CONTAINER` son configurables por variable de entorno.
- Cron sugerido: `0 */6 * * * /opt/reportmap/scripts/backup.sh >> /var/log/reportmap_backup.log 2>&1`.
- **Backup = puerta de entrada de cualquier despliegue o mantenimiento.** Sin
  backup verificado no se despliega.

---

## 2. Procedimiento exacto de Deploy

### 2.1 Preflight (obligatorio)
1. CI Suite verde en `main` (o la rama release) **excepto** el contrato visual
   si está en desfase autorizado; el resto (lint/typecheck/unit/build/smoke/E2E)
   debe estar verde.
2. Backup verificado (ver §1).
3. Confirmar `origin/main` == commit que se va a desplegar:
   ```bash
   git fetch origin --prune && git rev-parse origin/main
   ```

### 2.2 Disparar el despliegue
Vía GitHub Actions (recomendado, verifica automáticamente):
```bash
gh workflow run "Deploy to Dokploy (Production)" --ref main
gh run watch   # sigue el run; el paso final verifica health/ready/SHA/migraciones
```
O desde el panel Dokploy: redeploy del recurso Compose con el commit deseado.

### 2.3 Verificación post-deploy (automatizada por `deploy.yml`)
El workflow ya no considera éxito un mero 2xx del trigger. Tras disparar,
sondea:
```bash
BASE=https://app.report-map.online
SHA=<commit-esperado>

curl -fsS $BASE/api/health                                    # 200 {"status":"ok"}
curl -fsS $BASE/api/version                                   # gitSha == SHA
curl -fsS $BASE/api/ready                                     # {"status":"ready", ...}
curl -fsS $BASE/api/migrations                                # {"failed":0, ...}
```
Confirmar además el estado real de migraciones dentro del contenedor:
```bash
docker exec -it <app-container> pnpm db:deploy          # idempotente; no deja pendientes
docker exec -it <app-container> pnpm exec prisma migrate status
```

### 2.4 Confirmar el commit desplegado
`GET /api/version` devuelve `appVersion`, `gitSha`, `buildTime`. El `gitSha`
debe coincidir exactamente con el commit aprobado.

---

## 3. Procedimiento exacto de Rollback

Las migraciones son forward-only y no destructivas, por lo que **rollback =
redeploy del commit anterior** (código). Solo si una migración hubiera corrompido
datos (no debe ocurrir) se restaura la base desde backup.

```bash
# 1. Identificar el commit previo bueno (el actual lo reporta /api/version)
git log --oneline -5

# 2. Redeploy del commit anterior (Dokploy: build del commit previo, o)
#    GitHub: crear rama apuntando al commit anterior y despachar deploy manual.
#    Ejemplo con revert en una rama de emergencia (NO se hace push directo a main):
git checkout -b hotfix/rollback <sha-bueno>

# 3. Verificar que /api/version reporta el SHA esperado
curl -fsS https://app.report-map.online/api/version

# 4. Solo si se restaura base de datos (caso extremo, con aprobación):
docker compose -f docker-compose.prod.yml stop app
./scripts/restore.sh /backups/<YYYYMMDD_HHMMSS> --confirm
docker compose -f docker-compose.prod.yml start app
docker exec -it <app-container> pnpm db:deploy
curl -fsS https://app.report-map.online/api/ready
```

---

## 4. Checklist GO / NO-GO final

**GO** requiere todo lo siguiente:

- [ ] `main` sincronizado (`origin/main` == commit aprobado) y working tree limpio.
- [ ] CI Suite verde (functional): lint, typecheck, unit/API, build, smoke, E2E.
- [ ] Contrato visual **30/30** bajo el umbral 0,5 % (o desfase explícitamente
      aprobado por el usuario con las capturas inspeccionadas).
- [ ] Migración `20260817130000_workspace_manual_billing_source` aplicada y
      `prisma migrate status` sin pendientes ni fallos.
- [ ] `/api/health` 200, `/api/ready` 200 (`database/storage/billing/email` OK),
      `/api/version.gitSha` == commit aprobado, `/api/migrations.failed == 0`.
- [ ] `LEGAL_TERMS_URL` y `LEGAL_PRIVACY_URL` configuradas y servidas (páginas
      legales accesibles).
- [ ] Stripe Live: `STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PRO` en modo Live;
      webhook `https://app.report-map.online/api/billing/webhook` con los 6
      eventos y `STRIPE_WEBHOOK_SECRET` coincidente con la firma del endpoint.
- [ ] SMTP transaccional verificado (envío real de correo).
- [ ] `/admin` (superadmin): activación manual Starter/Pro **sin** crear sesión
      Stripe; 409 para workspace `PENDING_VERIFICATION`; 409 para Starter con
      >1 proyecto activo.
- [ ] Backup reciente verificado (`sha256sum -c SHA256SUMS`) + réplica off-site.
- [ ] Procedimiento de rollback ensayado y documentado.

**NO-GO** si falla cualquiera de los anteriores. No se abre el servicio a
clientes comerciales hasta resolver el elemento que falle.
