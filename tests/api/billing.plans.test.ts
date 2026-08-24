import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"
import { resolveWorkspacePlan } from "../../server/lib/plans"
import { resolveEntitlement } from "../../server/lib/entitlements"

describe("RMO-LAUNCH-01 Commercial Plans & Project Capacity API", () => {
  it("resolves plan metadata correctly for Trial, Starter, and Pro", () => {
    // 1. Trial workspace
    const trialWs = { billingStatus: "TRIAL" as const, planKey: null, stripePriceId: null }
    const trialPlan = resolveWorkspacePlan(trialWs)
    expect(trialPlan.planKey).toBeNull()
    expect(trialPlan.maxActiveProjects).toBe(15)
    expect(trialPlan.isTrial).toBe(true)

    // 2. Starter workspace
    const starterWs = { billingStatus: "ACTIVE" as const, planKey: "STARTER", stripePriceId: null }
    const starterPlan = resolveWorkspacePlan(starterWs)
    expect(starterPlan.planKey).toBe("STARTER")
    expect(starterPlan.maxActiveProjects).toBe(1)
    expect(starterPlan.isTrial).toBe(false)

    // 3. Pro workspace
    const proWs = { billingStatus: "ACTIVE" as const, planKey: "PRO", stripePriceId: null }
    const proPlan = resolveWorkspacePlan(proWs)
    expect(proPlan.planKey).toBe("PRO")
    expect(proPlan.maxActiveProjects).toBe(15)
    expect(proPlan.isTrial).toBe(false)
  })

  it("enforces project capacity limits on Starter plan (max 1 active project) via API", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const stamp = Date.now()
      const now = new Date()

      const user = await prisma.user.create({
        data: {
          name: "Starter User",
          email: `starter.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "SU",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: "Starter Workspace",
          slug: `starter-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
      })

      // 1st project via the real enforcement path succeeds.
      const create1 = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ code: `PRJ1_${stamp}`.slice(0, 30), name: "Proyecto Uno", description: "", themeKey: "blue" }),
      })
      expect(create1.status).toBe(201)

      // 2nd project is blocked at the Starter limit.
      const create2 = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ code: `PRJ2_${stamp}`.slice(0, 30), name: "Proyecto Dos", description: "", themeKey: "blue" }),
      })
      expect(create2.status).toBe(409)
      expect((await create2.json()).code).toBe("PROJECT_LIMIT_EXCEEDED")

      // Archiving frees capacity.
      const p1 = await prisma.project.findFirstOrThrow({ where: { workspaceId: ws.id, status: "ACTIVE" } })
      const archive = await fetch(`${baseUrl}/api/projects/${p1.id}/archive`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(archive.status).toBe(200)

      // 2nd project now succeeds.
      const create3 = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ code: `PRJ2_${stamp}`.slice(0, 30), name: "Proyecto Dos", description: "", themeKey: "blue" }),
      })
      expect(create3.status).toBe(201)
    } finally {
      server.close()
    }
  })

  it("billing and entitlements consume one canonical plan resolution", () => {
    expect(resolveWorkspacePlan).toBe(resolveEntitlement)
  })

  it("handles downgrade protection and webhook price resolution via API", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 1
      const now = new Date()

      const user = await prisma.user.create({
        data: {
          name: "Pro Downgrader",
          email: `downgrade.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "PD",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: "Pro Downgrade Workspace",
          slug: `pro-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
      })

      // Create 2 active projects
      for (let i = 1; i <= 2; i++) {
        const p = await prisma.project.create({
          data: {
            workspaceId: ws.id,
            code: `P${i}_${stamp}`.slice(0, 30),
            name: `Proyecto ${i}`,
            description: `Proyecto activo ${i}`,
            status: "ACTIVE",
          },
        })
        await prisma.projectMember.create({
          data: { projectId: p.id, userId: user.id, role: "OWNER" },
        })
      }

      // 1. Check status returns correct plan and capacity details
      const statusRes = await fetch(`${baseUrl}/api/billing/status`, {
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(statusRes.status).toBe(200)
      const statusData = await statusRes.json()
      expect(statusData.planKey).toBe("PRO")
      expect(statusData.activeProjectsCount).toBe(2)
      expect(statusData.canDowngradeToStarter).toBe(false)

      // 2. Checkout without a persisted transition is rejected before any provider call.
      const downgradeRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(user.id),
        },
        body: JSON.stringify({ planKey: "STARTER" }),
      })
      expect(downgradeRes.status).toBe(400)

      // 3. Archive 1 project
      const projects = await prisma.project.findMany({ where: { workspaceId: ws.id } })
      await prisma.project.update({
        where: { id: projects[0].id },
        data: { status: "ARCHIVED" },
      })

      // 4. Now status shows canDowngradeToStarter = true
      const statusRes2 = await fetch(`${baseUrl}/api/billing/status`, {
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      const statusData2 = await statusRes2.json()
      expect(statusData2.activeProjectsCount).toBe(1)
      expect(statusData2.canDowngradeToStarter).toBe(true)

      // 5. Persist a compliant transition, then checkout to STARTER succeeds.
      const transitionRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER" }),
      })
      expect(transitionRes.status).toBe(201)
      const transitionId = (await transitionRes.json()).transitionId as string
      const starterCheckoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(user.id),
        },
        body: JSON.stringify({ planKey: "STARTER", transitionId }),
      })
      expect(starterCheckoutRes.status).toBe(200)
      const checkoutData = await starterCheckoutRes.json()
      expect(checkoutData.checkoutUrl).toContain("plan=STARTER")

      // 6. Webhook simulation with STARTER plan sets workspace to STARTER
      const eventId = `evt_starter_${stamp}`
      const webhookRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventId,
          type: "checkout.session.completed",
          data: {
            object: {
              customer: `cus_st_${stamp}`,
              subscription: `sub_st_${stamp}`,
              priceId: process.env.STRIPE_PRICE_STARTER || "fake_price_starter",
              metadata: {
                workspaceId: String(ws.id),
                planKey: "STARTER",
                transitionId,
              },
            },
          },
        }),
      })
      expect(webhookRes.status).toBe(200)

      const finalWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(finalWs.planKey).toBe("STARTER")
      expect(finalWs.billingStatus).toBe("ACTIVE")
    } finally {
      server.close()
    }
  })
})

