import nodemailer from "nodemailer"

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface SentEmailRecord extends EmailMessage {
  id: string
  sentAt: Date
}

const sentEmails: SentEmailRecord[] = []

export function getSentEmails(): readonly SentEmailRecord[] {
  return sentEmails
}

export function clearSentEmails(): void {
  sentEmails.length = 0
}

export function findLatestEmail(to: string): SentEmailRecord | undefined {
  const normalized = to.trim().toLowerCase()
  return [...sentEmails].reverse().find((item) => item.to.trim().toLowerCase() === normalized)
}

function getEmailMode(): "smtp" | "console" | "test" {
  if (process.env.EMAIL_MODE === "smtp" || process.env.EMAIL_MODE === "console" || process.env.EMAIL_MODE === "test") {
    return process.env.EMAIL_MODE
  }
  if (process.env.NODE_ENV === "test") return "test"
  if (process.env.SMTP_HOST) return "smtp"
  return "console"
}

export function validateEmailConfiguration(): { valid: boolean; error?: string } {
  const isProduction = process.env.NODE_ENV === "production"
  const mode = getEmailMode()

  if (isProduction && mode !== "smtp") {
    return { valid: false, error: `EMAIL_MODE must be "smtp" in production (current: "${mode}")` }
  }

  if (mode === "smtp") {
    const missing: string[] = []
    if (!process.env.SMTP_HOST) missing.push("SMTP_HOST")
    if (!process.env.SMTP_USER) missing.push("SMTP_USER")
    if (!process.env.SMTP_PASSWORD) missing.push("SMTP_PASSWORD")
    if (!process.env.EMAIL_FROM) missing.push("EMAIL_FROM")

    if (missing.length > 0) {
      return {
        valid: false,
        error: `Incomplete SMTP configuration. Missing required variables: ${missing.join(", ")}`,
      }
    }
  }

  return { valid: true }
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const validation = validateEmailConfiguration()
    if (!validation.valid) {
      throw new Error(`[Email Config Error] ${validation.error}`)
    }

    const host = process.env.SMTP_HOST || "localhost"
    const port = Number(process.env.SMTP_PORT || "587")
    const secure = process.env.SMTP_SECURE === "true" || port === 465
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASSWORD
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    })
  }
  return transporter
}

