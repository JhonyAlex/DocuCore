import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

describe("SAAS-03 Trial Lifecycle & Read-Only Expiration API", () => {
  it("allows full writes during active trial, locks mutations into read-only upon expiration without deleting data, and unlocks upon extension", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const now = new Date()
      const stamp = Date.now()

      // Create user & platform admin
      const adminUser = await prisma.user.create({
        data: {
          name: "Admin Platform",
          email: `admin.trial.${stamp}@docucore.test`,
          passwordHash: await hashPassword("AdminPass2026!"),
          role: "Administradora",
          initials: "AP",
          color: "brand",
          isPlatformAdmin: true,
          emailVerifiedAt: now,
        },
      })

      const clientUser = await prisma.user.create({
        data: {
          name: "Cliente Trial",
          email: `client.trial.${stamp}@docucore.test`,
          passwordHash: await hashPassword("ValidPassword2026!"),
          role: "Propietario",
          initials: "CT",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      // 1. ACTIVE TRIAL (14 days remaining)
      const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      const ws = await prisma.workspace.create({
        data: {
          name: "Industrias Ensayo",
          slug: `industrias-ensayo-${stamp}`,
          billingStatus: "TRIAL",
          trialStartedAt: now,
          trialEndsAt,
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: clientUser.id, role: "OWNER" },
      })

      // Client creates project during active trial
      const createProjRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(clientUser.id),
        },
        body: JSON.stringify({
          code: `PRJ-TRIAL-${stamp}`,
          name: "Planta Piloto Trial",
          description: "Pruebas de trial",
          themeKey: "blue",
        }),
      })
      expect(createProjRes.status).toBe(201)
      const proj = await createProjRes.json()

      // 2. EXPIRE THE TRIAL (set trialEndsAt in the past)
      await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          trialEndsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // expired yesterday
        },
      })

      // Read operations STILL WORK 100% (Read-only guarantee: data is never deleted)
      const listProjRes = await fetch(`${baseUrl}/api/projects`, {
        headers: { "x-docucore-test-actor-id": String(clientUser.id) },
      })
      expect(listProjRes.status).toBe(200)

      const getProjRes = await fetch(`${baseUrl}/api/projects/${proj.id}`, {
        headers: { "x-docucore-test-actor-id": String(clientUser.id) },
      })
      expect(getProjRes.status).toBe(200)

      const getDashboardRes = await fetch(`${baseUrl}/api/projects/${proj.id}/dashboard`, {
        headers: { "x-docucore-test-actor-id": String(clientUser.id) },
      })
      expect(getDashboardRes.status).toBe(200)

      // Write mutations are REJECTED with 402 PAYMENT REQUIRED (TRIAL_EXPIRED)
      const writeProjRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(clientUser.id),
        },
        body: JSON.stringify({
          code: `PRJ-EXPIRED-${stamp}`,
          name: "Proyecto no permitido",
          description: "Debe ser rechazado",
          themeKey: "slate",
        }),
      })
      expect(writeProjRes.status).toBe(402)
      const writeErr = await writeProjRes.json()
      expect(writeErr.code).toBe("TRIAL_EXPIRED")

      // 3. ADMIN EXTENDS TRIAL (+14 days)
      const extendRes = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}/extend-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(adminUser.id),
        },
        body: JSON.stringify({ days: 14 }),
      })
      expect(extendRes.status).toBe(200)
      const extendData = await extendRes.json()
      expect(extendData.billingStatus).toBe("TRIAL")

      // Now write mutations SUCCEED again
      const retryWriteRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(clientUser.id),
        },
        body: JSON.stringify({
          code: `PRJ-UNLOCKED-${stamp}`,
          name: "Proyecto Desbloqueado",
          description: "Debe ser permitido tras extensión",
          themeKey: "emerald",
        }),
      })
      expect(retryWriteRes.status).toBe(201)
    } finally {
      server.close()
    }
  })
})
