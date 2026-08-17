# Despliegue de Report Map Online en Dokploy

Este documento detalla el procedimiento paso a paso para desplegar **Report Map Online** en producción utilizando **Dokploy**.

---

## 1. Requisitos Previos

- Un servidor VPS con Linux (Ubuntu 22.04 o superior) con Docker y Dokploy instalados.
- Un dominio público configurado con registros DNS:
  - `report-map.online` -> Dirección IP del VPS.
  - `www.report-map.online` -> Dirección IP del VPS (opcional/redirección).
- Certificados SSL/TLS gestionados automáticamente por Dokploy (Traefik / Let's Encrypt).
- Una cuenta de **Stripe** configurada con Claves API (Live) y Webhook Secret.
- Un servidor de correo SMTP (SendGrid, Mailgun, AWS SES, Postmark, etc.).

---

## 2. Creación del Proyecto y Servicio en Dokploy

1. En el panel de Dokploy, ve a **Projects** y haz clic en **Create Project** (Nombre: `Report Map Online`).
2. Selecciona **Compose** o **Application**:
   - Si utilizas Compose: usa la definición de `docker-compose.prod.yml`.
   - Si utilizas Application (Git Repository):
     - Repository: `https://github.com/JhonyAlex/DocuCore`
     - Branch: `main`
     - Build Type: `Dockerfile`
     - Port: `3000`

---

## 3. Variables de Entorno en Dokploy

Configura las siguientes variables de entorno en la pestaña **Environment**:

```env
NODE_ENV=production
PORT=3000
APP_PUBLIC_URL=https://report-map.online
SESSION_SECRET=GENERA_UNA_CADENA_ALEATORIA_DE_64_CARACTERES

# Base de Datos
DATABASE_URL=postgresql://docucore:TU_PASSWORD_SEGURO@docucore-db:5432/docucore?schema=public
DB_USER=docucore
DB_PASSWORD=TU_PASSWORD_SEGURO
DB_NAME=docucore
DB_HOST=docucore-db

# Facturación y Stripe
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Correo Transaccional
EMAIL_MODE=smtp
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.tu_api_key...
SMTP_SECURE=false
EMAIL_FROM=Report Map Online <soporte@report-map.online>
EMAIL_FROM_NAME=Report Map Online

# Almacenamiento Persistente
DOCUMENT_STORAGE_PATH=/app/storage/documents
FLOOR_PLAN_STORAGE_PATH=/app/storage/floor-plans
```

---

## 4. Volúmenes Persistentes

Asegúrate de que los tres volúmenes persistentes estén mapeados:

| Nombre del Volumen | Punto de Montaje | Propósito |
|---|---|---|
| `reportmap_pgdata` | `/var/lib/postgresql/data` (en el servicio db) | Datos de PostgreSQL |
| `reportmap_documents` | `/app/storage/documents` (en app) | Documentos PDF, imágenes y adjuntos |
| `reportmap_floor_plans` | `/app/storage/floor-plans` (en app) | Planos originales y pirámides Deep Zoom DZI |

---

## 5. Configuración de Stripe Webhooks

En el Dashboard de Stripe:
1. Ve a **Desarrolladores > Webhooks**.
2. Añade un punto de conexión con la URL: `https://report-map.online/api/billing/webhook`.
3. Selecciona los siguientes eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copia el **Secreto de firma del endpoint** (`whsec_...`) y asígnalo a la variable `STRIPE_WEBHOOK_SECRET` en Dokploy.

---

## 6. Configuración de Despliegue Continuo (GitHub Actions)

Para habilitar el despliegue automatizado desde la rama `main` a través de `.github/workflows/deploy.yml`:

1. En el repositorio de GitHub, ve a **Settings > Environments** y crea el entorno `production`.
2. Añade los siguientes **Environment Secrets**:
   - `DOKPLOY_URL`: URL del panel de Dokploy (ej. `https://dokploy.tu-servidor.com`).
   - `DOKPLOY_API_KEY`: API Key generada en el perfil de Dokploy.
   - `DOKPLOY_COMPOSE_ID`: ID del recurso Compose en Dokploy.
3. El workflow `deploy.yml` se disparará automáticamente únicamente cuando el workflow `CI Suite` finalice con éxito en `main`.

---

## 7. Verificación Post-Despliegue

1. Comprobar salud del servicio:
   ```bash
   curl -I https://report-map.online/api/ready
   # Debe responder HTTP 200 con {"status":"ready","database":"connected","storage":"ok"}
   ```
2. Crear el primer usuario superadministrador de la plataforma (solo primera vez):
   ```bash
   docker exec -it <nombre_contenedor_app> pnpm db:bootstrap-admin
   ```
3. Visitar `https://report-map.online` en el navegador para comprobar la Landing Page pública y el flujo de registro.
