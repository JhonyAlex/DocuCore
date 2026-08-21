import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"
import { hashToken } from "../../server/lib/auth"
import { clearSentEmails, getSentEmails } from "../../server/lib/email"

describe("workspace access & team management", () => {
  async function makeWorkspace(prefix: string, ownerName: string) {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const owner = await prisma.user.create({
      data: {
        name: ownerName,
        email: `${stamp}-owner@docucore.test`,
        passwordHash: await hashPassword("Password2026!"),
        role: "Propietario",
        initials: "OW",
        color: "brand",
        emailVerifiedAt: new Date(),
      },
    })
    const ws = await prisma.workspace.create({
      data: { name: `WS ${prefix}`, slug: stamp, billingStatus: "ACTIVE", planKey: "PRO" },
    })
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER" } })
    return { owner, ws }
  }

  it("workspace A admin cannot enumerate or modify users of workspace B", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const stale = Date.now()
      const a = await makeWorkspace("A", "Admin A")
      const b = await makeWorkspace("B", "Admin B")

      // Workspace A admin lists its own members; B is not leaked.
      const listRes = await fetch(`${baseUrl}/api/users`, { headers: { "x-docucore-test-actor-id": String(a.owner.id) } })
      expect(listRes.status).toBe(200)
      const list = await listRes.json() as Array<{ id: number; email: string }>
      expect(list.some((u) => u.id === a.owner.id)).toBe(true)
      expect(list.every((u) => u.id !== b.owner.id)).toBe(true)

      // Workspace A admin cannot modify B's member role (404: not in A's workspace).
      const patchRes = await fetch(`${baseUrl}/api/users/${b.owner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ role: "MEMBER" }),
      })
      expect(patchRes.status).toBe(404)

      // Workspace A admin cannot suspend B's member either.
      const suspendRes = await fetch(`${baseUrl}/api/users/${b.owner.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ suspend: true }),
      })
      expect(suspendRes.status).toBe(404)
      void stale
    } finally {
      server.close()
    }
  })

  it("suspends a member only within one workspace without touching the global identity", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const a = await makeWorkspace("SUS", "Owner Sus")
      const victim = await prisma.user.create({
        data: {
          name: "Victim",
          email: `victim-${Date.now()}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "VI",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: victim.id, role: "MEMBER" } })

      const res = await fetch(`${baseUrl}/api/users/${victim.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ suspend: true }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.workspaceStatus).toBe("SUSPENDED")

      // Global identity is untouched.
      const globalUser = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })
      expect(globalUser.isActive).toBe(true)
    } finally {
      server.close()
    }
  })

  it("removing a member revokes their project memberships but keeps the global identity", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const a = await makeWorkspace("RM", "Owner Rm")
      const member = await prisma.user.create({
        data: {
          name: "Member Rm",
          email: `rm-${Date.now()}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "RM",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: member.id, role: "MEMBER" } })
      const project = await prisma.project.create({ data: { workspaceId: a.ws.id, code: `RMP-${Date.now()}`.slice(0, 30), name: "Proyecto RM", description: "", status: "ACTIVE" } })
      await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: "EDITOR" } })

      const res = await fetch(`${baseUrl}/api/users/${member.id}`, {
        method: "DELETE",
        headers: { "x-docucore-test-actor-id": String(a.owner.id) },
      })
      expect(res.status).toBe(204)

      expect(await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: a.ws.id, userId: member.id } } })).toBeNull()
      expect(await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: member.id } } })).toBeNull()
      expect(await prisma.user.findUnique({ where: { id: member.id } })).not.toBeNull()
    } finally {
      server.close()
    }
  })

  it("accepting an invitation adds WorkspaceMember + project assignments without duplicating the user", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const a = await makeWorkspace("INV", "Owner Inv")
      const invitee = await prisma.user.create({
        data: {
          name: "Invitee",
          email: `invitee-${Date.now()}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "IV",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      const project = await prisma.project.create({ data: { workspaceId: a.ws.id, code: `INVP-${Date.now()}`.slice(0, 30), name: "Proyecto Inv", description: "", status: "ACTIVE" } })

      clearSentEmails()
      const invRes = await fetch(`${baseUrl}/api/users/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ email: invitee.email, workspaceRole: "MEMBER", projectAssignments: [{ projectId: project.id, role: "EDITOR" }] }),
      })
      expect(invRes.status).toBe(201)
      const invitation = await invRes.json()
      expect(invitation.invitationId).toBeDefined()
      expect(invitation.inviteToken).toBeUndefined()

      const sent = getSentEmails()
      const match = sent.find((e) => e.to === invitee.email)?.text.match(/token=([a-zA-Z0-9_-]+)/)
      expect(match).toBeTruthy()
      const inviteToken = match![1]

      // Token stored hashed; accepting with the plain token resolves identity.
      const acceptRes = await fetch(`${baseUrl}/api/users/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(invitee.id) },
        body: JSON.stringify({ token: inviteToken }),
      })
      expect(acceptRes.status).toBe(200)

      const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: a.ws.id, userId: invitee.id } } })
      expect(membership).not.toBeNull()
      const projectMembership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: invitee.id } } })
      expect(projectMembership?.role).toBe("EDITOR")

      // No duplicate User.
      const users = await prisma.user.findMany({ where: { email: invitee.email } })
      expect(users).toHaveLength(1)
    } finally {
      server.close()
    }
  })

  it("test: hashToken is stable and one-way for invitation tokens", () => {
    const t = "raw-invite-token"
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).not.toBe(t)
  })

  it("an ADMIN cannot promote themselves to OWNER (workspace takeover prevention)", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const a = await makeWorkspace("PRMO", "Owner P")
      const admin = await prisma.user.create({
        data: {
          name: "Admin P",
          email: `adminp-${Date.now()}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "AP",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: admin.id, role: "ADMIN" } })

      const res = await fetch(`${baseUrl}/api/users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(admin.id) },
        body: JSON.stringify({ role: "OWNER" }),
      })
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.code).toBe("INSUFFICIENT_WORKSPACE_ROLE")

      // The legitimate owner can still grant OWNER.
      const ownerRes = await fetch(`${baseUrl}/api/users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ role: "OWNER" }),
      })
      expect(ownerRes.status).toBe(200)
    } finally {
      server.close()
    }
  })

  it("multiple users can select the same active workspace without unique collisions", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const a = await makeWorkspace("ACT", "Owner Act")
      const second = await prisma.user.create({
        data: {
          name: "Second Member",
          email: `second-${Date.now()}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "SM",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: second.id, role: "MEMBER" } })

      // Both members pick the SAME workspace as active — no @unique collision.
      const res1 = await fetch(`${baseUrl}/api/users/switch-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ workspaceId: a.ws.id }),
      })
      const res2 = await fetch(`${baseUrl}/api/users/switch-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(second.id) },
        body: JSON.stringify({ workspaceId: a.ws.id }),
      })
      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)
    } finally {
      server.close()
    }
  })

  it("enforces active owner invariant: demoting, suspending, or deleting the sole active owner is rejected with 409", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const a = await makeWorkspace("OWNINV", "Sole Owner")

      // 1. Demoting the sole owner to ADMIN -> 409
      const demoteRes = await fetch(`${baseUrl}/api/users/${a.owner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ role: "ADMIN" }),
      })
      expect(demoteRes.status).toBe(409)
      const demoteData = await demoteRes.json()
      expect(demoteData.code).toBe("LAST_ACTIVE_OWNER")

      // 2. Suspending the sole owner -> 409
      const suspendRes = await fetch(`${baseUrl}/api/users/${a.owner.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ suspend: true }),
      })
      expect(suspendRes.status).toBe(409)
      const suspendData = await suspendRes.json()
      expect(suspendData.code).toBe("LAST_ACTIVE_OWNER")

      // 3. Deleting the sole owner -> 409
      const deleteRes = await fetch(`${baseUrl}/api/users/${a.owner.id}`, {
        method: "DELETE",
        headers: { "x-docucore-test-actor-id": String(a.owner.id) },
      })
      expect(deleteRes.status).toBe(409)
      const deleteData = await deleteRes.json()
      expect(deleteData.code).toBe("LAST_ACTIVE_OWNER")

      // 4. Add second owner: suspending one succeeds (200), suspending second fails (409)
      const secondOwner = await prisma.user.create({
        data: {
          name: "Second Owner",
          email: `owner2-${Date.now()}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "SO",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: secondOwner.id, role: "OWNER" } })

      // Suspending first owner succeeds because second owner is ACTIVE
      const suspend1 = await fetch(`${baseUrl}/api/users/${a.owner.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(secondOwner.id) },
        body: JSON.stringify({ suspend: true }),
      })
      expect(suspend1.status).toBe(200)

      // Suspending second owner fails because only 1 active owner remains
      const suspend2 = await fetch(`${baseUrl}/api/users/${secondOwner.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(secondOwner.id) },
        body: JSON.stringify({ suspend: true }),
      })
      expect(suspend2.status).toBe(409)
      expect((await suspend2.json()).code).toBe("LAST_ACTIVE_OWNER")
    } finally {
      server.close()
    }
  })

  it("enforces project member tenancy: only ACTIVE members of the project workspace can be added", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now()
      const a = await makeWorkspace("TENA", "Owner A")
      const b = await makeWorkspace("TENB", "Owner B")

      const projectA = await prisma.project.create({
        data: { workspaceId: a.ws.id, code: `PRJ_A_${stamp}`.slice(0, 30), name: "Project A", description: "", status: "ACTIVE" },
      })
      await prisma.projectMember.create({ data: { projectId: projectA.id, userId: a.owner.id, role: "OWNER" } })

      // 1. Admin A attempts to add User of Workspace B -> 403 WORKSPACE_ACCESS_DENIED
      const addForeign = await fetch(`${baseUrl}/api/projects/${projectA.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ userId: b.owner.id, role: "EDITOR" }),
      })
      expect(addForeign.status).toBe(403)
      expect((await addForeign.json()).code).toBe("WORKSPACE_ACCESS_DENIED")

      // 2. Add SUSPENDED member of Workspace A -> 409 WORKSPACE_MEMBER_NOT_ACTIVE
      const suspendedUser = await prisma.user.create({
        data: {
          name: "Suspended In A",
          email: `sus-a-${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "SA",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: suspendedUser.id, role: "MEMBER", status: "SUSPENDED" } })

      const addSuspended = await fetch(`${baseUrl}/api/projects/${projectA.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ userId: suspendedUser.id, role: "EDITOR" }),
      })
      expect(addSuspended.status).toBe(409)
      expect((await addSuspended.json()).code).toBe("WORKSPACE_MEMBER_NOT_ACTIVE")

      // 3. Add PLAN_LOCKED member of Workspace A -> 409 WORKSPACE_MEMBER_NOT_ACTIVE
      const lockedUser = await prisma.user.create({
        data: {
          name: "Locked In A",
          email: `lock-a-${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "LA",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: lockedUser.id, role: "MEMBER", status: "PLAN_LOCKED" } })

      const addLocked = await fetch(`${baseUrl}/api/projects/${projectA.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ userId: lockedUser.id, role: "EDITOR" }),
      })
      expect(addLocked.status).toBe(409)
      expect((await addLocked.json()).code).toBe("WORKSPACE_MEMBER_NOT_ACTIVE")

      // 4. Add ACTIVE member of Workspace A -> 201
      const activeUser = await prisma.user.create({
        data: {
          name: "Active In A",
          email: `act-a-${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Usuario",
          initials: "AA",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: activeUser.id, role: "MEMBER", status: "ACTIVE" } })

      const addActive = await fetch(`${baseUrl}/api/projects/${projectA.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ userId: activeUser.id, role: "EDITOR" }),
      })
      expect(addActive.status).toBe(201)
    } finally {
      server.close()
    }
  })

  it("POST /api/users/invitations does not return plaintext inviteToken or inviteUrl in body", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const stamp = Date.now()
      const a = await makeWorkspace("INVO", "Owner Invo")

      const res = await fetch(`${baseUrl}/api/users/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ email: `new-guest-${stamp}@docucore.test`, workspaceRole: "MEMBER" }),
      })
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.invitationId).toBeDefined()
      expect(data.email).toBe(`new-guest-${stamp}@docucore.test`)
      expect(data.inviteToken).toBeUndefined()
      expect(data.inviteUrl).toBeUndefined()
    } finally {
      server.close()
    }
  })

  it("serializes concurrent workspace OWNER suspend, demote, and removal mutations", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    async function ownerPair(prefix: string) {
      const primary = await makeWorkspace(prefix, `Owner ${prefix}`)
      const secondary = await prisma.user.create({
        data: {
          name: `Second ${prefix}`,
          email: `second-${prefix}-${Date.now()}-${Math.random()}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "SO",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: primary.ws.id, userId: secondary.id, role: "OWNER", status: "ACTIVE" } })
      return { ...primary, secondary }
    }

    try {
      const suspend = await ownerPair("RACE-S")
      const suspendResponses = await Promise.all([
        fetch(`${baseUrl}/api/users/${suspend.secondary.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(suspend.owner.id) }, body: JSON.stringify({ suspend: true }) }),
        fetch(`${baseUrl}/api/users/${suspend.owner.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(suspend.secondary.id) }, body: JSON.stringify({ suspend: true }) }),
      ])
      expect(suspendResponses.map((response) => response.status).sort()).toEqual([200, 409])
      expect(await prisma.workspaceMember.count({ where: { workspaceId: suspend.ws.id, role: "OWNER", status: "ACTIVE" } })).toBeGreaterThanOrEqual(1)

      const demote = await ownerPair("RACE-D")
      const demoteResponses = await Promise.all([
        fetch(`${baseUrl}/api/users/${demote.secondary.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(demote.owner.id) }, body: JSON.stringify({ role: "ADMIN" }) }),
        fetch(`${baseUrl}/api/users/${demote.owner.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(demote.secondary.id) }, body: JSON.stringify({ role: "ADMIN" }) }),
      ])
      expect(demoteResponses.map((response) => response.status).sort()).toEqual([200, 409])
      expect(await prisma.workspaceMember.count({ where: { workspaceId: demote.ws.id, role: "OWNER", status: "ACTIVE" } })).toBeGreaterThanOrEqual(1)

      const removal = await ownerPair("RACE-R")
      const removalResponses = await Promise.all([
        fetch(`${baseUrl}/api/users/${removal.secondary.id}`, { method: "DELETE", headers: { "x-docucore-test-actor-id": String(removal.owner.id) } }),
        fetch(`${baseUrl}/api/users/${removal.owner.id}`, { method: "DELETE", headers: { "x-docucore-test-actor-id": String(removal.secondary.id) } }),
      ])
      expect(removalResponses.map((response) => response.status).sort()).toEqual([204, 409])
      expect(await prisma.workspaceMember.count({ where: { workspaceId: removal.ws.id, role: "OWNER", status: "ACTIVE" } })).toBeGreaterThanOrEqual(1)
    } finally {
      server.close()
    }
  })

  it("serializes concurrent Project OWNER mutations", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const workspace = await makeWorkspace("RACE-P", "Project Owner A")
      const second = await prisma.user.create({
        data: { name: "Project Owner B", email: `project-owner-${Date.now()}@docucore.test`, passwordHash: await hashPassword("Password2026!"), role: "Propietario", initials: "PB", color: "brand", emailVerifiedAt: new Date() },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: workspace.ws.id, userId: second.id, role: "OWNER", status: "ACTIVE" } })
      const project = await prisma.project.create({ data: { workspaceId: workspace.ws.id, code: `RACEP${Date.now()}`.slice(0, 30), name: "Race project", description: "", status: "ACTIVE" } })
      await prisma.projectMember.createMany({ data: [
        { projectId: project.id, userId: workspace.owner.id, role: "OWNER" },
        { projectId: project.id, userId: second.id, role: "OWNER" },
      ] })

      const responses = await Promise.all([
        fetch(`${baseUrl}/api/projects/${project.id}/members/${second.id}`, { method: "DELETE", headers: { "x-docucore-test-actor-id": String(workspace.owner.id) } }),
        fetch(`${baseUrl}/api/projects/${project.id}/members/${workspace.owner.id}`, { method: "DELETE", headers: { "x-docucore-test-actor-id": String(second.id) } }),
      ])
      expect(responses.map((response) => response.status).sort()).toEqual([204, 409])
      expect(await prisma.projectMember.count({ where: { projectId: project.id, role: "OWNER" } })).toBeGreaterThanOrEqual(1)
    } finally {
      server.close()
    }
  })

  it("makes invitation acceptance and revocation mutually exclusive", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const workspace = await makeWorkspace("RACE-I", "Invite Owner")
      const invitee = await prisma.user.create({
        data: { name: "Invite Race", email: `invite-race-${Date.now()}@docucore.test`, passwordHash: await hashPassword("Password2026!"), role: "Usuario", initials: "IR", color: "brand", emailVerifiedAt: new Date() },
      })
      const token = `race-token-${Date.now()}-${Math.random()}`
      const invitation = await prisma.workspaceInvitation.create({
        data: { id: `inv_race_${Date.now()}`, workspaceId: workspace.ws.id, email: invitee.email, workspaceRole: "MEMBER", tokenHash: hashToken(token), invitedById: workspace.owner.id, expiresAt: new Date(Date.now() + 60_000), status: "PENDING" },
      })

      const [accept, revoke] = await Promise.all([
        fetch(`${baseUrl}/api/users/invitations/accept`, { method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(invitee.id) }, body: JSON.stringify({ token }) }),
        fetch(`${baseUrl}/api/users/invitations/${invitation.id}`, { method: "DELETE", headers: { "x-docucore-test-actor-id": String(workspace.owner.id) } }),
      ])
      expect([200, 409]).toContain(accept.status)
      expect([204, 409]).toContain(revoke.status)
      const finalInvitation = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: invitation.id } })
      const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.ws.id, userId: invitee.id } } })
      if (finalInvitation.status === "REVOKED") expect(membership).toBeNull()
      else {
        expect(finalInvitation.status).toBe("ACCEPTED")
        expect(membership?.status).toBe("ACTIVE")
      }
    } finally {
      server.close()
    }
  })

  it("requires explicit PlatformAdmin workspace selection and persists support context without a seat", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    try {
      const a = await makeWorkspace("SUP-A", "Support A")
      const b = await makeWorkspace("SUP-B", "Support B")
      const support = await prisma.user.create({
        data: { name: "Platform Support", email: `support-${Date.now()}@docucore.test`, passwordHash: await hashPassword("Password2026!"), role: "Platform", initials: "PS", color: "brand", emailVerifiedAt: new Date(), isPlatformAdmin: true },
      })
      const beforeSeats = await prisma.workspaceMember.count({ where: { workspaceId: b.ws.id, status: "ACTIVE" } })

      const noSelection = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(support.id) } })
      expect(noSelection.status).toBe(409)

      const switched = await fetch(`${baseUrl}/api/users/switch-workspace`, { method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(support.id) }, body: JSON.stringify({ workspaceId: b.ws.id }) })
      expect(switched.status).toBe(200)
      const status = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(support.id) } })
      expect(status.status).toBe(200)
      expect((await status.json()).workspaceId).toBe(b.ws.id)
      expect(await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: b.ws.id, userId: support.id } } })).toBeNull()
      expect(await prisma.workspaceMember.count({ where: { workspaceId: b.ws.id, status: "ACTIVE" } })).toBe(beforeSeats)

      // When PlatformAdmin is a genuine member, its persisted role is retained
      // rather than receiving synthetic support authority.
      await prisma.workspaceMember.create({ data: { workspaceId: a.ws.id, userId: support.id, role: "MEMBER", status: "ACTIVE" } })
      const realSwitch = await fetch(`${baseUrl}/api/users/switch-workspace`, { method: "POST", headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(support.id) }, body: JSON.stringify({ workspaceId: a.ws.id }) })
      expect(realSwitch.status).toBe(200)
      const realStatus = await fetch(`${baseUrl}/api/billing/status`, { headers: { "x-docucore-test-actor-id": String(support.id) } })
      expect(realStatus.status).toBe(200)
      expect((await realStatus.json()).role).toBe("MEMBER")
    } finally {
      server.close()
    }
  })
})
