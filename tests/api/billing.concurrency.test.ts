import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

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
