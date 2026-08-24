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

      // 1. Every billing action starts with a durable transition.
      const transitionRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "PRO" }),
      })
      expect(transitionRes.status).toBe(201)
      const transitionId = (await transitionRes.json()).transitionId as string

      const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(user.id),
        },
        body: JSON.stringify({ planKey: "PRO", transitionId }),
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
              metadata: { workspaceId: String(ws.id), planKey: "PRO", transitionId },
            },
          },
        }),
      })
      expect(webhookRes1.status).toBe(200)

      let updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      // Since ws was in trial and checkout was for Pro without trial_end in webhook payload, billingStatus is preserved/active
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

      // 5. An old payment success event cannot restore entitlement by itself.
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
      expect(updatedWs.billingStatus).toBe("PAST_DUE")

      // A current subscription event is authoritative and may restore ACTIVE.
      const recoveredRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_sub_recovered_${stamp}`,
          type: "customer.subscription.updated",
          data: { object: { id: `sub_${stamp}`, customer: `cus_${stamp}`, status: "active", items: { data: [{ price: { id: "fake_price_pro" } }] }, metadata: { workspaceId: String(ws.id), planKey: "PRO", transitionId } } },
        }),
      })
      expect(recoveredRes.status).toBe(200)
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

  it("upgrade Starter -> Pro on existing subscription modifies existing subscription directly without creating a second Checkout Session", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 10
      const now = new Date()

      const user = await prisma.user.create({
        data: {
          name: "Upgrade Subscriber",
          email: `upg.${stamp}@docucore.test`,
          passwordHash: await hashPassword("SubPassword2026!"),
          role: "Propietario",
          initials: "US",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: "Empresa Upgrade",
          slug: `empresa-upg-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_existing_${stamp}`,
          stripeSubscriptionId: `sub_existing_${stamp}`,
          stripePriceId: "fake_price_starter",
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
      })

      // Upgrade to PRO: since stripeSubscriptionId exists, it modifies the existing subscription.
      const transitionRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "PRO" }),
      })
      expect(transitionRes.status).toBe(201)
      const transitionId = (await transitionRes.json()).transitionId as string
      const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(user.id),
        },
        body: JSON.stringify({ planKey: "PRO", transitionId }),
      })
      expect(checkoutRes.status).toBe(200)
      const data = await checkoutRes.json()
      // Does NOT return checkoutUrl; returns nextAction REFRESH_BILLING and success confirmation
      expect(data.checkoutUrl).toBeNull()
      expect(data.nextAction).toBe("REFRESH_BILLING")
      expect(data.success).toBe(true)
      expect(data.planKey).toBe("PRO")

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.planKey).toBe("PRO")
      expect(updatedWs.stripeSubscriptionId).toBe(`sub_existing_${stamp}`) // Reused existing subscription
      expect(updatedWs.stripeCustomerId).toBe(`cus_existing_${stamp}`) // Reused customer
      expect(updatedWs.stripeScheduleId).toBeNull() // Schedule cleared
    } finally {
      server.close()
    }
  })

  it("downgrade Pro -> Starter on existing subscription schedules change for period end, retains Pro entitlements until period end, applies transition at period end, and is idempotent on duplicate events", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 20
      const now = new Date()
      const periodEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000)

      // 1. Create Owner + 4 additional members (5 members total)
      const owner = await prisma.user.create({
        data: {
          name: "Downgrade Owner",
          email: `down.owner.${stamp}@docucore.test`,
          passwordHash: await hashPassword("SubPassword2026!"),
          role: "Propietario",
          initials: "DO",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: "Empresa Downgrade Schedule",
          slug: `empresa-down-sched-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_down_${stamp}`,
          stripeSubscriptionId: `sub_down_${stamp}`,
          stripePriceId: "fake_price_pro",
          currentPeriodEnd: periodEnd,
        },
      })

      const ownerMember = await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
      })

      const otherMembers = []
      for (let i = 1; i <= 4; i++) {
        const u = await prisma.user.create({
          data: {
            name: `Member ${i}`,
            email: `member.${i}.${stamp}@docucore.test`,
            passwordHash: await hashPassword("SubPassword2026!"),
            role: "Operador",
            initials: `M${i}`,
            color: "brand",
            emailVerifiedAt: now,
          },
        })
        const m = await prisma.workspaceMember.create({
          data: { workspaceId: ws.id, userId: u.id, role: "MEMBER", status: "ACTIVE" },
        })
        otherMembers.push(m)
      }

      // Create 2 active projects
      const project1 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `PRJ-A-${stamp}`, name: "Project Alpha", description: "Desc Alpha", status: "ACTIVE" },
      })
      const project2 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `PRJ-B-${stamp}`, name: "Project Beta", description: "Desc Beta", status: "ACTIVE" },
      })

      // Check initial Pro status: 15/15 capacity, 0 locked
      const statusRes0 = await fetch(`${baseUrl}/api/billing/status`, {
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(statusRes0.status).toBe(200)
      const statusData0 = await statusRes0.json()
      expect(statusData0.planKey).toBe("PRO")
      expect(statusData0.maxActiveProjects).toBe(15)
      expect(statusData0.maxActiveMembers).toBe(15)
      expect(statusData0.activeProjectsCount).toBe(2)
      expect(statusData0.activeMembersCount).toBe(5)

      // 2. Initiate downgrade transition (select 1 project and 3 members to keep active)
      const selectedMembersToKeep = [ownerMember.id, otherMembers[0].id, otherMembers[1].id]
      const initiateRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          targetPlanKey: "STARTER",
          selectedProjectId: project1.id,
          selectedMemberIds: selectedMembersToKeep,
        }),
      })
      expect(initiateRes.status).toBe(201)
      const initData = await initiateRes.json()
      expect(initData.status).toBe("PENDING")
      expect(initData.targetPlanKey).toBe("STARTER")
      const transitionId = initData.transitionId

      // 3. Request downgrade through checkout API
      const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({ planKey: "STARTER", transitionId }),
      })
      expect(checkoutRes.status).toBe(200)
      const data = await checkoutRes.json()
      expect(data.success).toBe(true)
      expect(data.planKey).toBe("STARTER")
      expect(data.effectiveAt).toBe(periodEnd.toISOString())
      expect(data.stripeScheduleId).toBeDefined()

      // 4. Verify post-downgrade state BEFORE currentPeriodEnd:
      // - subscription is the same (no 2nd subscription or customer)
      // - workspace still resolves PRO
      // - entitlements are still 15/15
      // - NO project is PLAN_LOCKED
      // - NO member is PLAN_LOCKED
      // - transition is still PENDING
      // - NO graceEndsAt yet
      let wsAfter = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsAfter.planKey).toBe("PRO")
      expect(wsAfter.stripeSubscriptionId).toBe(`sub_down_${stamp}`)
      expect(wsAfter.stripeCustomerId).toBe(`cus_down_${stamp}`)
      expect(wsAfter.stripeScheduleId).toBe(data.stripeScheduleId)
      expect(wsAfter.graceEndsAt).toBeNull()

      let transition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
      expect(transition.status).toBe("PENDING")
      expect(transition.stripeScheduleId).toBe(data.stripeScheduleId)

      let p1 = await prisma.project.findUniqueOrThrow({ where: { id: project1.id } })
      let p2 = await prisma.project.findUniqueOrThrow({ where: { id: project2.id } })
      expect(p1.status).toBe("ACTIVE")
      expect(p2.status).toBe("ACTIVE")

      let mList = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id } })
      expect(mList.filter((m) => m.status === "ACTIVE")).toHaveLength(5)
      expect(mList.filter((m) => m.status === "PLAN_LOCKED")).toHaveLength(0)

      const statusRes1 = await fetch(`${baseUrl}/api/billing/status`, {
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      const statusData1 = await statusRes1.json()
      expect(statusData1.planKey).toBe("PRO")
      expect(statusData1.maxActiveProjects).toBe(15)
      expect(statusData1.maxActiveMembers).toBe(15)
      expect(statusData1.stripeScheduleId).toBe(data.stripeScheduleId)

      // 5. Reconcile before currentPeriodEnd -> maintains PRO and PENDING
      const reconcileRes = await fetch(`${baseUrl}/api/billing/reconcile`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(reconcileRes.status).toBe(200)
      wsAfter = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsAfter.planKey).toBe("PRO")
      transition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
      expect(transition.status).toBe("PENDING")

      // 6. At currentPeriodEnd: Stripe phase triggers and emits customer.subscription.updated with STARTER price
      // Simulate effective date arrival by updating transition.effectiveAt to now (or past)
      await prisma.planTransition.update({
        where: { id: transitionId },
        data: { effectiveAt: new Date(Date.now() - 1000) },
      })

      const eventIdDowngradeEffective = `evt_sched_eff_${stamp}`
      const webhookResEffective = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventIdDowngradeEffective,
          type: "customer.subscription.updated",
          data: {
            object: {
              id: `sub_down_${stamp}`,
              customer: `cus_down_${stamp}`,
              status: "active",
              items: { data: [{ price: { id: "fake_price_starter" } }] },
              metadata: { workspaceId: String(ws.id), transitionId },
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
            },
          },
        }),
      })
      expect(webhookResEffective.status).toBe(200)

      // 7. Verify post-effective state:
      // - workspace is now STARTER
      // - transition is APPLIED
      // - 1 project ACTIVE (project1), 1 project ARCHIVED/PLAN_LOCKED (project2)
      // - 3 members ACTIVE (owner + 2 selected), 2 members PLAN_LOCKED
      // - graceEndsAt starts NOW (+30 days)
      const wsFinal = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsFinal.planKey).toBe("STARTER")
      expect(wsFinal.graceEndsAt).not.toBeNull()
      const initialGrace = wsFinal.graceEndsAt!.getTime()

      const transitionFinal = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
      expect(transitionFinal.status).toBe("APPLIED")
      expect(transitionFinal.appliedAt).not.toBeNull()

      p1 = await prisma.project.findUniqueOrThrow({ where: { id: project1.id } })
      p2 = await prisma.project.findUniqueOrThrow({ where: { id: project2.id } })
      expect(p1.status).toBe("ACTIVE")
      expect(p2.status).toBe("ARCHIVED")
      expect(p2.archivedByPlan).toBe(true)
      expect(p2.planLockedAt).not.toBeNull()

      mList = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id } })
      const activeMembersFinal = mList.filter((m) => m.status === "ACTIVE")
      const lockedMembersFinal = mList.filter((m) => m.status === "PLAN_LOCKED")
      expect(activeMembersFinal).toHaveLength(3)
      expect(lockedMembersFinal).toHaveLength(2)
      expect(activeMembersFinal.map((m) => m.id).sort()).toEqual(selectedMembersToKeep.sort())

      // 8. Duplicate webhook event: guarantees idempotency
      const duplicateRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventIdDowngradeEffective,
          type: "customer.subscription.updated",
          data: {
            object: {
              id: `sub_down_${stamp}`,
              customer: `cus_down_${stamp}`,
              status: "active",
              items: { data: [{ price: { id: "fake_price_starter" } }] },
              metadata: { workspaceId: String(ws.id), transitionId },
            },
          },
        }),
      })
      expect(duplicateRes.status).toBe(200)

      const wsAfterDup = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsAfterDup.graceEndsAt!.getTime()).toBe(initialGrace) // Grace period untouched
      const transitionAfterDup = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
      expect(transitionAfterDup.status).toBe("APPLIED")
    } finally {
      server.close()
    }
  })

  it("trial user purchasing Starter 9 days early preserves Trial capacity (15/15) and PENDING transition until trial ends", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now() + 30
      const now = new Date()
      const trialEndsAt = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000)

      const owner = await prisma.user.create({
        data: {
          name: "Trial Subscriber",
          email: `trial.sub.${stamp}@docucore.test`,
          passwordHash: await hashPassword("SubPassword2026!"),
          role: "Propietario",
          initials: "TS",
          color: "brand",
          emailVerifiedAt: now,
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: "Empresa Trial Starter",
          slug: `empresa-trial-${stamp}`,
          billingStatus: "TRIAL",
          trialStartedAt: now,
          trialEndsAt: trialEndsAt,
        },
      })

      const ownerMember = await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
      })

      // Add 3 more members (4 total)
      const members = []
      for (let i = 1; i <= 3; i++) {
        const u = await prisma.user.create({
          data: {
            name: `Trial Member ${i}`,
            email: `trial.m${i}.${stamp}@docucore.test`,
            passwordHash: await hashPassword("SubPassword2026!"),
            role: "Operador",
            initials: `TM${i}`,
            color: "brand",
            emailVerifiedAt: now,
          },
        })
        const m = await prisma.workspaceMember.create({
          data: { workspaceId: ws.id, userId: u.id, role: "MEMBER", status: "ACTIVE" },
        })
        members.push(m)
      }

      // Create 2 projects
      const project1 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `TR-A-${stamp}`, name: "Trial Project Alpha", description: "Desc Alpha", status: "ACTIVE" },
      })
      const project2 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `TR-B-${stamp}`, name: "Trial Project Beta", description: "Desc Beta", status: "ACTIVE" },
      })

      // 1. Check status: in TRIAL (15/15 capacity, 9 days remaining)
      const statusRes0 = await fetch(`${baseUrl}/api/billing/status`, {
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      const statusData0 = await statusRes0.json()
      expect(statusData0.billingStatus).toBe("TRIAL")
      expect(statusData0.maxActiveProjects).toBe(15)
      expect(statusData0.maxActiveMembers).toBe(15)
      expect(statusData0.trialDaysLeft).toBe(9)

      // 2. Initiate Starter transition (keep project1, keep owner + 2 members)
      const selectedMembers = [ownerMember.id, members[0].id, members[1].id]
      const initRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({
          targetPlanKey: "STARTER",
          selectedProjectId: project1.id,
          selectedMemberIds: selectedMembers,
        }),
      })
      expect(initRes.status).toBe(201)
      const initData = await initRes.json()
      expect(initData.effectiveAt).toBe(trialEndsAt.toISOString())
      const transitionId = initData.transitionId

      // 3. User checks out Starter
      const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(owner.id),
        },
        body: JSON.stringify({ planKey: "STARTER", transitionId }),
      })
      expect(checkoutRes.status).toBe(200)

      // 4. Stripe webhook: checkout.session.completed arrives
      const eventIdCs = `evt_cs_trial_${stamp}`
      const webhookResCs = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventIdCs,
          type: "checkout.session.completed",
          data: {
            object: {
              customer: `cus_trial_${stamp}`,
              subscription: `sub_trial_${stamp}`,
              client_reference_id: String(ws.id),
              metadata: { workspaceId: String(ws.id), planKey: "STARTER", transitionId },
            },
          },
        }),
      })
      expect(webhookResCs.status).toBe(200)

      // BEFORE trialEndsAt:
      // - workspace.billingStatus is still TRIAL
      // - planKey is STARTER
      // - entitlements are still 15/15
      // - 0 projects locked, 0 members locked
      // - transition is still PENDING
      let wsCurrent = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsCurrent.billingStatus).toBe("TRIAL")
      expect(wsCurrent.stripeSubscriptionId).toBe(`sub_trial_${stamp}`)
      expect(wsCurrent.graceEndsAt).toBeNull()

      let transition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
      expect(transition.status).toBe("PENDING")

      let p1 = await prisma.project.findUniqueOrThrow({ where: { id: project1.id } })
      let p2 = await prisma.project.findUniqueOrThrow({ where: { id: project2.id } })
      expect(p1.status).toBe("ACTIVE")
      expect(p2.status).toBe("ACTIVE")

      let mList = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id } })
      expect(mList.filter((m) => m.status === "ACTIVE")).toHaveLength(4)

      // 5. Stripe webhook: customer.subscription.created (trialing) arrives
      const eventIdSubCreated = `evt_sub_cr_${stamp}`
      const webhookResSubCreated = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventIdSubCreated,
          type: "customer.subscription.created",
          data: {
            object: {
              id: `sub_trial_${stamp}`,
              customer: `cus_trial_${stamp}`,
              status: "trialing",
              items: { data: [{ price: { id: "fake_price_starter" } }] },
              metadata: { workspaceId: String(ws.id), transitionId },
            },
          },
        }),
      })
      expect(webhookResSubCreated.status).toBe(200)

      wsCurrent = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsCurrent.billingStatus).toBe("TRIAL")
      transition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
      expect(transition.status).toBe("PENDING")

      // 6. When trialEndsAt arrives: subscription converts to active in Stripe and emits customer.subscription.updated
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { trialEndsAt: new Date(Date.now() - 1000) },
      })
      await prisma.planTransition.update({
        where: { id: transitionId },
        data: { effectiveAt: new Date(Date.now() - 1000) },
      })

      const eventIdSubUpdated = `evt_sub_up_${stamp}`
      const webhookResSubUpdated = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: eventIdSubUpdated,
          type: "customer.subscription.updated",
          data: {
            object: {
              id: `sub_trial_${stamp}`,
              customer: `cus_trial_${stamp}`,
              status: "active",
              items: { data: [{ price: { id: "fake_price_starter" } }] },
              metadata: { workspaceId: String(ws.id), transitionId },
            },
          },
        }),
      })
      expect(webhookResSubUpdated.status).toBe(200)

      // Post-trial state:
      // - workspace is ACTIVE Starter
      // - transition is APPLIED
      // - 1 project ACTIVE, 1 ARCHIVED/PLAN_LOCKED
      // - 3 members ACTIVE, 1 PLAN_LOCKED
      // - grace period begins
      const wsFinal = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsFinal.billingStatus).toBe("ACTIVE")
      expect(wsFinal.planKey).toBe("STARTER")
      expect(wsFinal.graceEndsAt).not.toBeNull()

      const transitionFinal = await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })
      expect(transitionFinal.status).toBe("APPLIED")

      p1 = await prisma.project.findUniqueOrThrow({ where: { id: project1.id } })
      p2 = await prisma.project.findUniqueOrThrow({ where: { id: project2.id } })
      expect(p1.status).toBe("ACTIVE")
      expect(p2.status).toBe("ARCHIVED")
      expect(p2.archivedByPlan).toBe(true)

      mList = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id } })
      expect(mList.filter((m) => m.status === "ACTIVE")).toHaveLength(3)
      expect(mList.filter((m) => m.status === "PLAN_LOCKED")).toHaveLength(1)
    } finally {
      server.close()
    }
  })

  it("binds initial checkout once and protects foreign or already-managed schedules", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    try {
      const owner = await prisma.user.create({
        data: { name: "Retry Owner", email: `retry-${stamp}@docucore.test`, passwordHash: await hashPassword("SubPassword2026!"), role: "Propietario", initials: "RO", color: "brand", emailVerifiedAt: new Date() },
      })
      const initial = await prisma.workspace.create({ data: { name: "Retry initial", slug: `retry-initial-${stamp}`, billingStatus: "ACTIVE", planKey: "STARTER" } })
      await prisma.workspaceMember.create({ data: { workspaceId: initial.id, userId: owner.id, role: "OWNER" } })

      const initInitial = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ targetPlanKey: "PRO" }),
      })
      expect(initInitial.status).toBe(201)
      const initialTransitionId = (await initInitial.json()).transitionId as string
      const [checkoutA, checkoutB] = await Promise.all([
        fetch(`${baseUrl}/api/billing/checkout`, { method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ planKey: "PRO", transitionId: initialTransitionId }) }),
        fetch(`${baseUrl}/api/billing/checkout`, { method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ planKey: "PRO", transitionId: initialTransitionId }) }),
      ])
      expect([checkoutA.status, checkoutB.status]).toEqual([200, 200])
      const checkoutBodies = await Promise.all([checkoutA.json(), checkoutB.json()]) as Array<{ checkoutUrl?: string | null; sessionId: string; reused: boolean }>
      expect(checkoutBodies.map((body) => body.sessionId)[0]).toBe(checkoutBodies.map((body) => body.sessionId)[1])
      expect(checkoutBodies.every((body) => Boolean(body.checkoutUrl))).toBe(true)
      expect(await prisma.planTransition.findUniqueOrThrow({ where: { id: initialTransitionId } }).then((transition) => transition.stripeSessionId)).toBe(checkoutBodies[0].sessionId)

      const managed = await prisma.workspace.create({
        data: { name: "Managed schedule", slug: `managed-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO", stripeCustomerId: `cus-managed-${stamp}`, stripeSubscriptionId: `sub-managed-${stamp}`, stripePriceId: "fake_price_pro", currentPeriodEnd: new Date(Date.now() + 86_400_000) },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: managed.id, userId: owner.id, role: "OWNER" } })
      await prisma.user.update({ where: { id: owner.id }, data: { activeWorkspaceId: managed.id } })
      const managedInit = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ targetPlanKey: "STARTER" }),
      })
      expect(managedInit.status).toBe(201)
      const managedTransitionId = (await managedInit.json()).transitionId as string
      const managedFirst = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ planKey: "STARTER", transitionId: managedTransitionId }),
      })
      expect(managedFirst.status).toBe(200)
      const managedScheduleId = (await managedFirst.json()).stripeScheduleId as string
      const managedSecond = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ planKey: "STARTER", transitionId: managedTransitionId }),
      })
      expect(managedSecond.status).toBe(200)
      expect((await managedSecond.json()).stripeScheduleId).toBe(managedScheduleId)

      const foreign = await prisma.workspace.create({
        data: { name: "Foreign schedule", slug: `foreign-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO", stripeCustomerId: `cus-foreign-${stamp}`, stripeSubscriptionId: `sub-foreign-${stamp}`, stripePriceId: "fake_price_pro", stripeScheduleId: `foreign-schedule-${stamp}`, currentPeriodEnd: new Date(Date.now() + 86_400_000) },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: foreign.id, userId: owner.id, role: "OWNER" } })
      await prisma.user.update({ where: { id: owner.id }, data: { activeWorkspaceId: foreign.id } })
      const foreignInit = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ targetPlanKey: "STARTER" }),
      })
      expect(foreignInit.status).toBe(201)
      const foreignTransitionId = (await foreignInit.json()).transitionId as string
      const foreignCheckout = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body: JSON.stringify({ planKey: "STARTER", transitionId: foreignTransitionId }),
      })
      expect(foreignCheckout.status).toBe(409)
      expect((await foreignCheckout.json()).code).toBe("STRIPE_SCHEDULE_CONFLICT")
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: foreign.id } })).stripeScheduleId).toBe(`foreign-schedule-${stamp}`)
    } finally {
      server.close()
    }
  })

  it("paused subscription fails closed: does NOT apply transition in webhook or reconcile", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    try {
      const owner = await prisma.user.create({
        data: {
          name: "Paused Owner",
          email: `paused.${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "PO",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      const ws = await prisma.workspace.create({
        data: {
          name: "Paused WS",
          slug: `paused-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_paused_${stamp}`,
          stripeSubscriptionId: `sub_paused_${stamp}`,
          stripePriceId: "fake_price_starter",
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER" } })

      // Create 2 projects (1 active, 1 active)
      const p1 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `PAUSD1_${stamp}`.slice(0, 30), name: "P1", description: "", status: "ACTIVE" },
      })
      const p2 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `PAUSD2_${stamp}`.slice(0, 30), name: "P2", description: "", status: "ACTIVE" },
      })

      // Create PENDING transition to PRO
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_paused_${stamp}`,
          workspaceId: ws.id,
          actorId: owner.id,
          targetPlanKey: "PRO",
          status: "PENDING",
          effectiveAt: new Date(Date.now() - 5000),
        },
      })

      // Webhook arrives with subscription status 'paused' and target price 'fake_price_pro'
      const webhookRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_paused_${stamp}`,
          type: "customer.subscription.updated",
          data: {
            object: {
              id: `sub_paused_${stamp}`,
              customer: `cus_paused_${stamp}`,
              status: "paused",
              items: { data: [{ price: { id: "fake_price_pro" } }] },
              metadata: { workspaceId: String(ws.id), transitionId: transition.id },
            },
          },
        }),
      })
      expect(webhookRes.status).toBe(200)

      // Workspace billing status must be fail-closed as PAST_DUE
      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("PAST_DUE")

      // PlanTransition MUST REMAIN PENDING (NOT APPLIED) because subscription is paused!
      const transitionAfterWebhook = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(transitionAfterWebhook.status).toBe("PENDING")
      expect(transitionAfterWebhook.appliedAt).toBeNull()

      // Projects must not have been mutated
      const [refreshedP1, refreshedP2] = await Promise.all([
        prisma.project.findUniqueOrThrow({ where: { id: p1.id } }),
        prisma.project.findUniqueOrThrow({ where: { id: p2.id } }),
      ])
      expect(refreshedP1.status).toBe("ACTIVE")
      expect(refreshedP2.status).toBe("ACTIVE")

      // Reconcile also must NOT apply the transition when status is PAST_DUE / paused
      const reconcileRes = await fetch(`${baseUrl}/api/billing/reconcile`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(reconcileRes.status).toBe(200)

      const transitionAfterReconcile = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(transitionAfterReconcile.status).toBe("PENDING")
    } finally {
      server.close()
    }
  })

  it("passes top-level integration_identifier with /^[a-zA-Z]{8}$/ suffix to Stripe session creation", async () => {
    const { StripeBillingProvider, getStableTransitionSuffix } = await import("../../server/lib/billing")

    const transitionId = `pct_test_ident_${Date.now()}`
    const suffix = getStableTransitionSuffix(transitionId)

    // Verify regex strictly
    expect(suffix).toHaveLength(8)
    expect(/^[a-zA-Z]{8}$/.test(suffix)).toBe(true)

    // Verify stability
    expect(getStableTransitionSuffix(transitionId)).toBe(suffix)

    const provider = new StripeBillingProvider("sk_test_mock_secret", "whsec_test_mock_secret")

    let capturedParams: Record<string, unknown> | null = null
    const stripeMock = (provider as unknown as { stripe: { checkout: { sessions: { create: (params: Record<string, unknown>) => Promise<{ id: string; url: string }> } } } }).stripe
    stripeMock.checkout.sessions.create = async (params: Record<string, unknown>) => {
      capturedParams = params
      return { id: "cs_mock_created", url: "https://checkout.stripe.com/pay/cs_mock_created" }
    }

    const result = await provider.createInitialSubscriptionCheckout({
      workspaceId: 9999,
      customerEmail: "ident@example.com",
      planKey: "PRO",
      priceId: "price_mock_pro",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      transitionId,
    })

    expect(result.sessionId).toBe("cs_mock_created")
    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_mock_created")

    // Must be a TOP-LEVEL property on params
    const captured = capturedParams as unknown as Record<string, unknown>
    expect(captured.integration_identifier).toBe(`docucore_${suffix}`)
    expect(captured.integration_identifier).toMatch(/^docucore_[a-zA-Z]{8}$/)
  })

  it("configures top-level proration_behavior and phases[1] proration_behavior as 'none' on subscription schedule update", async () => {
    const { StripeBillingProvider } = await import("../../server/lib/billing")

    const stamp = Date.now() + 777
    const ws = await prisma.workspace.create({
      data: {
        name: "Schedule WS",
        slug: `sched-ws-${stamp}`,
        billingStatus: "ACTIVE",
        planKey: "PRO",
        stripeCustomerId: `cus_sched_${stamp}`,
        stripeSubscriptionId: `sub_sched_${stamp}`,
        stripePriceId: "price_pro_sched",
        currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
      },
    })

    const transitionId = `pct_sched_${stamp}`
    await prisma.planTransition.create({
      data: {
        id: transitionId,
        workspaceId: ws.id,
        actorId: 1,
        targetPlanKey: "STARTER",
        status: "PENDING",
      },
    })

    const provider = new StripeBillingProvider("sk_test_mock_secret", "whsec_test_mock_secret")

    let capturedScheduleUpdate: Record<string, unknown> | null = null
    const stripeMock = (provider as unknown as {
      stripe: {
        subscriptions: {
          retrieve: () => Promise<unknown>
          update: () => Promise<unknown>
        }
        subscriptionSchedules: {
          retrieve: () => Promise<unknown>
          update: (id: string, params: Record<string, unknown>) => Promise<unknown>
        }
      }
    }).stripe

    stripeMock.subscriptions.retrieve = async () => ({
      id: `sub_sched_${stamp}`,
      status: "active",
      items: { data: [{ id: "si_mock_item", price: { id: "price_pro_sched" } }] },
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      schedule: "sub_sched_mock_id",
    })
    stripeMock.subscriptionSchedules.retrieve = async () => ({
      id: "sub_sched_mock_id",
      status: "active",
      phases: [
        {
          start_date: 1000,
          end_date: 2000,
          items: [{ price: "price_bad_phase0", quantity: 1 }],
        },
      ],
      metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId },
    })
    stripeMock.subscriptionSchedules.update = async (id: string, params: Record<string, unknown>) => {
      capturedScheduleUpdate = params
      return { id, phases: params.phases, metadata: params.metadata }
    }
    stripeMock.subscriptions.update = async () => ({})

    await provider.changeExistingSubscriptionPlan({
      workspaceId: ws.id,
      targetPlanKey: "STARTER",
      targetPriceId: "price_starter_sched",
      transitionId,
    })

    expect(capturedScheduleUpdate).toBeTruthy()
    const capturedUpdate = capturedScheduleUpdate as unknown as Record<string, unknown>
    // Top-level proration_behavior === "none"
    expect(capturedUpdate.proration_behavior).toBe("none")
    // phases[1].proration_behavior === "none"
    const phases = capturedUpdate.phases as Array<{ proration_behavior?: string }>
    expect(phases[1].proration_behavior).toBe("none")
  })

  it("adversarial: webhook rejects price_starter_legacy_unrelated and pending_update from applying transition", async () => {
    const { StripeBillingProvider } = await import("../../server/lib/billing")
    process.env.STRIPE_PRICE_STARTER = "price_starter_canonical"
    const provider = new StripeBillingProvider("sk_test_mock", "whsec_mock")
    const stripeMock = (provider as unknown as { stripe: Record<string, Record<string, unknown>> }).stripe

    const stamp = Date.now() + 1234
    const user = await prisma.user.create({
      data: {
        name: "Adv Stripe User",
        email: `adv.stripe.${stamp}@docucore.test`,
        passwordHash: await hashPassword("SubPassword2026!"),
        role: "Propietario",
        initials: "AS",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: {
        name: "Adv Stripe WS",
        slug: `adv-stripe-ws-${stamp}`,
        billingStatus: "ACTIVE",
        planKey: "PRO",
        stripeCustomerId: `cus_adv_s_${stamp}`,
        stripeSubscriptionId: `sub_adv_s_${stamp}`,
      },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

    const transition = await prisma.planTransition.create({
      data: {
        id: `pct_adv_s_${stamp}`,
        workspaceId: ws.id,
        actorId: user.id,
        targetPlanKey: "STARTER",
        status: "PENDING",
      },
    })

    // 1. Webhook with price_starter_legacy_unrelated
    stripeMock.subscriptions = {
      retrieve: async () => ({
        id: `sub_adv_s_${stamp}`,
        customer: `cus_adv_s_${stamp}`,
        status: "active",
        items: { data: [{ price: { id: "price_starter_legacy_unrelated" } }] },
        metadata: { workspaceId: String(ws.id), transitionId: transition.id },
      }),
    }
    stripeMock.webhooks.constructEvent = () => ({
      id: `evt_adv_leg_${stamp}`,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_adv_s_${stamp}`,
          customer: `cus_adv_s_${stamp}`,
          status: "active",
          items: { data: [{ price: { id: "price_starter_legacy_unrelated" } }] },
          metadata: { workspaceId: String(ws.id), transitionId: transition.id },
        },
      },
    })

    await provider.handleWebhook(Buffer.from("{}"), "sig")

    let rec = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
    expect(rec.status).toBe("PENDING")
    expect(rec.appliedAt).toBeNull()

    // 2. Webhook with pending_update
    stripeMock.subscriptions = {
      retrieve: async () => ({
        id: `sub_adv_s_${stamp}`,
        customer: `cus_adv_s_${stamp}`,
        status: "active",
        pending_update: { expires_at: 999999 },
        items: { data: [{ price: { id: "price_starter_canonical" } }] },
        metadata: { workspaceId: String(ws.id), transitionId: transition.id },
      }),
    }
    stripeMock.webhooks.constructEvent = () => ({
      id: `evt_adv_upd_${stamp}`,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_adv_s_${stamp}`,
          customer: `cus_adv_s_${stamp}`,
          status: "active",
          pending_update: { expires_at: 999999 },
          items: { data: [{ price: { id: "price_starter_canonical" } }] },
          metadata: { workspaceId: String(ws.id), transitionId: transition.id },
        },
      },
    })

    await provider.handleWebhook(Buffer.from("{}"), "sig")

    rec = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
    expect(rec.status).toBe("PENDING")
    expect(rec.appliedAt).toBeNull()
  })

  it("B1: recontratación tras suscripción en estado final libera el vínculo y permite checkout inicial sin duplicar", async () => {
    const { StripeBillingProvider, setBillingProvider } = await import("../../server/lib/billing")
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const subId = `sub_terminated_${stamp}`
    const cusId = `cus_terminated_${stamp}`

    const provider = new StripeBillingProvider("sk_test_mock", "whsec_mock")
    const stripeMock = (provider as unknown as {
      stripe: {
        subscriptions: { retrieve: (id: string) => Promise<unknown>; update: () => Promise<unknown> }
        checkout: { sessions: { create: (params: Record<string, unknown>) => Promise<{ id: string; url: string }> } }
      }
    }).stripe

    let updateCalls = 0
    let createSessionCalls = 0
    let capturedSessionParams: Record<string, unknown> | null = null
    stripeMock.subscriptions.retrieve = async () => ({
      id: subId,
      status: "canceled",
      customer: cusId,
      items: { data: [{ id: "si_term", price: { id: "fake_price_pro" } }] },
    })
    stripeMock.subscriptions.update = async () => {
      updateCalls += 1
      throw new Error("no debe modificar la suscripción cancelada")
    }
    stripeMock.checkout.sessions.create = async (params) => {
      createSessionCalls += 1
      capturedSessionParams = params
      return { id: `cs_new_${stamp}`, url: `https://checkout.stripe.com/pay/cs_new_${stamp}` }
    }
    setBillingProvider(provider)

    let server: Awaited<ReturnType<typeof startServer>>
    try {
      server = await startServer(0)
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("Invalid test server address")
      const baseUrl = `http://127.0.0.1:${address.port}`
      const now = new Date()

      const user = await prisma.user.create({
        data: {
          name: "Recontract Owner",
          email: `recontract.${stamp}@docucore.test`,
          passwordHash: await hashPassword("SubPassword2026!"),
          role: "Propietario",
          initials: "RC",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: {
          name: "Recontract WS",
          slug: `recontract-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: cusId,
          stripeSubscriptionId: subId,
          stripePriceId: "fake_price_pro",
          currentPeriodEnd: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

      const initRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "PRO" }),
      })
      expect(initRes.status).toBe(201)
      const transitionId = (await initRes.json()).transitionId as string

      const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ planKey: "PRO", transitionId }),
      })
      expect(checkoutRes.status).toBe(200)
      const data = await checkoutRes.json()
      expect(data.nextAction).toBe("REDIRECT_TO_CHECKOUT")
      expect(data.sessionId).toBe(`cs_new_${stamp}`)

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.stripeSubscriptionId).toBeNull() // vínculo obsoleto liberado
      expect(updatedWs.stripeScheduleId).toBeNull()
      expect(updatedWs.billingStatus).toBe("CANCELED")
      expect(updatedWs.stripeCustomerId).toBe(cusId) // customer reutilizado

      expect(updateCalls).toBe(0) // nunca modificó la sub cancelada
      expect(createSessionCalls).toBe(1) // exactamente una sesión nueva, sin duplicados
      expect(capturedSessionParams).toMatchObject({ customer: cusId })

      const audit = await prisma.auditLog.findFirst({
        where: { workspaceId: ws.id, action: "Vínculo de suscripción obsoleto liberado" },
      })
      expect(audit).not.toBeNull()
    } finally {
      setBillingProvider(null)
      server!.close()
    }
  })

  it("B3: ciclo downgrade programado → upgrade → nuevo downgrade con selección distinta funciona (fake)", async () => {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const now = new Date()
      const user = await prisma.user.create({
        data: {
          name: "Zombie Owner",
          email: `zombie.${stamp}@docucore.test`,
          passwordHash: await hashPassword("SubPassword2026!"),
          role: "Propietario",
          initials: "ZO",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const ws = await prisma.workspace.create({
        data: {
          name: "Zombie WS",
          slug: `zombie-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_z_${stamp}`,
          stripeSubscriptionId: `sub_z_${stamp}`,
          stripePriceId: "fake_price_pro",
          currentPeriodEnd: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })
      const p1 = await prisma.project.create({ data: { workspaceId: ws.id, code: `Z-A-${stamp}`, name: "Z Alpha", description: "", status: "ACTIVE" } })
      const p2 = await prisma.project.create({ data: { workspaceId: ws.id, code: `Z-B-${stamp}`, name: "Z Beta", description: "", status: "ACTIVE" } })

      // 1) Downgrade programado (conserva p1)
      const init1 = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: p1.id }),
      })
      expect(init1.status).toBe(201)
      const t1 = (await init1.json()).transitionId as string
      const co1 = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ planKey: "STARTER", transitionId: t1 }),
      })
      expect(co1.status).toBe(200)
      const schedule1 = (await co1.json()).stripeScheduleId as string
      expect(schedule1).toBeDefined()

      let t1After = await prisma.planTransition.findUniqueOrThrow({ where: { id: t1 } })
      expect(t1After.status).toBe("PENDING")
      expect(t1After.stripeScheduleId).toBe(schedule1)

      // 2) Upgrade: libera el schedule y debe cancelar solo la transición vinculada
      const init2 = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "PRO" }),
      })
      expect(init2.status).toBe(201)
      const t2 = (await init2.json()).transitionId as string
      const co2 = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ planKey: "PRO", transitionId: t2 }),
      })
      expect(co2.status).toBe(200)
      expect((await co2.json()).success).toBe(true)

      t1After = await prisma.planTransition.findUniqueOrThrow({ where: { id: t1 } })
      expect(t1After.status).toBe("CANCELED") // zombie invalidado

      const audit = await prisma.auditLog.findFirst({
        where: { workspaceId: ws.id, action: "Transición de plan cancelada (schedule liberado)" },
      })
      expect(audit).not.toBeNull()
      expect(audit?.entityId).toBe(`plan-transition:${t1}`)

      let wsAfter = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsAfter.stripeScheduleId).toBeNull()
      expect(wsAfter.planKey).toBe("PRO")

      // 3) Nuevo downgrade con selección DISTINTA (conserva p2): debe iniciarse correctamente
      const init3 = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: p2.id }),
      })
      expect(init3.status).toBe(201)
      const t3 = (await init3.json()).transitionId as string
      expect(t3).not.toBe(t1)

      const co3 = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) },
        body: JSON.stringify({ planKey: "STARTER", transitionId: t3 }),
      })
      expect(co3.status).toBe(200)
      wsAfter = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(wsAfter.stripeScheduleId).toBe(`fake_sub_sched_${t3}`)
      const t3After = await prisma.planTransition.findUniqueOrThrow({ where: { id: t3 } })
      expect(t3After.status).toBe("PENDING")
      expect(t3After.stripeScheduleId).toBe(`fake_sub_sched_${t3}`)
    } finally {
      server.close()
    }
  })
})
