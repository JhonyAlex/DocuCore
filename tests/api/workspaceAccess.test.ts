import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"
import { hashToken } from "../../server/lib/auth"

describe("workspace access & team management", () => {
  async function makeWorkspace(prefix: string, ownerName: string) {
    const stamp = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
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

      const invRes = await fetch(`${baseUrl}/api/users/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(a.owner.id) },
        body: JSON.stringify({ email: invitee.email, workspaceRole: "MEMBER", projectAssignments: [{ projectId: project.id, role: "EDITOR" }] }),
      })
      expect(invRes.status).toBe(201)
      const invitation = await invRes.json()
      expect(invitation.inviteToken).toBeTruthy()

      // Token stored hashed; accepting with the plain token resolves identity.
      const acceptRes = await fetch(`${baseUrl}/api/users/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-docucore-test-actor-id": String(invitee.id) },
        body: JSON.stringify({ token: invitation.inviteToken }),
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
})
