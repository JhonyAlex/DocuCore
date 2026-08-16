import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

describe("SAAS-04 Billing & Webhook Processing API", () => {
  it("processes checkout, customer portal, webhook lifecycle transitions and guarantees idempotency", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const now = new Date()
      const stamp = Date.now()

      const user = await prisma.user.create({
        data: {
          name: "SaaS Subscriber",
          email: `subscriber.${stamp}@docucore.test`,
          passwordHash: await hashPassword("SubPassword2026!"),
          role: "Propietario",
          initials: "SS",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: "Empresa Suscriptora",
          slug: `empresa-sub-${stamp}`,
          billingStatus: "TRIAL",
          trialStartedAt: now,
          trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
      })

      // 1. Initiate Checkout
      const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(user.id),
        },
        body: JSON.stringify({ planKey: "PRO" }),
      })
      expect(checkoutRes.status).toBe(200)
      const checkoutData = await checkoutRes.json()
      expect(checkoutData.checkoutUrl).toContain("checkout")

      // 2. Webhook: checkout.session.completed
      const eventId1 = `evt_cs_${stamp}`
      const webhookRes1 = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId1,
          type: "checkout.session.completed",
          data: {
            object: {
              customer: `cus_${stamp}`,
              subscription: `sub_${stamp}`,
              metadata: { workspaceId: String(ws.id) },
            },
          },
        }),
      })
      expect(webhookRes1.status).toBe(200)

      let updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("ACTIVE")
      expect(updatedWs.stripeCustomerId).toBe(`cus_${stamp}`)
      expect(updatedWs.stripeSubscriptionId).toBe(`sub_${stamp}`)

      // 3. Customer Portal is now available
      const portalRes = await fetch(`${baseUrl}/api/billing/portal`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(portalRes.status).toBe(200)
      const portalData = await portalRes.json()
      expect(portalData.portalUrl).toContain("stripe.test")

      // 4. Webhook: invoice.payment_failed -> PAST_DUE
      const eventId2 = `evt_fail_${stamp}`
      const webhookRes2 = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId2,
          type: "invoice.payment_failed",
          data: {
            object: {
              customer: `cus_${stamp}`,
            },
          },
        }),
      })
      expect(webhookRes2.status).toBe(200)
      updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("PAST_DUE")

      // 5. Webhook: invoice.payment_succeeded -> recovers to ACTIVE
      const eventId3 = `evt_succ_${stamp}`
      const webhookRes3 = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId3,
          type: "invoice.payment_succeeded",
          data: {
            object: {
              customer: `cus_${stamp}`,
            },
          },
        }),
      })
      expect(webhookRes3.status).toBe(200)
      updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("ACTIVE")

      // 6. Idempotency test: duplicate webhook event
      const duplicateRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId3,
          type: "invoice.payment_succeeded",
          data: {
            object: { customer: `cus_${stamp}` },
          },
        }),
      })
      expect(duplicateRes.status).toBe(200)
      const dupData = await duplicateRes.json()
      expect(dupData.handled).toBe(true)

      // 7. Webhook: customer.subscription.deleted -> CANCELED
      const eventId4 = `evt_del_${stamp}`
      const webhookRes4 = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId4,
          type: "customer.subscription.deleted",
          data: {
            object: {
              id: `sub_${stamp}`,
            },
          },
        }),
      })
      expect(webhookRes4.status).toBe(200)
      updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("CANCELED")
    } finally {
      server.close()
    }
  })
})
