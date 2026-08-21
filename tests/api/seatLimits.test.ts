import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"
import { hashToken } from "../../server/lib/auth"
import { findLatestEmail } from "../../server/lib/email"

async function makeUser(stamp: string, name: string, opts: { isPlatformAdmin?: boolean } = {}) {
  const cleanStamp = `${stamp}-${Math.random().toString(36).slice(2, 8)}`
  return prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]/g, ".")}.${cleanStamp}@docucore.test`,
      passwordHash: await hashPassword("Password2026!"),
      role: "Usuario",
      initials: name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      color: "brand",
      emailVerifiedAt: new Date(),
      isPlatformAdmin: opts.isPlatformAdmin ?? false,
    },
  })
}

async function makeWorkspace(stamp: string, planKey: "STARTER" | "PRO" | "TRIAL", ownerId: number) {
  const cleanStamp = `${stamp}-${Math.random().toString(36).slice(2, 8)}`
  const ws = await prisma.workspace.create({
    data: {
      name: `Seat WS ${cleanStamp}`,
      slug: `seat-${cleanStamp}`,
      billingStatus: planKey === "TRIAL" ? "TRIAL" : "ACTIVE",
      planKey: planKey === "TRIAL" ? null : planKey,
      trialStartedAt: planKey === "TRIAL" ? new Date() : null,
      trialEndsAt: planKey === "TRIAL" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
    },
  })
  await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: ownerId, role: "OWNER" } })
  return ws
}

describe("member seat limits (per-plan ACTIVE member capacity)", () => {
  it("a user in many projects of one workspace counts once", async () => {
    const stamp = `${Date.now()}-many`
    const owner = await makeUser(stamp, "Owner Many")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    for (let i = 0; i < 3; i++) {
      const p = await prisma.project.create({ data: { workspaceId: ws.id, code: `M${i}_${stamp}`.slice(0, 30), name: `P${i}`, description: "", status: "ACTIVE" } })
      await prisma.projectMember.create({ data: { projectId: p.id, userId: owner.id, role: "OWNER" } })
    }
    const active = await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
    expect(active).toBe(1)
  })

  it("the same person in two workspaces consumes one seat per workspace", async () => {
    const stamp = `${Date.now()}-twows`
    const person = await makeUser(stamp, "Two Workspaces")
    const wsA = await makeWorkspace(`${stamp}-a`, "STARTER", person.id)
    const wsB = await prisma.workspace.create({ data: { name: "B", slug: `seatb-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO" } })
    await prisma.workspaceMember.create({ data: { workspaceId: wsB.id, userId: person.id, role: "OWNER" } })
    expect(await prisma.workspaceMember.count({ where: { workspaceId: wsA.id, status: "ACTIVE" } })).toBe(1)
    expect(await prisma.workspaceMember.count({ where: { workspaceId: wsB.id, status: "ACTIVE" } })).toBe(1)
  })

  it("pending invitations do not consume a seat", async () => {
    const stamp = `${Date.now()}-pending`
    const owner = await makeUser(stamp, "Owner Pending")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const invitee = await makeUser(`${stamp}-i1`, "Invitee One")
    await prisma.workspaceInvitation.create({
      data: { id: `inv_${stamp}`, workspaceId: ws.id, email: invitee.email, tokenHash: hashToken(`t_${stamp}`), invitedById: owner.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), status: "PENDING" },
    })
    expect(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })).toBe(1)
  })

  it("SUSPENDED does not consume a seat and can be reactivated when capacity exists", async () => {
    const stamp = `${Date.now()}-susp`
    const owner = await makeUser(stamp, "Owner Susp")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const victim = await makeUser(`${stamp}-v`, "Victim Susp")
    const member = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: victim.id, role: "MEMBER", status: "SUSPENDED" } })
    // Only the owner is ACTIVE.
    expect(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })).toBe(1)

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      // Unsuspending consumes a seat (2 available) → succeeds.
      const res = await fetch(`${baseUrl}/api/users/${victim.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ suspend: false }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.workspaceStatus).toBe("ACTIVE")
      expect(await prisma.workspaceMember.findUnique({ where: { id: member.id } })).toHaveProperty("status", "ACTIVE")
    } finally {
      server.close()
    }
  })

  it("Starter blocks the 4th ACTIVE member: two concurrent accepts for the last seat, exactly one wins", async () => {
    const stamp = `${Date.now()}-conc`
    const owner = await makeUser(stamp, "Owner Conc")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const m1 = await makeUser(`${stamp}-m1`, "Member One")
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: m1.id, role: "MEMBER" } })
    // 2 ACTIVE (owner + m1). Two pending invitations race for the last (3rd) seat.
    const invA = await makeUser(`${stamp}-ia`, "Invitee A")
    const invB = await makeUser(`${stamp}-ib`, "Invitee B")
    const tokenA = `tok_a_${stamp}`
    const tokenB = `tok_b_${stamp}`
    await prisma.workspaceInvitation.createMany({
      data: [
        { id: `inv_a_${stamp}`, workspaceId: ws.id, email: invA.email, tokenHash: hashToken(tokenA), invitedById: owner.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), status: "PENDING" },
        { id: `inv_b_${stamp}`, workspaceId: ws.id, email: invB.email, tokenHash: hashToken(tokenB), invitedById: owner.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), status: "PENDING" },
      ],
    })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const accept = (actorId: number, token: string) =>
        fetch(`${baseUrl}/api/users/invitations/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(actorId) },
          body: JSON.stringify({ token }),
        })
      const [ra, rb] = await Promise.all([accept(invA.id, tokenA), accept(invB.id, tokenB)])
      const statuses = [ra.status, rb.status].sort()
      expect(statuses).toEqual([200, 409])
      const activeCount = await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
      expect(activeCount).toBe(3) // never 4, even transiently
    } finally {
      server.close()
    }
  })

  it("reactivating a PLAN_LOCKED member respects capacity (blocks when full)", async () => {
    const stamp = `${Date.now()}-react`
    const owner = await makeUser(stamp, "Owner React")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const m1 = await makeUser(`${stamp}-r1`, "R One")
    const m2 = await makeUser(`${stamp}-r2`, "R Two")
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: m1.id, role: "MEMBER" } })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: m2.id, role: "MEMBER" } })
    const locked = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: (await makeUser(`${stamp}-r3`, "R Three")).id, role: "MEMBER", status: "PLAN_LOCKED" } })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      // 3 ACTIVE already → reactivation must fail.
      const res = await fetch(`${baseUrl}/api/users/${locked.userId}/reactivate`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe("WORKSPACE_MEMBER_LIMIT_REACHED")

      // Free a seat by suspending m1, then reactivation succeeds.
      await fetch(`${baseUrl}/api/users/${m1.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ suspend: true }),
      })
      const res2 = await fetch(`${baseUrl}/api/users/${locked.userId}/reactivate`, {
        method: "POST",
        headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(res2.status).toBe(200)
      expect(await prisma.workspaceMember.findUnique({ where: { id: locked.id } })).toHaveProperty("status", "ACTIVE")
    } finally {
      server.close()
    }
  })

  it("Pro -> Starter downgrade with 9 members keeps exactly 3 and preserves associations", async () => {
    const stamp = `${Date.now()}-downgrade`
    const owner = await makeUser(stamp, "Owner Downgrade")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const project = await prisma.project.create({ data: { workspaceId: ws.id, code: `DG_${stamp}`.slice(0, 30), name: "P", description: "", status: "ACTIVE" } })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: "OWNER" } })

    const ownerMember = await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: ws.id, userId: owner.id } } })
    const memberIds: number[] = [ownerMember.id]
    for (let i = 1; i < 9; i++) {
      const u = await makeUser(`${stamp}-d${i}`, `D Member ${i}`)
      const m = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: "MEMBER" } })
      await prisma.projectMember.create({ data: { projectId: project.id, userId: u.id, role: "VIEWER" } })
      memberIds.push(m.id)
    }

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const keep = [memberIds[0], memberIds[1], memberIds[2]]
      const res = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: project.id, selectedMemberIds: keep }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.planLockedMemberIds).toHaveLength(6)

      const active = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id, status: "ACTIVE" } })
      const locked = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id, status: "PLAN_LOCKED" } })
      expect(active.map((m) => m.id).sort()).toEqual(keep.slice().sort())
      expect(locked).toHaveLength(6)
      // Associations preserved: every locked member keeps their ProjectMember.
      const lockedProjectRoles = await prisma.projectMember.count({ where: { projectId: project.id, userId: { in: locked.map((m) => m.userId) } } })
      expect(lockedProjectRoles).toBe(6)
    } finally {
      server.close()
    }
  })

  it("downgrade must keep at least one OWNER (OWNER_REQUIRED otherwise)", async () => {
    const stamp = `${Date.now()}-owner`
    const owner = await makeUser(stamp, "Owner Only")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const project = await prisma.project.create({ data: { workspaceId: ws.id, code: `OW_${stamp}`.slice(0, 30), name: "P", description: "", status: "ACTIVE" } })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: "OWNER" } })
    const others: number[] = []
    for (let i = 1; i < 6; i++) {
      const u = await makeUser(`${stamp}-o${i}`, `O Member ${i}`)
      const m = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: "MEMBER" } })
      others.push(m.id)
    }

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: project.id, selectedMemberIds: others.slice(0, 3) }),
      })
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe("OWNER_REQUIRED")
    } finally {
      server.close()
    }
  })

  it("Trial -> Starter with member excess requires an explicit selection", async () => {
    const stamp = `${Date.now()}-trial`
    const owner = await makeUser(stamp, "Owner Trial")
    const ws = await makeWorkspace(stamp, "TRIAL", owner.id)
    for (let i = 1; i < 5; i++) {
      const u = await makeUser(`${stamp}-t${i}`, `T Member ${i}`)
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: "MEMBER" } })
    }

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER" }),
      })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code === "MEMBER_SELECTION_REQUIRED" || body.code === "PLAN_COMPLIANCE_REQUIRED").toBe(true)
    } finally {
      server.close()
    }
  })

  it("Starter -> Pro upgrade does not reactivate a SUSPENDED member nor a PLAN_LOCKED member", async () => {
    const stamp = `${Date.now()}-upgrade`
    const owner = await makeUser(stamp, "Owner Upgrade")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const suspended = await makeUser(`${stamp}-s`, "Up Suspended")
    const locked = await makeUser(`${stamp}-l`, "Up Locked")
    const suspendedMember = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: suspended.id, role: "MEMBER", status: "SUSPENDED" } })
    const lockedMember = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: locked.id, role: "MEMBER", status: "PLAN_LOCKED" } })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      // External upgrade: subscription.updated with a PRO price.
      const res = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_upgrade_${stamp}`,
          type: "customer.subscription.updated",
          data: { object: { id: `sub_${stamp}`, customer: `cus_${stamp}`, status: "active", priceId: "fake_price_pro", metadata: { workspaceId: String(ws.id) } } },
        }),
      })
      expect(res.status).toBe(200)
      expect(await prisma.workspaceMember.findUnique({ where: { id: suspendedMember.id } })).toHaveProperty("status", "SUSPENDED")
      expect(await prisma.workspaceMember.findUnique({ where: { id: lockedMember.id } })).toHaveProperty("status", "PLAN_LOCKED")
    } finally {
      server.close()
    }
  })

  it("external Stripe downgrade to Starter detects member overage and blocks writes (PLAN_ACTION_REQUIRED)", async () => {
    const stamp = `${Date.now()}-ext`
    const owner = await makeUser(stamp, "Owner Ext")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const project = await prisma.project.create({ data: { workspaceId: ws.id, code: `EX_${stamp}`.slice(0, 30), name: "P", description: "", status: "ACTIVE" } })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: "OWNER" } })
    for (let i = 1; i < 9; i++) {
      const u = await makeUser(`${stamp}-e${i}`, `E Member ${i}`)
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: "MEMBER" } })
      await prisma.projectMember.create({ data: { projectId: project.id, userId: u.id, role: "VIEWER" } })
    }

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_ext_${stamp}`,
          type: "customer.subscription.updated",
          data: { object: { id: `sub_${stamp}`, customer: `cus_${stamp}`, status: "active", priceId: "fake_price_starter", metadata: { workspaceId: String(ws.id) } } },
        }),
      })
      expect(res.status).toBe(200)

      const status = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(owner.id) } }).then((r) => r.json())
      expect(status.planKey).toBe("STARTER")
      expect(status.membersCompliant).toBe(false)
      expect(status.complianceStatus).toBe("PLAN_ACTION_REQUIRED")

      // A write on an active project is blocked while out of compliance.
      const write = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({}),
      })
      expect(write.status).toBe(402)
      expect((await write.json()).code).toBe("PLAN_ACTION_REQUIRED")
    } finally {
      server.close()
    }
  })

  it("manual plan assignment does not bypass the seat limit", async () => {
    const stamp = `${Date.now()}-manual`
    const owner = await makeUser(stamp, "Owner Manual")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    for (let i = 1; i < 5; i++) {
      const u = await makeUser(`${stamp}-m${i}`, `M Manual ${i}`)
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: "MEMBER" } })
    }
    const admin = await makeUser(`${stamp}-admin`, "Platform Admin", { isPlatformAdmin: true })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/admin/workspaces/${ws.id}/manual-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(admin.id) },
        body: JSON.stringify({ planKey: "STARTER" }),
      })
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe("DOWNGRADE_MEMBER_LIMIT_EXCEEDED")
    } finally {
      server.close()
    }
  })

  it("a PLAN_LOCKED member cannot access a project despite keeping ProjectMember", async () => {
    const stamp = `${Date.now()}-locked-access`
    const owner = await makeUser(stamp, "Owner Locked")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const project = await prisma.project.create({ data: { workspaceId: ws.id, code: `LA_${stamp}`.slice(0, 30), name: "P", description: "", status: "ACTIVE" } })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: "OWNER" } })
    const lockedUser = await makeUser(`${stamp}-lu`, "Locked User")
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: lockedUser.id, role: "MEMBER", status: "PLAN_LOCKED" } })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: lockedUser.id, role: "EDITOR" } })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, {
        headers: { "x-docucore-test-actor-id": String(lockedUser.id) },
      })
      expect(res.status).toBe(403)
    } finally {
      server.close()
    }
  })

  it("a platform admin with a real membership consumes a seat", async () => {
    const stamp = `${Date.now()}-pa`
    const pa = await makeUser(stamp, "PA Member", { isPlatformAdmin: true })
    const ws = await makeWorkspace(stamp, "STARTER", pa.id)
    expect(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })).toBe(1)
  })

  it("new-user invitation continues after register + verify + accept", async () => {
    const stamp = `${Date.now()}-flow`
    const owner = await makeUser(stamp, "Owner Flow")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const inviteeEmail = `new.invitee.${stamp}@docucore.test`

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      // Admin creates the invitation.
      const invRes = await fetch(`${baseUrl}/api/users/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ email: inviteeEmail, workspaceRole: "MEMBER" }),
      })
      expect(invRes.status).toBe(201)
      const invitation = await invRes.json()
      expect(invitation.invitationId).toBeDefined()
      expect(invitation.inviteToken).toBeUndefined()

      const inviteEmail = findLatestEmail(inviteeEmail)
      expect(inviteEmail).toBeDefined()
      const inviteToken = inviteEmail!.text.match(/token=([a-zA-Z0-9_-]+)/)?.[1]
      expect(inviteToken).toBeTruthy()

      // New user registers via the invitation (no workspace created yet).
      const regRes = await fetch(`${baseUrl}/api/auth/register-invitee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Invitee", email: inviteeEmail, password: "Password2026!", confirmPassword: "Password2026!", invitationToken: inviteToken, termsAccepted: true }),
      })
      expect(regRes.status).toBe(201)
      expect(await prisma.workspaceMember.findFirst({ where: { workspaceId: ws.id, user: { email: inviteeEmail } } })).toBeNull()

      // Verification email carries a returnTo that returns to the invitation.
      const email = findLatestEmail(inviteeEmail)
      expect(email).toBeDefined()
      const verifyToken = email!.text.match(/verify-email\?token=([a-f0-9]+)/)?.[1]
      expect(verifyToken).toBeTruthy()
      expect(email!.text).toContain("returnTo=")
      expect(email!.text).toContain("accept-invitation")

      const verifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verifyToken }),
      })
      expect(verifyRes.status).toBe(200)
      const verifyBody = await verifyRes.json()
      expect(verifyBody.workspace).toBeNull() // invitee has no workspace until acceptance

      const invitee = await prisma.user.findUniqueOrThrow({ where: { email: inviteeEmail } })
      const acceptRes = await fetch(`${baseUrl}/api/users/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(invitee.id) },
        body: JSON.stringify({ token: inviteToken }),
      })
      expect(acceptRes.status).toBe(200)
      expect(await prisma.workspaceMember.findFirst({ where: { workspaceId: ws.id, userId: invitee.id } })).not.toBeNull()
    } finally {
      server.close()
    }
  })

  it("downgrade with several projects AND >3 members resolves both dimensions at once", async () => {
    const stamp = `${Date.now()}-both`
    const owner = await makeUser(stamp, "Owner Both")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const ownerMember = await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: ws.id, userId: owner.id } } })
    const projectIds: number[] = []
    for (let i = 0; i < 3; i++) {
      const p = await prisma.project.create({ data: { workspaceId: ws.id, code: `BT${i}_${stamp}`.slice(0, 30), name: `P${i}`, description: "", status: "ACTIVE" } })
      await prisma.projectMember.create({ data: { projectId: p.id, userId: owner.id, role: "OWNER" } })
      projectIds.push(p.id)
    }
    const memberIds: number[] = [ownerMember.id]
    for (let i = 1; i < 6; i++) {
      const u = await makeUser(`${stamp}-b${i}`, `B Member ${i}`)
      const m = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: "MEMBER" } })
      memberIds.push(m.id)
    }

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: projectIds[1], selectedMemberIds: [memberIds[0], memberIds[1], memberIds[2]] }),
      })
      expect(res.status).toBe(200)
      const projects = await prisma.project.findMany({ where: { workspaceId: ws.id } })
      expect(projects.filter((p) => p.status === "ACTIVE").map((p) => p.id)).toEqual([projectIds[1]])
      expect(projects.filter((p) => p.archivedByPlan)).toHaveLength(2)
      const activeMembers = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id, status: "ACTIVE" } })
      const lockedMembers = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id, status: "PLAN_LOCKED" } })
      expect(activeMembers.map((m) => m.id).sort()).toEqual([memberIds[0], memberIds[1], memberIds[2]].sort())
      expect(lockedMembers).toHaveLength(3)
    } finally {
      server.close()
    }
  })

  it("downgrade with <=3 members does NOT require a member selection", async () => {
    const stamp = `${Date.now()}-trivial`
    const owner = await makeUser(stamp, "Owner Trivial")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const project = await prisma.project.create({ data: { workspaceId: ws.id, code: `TV_${stamp}`.slice(0, 30), name: "P", description: "", status: "ACTIVE" } })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: "OWNER" } })
    const extra = await makeUser(`${stamp}-tv`, "Trivial Member")
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: extra.id, role: "MEMBER" } })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: project.id }),
      })
      expect(res.status).toBe(200)
      expect(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })).toBe(2)
      expect(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "PLAN_LOCKED" } })).toBe(0)
    } finally {
      server.close()
    }
  })

  it("downgrade with 0 projects and member excess succeeds with selectedProjectId: null", async () => {
    const stamp = `${Date.now()}-zeroprj`
    const owner = await makeUser(stamp, "Owner Zero Prj")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const m1 = await makeUser(`${stamp}-z1`, "Zero Member 1")
    const m2 = await makeUser(`${stamp}-z2`, "Zero Member 2")
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: m1.id, role: "MEMBER" } })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: m2.id, role: "MEMBER" } })
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: ws.id, userId: owner.id } })

    // 0 projects in workspace, 3 active members. Target limit for test is selecting 1 user (or owner only).
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      // Initiate downgrade to STARTER selecting only the owner
      const initRes = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: null, selectedMemberIds: [ownerMember.id] }),
      })
      expect(initRes.status).toBe(201)
      const initData = await initRes.json()
      expect(initData.transitionId).toBeDefined()

      // Resolve transition immediately
      const resolveRes = await fetch(`${baseUrl}/api/billing/plan-change/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ transitionId: initData.transitionId }),
      })
      expect(resolveRes.status).toBe(200)

      // Verification: 0 projects, 1 active user (owner), 2 plan-locked users
      const projectCount = await prisma.project.count({ where: { workspaceId: ws.id } })
      const activeMembers = await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "ACTIVE" } })
      const lockedMembers = await prisma.workspaceMember.count({ where: { workspaceId: ws.id, status: "PLAN_LOCKED" } })

      expect(projectCount).toBe(0)
      expect(activeMembers).toBe(1)
      expect(lockedMembers).toBe(2)
    } finally {
      server.close()
    }
  })

  it("duplicate Stripe checkout webhook is idempotent (transition applied once)", async () => {
    const stamp = `${Date.now()}-dup`
    const owner = await makeUser(stamp, "Owner Dup")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const projectIds: number[] = []
    for (let i = 0; i < 2; i++) {
      const p = await prisma.project.create({ data: { workspaceId: ws.id, code: `DP${i}_${stamp}`.slice(0, 30), name: `P${i}`, description: "", status: "ACTIVE" } })
      await prisma.projectMember.create({ data: { projectId: p.id, userId: owner.id, role: "OWNER" } })
      projectIds.push(p.id)
    }
    const transitionId = `pct_dup_${stamp}`
    await prisma.planTransition.create({
      data: { id: transitionId, workspaceId: ws.id, actorId: owner.id, targetPlanKey: "STARTER", selectedProjectId: projectIds[0], status: "PENDING" },
    })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const payload = {
        id: `evt_dup_${stamp}`,
        type: "checkout.session.completed",
        data: { object: { customer: `cus_${stamp}`, subscription: `sub_${stamp}`, metadata: { workspaceId: String(ws.id), planKey: "STARTER", transitionId, selectedProjectId: String(projectIds[0]) } } },
      }
      const r1 = await fetch(`${baseUrl}/api/billing/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const r2 = await fetch(`${baseUrl}/api/billing/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      expect(r1.status).toBe(200)
      expect(r2.status).toBe(200)
      expect(await prisma.processedWebhookEvent.count({ where: { id: payload.id } })).toBe(1)
      const projects = await prisma.project.findMany({ where: { workspaceId: ws.id } })
      expect(projects.filter((p) => p.status === "ACTIVE").map((p) => p.id)).toEqual([projectIds[0]])
      expect(await prisma.planTransition.findUniqueOrThrow({ where: { id: transitionId } })).toHaveProperty("status", "APPLIED")
    } finally {
      server.close()
    }
  })

  it("double submit of the same plan transition is idempotent", async () => {
    const stamp = `${Date.now()}-idem`
    const owner = await makeUser(stamp, "Owner Idem")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const projectIds: number[] = []
    for (let i = 0; i < 2; i++) {
      const p = await prisma.project.create({ data: { workspaceId: ws.id, code: `ID${i}_${stamp}`.slice(0, 30), name: `P${i}`, description: "", status: "ACTIVE" } })
      await prisma.projectMember.create({ data: { projectId: p.id, userId: owner.id, role: "OWNER" } })
      projectIds.push(p.id)
    }

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const body = JSON.stringify({ targetPlanKey: "STARTER", selectedProjectId: projectIds[0] })
      const r1 = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body,
      })
      const r2 = await fetch(`${baseUrl}/api/billing/plan-change/initiate`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) }, body,
      })
      expect(r1.status).toBe(201)
      expect(r2.status).toBe(201)
      const t1 = await r1.json()
      const t2 = await r2.json()
      expect(t1.transitionId).toBe(t2.transitionId)

      const pending = await prisma.planTransition.findMany({ where: { workspaceId: ws.id, status: "PENDING" } })
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe(t1.transitionId)
    } finally {
      server.close()
    }
  })

  it("reconcile requires OWNER/ADMIN (MEMBER rejected, OWNER allowed)", async () => {
    const stamp = `${Date.now()}-recon`
    const owner = await makeUser(stamp, "Owner Recon")
    const ws = await makeWorkspace(stamp, "PRO", owner.id)
    const member = await makeUser(`${stamp}-m`, "Recon Member")
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: member.id, role: "MEMBER" } })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const memberRes = await fetch(`${baseUrl}/api/billing/reconcile`, {
        method: "POST", headers: { "x-docucore-test-actor-id": String(member.id) },
      })
      expect(memberRes.status).toBe(403)
      expect((await memberRes.json()).code).toBe("WORKSPACE_ACCESS_DENIED")

      const ownerRes = await fetch(`${baseUrl}/api/billing/reconcile`, {
        method: "POST", headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(ownerRes.status).toBe(200)
      const body = await ownerRes.json()
      expect(body.workspaceId).toBe(ws.id)
    } finally {
      server.close()
    }
  })

  it("PATCH project metadata is blocked under PLAN_ACTION_REQUIRED, but archive is allowed", async () => {
    const stamp = `${Date.now()}-gate`
    const owner = await makeUser(stamp, "Owner Gate")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const projectIds: number[] = []
    for (let i = 0; i < 2; i++) {
      const p = await prisma.project.create({ data: { workspaceId: ws.id, code: `GT${i}_${stamp}`.slice(0, 30), name: `P${i}`, description: "", status: "ACTIVE" } })
      await prisma.projectMember.create({ data: { projectId: p.id, userId: owner.id, role: "OWNER" } })
      projectIds.push(p.id)
    }

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const patch = await fetch(`${baseUrl}/api/projects/${projectIds[0]}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(owner.id) },
        body: JSON.stringify({ name: "Renamed" }),
      })
      expect(patch.status).toBe(402)
      expect((await patch.json()).code).toBe("PLAN_ACTION_REQUIRED")

      // Archiving is a resolution action and must remain available.
      const archive = await fetch(`${baseUrl}/api/projects/${projectIds[1]}/archive`, {
        method: "POST", headers: { "x-docucore-test-actor-id": String(owner.id) },
      })
      expect(archive.status).toBe(200)
    } finally {
      server.close()
    }
  })

  it("upgrade from PLAN_ACTION_REQUIRED restores compliance without auto-reactivation", async () => {
    const stamp = `${Date.now()}-upg2`
    const owner = await makeUser(stamp, "Owner Upg2")
    const ws = await makeWorkspace(stamp, "STARTER", owner.id)
    const activeProject = await prisma.project.create({ data: { workspaceId: ws.id, code: `UA_${stamp}`.slice(0, 30), name: "Active", description: "", status: "ACTIVE" } })
    await prisma.projectMember.create({ data: { projectId: activeProject.id, userId: owner.id, role: "OWNER" } })
    const lockedProject = await prisma.project.create({ data: { workspaceId: ws.id, code: `UL_${stamp}`.slice(0, 30), name: "Locked", description: "", status: "ARCHIVED", archivedByPlan: true, planLockedAt: new Date() } })
    await prisma.projectMember.create({ data: { projectId: lockedProject.id, userId: owner.id, role: "OWNER" } })

    const m1 = await makeUser(`${stamp}-u1`, "U One")
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: m1.id, role: "MEMBER" } })
    const lockedUser = await makeUser(`${stamp}-ul`, "U Locked")
    const lockedMember = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: lockedUser.id, role: "MEMBER", status: "PLAN_LOCKED" } })
    const suspendedUser = await makeUser(`${stamp}-us`, "U Suspended")
    const suspendedMember = await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: suspendedUser.id, role: "MEMBER", status: "SUSPENDED" } })

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const res = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `evt_upg2_${stamp}`,
          type: "customer.subscription.updated",
          data: { object: { id: `sub_${stamp}`, customer: `cus_${stamp}`, status: "active", priceId: "fake_price_pro", metadata: { workspaceId: String(ws.id) } } },
        }),
      })
      expect(res.status).toBe(200)

      // Capacity rose to Pro; the previously locked/suspended entities stay put.
      expect(await prisma.project.findUniqueOrThrow({ where: { id: lockedProject.id } })).toHaveProperty("status", "ARCHIVED")
      expect(await prisma.workspaceMember.findUniqueOrThrow({ where: { id: lockedMember.id } })).toHaveProperty("status", "PLAN_LOCKED")
      expect(await prisma.workspaceMember.findUniqueOrThrow({ where: { id: suspendedMember.id } })).toHaveProperty("status", "SUSPENDED")

      const status = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(owner.id) } }).then((r) => r.json())
      expect(status.planKey).toBe("PRO")
      expect(status.complianceStatus).toBe("COMPLIANT")
    } finally {
      server.close()
    }
  })
})
