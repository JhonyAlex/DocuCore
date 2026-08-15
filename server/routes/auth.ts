import { randomBytes } from "node:crypto"
import { Router } from "express"
import { z } from "zod"
import prisma from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import {
  authenticatedUserId,
  clearSessionCookie,
  createSession,
  hashToken,
  publicUser,
  requireAuth,
  revokeSessionFromRequest,
  type AuthenticatedRequest,
} from "../lib/auth"
import { hashPassword, passwordIsValid, verifyPassword } from "../lib/passwords"
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "../lib/email"
import { evaluateWorkspaceEntitlement, getUserPrimaryWorkspace } from "../lib/workspaceScope"

const router = Router()

// Rate limiting in-memory map
const rateLimits = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  if (process.env.NODE_ENV === "test") return true
  const now = Date.now()
  const current = rateLimits.get(key)
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (current.count >= maxAttempts) {
    return false
  }
  current.count += 1
  return true
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cuenta"
  return base
}

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
}).strict()

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  workspaceName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256),
  termsAccepted: z.boolean().optional(),
}).strict()

const verifyEmailSchema = z.object({
  token: z.string().trim().min(1).max(256),
}).strict()

const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict()

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict()

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1).max(256),
  newPassword: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256),
}).strict()

router.post("/register", asyncHandler(async (req, res) => {
  const ip = req.ip || "unknown"
  if (!checkRateLimit(`register|${ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Demasiados registros desde esta conexión. Inténtalo más tarde." })
  }

  const input = registerSchema.parse(req.body)
  if (input.password !== input.confirmPassword) {
    return res.status(400).json({ error: "Las contraseñas no coinciden." })
  }
  if (!passwordIsValid(input.password)) {
    return res.status(400).json({ error: "La contraseña debe tener al mensaje 12 caracteres." })
  }

  const legalRequired = Boolean(process.env.LEGAL_TERMS_URL || process.env.LEGAL_PRIVACY_URL || process.env.NODE_ENV === "production")
  if (legalRequired && input.termsAccepted !== true) {
    return res.status(400).json({ error: "Debes aceptar los Términos de Servicio y la Política de Privacidad para continuar." })
  }

  const email = input.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return res.status(409).json({ error: "Este correo electrónico ya está registrado." })
  }

  const baseSlug = generateSlug(input.workspaceName)
  let slug = baseSlug
  let counter = 1
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`
    counter += 1
  }

  const token = randomBytes(32).toString("hex")
  const hashed = hashToken(token)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const passwordHash = await hashPassword(input.password)
  const initials = input.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US"

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: "Propietario",
        initials,
        color: "brand",
        isActive: true,
        emailVerifiedAt: null,
        isPlatformAdmin: false,
      },
    })

    const workspace = await tx.workspace.create({
      data: {
        name: input.workspaceName,
        slug,
        billingStatus: "PENDING_VERIFICATION",
      },
    })

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      },
    })

    await tx.emailVerificationToken.create({
      data: {
        id: hashed,
        userId: user.id,
        email,
        expiresAt,
      },
    })

    if (input.termsAccepted) {
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          action: "Aceptación de términos y condiciones",
          entityId: String(user.id),
          detail: JSON.stringify({
            termsAccepted: true,
            acceptedAt: new Date().toISOString(),
            ip,
            termsUrl: process.env.LEGAL_TERMS_URL ?? null,
            privacyUrl: process.env.LEGAL_PRIVACY_URL ?? null,
          }),
        },
      })
    }
  })

  void sendVerificationEmail({ to: email, name: input.name, token }).catch((err) => {
    console.error("Failed to send verification email:", err)
  })

  res.status(201).json({
    message: "Cuenta creada correctamente. Por favor, revisa tu correo para verificar tu cuenta e iniciar tu prueba de 14 días.",
    email,
  })
}))

router.post("/verify-email", asyncHandler(async (req, res) => {
  const input = verifyEmailSchema.parse(req.body)
  const hashed = hashToken(input.token)
  const now = new Date()

  const record = await prisma.emailVerificationToken.findUnique({
    where: { id: hashed },
    include: { user: true },
  })

  if (!record || record.expiresAt <= now) {
    return res.status(400).json({ error: "El enlace de verificación no es válido o ha expirado." })
  }

  const user = record.user
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  let activatedWorkspaceName = "tu empresa"
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: now },
    })

    const memberships = await tx.workspaceMember.findMany({
      where: { userId: user.id, role: "OWNER" },
      include: { workspace: true },
    })

    for (const m of memberships) {
      if (m.workspace.billingStatus === "PENDING_VERIFICATION") {
        activatedWorkspaceName = m.workspace.name
        await tx.workspace.update({
          where: { id: m.workspaceId },
          data: {
            billingStatus: "TRIAL",
            trialStartedAt: now,
            trialEndsAt,
          },
        })
      }
    }

    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } })
  })

  await createSession(user.id, res)

  void sendWelcomeEmail({
    to: user.email,
    name: user.name,
    workspaceName: activatedWorkspaceName,
    trialDays: 14,
  }).catch((err) => console.error("Failed to send welcome email:", err))

  const ws = await getUserPrimaryWorkspace(user.id)
  const entitlement = evaluateWorkspaceEntitlement(ws.workspace)

  res.json({
    user: publicUser(user),
    workspace: {
      id: ws.workspace.id,
      name: ws.workspace.name,
      slug: ws.workspace.slug,
      billingStatus: ws.workspace.billingStatus,
      trialStartedAt: ws.workspace.trialStartedAt?.toISOString(),
      trialEndsAt: ws.workspace.trialEndsAt?.toISOString(),
      trialDaysLeft: entitlement.trialDaysLeft ?? 14,
    },
  })
}))

