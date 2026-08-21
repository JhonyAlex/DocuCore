import { describe, expect, it, beforeEach } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { clearSentEmails, getSentEmails } from "../../server/lib/email"

describe("SAAS-01 Authentication and Lifecycle API", () => {
  beforeEach(() => {
    clearSentEmails()
  })

  it("registers a new account, stores pending verification, and dispatches verification email", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const email = `register.test.${Date.now()}@docucore.test`
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Carlos Developer",
          workspaceName: "Empresa Piloto",
          email,
          password: "SuperSecurePassword2026!",
          confirmPassword: "SuperSecurePassword2026!",
          termsAccepted: true,
        }),
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.email).toBe(email)

      // User created as unverified
      const user = await prisma.user.findUnique({ where: { email } })
      expect(user).toBeTruthy()
      expect(user?.emailVerifiedAt).toBeNull()

      // Workspace created as PENDING_VERIFICATION
      const member = await prisma.workspaceMember.findFirst({
        where: { userId: user!.id },
        include: { workspace: true },
      })
      expect(member).toBeTruthy()
      expect(member?.role).toBe("OWNER")
      expect(member?.workspace.billingStatus).toBe("PENDING_VERIFICATION")

      // Email verification token created and email sent
      const sent = getSentEmails()
      expect(sent.length).toBe(1)
      expect(sent[0].to).toBe(email)
      expect(sent[0].subject).toContain("Verifica tu cuenta")

      // Audit log records terms acceptance
      const audit = await prisma.auditLog.findFirst({
        where: { userId: user!.id, action: "Aceptación de términos y condiciones" },
      })
      expect(audit).toBeTruthy()

      // When legal terms URL is configured, missing termsAccepted returns 400
      process.env.LEGAL_TERMS_URL = "https://report-map.online/terms"
      const rejectTermsRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Carlos Sin Terminos",
          workspaceName: "Empresa Sin Terminos",
          email: `noterms.${Date.now()}@docucore.test`,
          password: "SuperSecurePassword2026!",
          confirmPassword: "SuperSecurePassword2026!",
          termsAccepted: false,
        }),
      })
      expect(rejectTermsRes.status).toBe(400)
      delete process.env.LEGAL_TERMS_URL

      // Duplicate registration with same email returns 409
      const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Carlos 2",
          workspaceName: "Empresa 2",
          email,
          password: "SuperSecurePassword2026!",
          confirmPassword: "SuperSecurePassword2026!",
          termsAccepted: true,
        }),
      })
      expect(dupRes.status).toBe(409)
    } finally {
      server.close()
    }
  })

  it("activates user and starts 14-day trial upon email verification", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const email = `verify.test.${Date.now()}@docucore.test`
      // Register
      await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Laura Verification",
          workspaceName: "Taller Mecánico Laura",
          email,
          password: "SuperSecurePassword2026!",
          confirmPassword: "SuperSecurePassword2026!",
        }),
      })

      const sent = getSentEmails()
      const match = sent[0].text.match(/token=([a-f0-9]+)/)
      expect(match).toBeTruthy()
      const token = match![1]

      // Verify email
      const verifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })

      expect(verifyRes.status).toBe(200)
      const verifyData = await verifyRes.json()
      expect(verifyData.user.email).toBe(email)
      expect(verifyData.workspace.billingStatus).toBe("TRIAL")
      expect(verifyData.workspace.trialDaysLeft).toBe(14)

      // Check DB
      const user = await prisma.user.findUniqueOrThrow({ where: { email } })
      expect(user.emailVerifiedAt).not.toBeNull()

      const member = await prisma.workspaceMember.findFirstOrThrow({
        where: { userId: user.id },
        include: { workspace: true },
      })
      expect(member.workspace.billingStatus).toBe("TRIAL")
      expect(member.workspace.trialStartedAt).not.toBeNull()
      expect(member.workspace.trialEndsAt).not.toBeNull()

      // Welcome email sent
      const welcomeEmails = getSentEmails().filter((e) => e.subject.includes("Bienvenido"))
      expect(welcomeEmails.length).toBe(1)

      // Verification token is single-use: repeating with same token fails
      const repeatRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      expect(repeatRes.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it("handles password reset with single-use token and session revocation", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const email = `reset.test.${Date.now()}@docucore.test`
      await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pedro Reset",
          workspaceName: "Espacio Pedro",
          email,
          password: "OriginalPassword2026!",
          confirmPassword: "OriginalPassword2026!",
        }),
      })

      // Request password reset
      clearSentEmails()
      const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      expect(forgotRes.status).toBe(200)

      const sent = getSentEmails()
      expect(sent.length).toBe(1)
      expect(sent[0].subject).toContain("Restablece tu contraseña")
      const match = sent[0].text.match(/token=([a-f0-9]+)/)
      expect(match).toBeTruthy()
      const token = match![1]

      // Reset password
      const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: "BrandNewPassword2026!",
          confirmPassword: "BrandNewPassword2026!",
        }),
      })
      expect(resetRes.status).toBe(200)

      // Can now login with new password
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "BrandNewPassword2026!",
        }),
      })
      expect(loginRes.status).toBe(200)

      // Old password fails
      const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "OriginalPassword2026!",
        }),
      })
      expect(oldLoginRes.status).toBe(401)
    } finally {
      server.close()
    }
  })

  it("resend-verification preserves returnTo when a valid invitationToken is provided", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now()
      const inviter = await prisma.user.create({
        data: {
          name: "Inviter User",
          email: `inviter.${stamp}@docucore.test`,
          passwordHash: "dummyHash",
          role: "Propietario",
          initials: "IU",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Invite WS", slug: `inv-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO" },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: inviter.id, role: "OWNER" } })

      const guestEmail = `guest.${stamp}@docucore.test`
      const rawToken = `invtoken_${stamp}`
      const { hashToken } = await import("../../server/lib/auth")
      await prisma.workspaceInvitation.create({
        data: {
          id: `inv_${stamp}`,
          workspaceId: ws.id,
          email: guestEmail,
          workspaceRole: "MEMBER",
          tokenHash: hashToken(rawToken),
          invitedById: inviter.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: "PENDING",
        },
      })

      // Register guest
      await fetch(`${baseUrl}/api/auth/register-invitee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Guest User",
          email: guestEmail,
          password: "Password123456!",
          confirmPassword: "Password123456!",
          invitationToken: rawToken,
          termsAccepted: true,
        }),
      })

      // 1. Resend with valid invitationToken -> email text contains returnTo=/accept-invitation?token=...
      clearSentEmails()
      const res1 = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: guestEmail, invitationToken: rawToken }),
      })
      expect(res1.status).toBe(200)
      const emails1 = getSentEmails()
      expect(emails1.length).toBe(1)
      expect(emails1[0].text).toContain(`returnTo=${encodeURIComponent(`/accept-invitation?token=${rawToken}`)}`)

      // 2. Resend without invitationToken -> normal flow without returnTo
      clearSentEmails()
      const res2 = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: guestEmail }),
      })
      expect(res2.status).toBe(200)
      const emails2 = getSentEmails()
      expect(emails2.length).toBe(1)
      expect(emails2[0].text).not.toContain("returnTo=")

      // 3. Resend with invalid/foreign invitationToken -> ignores invalid token and emits normal email
      clearSentEmails()
      const res3 = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: guestEmail, invitationToken: "foreign_invalid_token" }),
      })
      expect(res3.status).toBe(200)
      const emails3 = getSentEmails()
      expect(emails3.length).toBe(1)
      expect(emails3[0].text).not.toContain("returnTo=")
    } finally {
      server.close()
    }
  })
})
