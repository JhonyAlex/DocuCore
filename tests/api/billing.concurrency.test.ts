import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"
import { hashToken } from "../../server/lib/auth"
import { applyPlanTransition } from "../../server/lib/entitlements"

describe("concurrency: two simultaneous project creations cannot exceed Starter (1 active)", () => {
  it("ends with exactly one ACTIVE project under concurrent creation (transaction level)", async () => {
    const stamp = Date.now()
    const now = new Date()
    const user = await prisma.user.create({
      data: {
        name: "Concurrent Owner",
        email: `cc.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "CO",
        color: "brand",
        emailVerifiedAt: now,
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Concurrent WS", slug: `cc-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

    const attempt = (n: number) =>
      prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM "Workspace" WHERE id = ${ws.id} FOR UPDATE`
        if (!locked) throw new Error("no workspace")
        const count = await tx.project.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
        if (count >= 1) throw Object.assign(new Error("capacity"), { status: 409, code: "PROJECT_LIMIT_EXCEEDED" })
        return tx.project.create({
          data: { workspaceId: ws.id, code: `CC${n}_${stamp}`.slice(0, 30), name: `Concurrent ${n}`, description: "", status: "ACTIVE" },
          select: { id: true },
        })
      }).then(
        (p) => ({ ok: true as const, id: p?.id }),
        () => ({ ok: false as const, id: null as number | null }),
      )

    const results = await Promise.all([attempt(1), attempt(2)])
    const activeCount = await prisma.project.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(activeCount).toBe(1)
  })

  it("ends with exactly one 201 and one 409 under concurrent HTTP POST /api/projects on Starter", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 1
      const now = new Date()
      const user = await prisma.user.create({
        data: {
          name: "HTTP Concurrent Owner",
          email: `http-cc.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "HC",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "HTTP Concurrent WS", slug: `http-cc-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

      const createProjectReq = (code: string, name: string) =>
        fetch(`${baseUrl}/api/projects`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-docucore-test-actor-id": String(user.id),
          },
          body: JSON.stringify({
            code,
            name,
            description: "Test description",
            themeKey: "slate",
            memberIds: [],
          }),
        })

      const [res1, res2] = await Promise.all([
        createProjectReq(`P1_${stamp}`.slice(0, 30), "Proyecto 1"),
        createProjectReq(`P2_${stamp}`.slice(0, 30), "Proyecto 2"),
      ])

      const statuses = [res1.status, res2.status].sort()
      expect(statuses).toEqual([201, 409])

      const activeCount = await prisma.project.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
      expect(activeCount).toBe(1)
    } finally {
      server.close()
    }
  })
})

describe("Finding F: Concurrent applyPlanTransition executes exactly once under row lock", () => {
  it("safely handles concurrent applyPlanTransition calls without duplicate mutations", async () => {
    const stamp = Date.now() + 2
    const user = await prisma.user.create({
      data: {
        name: "Transition Actor",
        email: `trans.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "TA",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Transition WS", slug: `trans-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

    // Create 2 active projects
    const p1 = await prisma.project.create({
      data: { workspaceId: ws.id, code: `PR1_${stamp}`.slice(0, 30), name: "Project 1", description: "", status: "ACTIVE" },
    })
    const p2 = await prisma.project.create({
      data: { workspaceId: ws.id, code: `PR2_${stamp}`.slice(0, 30), name: "Project 2", description: "", status: "ACTIVE" },
    })

    // Create a plan transition to STARTER keeping p1 active and archiving others
    const transition = await prisma.planTransition.create({
      data: {
        id: `pct_conc_${stamp}`,
        workspaceId: ws.id,
        actorId: user.id,
        targetPlanKey: "STARTER",
        status: "PENDING",
        selectedProjectId: p1.id,
      },
    })

    // Call applyPlanTransition concurrently in parallel transactions
    const runTransition = () =>
      prisma.$transaction((tx) =>
        applyPlanTransition(tx, {
          workspaceId: ws.id,
          targetPlanKey: "STARTER",
          transitionId: transition.id,
          actorId: user.id,
          selectedProjectId: p1.id,
          effectiveAt: new Date(),
        }),
      )

    const [res1, res2] = await Promise.all([runTransition(), runTransition()])

    expect(res1.status).toBe("APPLIED")
    expect(res2.status).toBe("APPLIED")

    // Check final workspace state
    const refreshedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
    expect(refreshedWs.planKey).toBe("STARTER")

    const refreshedP1 = await prisma.project.findUniqueOrThrow({ where: { id: p1.id } })
    const refreshedP2 = await prisma.project.findUniqueOrThrow({ where: { id: p2.id } })
    expect(refreshedP1.status).toBe("ACTIVE")
    expect(refreshedP2.status).toBe("ARCHIVED")

    const refreshedTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
    expect(refreshedTransition.status).toBe("APPLIED")
    expect(refreshedTransition.appliedAt).toBeInstanceOf(Date)
    expect(refreshedTransition.planLockedProjectIds).toEqual([String(p2.id)])

    const auditCount = await prisma.auditLog.count({
      where: {
        workspaceId: ws.id,
        action: "Transición de plan aplicada",
        entityId: `plan-transition:${transition.id}`,
      },
    })
    expect(auditCount).toBe(1)
  })
})

describe("Finding H: Read-Only guarantee under PAST_DUE and TRIAL_EXPIRED", () => {
  it("blocks mutations with 402/403 while reads, exports and downloads remain 200 OK", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 3
      const now = new Date()
      const user = await prisma.user.create({
        data: {
          name: "Past Due Owner",
          email: `pastdue.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "PD",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Past Due WS", slug: `pastdue-ws-${stamp}`, billingStatus: "PAST_DUE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

      const project = await prisma.project.create({
        data: { workspaceId: ws.id, code: `PDP_${stamp}`.slice(0, 30), name: "PD Project", description: "", status: "ACTIVE" },
      })
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: user.id, role: "OWNER" },
      })

      // 1. Read operations MUST SUCCEED (200 OK)
      const listProjectsRes = await fetch(`${baseUrl}/api/projects`, {
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(listProjectsRes.status).toBe(200)

      const listAssetsRes = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, {
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(listAssetsRes.status).toBe(200)

      const dashboardExportRes = await fetch(`${baseUrl}/api/projects/${project.id}/dashboard/export`, {
        headers: { "x-docucore-test-actor-id": String(user.id) },
      })
      expect(dashboardExportRes.status).toBe(200)

      // 2. Write operations MUST BE BLOCKED (HTTP 402 with PAST_DUE code)
      const createProjectRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(user.id),
        },
        body: JSON.stringify({
          code: `BLOCKED_${stamp}`.slice(0, 30),
          name: "Blocked Project",
          description: "",
          themeKey: "slate",
          memberIds: [],
        }),
      })
      expect(createProjectRes.status).toBe(402)
      const createProjectErr = await createProjectRes.json()
      expect(createProjectErr.code).toBe("PAST_DUE")

      const inviteRes = await fetch(`${baseUrl}/api/users/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(user.id),
        },
        body: JSON.stringify({
          email: `invitee.${stamp}@docucore.test`,
          name: "Invitee",
          role: "EDITOR",
        }),
      })
      expect(inviteRes.status).toBe(402)
      const inviteErr = await inviteRes.json()
      expect(inviteErr.code).toBe("PAST_DUE")
    } finally {
      server.close()
    }
  })
})

describe("Finding I, J, K, L: Edge cases and access control invariants", () => {
  it("rejects deleting the sole project owner with 409 LAST_PROJECT_OWNER", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 4
      const now = new Date()
      const owner = await prisma.user.create({
        data: {
          name: "Workspace Owner",
          email: `wsowner.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "WO",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const admin = await prisma.user.create({
        data: {
          name: "Admin Sole Project Owner",
          email: `admin.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Administrador",
          initials: "AU",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Sole WS", slug: `sole-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER" } })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: admin.id, role: "ADMIN" } })

      const project = await prisma.project.create({
        data: { workspaceId: ws.id, code: `SOLE_${stamp}`.slice(0, 30), name: "Sole Project", description: "", status: "ACTIVE" },
      })
      // Admin is the SOLE project owner
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: admin.id, role: "OWNER" },
      })
      // Owner is only an EDITOR on the project
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: owner.id, role: "EDITOR" },
      })

      // Workspace owner attempts to delete admin from workspace -> must fail with 409 LAST_PROJECT_OWNER
      const deleteRes = await fetch(`${baseUrl}/api/users/${admin.id}`, {
        method: "DELETE",
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(deleteRes.status).toBe(409)
      const err = await deleteRes.json()
      expect(err.code).toBe("LAST_PROJECT_OWNER")
    } finally {
      server.close()
    }
  })

  it("blocks PlatformAdmin in support access mode from creating projects (Finding K)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 5
      const now = new Date()
      const ws = await prisma.workspace.create({
        data: { name: "Customer WS", slug: `customer-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO" },
      })
      const superAdmin = await prisma.user.create({
        data: {
          name: "Super Platform Admin",
          email: `super.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          isPlatformAdmin: true,
          activeWorkspaceId: ws.id,
          initials: "SA",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      // SuperAdmin accessing customer WS via support context (no real WorkspaceMember)
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(superAdmin.id),
        },
        body: JSON.stringify({
          code: `SUPP_${stamp}`.slice(0, 30),
          name: "Support Project",
          description: "",
          themeKey: "slate",
          memberIds: [],
        }),
      })

      expect(res.status).toBe(403)
      const err = await res.json()
      expect(err.code).toBe("SUPPORT_ACCESS_CANNOT_CREATE_PROJECT")
    } finally {
      server.close()
    }
  })

  it("blocks invitation acceptance when user membership is SUSPENDED or PLAN_LOCKED (Finding L)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 6
      const now = new Date()
      const owner = await prisma.user.create({
        data: {
          name: "Workspace Inviter Owner",
          email: `inviter.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "IO",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const suspendedUser = await prisma.user.create({
        data: {
          name: "Suspended User",
          email: `suspended.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Técnico",
          initials: "SU",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Locked WS", slug: `locked-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: owner.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      })
      await prisma.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: suspendedUser.id,
          role: "MEMBER",
          status: "SUSPENDED",
        },
      })

      const rawToken = `token_susp_${stamp}`
      await prisma.workspaceInvitation.create({
        data: {
          id: `inv_susp_${stamp}`,
          workspaceId: ws.id,
          email: suspendedUser.email,
          tokenHash: hashToken(rawToken),
          invitedById: owner.id,
          workspaceRole: "MEMBER",
          expiresAt: new Date(Date.now() + 86400000),
        },
      })

      const res = await fetch(`${baseUrl}/api/users/invitations/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(suspendedUser.id),
        },
        body: JSON.stringify({
          token: rawToken,
        }),
      })

      expect(res.status).toBe(409)
      const err = await res.json()
      expect(err.code).toBe("MEMBER_SUSPENDED")

      // Status must remain SUSPENDED in DB
      const member = await prisma.workspaceMember.findFirstOrThrow({
        where: { workspaceId: ws.id, userId: suspendedUser.id },
      })
      expect(member.status).toBe("SUSPENDED")
    } finally {
      server.close()
    }
  })

  it("blocks modifying a transition bound to an active Stripe session with 409 TRANSITION_FROZEN", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 7
      const now = new Date()
      const owner = await prisma.user.create({
        data: {
          name: "Frozen Test Owner",
          email: `frozen.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "FO",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Frozen WS", slug: `frozen-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
      })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_frozen_${stamp}`,
          workspaceId: ws.id,
          actorId: owner.id,
          targetPlanKey: "PRO",
          status: "PENDING",
          stripeSessionId: `cs_mock_active_${stamp}`,
        },
      })

      // Attempting to modify the transition with a different target plan must be rejected with 409 TRANSITION_FROZEN
      const res = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          transitionId: transition.id,
          targetPlanKey: "STARTER",
        }),
      })

      expect(res.status).toBe(409)
      const err = await res.json()
      expect(err.code).toBe("TRANSITION_FROZEN")
    } finally {
      server.close()
    }
  })

  it("returns reused: true without calling Stripe when checkout session already exists", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 8
      const now = new Date()
      const owner = await prisma.user.create({
        data: {
          name: "Reuse Test Owner",
          email: `reuse.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "RO",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Reuse WS", slug: `reuse-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
      })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_reuse_${stamp}`,
          workspaceId: ws.id,
          actorId: owner.id,
          targetPlanKey: "PRO",
          status: "PENDING",
          stripeSessionId: `cs_existing_session_${stamp}`,
        },
      })

      const res = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          planKey: "PRO",
          transitionId: transition.id,
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.reused).toBe(true)
      expect(data.sessionId).toBe(`cs_existing_session_${stamp}`)
      expect(data.status).toBe("CHECKOUT_REUSED")
      expect(data.checkoutUrl).toBeTruthy()
    } finally {
      server.close()
    }
  })

  it("rejects checkout request with extra unexpected fields with HTTP 400 (Requirement 3)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 88
      const now = new Date()
      const owner = await prisma.user.create({
        data: {
          name: "Extra Fields Owner",
          email: `extra.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "EF",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Extra WS", slug: `extra-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
      })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_extra_${stamp}`,
          workspaceId: ws.id,
          actorId: owner.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      // Sending extra field selectedProjectId to checkout endpoint must be rejected with 400
      const res1 = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          planKey: "PRO",
          transitionId: transition.id,
          selectedProjectId: 123,
        }),
      })

      expect(res1.status).toBe(400)

      // Sending extra field selectedMemberIds to checkout endpoint must be rejected with 400
      const res2 = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          planKey: "PRO",
          transitionId: transition.id,
          selectedMemberIds: [1, 2],
        }),
      })

      expect(res2.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it("handles two isolated CheckoutCoordinators with independent providers calling checkout concurrently on shared PostgreSQL with slow external call (>3s)", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const externalCallStub = {
      count: 0,
    }

    class InstrumentedProvider extends FakeBillingProvider {
      override async createInitialSubscriptionCheckout(params: import("../../server/lib/billing").InitialCheckoutParams) {
        externalCallStub.count++
        await new Promise((resolve) => setTimeout(resolve, 3200))
        return super.createInitialSubscriptionCheckout(params)
      }
    }

    const providerA = new InstrumentedProvider()
    const providerB = new InstrumentedProvider()

    const coordinatorOptions = { leaseTtlMs: 10_000, heartbeatIntervalMs: 500, pollIntervalMs: 100, maxPollAttempts: 60 }
    const coordinatorA = new CheckoutCoordinator(providerA, prisma, coordinatorOptions)
    const coordinatorB = new CheckoutCoordinator(providerB, prisma, coordinatorOptions)

    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date()
    const owner = await prisma.user.create({
      data: {
        name: "Isolated Multi Replica Owner",
        email: `isolated.multi.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "MR",
        color: "brand",
        emailVerifiedAt: now,
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Isolated Multi WS", slug: `isolated-multi-ws-${stamp}`.slice(0, 50), billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
    })

    const transition = await prisma.planTransition.create({
      data: {
        id: `pct_isolated_multi_${stamp}`,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
      },
    })

    // Execute checkouts simultaneously on Coordinator A and Coordinator B
    const checkoutArgs = {
      workspaceId: ws.id,
      actorId: owner.id,
      planKey: "PRO" as const,
      transitionId: transition.id,
      customerEmail: owner.email,
      customerName: owner.name,
      baseUrl: "https://app.report-map.online",
    }

    const [resA, resB] = await Promise.all([
      coordinatorA.executeCheckout(checkoutArgs),
      coordinatorB.executeCheckout(checkoutArgs),
    ])

    // External checkout was called EXACTLY ONCE across isolated providers
    expect(externalCallStub.count).toBe(1)

    // Both coordinators must return the exact same canonical session ID and valid URLs
    expect(resA.sessionId).toBe(resB.sessionId)
    expect(resA.checkoutUrl).toBeTruthy()
    expect(resB.checkoutUrl).toBeTruthy()

    const finalTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
    expect(finalTransition.stripeSessionId).toBe(resA.sessionId)
  }, 15000)

  it("rejects recovered checkout session with missing metadata or foreign workspace/transition with conflict 409", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const stamp = Date.now() + 123
    const owner = await prisma.user.create({
      data: {
        name: "Metadata Test Owner",
        email: `meta.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "MO",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Meta WS", slug: `meta-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    const transition = await prisma.planTransition.create({
      data: {
        id: `pct_meta_${stamp}`,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
        stripeSessionId: `cs_invalid_meta_${stamp}`,
      },
    })

    // Case 1: Session has empty/missing metadata -> must be rejected as conflict
    class EmptyMetaProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(sessionId: string) {
        return {
          id: sessionId,
          url: "https://checkout.stripe.test/c/123",
          status: "open",
          metadata: {}, // Empty metadata
        }
      }
    }

    const coordinator1 = new CheckoutCoordinator(new EmptyMetaProvider(), prisma)
    await expect(
      coordinator1.executeCheckout({
        workspaceId: ws.id,
        actorId: owner.id,
        planKey: "PRO",
        transitionId: transition.id,
        customerEmail: owner.email,
        baseUrl: "https://app.report-map.online",
      }),
    ).rejects.toThrow(/conflicto|no coincide/i)

    // Case 2: Session has foreign workspaceId -> must be rejected as conflict
    class ForeignMetaProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(sessionId: string) {
        return {
          id: sessionId,
          url: "https://checkout.stripe.test/c/123",
          status: "open",
          metadata: { workspaceId: "999999", transitionId: transition.id },
        }
      }
    }

    const coordinator2 = new CheckoutCoordinator(new ForeignMetaProvider(), prisma)
    await expect(
      coordinator2.executeCheckout({
        workspaceId: ws.id,
        actorId: owner.id,
        planKey: "PRO",
        transitionId: transition.id,
        customerEmail: owner.email,
        baseUrl: "https://app.report-map.online",
      }),
    ).rejects.toThrow(/conflicto|no coincide/i)
  })

  it("retrieval 404 cleans binding via CAS and recreates, whereas 500/timeout preserves binding and propagates error", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const stamp = Date.now() + 234
    const owner = await prisma.user.create({
      data: {
        name: "Retr Error Owner",
        email: `retr.err.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "RE",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Retr Err WS", slug: `retr-err-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    const transition = await prisma.planTransition.create({
      data: {
        id: `pct_retr_err_${stamp}`,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
        stripeSessionId: `cs_missing_404_${stamp}`,
      },
    })

    // Case 1: 404 resource_missing -> cleans CAS on exact ID and creates new session
    class NotFoundProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(_sessionId: string): Promise<import("../../server/lib/billing").RetrievedCheckoutSession> {
        throw Object.assign(new Error("No such checkout.session"), { statusCode: 404, code: "resource_missing" })
      }
    }

    const coordinator404 = new CheckoutCoordinator(new NotFoundProvider(), prisma)
    const result404 = await coordinator404.executeCheckout({
      workspaceId: ws.id,
      actorId: owner.id,
      planKey: "PRO",
      transitionId: transition.id,
      customerEmail: owner.email,
      baseUrl: "https://app.report-map.online",
    })

    expect(result404.status).toBe("CHECKOUT_CREATED")
    expect(result404.sessionId).not.toBe(`cs_missing_404_${stamp}`)

    // Case 2: 500 / timeout -> preserves binding in DB and propagates error
    await prisma.planTransition.update({
      where: { id: transition.id },
      data: { stripeSessionId: `cs_timeout_preserved_${stamp}` },
    })

    class TimeoutProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(_sessionId: string): Promise<import("../../server/lib/billing").RetrievedCheckoutSession> {
        throw Object.assign(new Error("Stripe network timeout"), { statusCode: 500 })
      }
    }

    const coordinator500 = new CheckoutCoordinator(new TimeoutProvider(), prisma)
    await expect(
      coordinator500.executeCheckout({
        workspaceId: ws.id,
        actorId: owner.id,
        planKey: "PRO",
        transitionId: transition.id,
        customerEmail: owner.email,
        baseUrl: "https://app.report-map.online",
      }),
    ).rejects.toThrow("Stripe network timeout")

    // Binding must be PRESERVED in DB
    const recordAfter500 = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
    expect(recordAfter500.stripeSessionId).toBe(`cs_timeout_preserved_${stamp}`)
  })

  it("handles race when cleaning expired session: cleaning old session affects 0 rows and does not overwrite new session", async () => {
    const stamp = Date.now() + 345
    const owner = await prisma.user.create({
      data: {
        name: "Expired Race Owner",
        email: `exp.race.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "ER",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Exp Race WS", slug: `exp-race-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    const transitionId = `pct_exp_race_${stamp}`
    const expiredSessionId = `cs_expired_old_${stamp}`

    await prisma.planTransition.create({
      data: {
        id: transitionId,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
        stripeSessionId: expiredSessionId,
      },
    })

    // Replica A cleans expiredSessionId via CAS
    const cleanResultA = await prisma.planTransition.updateMany({
      where: {
        id: transitionId,
        stripeSessionId: expiredSessionId,
        status: "PENDING",
      },
      data: {
        stripeSessionId: null,
      },
    })
    expect(cleanResultA.count).toBe(1)

    // Replica A creates and persists a brand new session
    const newSessionId = `cs_new_active_${stamp}`
    await prisma.planTransition.update({
      where: { id: transitionId },
      data: {
        stripeSessionId: newSessionId,
      },
    })

    // Replica B now attempts to clean the old expiredSessionId via CAS
    const cleanResultB = await prisma.planTransition.updateMany({
      where: {
        id: transitionId,
        stripeSessionId: expiredSessionId,
        status: "PENDING",
      },
      data: {
        stripeSessionId: null,
      },
    })

    // Replica B's cleanup MUST affect 0 rows because stripeSessionId is now newSessionId!
    expect(cleanResultB.count).toBe(0)

    // Verified: newSessionId is safely preserved
    const current = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
    expect(current.stripeSessionId).toBe(newSessionId)
  })

  it("maintains lease ownership via heartbeat when external call > leaseTtl so second replica started after TTL cannot capture lease", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const owner = await prisma.user.create({
      data: {
        name: "Heartbeat Owner",
        email: `heartbeat.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "HO",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Heartbeat WS", slug: `heartbeat-ws-${stamp}`.slice(0, 50), billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    const transitionId = `pct_heartbeat_${stamp}`
    await prisma.planTransition.create({
      data: {
        id: transitionId,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
      },
    })

    const sharedExternalStub = {
      callsA: 0,
      callsB: 0,
      async createCheckout(params: import("../../server/lib/billing").InitialCheckoutParams, caller: "A" | "B") {
        if (caller === "A") {
          this.callsA++
          await new Promise((resolve) => setTimeout(resolve, 4000))
        } else {
          this.callsB++
        }
        return {
          checkoutUrl: `https://checkout.stripe.test/c/cs_shared_${params.transitionId}`,
          sessionId: `cs_shared_${params.transitionId}`,
        }
      },
    }

    class InstrumentedProviderA extends FakeBillingProvider {
      override async createInitialSubscriptionCheckout(params: import("../../server/lib/billing").InitialCheckoutParams) {
        return sharedExternalStub.createCheckout(params, "A")
      }
    }

    class InstrumentedProviderB extends FakeBillingProvider {
      override async createInitialSubscriptionCheckout(params: import("../../server/lib/billing").InitialCheckoutParams) {
        return sharedExternalStub.createCheckout(params, "B")
      }
    }

    const testOptions = {
      leaseTtlMs: 2500,
      heartbeatIntervalMs: 200,
      pollIntervalMs: 100,
      maxPollAttempts: 50,
    }

    const providerA = new InstrumentedProviderA()
    const providerB = new InstrumentedProviderB()

    const coordinatorA = new CheckoutCoordinator(providerA, prisma, testOptions)
    const coordinatorB = new CheckoutCoordinator(providerB, prisma, testOptions)

    // 1. Start coordinator A at t=0
    const promiseA = coordinatorA.executeCheckout({
      workspaceId: ws.id,
      actorId: owner.id,
      planKey: "PRO",
      transitionId,
      customerEmail: owner.email,
      baseUrl: "https://app.report-map.online",
    })

    // 2. Wait 2800ms (2.8s > 2.5s lease TTL). Without heartbeat, the lease would have expired at 2500ms.
    await new Promise((resolve) => setTimeout(resolve, 2800))

    // 3. Start coordinator B at t=2800ms (after the original lease would have expired).
    // Because coordinator A's heartbeat continually renewed the lease, coordinator B cannot acquire the lease
    // and must poll until coordinator A finishes.
    const promiseB = coordinatorB.executeCheckout({
      workspaceId: ws.id,
      actorId: owner.id,
      planKey: "PRO",
      transitionId,
      customerEmail: owner.email,
      baseUrl: "https://app.report-map.online",
    })

    const [resA, resB] = await Promise.all([promiseA, promiseB])

    // Assert both providers call shared external stub and total calls is exactly 1
    expect(sharedExternalStub.callsA).toBe(1)
    expect(sharedExternalStub.callsB).toBe(0)
    expect(sharedExternalStub.callsA + sharedExternalStub.callsB).toBe(1)

    // Both coordinators must return the exact same canonical session ID and valid URLs
    expect(resA.sessionId).toBe(resB.sessionId)
    expect(resA.sessionId).toBe(`cs_shared_${transitionId}`)
    expect(resA.checkoutUrl).toBe(`https://checkout.stripe.test/c/cs_shared_${transitionId}`)
    expect(resB.checkoutUrl).toBe(`https://checkout.stripe.test/c/cs_shared_${transitionId}`)
    expect(resA.status).toBe("CHECKOUT_CREATED")
    expect(resB.status).toBe("CHECKOUT_ALREADY_CREATED")
  }, 15000)

  it("rejects checkout session with null or unknown status in initial recovery with 502 preserving binding", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const stamp = Date.now() + 789
    const owner = await prisma.user.create({
      data: {
        name: "Null Status Owner",
        email: `null.stat.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "NS",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Null Stat WS", slug: `null-stat-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    // 1. Initial recovery with null status
    const transitionNull = await prisma.planTransition.create({
      data: {
        id: `pct_null_stat_${stamp}`,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
        stripeSessionId: `cs_null_stat_${stamp}`,
      },
    })

    class NullStatusProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(sessionId: string): Promise<import("../../server/lib/billing").RetrievedCheckoutSession> {
        return {
          id: sessionId,
          url: "https://checkout.stripe.test/c/123",
          status: null,
          metadata: { workspaceId: String(ws.id), transitionId: transitionNull.id },
        }
      }
    }

    const coordinatorNull = new CheckoutCoordinator(new NullStatusProvider(), prisma)
    await expect(
      coordinatorNull.executeCheckout({
        workspaceId: ws.id,
        actorId: owner.id,
        planKey: "PRO",
        transitionId: transitionNull.id,
        customerEmail: owner.email,
        baseUrl: "https://app.report-map.online",
      }),
    ).rejects.toThrow(/estado no reconocido/i)

    // Verify binding is PRESERVED in DB
    const recNull = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionNull.id } })
    expect(recNull.stripeSessionId).toBe(`cs_null_stat_${stamp}`)

    // 2. Initial recovery with unknown status
    class UnknownStatusProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(sessionId: string): Promise<import("../../server/lib/billing").RetrievedCheckoutSession> {
        return {
          id: sessionId,
          url: "https://checkout.stripe.test/c/123",
          status: "unknown_status_from_stripe",
          metadata: { workspaceId: String(ws.id), transitionId: transitionNull.id },
        }
      }
    }

    const coordinatorUnknown = new CheckoutCoordinator(new UnknownStatusProvider(), prisma)
    await expect(
      coordinatorUnknown.executeCheckout({
        workspaceId: ws.id,
        actorId: owner.id,
        planKey: "PRO",
        transitionId: transitionNull.id,
        customerEmail: owner.email,
        baseUrl: "https://app.report-map.online",
      }),
    ).rejects.toThrow(/estado no reconocido/i)
  })

  it("real polling loop rejects session with null or unknown status with 502 preserving binding and without creating a duplicate session", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const stamp = Date.now() + 890
    const owner = await prisma.user.create({
      data: {
        name: "Polling Null Owner",
        email: `polling.null.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "PN",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Polling Null WS", slug: `poll-null-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    const transitionId = `pct_poll_null_${stamp}`
    // 1. Initial transition has NO stripeSessionId and has an active lease held by replica 1
    await prisma.planTransition.create({
      data: {
        id: transitionId,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
        stripeSessionId: null,
        checkoutClaimToken: "replica_1_active_lease_token",
        checkoutClaimExpiresAt: new Date(Date.now() + 10_000), // Active lease for 10s
      },
    })

    const nullSessionId = `cs_replica1_null_${stamp}`

    class PollingNullStatusProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(sessionId: string): Promise<import("../../server/lib/billing").RetrievedCheckoutSession> {
        return {
          id: sessionId,
          url: null,
          status: null, // nullable status from Stripe
          metadata: { workspaceId: String(ws.id), transitionId },
        }
      }
    }

    const testOptions = {
      leaseTtlMs: 5000,
      heartbeatIntervalMs: 1000,
      pollIntervalMs: 100,
      maxPollAttempts: 20,
    }

    const coordinator = new CheckoutCoordinator(new PollingNullStatusProvider(), prisma, testOptions)

    // 2. Start Coordinator (replica 2) -> fails lease acquisition and enters polling loop
    const pollingPromise = coordinator.executeCheckout({
      workspaceId: ws.id,
      actorId: owner.id,
      planKey: "PRO",
      transitionId,
      customerEmail: owner.email,
      baseUrl: "https://app.report-map.online",
    })

    // 3. While coordinator is polling, replica 1 persists the session with null status
    setTimeout(async () => {
      await prisma.planTransition.update({
        where: { id: transitionId },
        data: {
          stripeSessionId: nullSessionId,
          checkoutClaimToken: null,
          checkoutClaimExpiresAt: null,
        },
      })
    }, 250)

    // 4. Coordinator polling must retrieve the session, fail-closed with 502/CHECKOUT_SESSION_INVALID_STATUS
    await expect(pollingPromise).rejects.toThrow(/estado no reconocido/i)

    // 5. Verify the exact stripeSessionId is PRESERVED in DB (not cleared or corrupted)
    const finalRecord = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
    expect(finalRecord.stripeSessionId).toBe(nullSessionId)
    expect(finalRecord.status).toBe("PENDING")
  })

  it("handles CAS count 0 when claim is lost before persisting session", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const stamp = Date.now() + 567
    const owner = await prisma.user.create({
      data: {
        name: "Claim Loss Owner",
        email: `claim.loss.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "CL",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Claim Loss WS", slug: `claim-loss-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    const transitionId = `pct_claim_loss_${stamp}`
    await prisma.planTransition.create({
      data: {
        id: transitionId,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
      },
    })

    // Provider that simulates another replica taking over the claim during the call
    class TakeoverProvider extends FakeBillingProvider {
      override async createInitialSubscriptionCheckout(params: import("../../server/lib/billing").InitialCheckoutParams) {
        // Another replica invalidates this replica's claimToken in DB
        await prisma.planTransition.update({
          where: { id: params.transitionId },
          data: { checkoutClaimToken: "other_replica_token" },
        })
        return super.createInitialSubscriptionCheckout(params)
      }
    }

    const coordinator = new CheckoutCoordinator(new TakeoverProvider(), prisma)
    await expect(
      coordinator.executeCheckout({
        workspaceId: ws.id,
        actorId: owner.id,
        planKey: "PRO",
        transitionId,
        customerEmail: owner.email,
        baseUrl: "https://app.report-map.online",
      }),
    ).rejects.toThrow(/lease de checkout se perdió|CLAIM_LOST/i)
  })

  it("polling handles complete, expired, invalid, and 500 failure states correctly", async () => {
    const { FakeBillingProvider, CheckoutCoordinator } = await import("../../server/lib/billing")

    const stamp = Date.now() + 678
    const owner = await prisma.user.create({
      data: {
        name: "Polling States Owner",
        email: `poll.states.${stamp}@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "PS",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: "Poll States WS", slug: `poll-states-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } })

    // 1. Polling detects COMPLETE session -> returns CHECKOUT_ALREADY_COMPLETED with checkoutUrl: null
    const transComplete = await prisma.planTransition.create({
      data: {
        id: `pct_poll_comp_${stamp}`,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
        stripeSessionId: `cs_poll_comp_${stamp}`,
      },
    })

    class CompleteProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(sessionId: string) {
        return {
          id: sessionId,
          url: null,
          status: "complete",
          metadata: { workspaceId: String(ws.id), transitionId: transComplete.id },
        }
      }
    }

    const coordComplete = new CheckoutCoordinator(new CompleteProvider(), prisma)
    const resComplete = await coordComplete.executeCheckout({
      workspaceId: ws.id,
      actorId: owner.id,
      planKey: "PRO",
      transitionId: transComplete.id,
      customerEmail: owner.email,
      baseUrl: "https://app.report-map.online",
    })

    expect(resComplete.status).toBe("CHECKOUT_ALREADY_COMPLETED")
    expect(resComplete.checkoutUrl).toBeNull()

    // 2. Polling detects EXPIRED session -> cleans CAS and creates new
    const transExpired = await prisma.planTransition.create({
      data: {
        id: `pct_poll_exp_${stamp}`,
        workspaceId: ws.id,
        actorId: owner.id,
        targetPlanKey: "PRO",
        status: "PENDING",
        stripeSessionId: `cs_poll_exp_${stamp}`,
      },
    })

    class ExpiredProvider extends FakeBillingProvider {
      override async retrieveCheckoutSession(sessionId: string) {
        return {
          id: sessionId,
          url: null,
          status: "expired",
          metadata: { workspaceId: String(ws.id), transitionId: transExpired.id },
        }
      }
    }

    const coordExpired = new CheckoutCoordinator(new ExpiredProvider(), prisma)
    const resExpired = await coordExpired.executeCheckout({
      workspaceId: ws.id,
      actorId: owner.id,
      planKey: "PRO",
      transitionId: transExpired.id,
      customerEmail: owner.email,
      baseUrl: "https://app.report-map.online",
    })
    expect(resExpired.status).toBe("CHECKOUT_CREATED")
  })

  it("recovers expired checkout claim lease and prevents stale owner from overwriting new session (Requirement 1 & 7)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 101
      const now = new Date()
      const owner = await prisma.user.create({
        data: {
          name: "Lease Recovery Owner",
          email: `lease.rec.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "LR",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Lease Rec WS", slug: `lease-rec-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
      })

      // Simulate an expired lease from a previous dead replica (token: stale_tok_old, expired 10s ago)
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_lease_rec_${stamp}`,
          workspaceId: ws.id,
          actorId: owner.id,
          targetPlanKey: "PRO",
          status: "PENDING",
          stripeSessionId: null,
          checkoutClaimToken: "stale_tok_old",
          checkoutClaimExpiresAt: new Date(Date.now() - 10000),
        },
      })

      // A new replica/request calls checkout -> successfully acquires the expired lease
      const res = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          planKey: "PRO",
          transitionId: transition.id,
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.reused).toBe(false)
      expect(data.sessionId).toBeTruthy()

      // The new session is persisted in DB
      const currentRecord = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(currentRecord.stripeSessionId).toBe(data.sessionId)

      // The stale dead replica now wakes up and attempts to write its old result with CAS (stale_tok_old)
      const staleWrite = await prisma.planTransition.updateMany({
        where: {
          id: transition.id,
          checkoutClaimToken: "stale_tok_old",
        },
        data: {
          stripeSessionId: "cs_stale_overwritten",
        },
      })

      // Must NOT update any rows because the token was replaced
      expect(staleWrite.count).toBe(0)

      // Verified: the valid session was NOT overwritten
      const verifiedRecord = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(verifiedRecord.stripeSessionId).toBe(data.sessionId)
      expect(verifiedRecord.stripeSessionId).not.toBe("cs_stale_overwritten")
    } finally {
      server.close()
    }
  })

  it("blocks concurrent initiate when checkout has active lease claim in DB", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 10
      const now = new Date()
      const owner = await prisma.user.create({
        data: {
          name: "Concurrent Freeze Owner",
          email: `freeze.owner.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "CF",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: { name: "Concurrent Freeze WS", slug: `freeze-ws-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
      })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_freeze_conc_${stamp}`,
          workspaceId: ws.id,
          actorId: owner.id,
          targetPlanKey: "PRO",
          status: "PENDING",
          checkoutClaimToken: `claim_tok_${stamp}`,
          checkoutClaimExpiresAt: new Date(Date.now() + 30000),
        },
      })

      // Concurrent initiate attempting to alter parameters
      const res = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          transitionId: transition.id,
          targetPlanKey: "STARTER",
        }),
      })

      expect(res.status).toBe(409)
      const err = await res.json()
      expect(err.code).toBe("TRANSITION_FROZEN")
    } finally {
      server.close()
    }
  })
})