describe("FIX-B1/B2/B3: resolución de compliance, gracia y restauración tras Pro (dirigido)", () => {
  async function makeOwnerWorkspace(stamp: string, planKey: "STARTER" | "PRO") {
    const user = await prisma.user.create({
      data: {
        name: "Fix Owner",
        email: `fix.owner.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "FO",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: `Fix WS ${stamp}`, slug: `fix-ws-${stamp}`, billingStatus: "ACTIVE", planKey },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })
    return { user, ws }
  }

  it("B1: Starter en PLAN_ACTION_REQUIRED se resuelve con initiate + resolve (sin checkout)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const stamp = Date.now()
      const { user, ws } = await makeOwnerWorkspace(`${stamp}-b1`, "STARTER")
      const projectIds: number[] = []
      for (let i = 0; i < 2; i++) {
        const p = await prisma.project.create({ data: { workspaceId: ws.id, code: `B1P${i}_${stamp}`.slice(0, 30), name: `P${i}`, description: "", status: "ACTIVE" } })
        await prisma.projectMember.create({ data: { projectId: p.id, userId: user.id, role: "OWNER" } })
        projectIds.push(p.id)
      }
      const keepId = projectIds[0]

      // Estado inicial: Starter efectivo con 2 proyectos activos -> exceso detectado.
      const statusBefore = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(user.id) } }).then((r) => r.json())
      expect(statusBefore.complianceStatus).toBe("PLAN_ACTION_REQUIRED")

      // Secuencia exacta del modo "resolve" del wizard: initiate -> resolve(transitionId).
      const initRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: keepId }),
      })
      expect(initRes.status).toBe(201)
      const initData = await initRes.json()

      const resolveRes = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ transitionId: initData.transitionId }),
      })
      expect(resolveRes.status).toBe(200)
      const resolveData = await resolveRes.json()
      expect(resolveData.keptProjectId).toBe(keepId)
      expect(resolveData.planLockedProjectIds.sort()).toEqual([projectIds[1]].sort())

      const statusAfter = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(user.id) } }).then((r) => r.json())
      expect(statusAfter.planKey).toBe("STARTER")
      expect(statusAfter.activeProjectsCount).toBe(1)
      expect(statusAfter.complianceStatus).toBe("COMPLIANT")
    } finally {
      server.close()
    }
  })

  it("B2: /billing/status expone graceEndsAt y planLockedProjectsCount", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const stamp = Date.now()
      const { user, ws } = await makeOwnerWorkspace(`${stamp}-b2`, "STARTER")
      await prisma.workspace.update({ where: { id: ws.id }, data: { graceEndsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000) } })
      await prisma.project.create({ data: { workspaceId: ws.id, code: `B2P_${stamp}`.slice(0, 30), name: "Locked", description: "", status: "ARCHIVED", archivedByPlan: true, planLockedAt: new Date() } })

      const status = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(user.id) } }).then((r) => r.json())
      expect(status.planLockedProjectsCount).toBe(1)
      expect(status.graceEndsAt).not.toBeNull()
      expect(new Date(status.graceEndsAt).getTime()).toBeGreaterThan(Date.now())
    } finally {
      server.close()
    }
  })

  it("B3: un proyecto bloqueado por plan se restaura en Pro (backend autoritativo)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const stamp = Date.now()
      const { user, ws } = await makeOwnerWorkspace(`${stamp}-b3`, "PRO")
      const locked = await prisma.project.create({ data: { workspaceId: ws.id, code: `B3P_${stamp}`.slice(0, 30), name: "Locked", description: "", status: "ARCHIVED", archivedByPlan: true, planLockedAt: new Date() } })
      await prisma.projectMember.create({ data: { projectId: locked.id, userId: user.id, role: "OWNER" } })

      const res = await fetch(`${baseUrl}/api/projects/${locked.id}/restore`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(res.status).toBe(200)
      expect(await prisma.project.findUniqueOrThrow({ where: { id: locked.id } })).toMatchObject({ status: "ACTIVE", archivedByPlan: false, planLockedAt: null })
    } finally {
      server.close()
    }
  })
})
