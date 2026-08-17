import { Router, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import prisma from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { authenticatedUserId, requireAuth, type AuthenticatedRequest } from "../lib/auth"
import type { BillingStatus, Prisma } from "@prisma/client"

const router = Router()

function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  const auth = (req as AuthenticatedRequest).auth
  if (!auth || !auth.user.isPlatformAdmin) {
    throw Object.assign(new Error("Acceso restringido a administradores de plataforma."), { status: 403 })
  }
  next()
}

router.use(requireAuth)
router.use(requirePlatformAdmin)

const listWorkspacesSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["all", "PENDING_VERIFICATION", "TRIAL", "ACTIVE", "PAST_DUE", "CANCELED", "SUSPENDED"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

const extendTrialSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  untilDate: z.string().optional(),
}).refine((data) => data.days !== undefined || data.untilDate !== undefined, {
  message: "Indica 'days' o 'untilDate' para extender el período de prueba.",
})

const suspendSchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).strict()

const manualPlanSchema = z.object({
  planKey: z.enum(["STARTER", "PRO"]),
}).strict()

router.get("/workspaces", asyncHandler(async (req, res) => {
  const query = listWorkspacesSchema.parse(req.query)

  const where: Prisma.WorkspaceWhereInput = {
    ...(query.status !== "all" ? { billingStatus: query.status as BillingStatus } : {}),
    ...(query.search ? {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } },
        {
          members: {
            some: {
              role: "OWNER",
              user: {
                OR: [
                  { email: { contains: query.search, mode: "insensitive" } },
                  { name: { contains: query.search, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ],
    } : {}),
  }

  const [total, workspaces] = await Promise.all([
    prisma.workspace.count({ where }),
    prisma.workspace.findMany({
      where,
      include: {
        _count: {
          select: {
            projects: true,
            members: true,
          },
        },
        members: {
          where: { role: "OWNER" },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                initials: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: [{ id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])

  const data = workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    billingStatus: ws.billingStatus,
    billingSource: ws.billingSource,
    planKey: ws.planKey,
    trialStartedAt: ws.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: ws.trialEndsAt?.toISOString() ?? null,
    stripeCustomerId: ws.stripeCustomerId,
    stripeSubscriptionId: ws.stripeSubscriptionId,
    currentPeriodEnd: ws.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
    projectCount: ws._count.projects,
    memberCount: ws._count.members,
    owner: ws.members[0]?.user ?? null,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
  }))

  res.json({
    data,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  })
}))

router.get("/workspaces/:workspaceId", asyncHandler(async (req, res) => {
  const workspaceId = Number(req.params.workspaceId)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return res.status(400).json({ error: "Identificador de workspace inválido." })
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      _count: {
        select: {
          projects: true,
          members: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              initials: true,
              color: true,
              isActive: true,
            },
          },
        },
      },
    },
  })

  if (!ws) return res.status(404).json({ error: "Workspace no encontrado." })

  res.json({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    billingStatus: ws.billingStatus,
    billingSource: ws.billingSource,
    planKey: ws.planKey,
    trialStartedAt: ws.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: ws.trialEndsAt?.toISOString() ?? null,
    stripeCustomerId: ws.stripeCustomerId,
    stripeSubscriptionId: ws.stripeSubscriptionId,
    currentPeriodEnd: ws.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
    projectCount: ws._count.projects,
    memberCount: ws._count.members,
    members: ws.members.map((m) => ({
      ...m.user,
      role: m.role,
    })),
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
  })
}))

router.post("/workspaces/:workspaceId/extend-trial", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const workspaceId = Number(req.params.workspaceId)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return res.status(400).json({ error: "Identificador de workspace inválido." })
  }

  const input = extendTrialSchema.parse(req.body)
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado." })
  if (ws.billingSource === "MANUAL") {
    return res.status(409).json({ error: "Este espacio tiene una licencia manual activa. Selecciona su plan manual o suspéndelo desde administración." })
  }

  let nextTrialEndsAt: Date
  if (input.untilDate) {
    nextTrialEndsAt = new Date(input.untilDate)
    if (Number.isNaN(nextTrialEndsAt.getTime())) {
      return res.status(400).json({ error: "Fecha de vencimiento inválida." })
    }
  } else {
    const baseDate = ws.trialEndsAt && ws.trialEndsAt.getTime() > Date.now() ? ws.trialEndsAt : new Date()
    nextTrialEndsAt = new Date(baseDate.getTime() + (input.days ?? 14) * 24 * 60 * 60 * 1000)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        trialEndsAt: nextTrialEndsAt,
        billingStatus: "TRIAL",
      },
    })

    await tx.auditLog.create({
      data: {
        workspaceId,
        userId: actorId,
        action: "Extensión de prueba",
        entityId: `workspace:${workspaceId}`,
        detail: `Prueba extendida hasta ${nextTrialEndsAt.toISOString()}`,
      },
    })

    return res
  })

  res.json({
    workspaceId: updated.id,
    billingStatus: updated.billingStatus,
    trialEndsAt: updated.trialEndsAt?.toISOString(),
  })
}))

