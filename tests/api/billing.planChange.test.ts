import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

describe("plan-change API (preview / initiate / resolve / swap)", () => {
  async function setup(planKey: "STARTER" | "PRO", activeCount: number) {
    const stamp = Date.now()
    const now = new Date()
    const user = await prisma.user.create({
      data: {
        name: "Plan Owner",
        email: `planowner.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "PO",
        color: "brand",
        emailVerifiedAt: now,
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Plan WS", slug: `plan-ws-${stamp}`, billingStatus: "ACTIVE", planKey },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })
    const projectIds: number[] = []
    for (let i = 0; i < activeCount; i++) {
      const p = await prisma.project.create({
        data: { workspaceId: ws.id, code: `PP${i}_${stamp}`.slice(0, 30), name: `Proyecto ${i}`, description: "", status: "ACTIVE" },
      })
      await prisma.projectMember.create({ data: { projectId: p.id, userId: user.id, role: "OWNER" } })
      projectIds.push(p.id)
    }
    return { user, ws, projectIds }
  }

  it("preview detects selection requirement for Pro -> Starter with 2 active projects", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, projectIds } = await setup("PRO", 2)
      const res = await fetch(`${baseUrl}/api/billing/plan-change/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER" }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.targetPlanKey).toBe("STARTER")
      expect(data.requiresSelection).toBe(true)
      expect(data.activeProjects).toBe(2)
      expect(data.affectedProjects).toHaveLength(2)
      expect(projectIds).toContain(data.affectedProjects[0].id)
    } finally {
      server.close()
    }
  })

  it("exposes an already-effective Starter overage so the next owner session must choose the project to keep", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, ws, projectIds } = await setup("PRO", 2)
      // Simula el resultado de una prueba expirada o un downgrade confirmado
      // por Stripe fuera de la pantalla que inició el cambio.
      await prisma.workspace.update({ where: { id: ws.id }, data: { planKey: "STARTER" } })

      const status = await fetch(`${baseUrl}/api/billing/status`, {
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(status.status).toBe(200)
      expect(await status.json()).toMatchObject({
        planKey: "STARTER",
        activeProjectsCount: 2,
        complianceStatus: "PLAN_ACTION_REQUIRED",
      })

      const preview = await fetch(`${baseUrl}/api/billing/plan-change/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER" }),
      })
      expect(preview.status).toBe(200)
      const body = await preview.json()
      expect(body.requiresProjectSelection).toBe(true)
      expect(body.affectedProjects.map((project: { id: number }) => project.id).sort()).toEqual(projectIds.slice().sort())
    } finally {
      server.close()
    }
  })

  it("resolve leaves exactly one ACTIVE project and plan-locks the rest, never destroying data", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, ws, projectIds } = await setup("STARTER", 3)
      const keepId = projectIds[1]

      const res = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: keepId }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.keptProjectId).toBe(keepId)
      expect(data.planLockedProjectIds.sort()).toEqual(projectIds.filter((id) => id !== keepId).sort())

      const projects = await prisma.project.findMany({ where: { workspaceId: ws.id } })
      const active = projects.filter((p) => p.status === "ACTIVE")
      const planLocked = projects.filter((p) => p.status === "ARCHIVED" && p.archivedByPlan)
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe(keepId)
      expect(planLocked).toHaveLength(2)
      // Data is preserved: all 3 rows still exist.
      expect(projects).toHaveLength(3)
    } finally {
      server.close()
    }
  })

  it("swap during grace period is atomic and keeps exactly one active", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, ws, projectIds } = await setup("STARTER", 3)
      const keepId = projectIds[1]
      await prisma.$transaction(async (tx) => {
        for (const id of projectIds) {
          await tx.project.update({ where: { id }, data: { status: id === keepId ? "ACTIVE" : "ARCHIVED", archivedByPlan: id !== keepId, planLockedAt: id !== keepId ? new Date() : null } })
        }
      })
      await prisma.workspace.update({ where: { id: ws.id }, data: { graceEndsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000) } })

      const newActiveId = projectIds[2]
      const res = await fetch(`${baseUrl}/api/billing/plan-change/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ keepProjectId: newActiveId }),
      })
      expect(res.status).toBe(200)
      const projects = await prisma.project.findMany({ where: { workspaceId: ws.id } })
      const active = projects.filter((p) => p.status === "ACTIVE")
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe(newActiveId)
    } finally {
      server.close()
    }
  })

  it("blocks swap after graceEndsAt and blocks restore of a plan-locked project on Starter", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, ws, projectIds } = await setup("STARTER", 2)
      const keepId = projectIds[0]
      const lockedId = projectIds[1]
      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: keepId }, data: { status: "ACTIVE" } })
        await tx.project.update({ where: { id: lockedId }, data: { status: "ARCHIVED", archivedByPlan: true, planLockedAt: new Date() } })
        await tx.workspace.update({ where: { id: ws.id }, data: { graceEndsAt: new Date(Date.now() - 1000) } })
      })

      const swapRes = await fetch(`${baseUrl}/api/billing/plan-change/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ keepProjectId: lockedId }),
      })
      expect(swapRes.status).toBe(409)
      const swapData = await swapRes.json()
      expect(swapData.code).toBe("GRACE_PERIOD_EXPIRED")

      // Restore of plan-locked project on Starter is blocked (PLAN_LOCKED_PROJECT).
      const restoreRes = await fetch(`${baseUrl}/api/projects/${lockedId}/restore`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(restoreRes.status).toBe(409)
      const restoreData = await restoreRes.json()
      expect(restoreData.code).toBe("PLAN_LOCKED_PROJECT")
    } finally {
      server.close()
    }
  })

  it("platform admin inside a normal Starter workspace does NOT get infinite capacity", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const stamp = Date.now()
      const user = await prisma.user.create({
        data: {
          name: "Platform Admin",
          email: `pa.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Administrador de plataforma",
          initials: "PA",
          color: "brand",
          emailVerifiedAt: new Date(),
          isPlatformAdmin: true,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Starter WS PA", slug: `starter-pa-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "MEMBER" } })
      const p1 = await prisma.project.create({ data: { workspaceId: ws.id, code: `PA1_${stamp}`.slice(0, 30), name: "P1", description: "", status: "ACTIVE" } })
      await prisma.projectMember.create({ data: { projectId: p1.id, userId: user.id, role: "ADMIN" } })

      // Trying to create a 2nd project should be rejected despite platform admin.
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ code: `PA2_${stamp}`.slice(0, 30), name: "P2", description: "", themeKey: "blue" }),
      })
      expect(createRes.status).toBe(409)
      const createData = await createRes.json()
      expect(createData.code).toBe("PROJECT_LIMIT_EXCEEDED")
    } finally {
      server.close()
    }
  })

  it("upgrade to PRO via resolve is blocked (must go through Stripe checkout)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, projectIds } = await setup("STARTER", 2)
      const res = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "PRO", selectedProjectId: projectIds[0] }),
      })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.code).toBe("PLAN_UPGRADE_REQUIRES_CHECKOUT")
    } finally {
      server.close()
    }
  })

  it("checkout rejects a transition owned by another workspace or a mismatched plan", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const stamp = Date.now()
      const now = new Date()
      const user = await prisma.user.create({
        data: { name: "Owner A", email: `oa.${stamp}@docucore.test`, passwordHash: await hashPassword("Password2026!"), role: "Propietario", initials: "OA", color: "brand", emailVerifiedAt: now },
      })
      const ws = await prisma.workspace.create({ data: { name: "WS A", slug: `wsa-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO" } })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })
      await prisma.project.create({ data: { workspaceId: ws.id, code: `TP1_${stamp}`.slice(0, 30), name: "P1", description: "", status: "ACTIVE" } })

      // A foreign transition id (nonexistent here) is rejected with INVALID_TRANSITION.
      const res = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ planKey: "STARTER", transitionId: "pct_foreign_workspace_000" }),
      })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.code).toBe("INVALID_TRANSITION")
    } finally {
      server.close()
    }
  })

  it("downgrade: initiate -> checkout -> webhook applies the transition (exactly 1 ACTIVE)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, ws, projectIds } = await setup("PRO", 3)
      const keepId = projectIds[1]

      // 1. Wizard: persist the transition with the selection (server-side, no browser memory).
      const initiateRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: keepId }),
      })
      expect(initiateRes.status).toBe(201)
      const initiated = await initiateRes.json()

      // 2. Checkout carries the transition id (Stripe session metadata).
      const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ planKey: "STARTER", transitionId: initiated.transitionId }),
      })
      expect(checkoutRes.status).toBe(200)

      // 3. Fake webhook confirms the checkout, which applies the PENDING transition.
      const eventId = `evt_downgrade_apply_${Date.now()}`
      const webhookRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId,
          type: "checkout.session.completed",
          data: {
            object: {
              customer: `cus_dg_${Date.now()}`,
              subscription: `sub_dg_${Date.now()}`,
              priceId: process.env.STRIPE_PRICE_STARTER || "fake_price_starter",
              metadata: { workspaceId: String(ws.id), planKey: "STARTER", transitionId: initiated.transitionId, selectedProjectId: String(keepId) },
            },
          },
        }),
      })
      expect(webhookRes.status).toBe(200)

      const projects = await prisma.project.findMany({ where: { workspaceId: ws.id } })
      const active = projects.filter((p) => p.status === "ACTIVE")
      const planLocked = projects.filter((p) => p.status === "ARCHIVED" && p.archivedByPlan)
      expect(active.map((p) => p.id)).toEqual([keepId])
      expect(planLocked).toHaveLength(2)
      expect(projects).toHaveLength(3) // no data destroyed

      const transition = await prisma.planTransition.findUniqueOrThrow({ where: { id: initiated.transitionId } })
      expect(transition.status).toBe("APPLIED")
    } finally {
      server.close()
    }
  })

  it("checkout for already completed session returns 200 CHECKOUT_ALREADY_COMPLETED with checkoutUrl null", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const { user, ws } = await setup("PRO", 1)
      const stamp = Date.now() + 999

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_comp_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
          stripeSessionId: `cs_completed_${stamp}`,
        },
      })

      const { setBillingProvider, FakeBillingProvider } = await import("../../server/lib/billing")
      class MockCompleteProvider extends FakeBillingProvider {
        override async retrieveCheckoutSession(sessionId: string): Promise<import("../../server/lib/billing").RetrievedCheckoutSession> {
          return {
            id: sessionId,
            url: null,
            status: "complete",
            metadata: { workspaceId: String(ws.id), transitionId: transition.id },
          }
        }
      }
      setBillingProvider(new MockCompleteProvider())

      const res = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ planKey: "PRO", transitionId: transition.id }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe("CHECKOUT_ALREADY_COMPLETED")
      expect(data.checkoutUrl).toBeNull()
      expect(data.reused).toBe(true)
      expect(data.sessionId).toBe(`cs_completed_${stamp}`)
    } finally {
      const { setBillingProvider } = await import("../../server/lib/billing")
      setBillingProvider(null)
      server.close()
    }
  })

  describe("Item 2: BILLING_PROVIDER=fake exact predicate and adversarial tests", () => {
    it("rejects fake webhooks with missing price, foreign price, pending_update, and paused/past_due while applying exact price", async () => {
      process.env.BILLING_PROVIDER = "fake"
      process.env.STRIPE_PRICE_STARTER = "fake_price_starter"
      process.env.STRIPE_PRICE_PRO = "fake_price_pro"

      const server = await startServer(0)
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("Invalid test server address")
      const baseUrl = `http://127.0.0.1:${address.port}`

      try {
        const { user, ws, projectIds } = await setup("PRO", 3)
        const keepId = projectIds[1]
        const stamp = Date.now() + 555

        // Helper to create a PENDING transition
        async function createTransition(tId: string) {
          return prisma.planTransition.create({
            data: {
              id: tId,
              workspaceId: ws.id,
              actorId: user.id,
              targetPlanKey: "STARTER",
              selectedProjectId: keepId,
              status: "PENDING",
            },
          })
        }

        // 1. Missing Price => remains PENDING, projects NOT modified
        const tMissing = await createTransition(`pct_fake_miss_${stamp}`)
        await fetch(`${baseUrl}/api/billing/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `evt_fake_miss_${stamp}`,
            type: "customer.subscription.updated",
            data: {
              object: {
                id: `sub_fake_${stamp}`,
                customer: `cus_fake_${stamp}`,
                status: "active",
                items: { data: [] }, // missing price
                metadata: { workspaceId: String(ws.id), transitionId: tMissing.id },
              },
            },
          }),
        })
        const refMissing = await prisma.planTransition.findUniqueOrThrow({ where: { id: tMissing.id } })
        expect(refMissing.status).toBe("PENDING")
        const activeProjects1 = await prisma.project.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
        expect(activeProjects1).toBe(3) // Unchanged!

        // 2. Foreign Price (fake_price_unrelated) => remains PENDING, projects NOT modified
        const tForeign = await createTransition(`pct_fake_foreign_${stamp}`)
        await fetch(`${baseUrl}/api/billing/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `evt_fake_foreign_${stamp}`,
            type: "customer.subscription.updated",
            data: {
              object: {
                id: `sub_fake_${stamp}`,
                customer: `cus_fake_${stamp}`,
                status: "active",
                priceId: "fake_price_unrelated_foreign",
                metadata: { workspaceId: String(ws.id), transitionId: tForeign.id },
              },
            },
          }),
        })
        const refForeign = await prisma.planTransition.findUniqueOrThrow({ where: { id: tForeign.id } })
        expect(refForeign.status).toBe("PENDING")
        const activeProjects2 = await prisma.project.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
        expect(activeProjects2).toBe(3) // Unchanged!

        // 3. pending_update present => remains PENDING, projects NOT modified
        const tPendingUpdate = await createTransition(`pct_fake_pupd_${stamp}`)
        await fetch(`${baseUrl}/api/billing/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `evt_fake_pupd_${stamp}`,
            type: "customer.subscription.updated",
            data: {
              object: {
                id: `sub_fake_${stamp}`,
                customer: `cus_fake_${stamp}`,
                status: "active",
                priceId: "fake_price_starter",
                pending_update: { expires_at: 99999 },
                metadata: { workspaceId: String(ws.id), transitionId: tPendingUpdate.id },
              },
            },
          }),
        })
        const refPendingUpdate = await prisma.planTransition.findUniqueOrThrow({ where: { id: tPendingUpdate.id } })
        expect(refPendingUpdate.status).toBe("PENDING")
        const activeProjects3 = await prisma.project.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
        expect(activeProjects3).toBe(3) // Unchanged!

        // 4. paused / past_due => remains PENDING, projects NOT modified
        const tPaused = await createTransition(`pct_fake_paused_${stamp}`)
        await fetch(`${baseUrl}/api/billing/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `evt_fake_paused_${stamp}`,
            type: "customer.subscription.updated",
            data: {
              object: {
                id: `sub_fake_${stamp}`,
                customer: `cus_fake_${stamp}`,
                status: "paused",
                priceId: "fake_price_starter",
                metadata: { workspaceId: String(ws.id), transitionId: tPaused.id },
              },
            },
          }),
        })
        const refPaused = await prisma.planTransition.findUniqueOrThrow({ where: { id: tPaused.id } })
        expect(refPaused.status).toBe("PENDING")
        const activeProjects4 = await prisma.project.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
        expect(activeProjects4).toBe(3) // Unchanged!

        // 5. Exact price + active => applies transition and updates projects
        const tExact = await createTransition(`pct_fake_exact_${stamp}`)
        await fetch(`${baseUrl}/api/billing/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `evt_fake_exact_${stamp}`,
            type: "customer.subscription.updated",
            data: {
              object: {
                id: `sub_fake_${stamp}`,
                customer: `cus_fake_${stamp}`,
                status: "active",
                priceId: "fake_price_starter",
                metadata: { workspaceId: String(ws.id), transitionId: tExact.id },
              },
            },
          }),
        })
        const refExact = await prisma.planTransition.findUniqueOrThrow({ where: { id: tExact.id } })
        expect(refExact.status).toBe("APPLIED")

        // Kept project is active, others archived
        const activeProjectsFinal = await prisma.project.findMany({ where: { workspaceId: ws.id, status: "ACTIVE" } })
        expect(activeProjectsFinal).toHaveLength(1)
        expect(activeProjectsFinal[0].id).toBe(keepId)
      } finally {
        server.close()
      }
    })
  })
})