router.post("/resend-verification", asyncHandler(async (req, res) => {
  const ip = req.ip || "unknown"
  if (!checkRateLimit(`resend|${ip}`, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Demasiadas solicitudes. Inténtalo más tarde." })
  }

  const input = resendVerificationSchema.parse(req.body)
  const email = input.email.toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })

  if (user && !user.emailVerifiedAt) {
    const token = randomBytes(32).toString("hex")
    const hashed = hashToken(token)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } })
      await tx.emailVerificationToken.create({
        data: { id: hashed, userId: user.id, email, expiresAt },
      })
    })

    void sendVerificationEmail({ to: email, name: user.name, token }).catch(() => undefined)
  }

  res.json({ message: "Si el correo está registrado y pendiente de verificación, recibirás un nuevo enlace." })
}))

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const ip = req.ip || "unknown"
  if (!checkRateLimit(`forgot|${ip}`, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Demasiadas solicitudes. Inténtalo más tarde." })
  }

  const input = forgotPasswordSchema.parse(req.body)
  const email = input.email.toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })

  if (user && user.isActive) {
    const token = randomBytes(32).toString("hex")
    const hashed = hashToken(token)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } })
      await tx.passwordResetToken.create({
        data: { id: hashed, userId: user.id, expiresAt },
      })
    })

    void sendPasswordResetEmail({ to: email, name: user.name, token }).catch(() => undefined)
  }

  res.json({ message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." })
}))

router.post("/reset-password", asyncHandler(async (req, res) => {
  const input = resetPasswordSchema.parse(req.body)
  if (input.newPassword !== input.confirmPassword) {
    return res.status(400).json({ error: "Las contraseñas no coinciden." })
  }
  if (!passwordIsValid(input.newPassword)) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 12 caracteres." })
  }

  const hashed = hashToken(input.token)
  const now = new Date()

  const record = await prisma.passwordResetToken.findUnique({
    where: { id: hashed },
    include: { user: true },
  })

  if (!record || record.usedAt !== null || record.expiresAt <= now) {
    return res.status(400).json({ error: "El enlace para restablecer la contraseña no es válido o ha expirado." })
  }

  const newHash = await hashPassword(input.newPassword)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: newHash },
    })
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } })
    // Revoke all existing sessions upon password reset
    await tx.authSession.deleteMany({ where: { userId: record.userId } })
  })

  res.json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión con tu nueva contraseña." })
}))

router.post("/login", asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const email = input.email.toLowerCase()
  const key = `login|${email}|${req.ip ?? "unknown"}`
  if (!checkRateLimit(key, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Demasiados intentos. Inténtalo de nuevo más tarde." })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !passwordIsValid(input.password) || !(await verifyPassword(input.password, user.passwordHash))) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos." })
  }

  await createSession(user.id, res)

  let workspaceData: Record<string, unknown> | null = null
  try {
    const ws = await getUserPrimaryWorkspace(user.id)
    const entitlement = evaluateWorkspaceEntitlement(ws.workspace)
    workspaceData = {
      id: ws.workspace.id,
      name: ws.workspace.name,
      slug: ws.workspace.slug,
      billingStatus: ws.workspace.billingStatus,
      trialStartedAt: ws.workspace.trialStartedAt?.toISOString(),
      trialEndsAt: ws.workspace.trialEndsAt?.toISOString(),
      trialDaysLeft: entitlement.trialDaysLeft,
      role: ws.membership.role,
    }
  } catch {
    // Platform admin or user without workspace
  }

  res.set("Cache-Control", "no-store").json({
    user: publicUser(user),
    workspace: workspaceData,
  })
}))

router.post("/logout", asyncHandler(async (req, res) => {
  await revokeSessionFromRequest(req)
  clearSessionCookie(res)
  res.status(204).end()
}))

router.get("/session", asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth
  if (!auth) return res.status(401).json({ error: "Authentication required" })

  let workspaceData: Record<string, unknown> | null = null
  try {
    const ws = await getUserPrimaryWorkspace(auth.user.id)
    const entitlement = evaluateWorkspaceEntitlement(ws.workspace)
    workspaceData = {
      id: ws.workspace.id,
      name: ws.workspace.name,
      slug: ws.workspace.slug,
      billingStatus: ws.workspace.billingStatus,
      trialStartedAt: ws.workspace.trialStartedAt?.toISOString(),
      trialEndsAt: ws.workspace.trialEndsAt?.toISOString(),
      trialDaysLeft: entitlement.trialDaysLeft,
      isEntitledToWrite: entitlement.isEntitledToWrite,
      entitlementReason: entitlement.reason,
      role: ws.membership.role,
    }
  } catch {
    // User without workspace
  }

  res.set("Cache-Control", "no-store").json({
    user: publicUser(auth.user),
    workspace: workspaceData,
  })
}))

router.post("/password", requireAuth, asyncHandler(async (req, res) => {
  const input = z.object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(256),
    confirmPassword: z.string().min(1).max(256),
  }).strict().parse(req.body)

  if (input.newPassword !== input.confirmPassword || !passwordIsValid(input.newPassword)) {
    return res.status(400).json({ error: "La nueva contraseña no cumple los requisitos." })
  }

  const userId = authenticatedUserId(req)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "La contraseña actual no es correcta." })
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword) } })
    await tx.authSession.deleteMany({ where: { userId, id: { not: (req as AuthenticatedRequest).auth!.sessionId } } })
  })

  res.status(204).end()
}))

export default router
