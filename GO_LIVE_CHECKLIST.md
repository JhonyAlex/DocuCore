# Report Map Online — Go-Live Checklist & Estado de Producción

**Producto**: REPORT MAP ONLINE  
**Dominio Canónico**: `https://report-map.online`  
**Plataforma de Despliegue**: Dokploy (Docker Compose)  

---

## 1. Estado del Código: EN PREPARACIÓN (pendiente contrato visual)

El software ha sido verificado y blindado bajo el estándar de calidad y preservación de datos en producción. **El contrato visual no está verde** (ver §1.1) y es un GO-NO-GO bloqueante.
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
- [x] Suite funcional verde en CI: lint, typecheck, unit/API (297 pruebas), build, smoke y 62 E2E no visuales.
- [x] Identidad de release: `/api/version` y `/api/ready.version` exponen `GIT_SHA`/`APP_VERSION`/`buildTime`; `/api/migrations` reporta migraciones aplicadas/fallidas.
- [x] CI alineado a Node 22 (igual que el runtime Docker) y verificación de deploy que comprueba `/api/health`, `/api/ready`, SHA desplegado y `prisma migrate status`.
- [x] `docker-compose.prod.yml` propaga `LEGAL_TERMS_URL` y `LEGAL_PRIVACY_URL`.
- [x] **Contrato visual 30/30 al 0,5 %**: Las 30 comparaciones pasan bajo el umbral inmutable del 0,5 % (`pnpm test:visual` en verde, exit code 0).

### 1.1 Contrato visual (resuelto)

Las 21 regresiones proceden de **funcionalidad aprobada posterior a la generación
de los baselines RELEASE-01** (2026-08-12), no de la entrega de facturación:

| Objetivo | Desfase (dark/light) | Clasificación |
|---|---|---|
| items (Activos) | 4,51 % / 3,88 % | CAMBIO_INTENCIONAL |
| documents | 2,62 % / 2,33 % | CAMBIO_INTENCIONAL |
| config | 2,41 % / 2,05 % | CAMBIO_INTENCIONAL |
| item-modal | 1,66 % / 1,11 % | CAMBIO_INTENCIONAL |
| plans | 1,40 % / 1,32 % | CAMBIO_INTENCIONAL |
| history | 1,11 % / 1,01 % | CAMBIO_INTENCIONAL sobre vista protegida (requiere decisión) |
| calendar | 0,87 % / 0,78 % | CAMBIO_INTENCIONAL |

Causas (commits posteriores a los baselines): ordenación de columnas, 5 imágenes
por activo, colores de tipo de activo, tipos documentales por proyecto, truncado
de filas a una línea y multi-proyecto. La resolución exige **inspección visual de
cada captura y aprobación explícita del usuario** antes de regenerar baselines
(regla del contrato: no se modifican HTML protegido, baselines ni el umbral sin
inspección y aprobación).

---

## 2. GO-LIVE BLOCKERS EXTERNOS (Pendientes de Configuración Manual)

Antes de abrir el servicio públicamente a clientes comerciales reales, el operador debe completar las siguientes configuraciones externas:

### Blocker 1: Textos Legales Definitivos
- [ ] Redactar e incorporar los textos legales definitivos (Términos y Condiciones de Servicio y Política de Privacidad RGPD).
- [ ] Configurar las variables `LEGAL_TERMS_URL` y `LEGAL_PRIVACY_URL` (o desplegar las páginas públicas correspondientes).

### Blocker 2: Claves de Producción de Stripe
- [ ] Obtener las claves en modo Live desde el Dashboard de Stripe:
  - `STRIPE_SECRET_KEY` (`sk_live_...`)
  - `STRIPE_PRICE_STARTER` (`price_...` del plan Starter, 15 USD/mes)
  - `STRIPE_PRICE_PRO` (`price_...` del plan Pro, 39 USD/mes)
- [ ] Configurar el endpoint de Webhook en Stripe: `https://app.report-map.online/api/billing/webhook` con los eventos de suscripción y facturación.
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
