import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

describe("SAAS-05 Platform Admin API", () => {
  it("enforces requirePlatformAdmin and permits full lifecycle management and audit logs", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const now = new Date()
      const stamp = Date.now()

      const adminUser = await prisma.user.create({
        data: {
          name: "Plataforma Superadmin",
          email: `superadmin.${stamp}@docucore.test`,
          passwordHash: await hashPassword("AdminSecret2026!"),
          role: "Administradora",
          initials: "PS",
          color: "brand",
          isPlatformAdmin: true,
          emailVerifiedAt: now,
        },
      })

      const standardUser = await prisma.user.create({
        data: {
          name: "Cliente Estandar",
          email: `standard.${stamp}@docucore.test`,
          passwordHash: await hashPassword("StandardSecret2026!"),
          role: "Propietario",
          initials: "CE",
          color: "brand",
          isPlatformAdmin: false,
          emailVerifiedAt: now,
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: `Empresa Administrada ${stamp}`,
          slug: `empresa-admin-${stamp}`,
          billingStatus: "TRIAL",
          trialStartedAt: now,
          trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: standardUser.id, role: "OWNER" },
      })

      // 1. Non-admin user gets 403 Forbidden
      const nonAdminRes = await fetch(`${baseUrl}/api/admin/workspaces`, {
        headers: { "x-docucore-test-actor-id": String(standardUser.id) },
      })
      expect(nonAdminRes.status).toBe(403)

      const nonAdminManualRes = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}/manual-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(standardUser.id),
        },
        body: JSON.stringify({ planKey: "PRO" }),
      })
      expect(nonAdminManualRes.status).toBe(403)

      // 2. Admin user lists workspaces
      const listRes = await fetch(`${baseUrl}/api/admin/workspaces?search=${ws.slug}`, {
        headers: { "x-docucore-test-actor-id": String(adminUser.id) },
      })
      expect(listRes.status).toBe(200)
      const listData = await listRes.json()
      expect(listData.data.length).toBeGreaterThanOrEqual(1)
      expect(listData.data.some((item: { id: number }) => item.id === ws.id)).toBe(true)

      // 3. Admin user gets workspace detail
      const detailRes = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}`, {
        headers: { "x-docucore-test-actor-id": String(adminUser.id) },
      })
      expect(detailRes.status).toBe(200)
      const detailData = await detailRes.json()
      expect(detailData.id).toBe(ws.id)
      expect(detailData.members.length).toBe(1)

      // 4. Admin extends trial
      const extendRes = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}/extend-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(adminUser.id),
        },
        body: JSON.stringify({ days: 30 }),
      })
      expect(extendRes.status).toBe(200)
      const extendData = await extendRes.json()
      expect(extendData.billingStatus).toBe("TRIAL")

      // Check audit log recorded
      const logs = await prisma.auditLog.findMany({
        where: { workspaceId: ws.id, action: "Extensión de prueba" },
      })
      expect(logs.length).toBe(1)
      expect(logs[0].userId).toBe(adminUser.id)

      // 5. Admin activates a manual plan without erasing historic Stripe references.
      await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          stripeCustomerId: `cus_existing_${stamp}`,
          stripeSubscriptionId: `sub_existing_${stamp}`,
          stripePriceId: "price_existing",
        },
      })
      const manualPlanRes = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}/manual-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(adminUser.id),
        },
        body: JSON.stringify({ planKey: "PRO" }),
      })
      expect(manualPlanRes.status).toBe(200)
      expect(await manualPlanRes.json()).toMatchObject({
        workspaceId: ws.id,
        billingStatus: "ACTIVE",
        billingSource: "MANUAL",
        planKey: "PRO",
      })

      const manuallyLicensedWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(manuallyLicensedWorkspace.stripeCustomerId).toBe(`cus_existing_${stamp}`)
      expect(manuallyLicensedWorkspace.stripeSubscriptionId).toBe(`sub_existing_${stamp}`)
      expect(manuallyLicensedWorkspace.billingSource).toBe("MANUAL")

      const manualLogs = await prisma.auditLog.findMany({
        where: { workspaceId: ws.id, action: "Licencia manual activada" },
      })
      expect(manualLogs).toHaveLength(1)
      expect(manualLogs[0].userId).toBe(adminUser.id)

      // Customer checkout and Stripe failures cannot replace a manual entitlement.
      const manualCheckoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(standardUser.id),
        },
        body: JSON.stringify({ planKey: "STARTER" }),
      })
      expect(manualCheckoutRes.status).toBe(409)

      const manualPortalRes = await fetch(`${baseUrl}/api/billing/portal`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(standardUser.id) },
      })
      expect(manualPortalRes.status).toBe(409)

      const manualStatusRes = await fetch(`${baseUrl}/api/billing/status`, {
        headers: { "x-docucore-test-actor-id": String(standardUser.id) },
      })
      expect(manualStatusRes.status).toBe(200)
      expect(await manualStatusRes.json()).toMatchObject({
        workspaceId: ws.id,
        billingStatus: "ACTIVE",
        billingSource: "MANUAL",
        planKey: "PRO",
      })

      const failedInvoiceRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_manual_failed_${stamp}`,
          type: "invoice.payment_failed",
          data: { object: { customer: `cus_existing_${stamp}` } },
        }),
      })
      expect(failedInvoiceRes.status).toBe(200)
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })).billingStatus).toBe("ACTIVE")

      // 6. Admin suspends workspace
      const suspendRes = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}/suspend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(adminUser.id),
        },
        body: JSON.stringify({ reason: "Falta de pago o términos" }),
      })
      expect(suspendRes.status).toBe(200)
      const suspendData = await suspendRes.json()
      expect(suspendData.billingStatus).toBe("SUSPENDED")

      // 7. Reactivating a manual license returns it to ACTIVE, not back to trial.
      const reactivateRes = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}/reactivate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(adminUser.id),
        },
      })
      expect(reactivateRes.status).toBe(200)
      const reactivateData = await reactivateRes.json()
      expect(reactivateData.billingStatus).toBe("ACTIVE")
    } finally {
      server.close()
    }
  })
})
