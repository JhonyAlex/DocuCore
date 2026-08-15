# Report Map Online — Go-Live Checklist & Estado de Producción

**Producto**: REPORT MAP ONLINE  
**Dominio Canónico**: `https://report-map.online`  
**Plataforma de Despliegue**: Dokploy (Docker Compose)  

---

## 1. Estado del Código: LISTO PARA PRODUCCIÓN

El software ha sido completamente verificado y blindado bajo el estándar de calidad y preservación de datos en producción:
- [x] Fail-closed en facturación: Stripe estrictamente requerido en producción, sin fallback a FakeBillingProvider.
- [x] Fail-closed en correo: SMTP validado y estandarizado con `SMTP_PASSWORD`.
- [x] Tenancy y aislamiento estricto por Workspace.
- [x] Bloqueo de mutaciones destructivas en cascada con `onDelete: Restrict` en proyectos.
- [x] Aceptación explícita obligatoria de términos legales con registro de evidencia y traza de auditoría.
- [x] Probe de preparación `/api/ready` con verificación en vivo de DB, storage, y variables críticas.
- [x] Stack Docker productivo (`docker-compose.prod.yml`) ejecutado y validado en runtime real: app y db containers healthy, DB aislada internamente sin puertos host, migraciones mediante `prisma migrate deploy`, `/api/health` = 200 y `/api/ready` = 200.
- [x] Ejecución operacional real de `scripts/backup.sh` y `scripts/restore.sh <dir> --confirm` demostrada sobre stack Docker productivo real aislado con verificación de hash SHA-256 byte a byte de base de datos, documentos y planos tras simular destrucción total.
- [x] Actualización no destructiva probada desde estado pre-SaaS (`02b1203`) con backfill automático.
- [x] Despliegue limpio probado desde base de datos vacía con bootstrap idempotente.
- [x] Rendimiento de alta densidad validado con perfil de 10.000 registros (p50 < 120 ms en todas las consultas).
- [x] Pruebas de humo (`pnpm test:smoke`) 5/5 en verde.
- [x] Suite completa de tests unitarios, API e integración (263 tests en 48 suites), 82 pruebas E2E funcionales y 30 capturas de regresión visual Playwright al 0,5% 100% en verde.

---

## 2. GO-LIVE BLOCKERS EXTERNOS (Pendientes de Configuración Manual)

Antes de abrir el servicio públicamente a clientes comerciales reales, el operador debe completar las siguientes configuraciones externas:

### Blocker 1: Textos Legales Definitivos
- [ ] Redactar e incorporar los textos legales definitivos (Términos y Condiciones de Servicio y Política de Privacidad RGPD).
- [ ] Configurar las variables `LEGAL_TERMS_URL` y `LEGAL_PRIVACY_URL` (o desplegar las páginas públicas correspondientes).

### Blocker 2: Claves de Producción de Stripe
- [ ] Obtener las claves en modo Live desde el Dashboard de Stripe:
  - `STRIPE_SECRET_KEY` (`sk_live_...`)
  - `STRIPE_PRICE_ID` (`price_...` del plan de suscripción)
- [ ] Configurar el endpoint de Webhook en Stripe: `https://report-map.online/api/billing/webhook` con los eventos de suscripción y facturación.
- [ ] Obtener el `STRIPE_WEBHOOK_SECRET` (`whsec_...`) y cargarlo en Dokploy.

### Blocker 3: Proveedor de Correo SMTP Transaccional
- [ ] Crear cuenta en proveedor SMTP (SendGrid, Mailgun, Postmark, AWS SES).
- [ ] Verificar el dominio emisor `report-map.online` con registros SPF, DKIM y DMARC.
- [ ] Configurar en Dokploy: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME`.

### Blocker 4: GitHub Branch Protection en `main`
En la configuración de GitHub (`https://github.com/JhonyAlex/DocuCore/settings/branches`):
- [ ] Añadir regla de protección para la rama `main`.
- [ ] Activar **Require a pull request before merging**.
- [ ] Activar **Require status checks to pass before merging** y seleccionar el job `Lint, Typecheck & Tests` del workflow `CI Suite`.
- [ ] Activar **Do not allow bypassing the above settings**.
- [ ] Prohibir **Force pushes** y **Branch deletions**.

### Blocker 5: Secretos de Despliegue en GitHub Environments
En GitHub (`Settings > Environments > production`):
- [ ] Crear el secret `DOKPLOY_URL` con la URL del panel Dokploy.
- [ ] Crear el secret `DOKPLOY_API_KEY` con la API key de Dokploy.
- [ ] Crear el secret `DOKPLOY_COMPOSE_ID` con el ID del proyecto Compose.

### Blocker 6: Sincronización Off-site de Backups
- [ ] Configurar réplica externa de `/backups` hacia un bucket S3 / Cloudflare R2 / Hetzner Storage Box mediante `rclone` o la herramienta nativa de Dokploy.