router.post("/workspaces/:workspaceId/suspend", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const workspaceId = Number(req.params.workspaceId)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return res.status(400).json({ error: "Identificador de workspace inválido." })
  }

  const input = suspendSchema.parse(req.body)
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado." })

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.workspace.update({
      where: { id: workspaceId },
      data: { billingStatus: "SUSPENDED" },
    })

    await tx.auditLog.create({
      data: {
        workspaceId,
        userId: actorId,
        action: "Suspensión de cuenta",
        entityId: `workspace:${workspaceId}`,
        detail: input.reason ? `Cuenta suspendida: ${input.reason}` : "Cuenta suspendida por administración",
      },
    })

    return res
  })

  res.json({
    workspaceId: updated.id,
    billingStatus: updated.billingStatus,
  })
}))

router.post("/workspaces/:workspaceId/manual-plan", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const workspaceId = Number(req.params.workspaceId)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return res.status(400).json({ error: "Identificador de workspace inválido." })
  }

  const input = manualPlanSchema.parse(req.body)
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado." })

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        billingStatus: "ACTIVE",
        billingSource: "MANUAL",
        planKey: input.planKey,
      },
    })

    await tx.auditLog.create({
      data: {
        workspaceId,
        userId: actorId,
        action: "Licencia manual activada",
        entityId: `workspace:${workspaceId}`,
        detail: `Plan ${input.planKey} activado manualmente sin Stripe (antes: ${ws.billingStatus}/${ws.planKey ?? "sin plan"} · origen ${ws.billingSource}). Las referencias de Stripe existentes se conservan.`,
      },
    })

    return res
  })

  res.json({
    workspaceId: updated.id,
    billingStatus: updated.billingStatus,
    billingSource: updated.billingSource,
    planKey: updated.planKey,
  })
}))

router.post("/workspaces/:workspaceId/reactivate", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const workspaceId = Number(req.params.workspaceId)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return res.status(400).json({ error: "Identificador de workspace inválido." })
  }

  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return res.status(404).json({ error: "Workspace no encontrado." })

  let nextStatus: BillingStatus = "ACTIVE"
  if (ws.billingSource === "MANUAL") {
    nextStatus = "ACTIVE"
  } else if (ws.stripeSubscriptionId) {
    nextStatus = "ACTIVE"
  } else if (ws.trialEndsAt && ws.trialEndsAt.getTime() > Date.now()) {
    nextStatus = "TRIAL"
  } else {
    nextStatus = "ACTIVE"
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.workspace.update({
      where: { id: workspaceId },
      data: { billingStatus: nextStatus },
    })

    await tx.auditLog.create({
      data: {
        workspaceId,
        userId: actorId,
        action: "Reactivación de cuenta",
        entityId: `workspace:${workspaceId}`,
        detail: `Cuenta reactivada con estado ${nextStatus}`,
      },
    })

    return res
  })

  res.json({
    workspaceId: updated.id,
    billingStatus: updated.billingStatus,
  })
}))

export default router
