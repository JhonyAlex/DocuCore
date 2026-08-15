import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

describe("SAAS-02 Workspace Isolation API", () => {
  it("strictly isolates projects between different customer workspaces", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const now = new Date()
      const stamp = Date.now()

      // Customer A
      const userA = await prisma.user.create({
        data: {
          name: "User Workspace A",
          email: `userA.${stamp}@docucore.test`,
          passwordHash: await hashPassword("ValidPassword2026!"),
          role: "Propietario",
          initials: "UA",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const wsA = await prisma.workspace.create({
        data: {
          name: "Empresa Alpha",
          slug: `empresa-alpha-${stamp}`,
          billingStatus: "ACTIVE",
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: wsA.id, userId: userA.id, role: "OWNER" },
      })
      const projA = await prisma.project.create({
        data: {
          workspaceId: wsA.id,
          code: `PRJ-A-${stamp}`,
          name: "Proyecto Privado Alpha",
          description: "Datos confidenciales de Alpha",
          themeKey: "blue",
        },
      })
      await prisma.projectMember.create({
        data: { projectId: projA.id, userId: userA.id, role: "OWNER" },
      })

      // Customer B
      const userB = await prisma.user.create({
        data: {
          name: "User Workspace B",
          email: `userB.${stamp}@docucore.test`,
          passwordHash: await hashPassword("ValidPassword2026!"),
          role: "Propietario",
          initials: "UB",
          color: "brand",
          emailVerifiedAt: now,
        },
      })
      const wsB = await prisma.workspace.create({
        data: {
          name: "Empresa Beta",
          slug: `empresa-beta-${stamp}`,
          billingStatus: "ACTIVE",
        },
      })
      await prisma.workspaceMember.create({
        data: { workspaceId: wsB.id, userId: userB.id, role: "OWNER" },
      })
      const projB = await prisma.project.create({
        data: {
          workspaceId: wsB.id,
          code: `PRJ-B-${stamp}`,
          name: "Proyecto Privado Beta",
          description: "Datos confidenciales de Beta",
          themeKey: "emerald",
        },
      })
      await prisma.projectMember.create({
        data: { projectId: projB.id, userId: userB.id, role: "OWNER" },
      })

      // Query projects as User A (actor header in test mode)
      const listResA = await fetch(`${baseUrl}/api/projects`, {
        headers: { "x-docucore-test-actor-id": String(userA.id) },
      })
      expect(listResA.status).toBe(200)
      const listDataA = await listResA.json()
      const idsA = listDataA.data.map((p: { id: number }) => p.id)
      expect(idsA).toContain(projA.id)
      expect(idsA).not.toContain(projB.id)

      // Query projects as User B
      const listResB = await fetch(`${baseUrl}/api/projects`, {
        headers: { "x-docucore-test-actor-id": String(userB.id) },
      })
      expect(listResB.status).toBe(200)
      const listDataB = await listResB.json()
      const idsB = listDataB.data.map((p: { id: number }) => p.id)
      expect(idsB).toContain(projB.id)
      expect(idsB).not.toContain(projA.id)

      // User A attempting to access Project B directly -> 403
      const directRes = await fetch(`${baseUrl}/api/projects/${projB.id}`, {
        headers: { "x-docucore-test-actor-id": String(userA.id) },
      })
      expect(directRes.status).toBe(403)

      // User A creating a new project automatically assigns to Workspace A
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-docucore-test-actor-id": String(userA.id),
        },
        body: JSON.stringify({
          code: `PRJ-NEW-${stamp}`,
          name: "Segundo Proyecto de Alpha",
          description: "Nuevo proyecto",
          themeKey: "slate",
        }),
      })
      expect(createRes.status).toBe(201)
      const createdProj = await createRes.json()

      const inDb = await prisma.project.findUniqueOrThrow({ where: { id: createdProj.id } })
      expect(inDb.workspaceId).toBe(wsA.id)
    } finally {
      server.close()
    }
  })
})
