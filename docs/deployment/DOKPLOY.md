# Despliegue en Dokploy — Report Map Online

Guía de despliegue en producción para la arquitectura de dominios de **Report Map Online**:
- **Landing pública**: `https://report-map.online`
- **Aplicación SaaS**: `https://app.report-map.online`

---

## 1. Arquitectura de Servicios

El stack de producción se compone de tres servicios orquestados mediante Docker Compose (`docker-compose.prod.yml`):

1. **`app` (SaaS Application & API)**:
   - Contenedor Node.js con Express API, Prisma ORM y frontend SPA.
   - Escucha en el puerto `3000`.
   - Dominio público: `https://app.report-map.online`.
   - Ejecuta automáticamente migraciones no destructivas (`pnpm db:deploy`) y bootstrap de administrador al arrancar.

2. **`landing` (Public Landing & Marketing)**:
   - Contenedor Nginx Alpine ultra-ligero que sirve la landing page estática construida con Vite.
   - Escucha en el puerto `80` (mapeado internamente a `8080` o gestionado por Traefik/Dokploy).
   - Dominio público: `https://report-map.online`.

3. **`db` (PostgreSQL Database)**:
   - PostgreSQL 16 Alpine con almacenamiento persistente en el volumen `pgdata`.
   - Conexión interna segura (`db:5432`).

---

## 2. Variables de Entorno en Dokploy

Configura las siguientes variables de entorno para el servicio `app`:

```env
# Servidor y Dominios
NODE_ENV=production
PORT=3000
APP_PUBLIC_URL=https://app.report-map.online
MARKETING_PUBLIC_URL=https://report-map.online
SESSION_SECRET=genera_una_clave_aleatoria_muy_larga_de_minimo_32_caracteres
COMPANY_DISPLAY_NAME=Report Map Online
SUPPORT_EMAIL=admin@report-map.online
LEGAL_TERMS_URL=https://report-map.online/terminos-y-condiciones
LEGAL_PRIVACY_URL=https://report-map.online/politica-de-privacidad

# Base de Datos
DATABASE_URL=postgresql://docucore:TU_CONTRASENA_PROD@db:5432/docucore?schema=public
DB_USER=docucore
DB_PASSWORD=TU_CONTRASENA_PROD
DB_NAME=docucore

# Facturación y Suscripciones (Stripe)
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Plan Starter: 15 USD/mes (1 proyecto activo)
STRIPE_PRICE_STARTER=price_1U5189KyzuNr2TvU6UE4pEpl
# Plan Pro: 39 USD/mes (hasta 15 proyectos activos)
STRIPE_PRICE_PRO=price_1U518LKyzuNr2TvU3PDHEFlp

# Servicio de Correo Electrónico (SMTP)
EMAIL_MODE=smtp
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.tu_api_key...
SMTP_SECURE=false
EMAIL_FROM=admin@report-map.online
EMAIL_FROM_NAME=Report Map Online

# Almacenamiento
DOCUMENT_STORAGE_PATH=/app/storage/documents
FLOOR_PLAN_STORAGE_PATH=/app/storage/floor-plans
```

---

## 3. Configuración de Dominios y Enrutamiento en Dokploy / Traefik

### Dominio 1: `https://app.report-map.online`
- **Servicio destino:** `app`
- **Puerto interno:** `3000`
- **Healthcheck Path:** `/api/ready`
- **Certificado SSL:** Let's Encrypt automático (HTTP-01 o DNS-01)

### Dominio 2: `https://report-map.online`
- **Servicio destino:** `landing`
- **Puerto interno:** `80`
- **Certificado SSL:** Let's Encrypt automático

---

## 4. Webhooks de Stripe

Configura en el Dashboard de Stripe (Modo Live) el endpoint de webhook:
- **URL del Endpoint:** `https://app.report-map.online/api/billing/webhook`
- **Eventos a suscribir:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copia la clave secreta de firma del webhook en la variable `STRIPE_WEBHOOK_SECRET`.

---

## 5. Volúmenes Persistentes y Backups

El stack utiliza tres volúmenes Docker con garantía de preservación permanente:
- `pgdata`: Almacenamiento de base de datos PostgreSQL.
- `documents_data`: Almacenamiento local de versiones de documentos PDF, imágenes y archivos.
- `floor_plans_data`: Almacenamiento de imágenes de planos y pirámides de mosaicos DZI.

> **Regla de Producción:** Nunca ejecutes `pnpm db:seed` ni `pnpm db:reset:manual-test` en entornos con datos reales de clientes.
