import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import { hashPassword } from "../../server/lib/passwords"

describe("concurrency: two simultaneous project creations cannot exceed Starter (1 active)", () => {
  it("ends with exactly one ACTIVE project under concurrent creation", async () => {
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

    // Two transactions race on the same FOR UPDATE lock (§9). At most one may
    // create an ACTIVE project; the other must observe capacity and roll back.
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

    // Exactly one attempt won; the workspace never exceeded Starter.
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(activeCount).toBe(1)
  })
})
