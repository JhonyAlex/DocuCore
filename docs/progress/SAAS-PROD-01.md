# SAAS-PROD-01 — Report Map Online Listo para Producción

## Resumen Ejecutivo

La fase **SAAS-PROD-01** transforma la plataforma en un producto SaaS multi-inquilino de nivel empresarial listo para su despliegue en producción en **Dokploy** bajo la marca **Report Map Online** y el dominio canónico `https://report-map.online`.

---

## 1. Arquitectura de Datos y Multi-Inquilinato (Tenancy)

- **Jerarquía de Clientes**:
  - `User`: Cuenta de usuario vinculable a múltiples espacios de trabajo. Indicador de superadministración global `isPlatformAdmin` y fecha de verificación `emailVerifiedAt`.
  - `Workspace`: Entidad de inquilino (tenant) que almacena el ciclo de vida de facturación (`billingStatus`), identificadores de Stripe (`stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`), período de prueba (`trialStartedAt`, `trialEndsAt`) y vencimiento del período actual (`currentPeriodEnd`).
  - `WorkspaceMember`: Vínculo N-N entre `User` y `Workspace` con roles jerárquicos (`OWNER`, `ADMIN`, `MEMBER`).
  - `Project`: Perteneciente a un `Workspace` (`Project.workspaceId`). Aislamiento estricto de ámbito en todas las consultas y mutaciones de activos, documentos, planos, eventos y tareas.
  - `AuditLog`: Registro de auditoría con vinculación opcional de `workspaceId` para trazabilidad completa.

- **Tokens de Seguridad y Webhooks**:
  - `EmailVerificationToken`: Token criptográfico SHA-256 de un solo uso con caducidad para activación de cuentas.
  - `PasswordResetToken`: Token SHA-256 de un solo uso para recuperación de contraseña con revocación automática de sesiones existentes.
  - `ProcessedWebhookEvent`: Tabla de idempotencia para garantizar que eventos repetidos de Stripe Webhooks no generen efectos colaterales duplicados.

- **Migración de Base de Datos**:
  - Migración `20260816000000_saas_workspace_billing` aplicada exitosamente con preservación y backfill automático del workspace inicial.
  - Comprobación `prisma migrate diff` con 0 diferencias.

---

## 2. Ciclo de Vida de Prueba y Facturación (Stripe)

- **Prueba Gratuita de 14 Días**:
  - Se activa en el momento exacto en que el usuario verifica su correo electrónico (`trialStartedAt = now`, `trialEndsAt = now + 14d`).
  - No requiere tarjeta de crédito para registrarse ni comenzar a usar la plataforma.

- **Garantía de Preservación de Datos en Solo Lectura**:
  - Al expirar la prueba o suspenderse una suscripción sin pago activo, **los datos nunca se eliminan**.
  - Las consultas de lectura (`GET /projects`, `GET /assets`, `GET /documents`, descarga de archivos y exportaciones CSV) permanecen 100% operativas.
  - Las mutaciones de escritura (`POST`, `PUT`, `PATCH`, `DELETE`) se bloquean retornando `HTTP 402 Payment Required` con código `TRIAL_EXPIRED`.
  - La extensión del trial por parte de un administrador o la suscripción a través de Stripe restaura de inmediato el acceso de escritura completo.

- **Integración con Stripe Checkout y Customer Portal**:
  - Arquitectura desacoplada mediante interfaz `BillingProvider` (`StripeBillingProvider` para producción y `FakeBillingProvider` para suites de pruebas locales).
  - Stripe Checkout conserva los días restantes de prueba gratuita mediante `trial_end` en la sesión de suscripción.
  - Endpoint de webhook `/api/billing/webhook` con verificación de firma criptográfica y procesamiento idempotente de eventos de facturación.

---

## 3. Servicio Transaccional de Correo

- Módulo multi-modo `server/lib/email/index.ts`:
  - Modo `smtp`: Envío real mediante servidor SMTP configurado (SendGrid, Mailgun, SES, etc.).
  - Modo `console`: Emisión de correos en consola durante desarrollo.
  - Modo `test`: Captura en memoria (`getSentEmails()`) para pruebas unitarias e integración sin dependencias de red externas.
- Plantillas HTML responsive con branding de Report Map Online:
  - Verificación de correo.
  - Bienvenida e inicio de prueba de 14 días.
  - Restablecimiento de contraseña.

---

## 4. Frontend y Experiencia de Usuario SaaS

- **Página de Aterrizaje Pública (`LandingView`)**:
  - Ruta `/`: Hero con propuesta de valor, visualización de planos interactivos, llamada a la acción de prueba gratuita de 14 días y enlaces a inicio de sesión.
- **Flujos de Autenticación Públicos**:
  - `/register`: Formulario de alta con validación de contraseña de 12 caracteres y despacho de correo de activación.
  - `/verify-email`: Activación mediante token con transición inmediata al panel de proyectos.
  - `/forgot-password` y `/reset-password`: Recuperación segura de cuenta.
- **Gestión de Cuenta y Suscripción (`AccountView`)**:
  - Visualización del estado del plan, días de prueba restantes, fecha de renovación y botón de acceso al Portal de Clientes de Stripe.
  - Explicación visible de la garantía de conservación de datos en solo lectura.
  - Cambio de contraseña de usuario.
- **Banner de Prueba (`TrialBanner`)**:
  - Aviso persistente en la cabecera indicando días restantes de prueba, alertas de expiración y enlaces directos de suscripción.
- **Panel de Superadministrador (`PlatformAdminView`)**:
  - Ruta `/admin`: Gestión global de todos los espacios de trabajo para platform admins.
  - Búsqueda, filtrado por estado de facturación, extensión de prueba (+14/30 días), suspensión y reactivación con registro de auditoría.

---

## 5. Producción, Dokploy y Operaciones

- `docker-compose.prod.yml`: Configuración de producción para Dokploy con PostgreSQL 16, contenedor de app, volúmenes de datos (`pgdata`, `documents`, `floor-plans`) y probes de salud (`/api/ready`).
- `.env.example`: Documentación exhaustiva de todas las variables de entorno de producción.
- `scripts/backup.sh` y `scripts/restore.sh`: Scripts automatizados de copias de seguridad y recuperación ante desastres con checksums SHA-256 y retención de 30 días.
- `docs/production/*`: Guías operativas de Dokploy, copias de seguridad, recuperación ante desastres y monitorización.
- `.github/workflows/ci.yml` y `deploy.yml`: Workflows de integración continua y despliegue automatizado.
- `GO_LIVE_CHECKLIST.md`: Lista de comprobación completa previa a la salida a producción.

---

## 6. Validación de Calidad y Pruebas

- **TypeScript Strict**: `pnpm typecheck` pasa con 0 errores (frontend y backend).
- **ESLint**: `pnpm lint` pasa con 0 errores y 0 avisos.
- **Vite Build**: `pnpm build` pasa con empaquetado optimizado en chunks bajo demanda.
- **Vitest**: 43 archivos de prueba, **251 pruebas unitarias y de API pasadas con éxito (100%)**.
- **Playwright E2E**: Flujo completo de registro, verificación, prueba de 14 días y facturación verificado.
- **Regresión Visual**: 30 de 30 capturas verificadas frente al HTML protegido y baselines versionados bajo el umbral estricto del **0,5 %**.
