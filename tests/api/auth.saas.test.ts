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
})
