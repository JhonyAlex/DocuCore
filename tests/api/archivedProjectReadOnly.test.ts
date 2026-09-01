import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

describe("archived project read-only boundary", () => {
  it("keeps documents readable but rejects document and asset writes before their handlers run", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    const stamp = Date.now()

    try {
      const user = await prisma.user.create({
        data: {
          name: "Archived owner",
          email: `archived-owner-${stamp}@docucore.test`,
          passwordHash: await hashPassword("Password2026!"),
          role: "Propietario",
          initials: "AO",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      const workspace = await prisma.workspace.create({
        data: { name: "Archived workspace", slug: `archived-workspace-${stamp}`, billingStatus: "ACTIVE", planKey: "PRO" },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } })
      const project = await prisma.project.create({
        data: { workspaceId: workspace.id, code: `ARC-${stamp}`, name: "Proyecto archivado", description: "", status: "ARCHIVED" },
      })
      await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "OWNER" } })
      const headers = { "Content-Type": "application/json", "x-docucore-test-actor-id": String(user.id) }

      expect((await fetch(`${baseUrl}/api/projects/${project.id}/documents`, { headers })).status).toBe(200)

      const documentWrite = await fetch(`${baseUrl}/api/projects/${project.id}/documents`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      })
      expect(documentWrite.status).toBe(409)

      const assetWrite = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      })
      expect(assetWrite.status).toBe(409)
    } finally {
      server.close()
    }
  })
})