function resolveFromHeader(): string {
  const rawFrom = process.env.EMAIL_FROM || process.env.SUPPORT_EMAIL || "admin@report-map.online"
  if (rawFrom.includes("<") && rawFrom.includes(">")) {
    return rawFrom
  }
  const fromName = process.env.EMAIL_FROM_NAME || "Report Map Online"
  return `"${fromName}" <${rawFrom}>`
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const mode = getEmailMode()
  const from = resolveFromHeader()

  if (mode === "test") {
    sentEmails.push({
      id: `test-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      sentAt: new Date(),
    })
    return
  }

  if (mode === "console") {
    console.log("==================== [EMAIL (CONSOLE MODE)] ====================")
    console.log(`To: ${message.to}`)
    console.log(`From: ${from}`)
    console.log(`Subject: ${message.subject}`)
    console.log("-------------------- Text Body --------------------")
    console.log(message.text)
    console.log("================================================================")
    return
  }

  const client = getTransporter()
  await client.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
}

export async function sendVerificationEmail(options: { to: string; name: string; token: string; returnTo?: string }): Promise<void> {
  const baseUrl = (process.env.APP_PUBLIC_URL || "https://app.report-map.online").replace(/\/+$/, "")
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(options.token)}${options.returnTo ? `&returnTo=${encodeURIComponent(options.returnTo)}` : ""}`

  const subject = "Verifica tu cuenta en Report Map Online"
  const text = `Hola ${options.name},

Bienvenido a Report Map Online. Para activar tu cuenta e iniciar tu prueba gratuita de 14 días, confirma tu dirección de correo electrónico en el siguiente enlace:

${verifyUrl}

Este enlace es válido durante 24 horas.

Si no has creado esta cuenta, puedes ignorar este mensaje.`

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px;">
  <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0; color: #0f172a; font-size: 20px;">Report Map Online</h2>
  </div>
  <p style="font-size: 15px; line-height: 1.5;">Hola <strong>${options.name}</strong>,</p>
  <p style="font-size: 15px; line-height: 1.5;">Gracias por registrarte. Para activar tu cuenta y comenzar tu <strong>prueba gratuita de 14 días</strong>, confirma tu correo:</p>
  <div style="margin: 28px 0;">
    <a href="${verifyUrl}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Verificar mi cuenta</a>
  </div>
  <p style="font-size: 13px; color: #64748b; line-height: 1.5;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${verifyUrl}" style="color: #3b82f6;">${verifyUrl}</a></p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 12px; color: #94a3b8;">Este enlace expirará en 24 horas. Si no has solicitado este registro, puedes ignorar este mensaje con total tranquilidad.</p>
</div>`

  await sendEmail({ to: options.to, subject, text, html })
}

export async function sendPasswordResetEmail(options: { to: string; name: string; token: string }): Promise<void> {
  const baseUrl = (process.env.APP_PUBLIC_URL || "https://app.report-map.online").replace(/\/+$/, "")
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(options.token)}`

  const subject = "Restablece tu contraseña en Report Map Online"
  const text = `Hola ${options.name},

Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Report Map Online.

Haz clic en el siguiente enlace para elegir una nueva contraseña:
${resetUrl}

Este enlace es válido durante 1 hora y solo se puede utilizar una vez.

Si tú no solicitaste este cambio, puedes ignorar este mensaje.`

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px;">
  <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0; color: #0f172a; font-size: 20px;">Report Map Online</h2>
  </div>
  <p style="font-size: 15px; line-height: 1.5;">Hola <strong>${options.name}</strong>,</p>
  <p style="font-size: 15px; line-height: 1.5;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta:</p>
  <div style="margin: 28px 0;">
    <a href="${resetUrl}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Restablecer contraseña</a>
  </div>
  <p style="font-size: 13px; color: #64748b; line-height: 1.5;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${resetUrl}" style="color: #3b82f6;">${resetUrl}</a></p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 12px; color: #94a3b8;">Este enlace expirará en 1 hora y es de un solo uso. Si no solicitaste este cambio, ignora este mensaje.</p>
</div>`

  await sendEmail({ to: options.to, subject, text, html })
}

export async function sendWelcomeEmail(options: { to: string; name: string; workspaceName: string; trialDays: number }): Promise<void> {
  const baseUrl = (process.env.APP_PUBLIC_URL || "https://app.report-map.online").replace(/\/+$/, "")
  const supportEmail = process.env.SUPPORT_EMAIL || "admin@report-map.online"
  const appUrl = `${baseUrl}/projects`

  const subject = "¡Bienvenido a Report Map Online! Tu prueba de 14 días está activa"
  const text = `Hola ${options.name},

Tu cuenta para ${options.workspaceName} está activa.

Dispones de ${options.trialDays} días de prueba completa para crear tus proyectos, inventariar activos, subir documentación y configurar tus planos interactivos.

Accede a la plataforma aquí:
${appUrl}

Si necesitas ayuda durante tu prueba, estamos a tu disposición en ${supportEmail}.`

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px;">
  <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0; color: #0f172a; font-size: 20px;">Report Map Online</h2>
  </div>
  <p style="font-size: 15px; line-height: 1.5;">Hola <strong>${options.name}</strong>,</p>
  <p style="font-size: 15px; line-height: 1.5;">¡Tu cuenta para <strong>${options.workspaceName}</strong> ya está verificada y activa!</p>
  <p style="font-size: 15px; line-height: 1.5;">Cuentas con <strong>${options.trialDays} días de prueba completa</strong> sin compromiso para explorar todas las capacidades de Report Map Online.</p>
  <div style="margin: 28px 0;">
    <a href="${appUrl}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Ir a mis proyectos</a>
  </div>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 12px; color: #94a3b8;">¿Tienes dudas? Escríbenos en cualquier momento a <a href="mailto:${supportEmail}" style="color: #3b82f6;">${supportEmail}</a> respondiendo a este correo.</p>
</div>`

  await sendEmail({ to: options.to, subject, text, html })
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function sendWorkspaceInvitationEmail(options: { to: string; workspaceName: string; inviterName: string; inviteUrl: string }): Promise<void> {
  const supportEmail = process.env.SUPPORT_EMAIL || "admin@report-map.online"
  const workspaceName = escapeHtml(options.workspaceName)
  const inviterName = escapeHtml(options.inviterName)
  const inviteUrl = escapeHtml(options.inviteUrl)
  const subject = `Invitación a ${options.workspaceName.replace(/[\r\n]+/g, " ")}`
  const text = `Hola,

${options.inviterName} te ha invitado a unirte al espacio "${options.workspaceName}" en Report Map Online.

Acepta la invitación aquí:
${options.inviteUrl}

El enlace es de un solo uso y caduca en 7 días. Si necesitas ayuda, escríbenos a ${supportEmail}.`
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px;">
  <h2 style="margin: 0; color: #0f172a; font-size: 20px;">Report Map Online</h2>
  <p style="font-size: 15px; line-height: 1.5;"><strong>${inviterName}</strong> te ha invitado a unirte al espacio <strong>${workspaceName}</strong>.</p>
  <div style="margin: 28px 0;"><a href="${inviteUrl}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Aceptar invitación</a></div>
  <p style="font-size: 12px; color: #94a3b8;">El enlace es de un solo uso y caduca en 7 días.</p>
</div>`
  await sendEmail({ to: options.to, subject, text, html })
}
