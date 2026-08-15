import type { NextFunction, Request, RequestHandler, Response } from "express"
import type { BillingStatus, Workspace, WorkspaceRole } from "@prisma/client"
import prisma from "./prisma"
import { authenticatedUserId } from "./auth"

export interface WorkspaceEntitlement {
  isEntitledToWrite: boolean
  reason?: "TRIAL_EXPIRED" | "PAST_DUE" | "SUBSCRIPTION_EXPIRED" | "WORKSPACE_SUSPENDED" | "EMAIL_UNVERIFIED"
  trialDaysLeft?: number
  currentStatus: BillingStatus
}

export interface WorkspaceScope {
  workspaceId: number
  workspace: Workspace
  membership: {
    id: number
    userId: number
    role: WorkspaceRole
  }
}

declare module "express" {
  interface Request {
    workspaceScope?: WorkspaceScope
  }
}

function workspaceError(message: string, status: number, code?: string, extra?: Record<string, unknown>): Error & { status: number; code?: string } {
  return Object.assign(new Error(message), { status, code, ...extra })
}

export function evaluateWorkspaceEntitlement(workspace: {
  billingStatus: BillingStatus
  trialStartedAt: Date | null
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}): WorkspaceEntitlement {
  const now = new Date()

  if (workspace.billingStatus === "PENDING_VERIFICATION") {
    return {
      isEntitledToWrite: false,
      reason: "EMAIL_UNVERIFIED",
      currentStatus: workspace.billingStatus,
    }
  }

  if (workspace.billingStatus === "SUSPENDED") {
    return {
      isEntitledToWrite: false,
      reason: "WORKSPACE_SUSPENDED",
      currentStatus: workspace.billingStatus,
    }
  }

  if (workspace.billingStatus === "PAST_DUE") {
    return {
      isEntitledToWrite: false,
      reason: "PAST_DUE",
      currentStatus: workspace.billingStatus,
    }
  }

  if (workspace.billingStatus === "TRIAL") {
    if (workspace.trialEndsAt && now <= workspace.trialEndsAt) {
      const msLeft = workspace.trialEndsAt.getTime() - now.getTime()
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
      return {
        isEntitledToWrite: true,
        trialDaysLeft: daysLeft,
        currentStatus: workspace.billingStatus,
      }
    }
    return {
      isEntitledToWrite: false,
      reason: "TRIAL_EXPIRED",
      trialDaysLeft: 0,
      currentStatus: workspace.billingStatus,
    }
  }

  if (workspace.billingStatus === "CANCELED") {
    if (workspace.currentPeriodEnd && now <= workspace.currentPeriodEnd) {
      return {
        isEntitledToWrite: true,
        currentStatus: workspace.billingStatus,
      }
    }
    return {
      isEntitledToWrite: false,
      reason: "SUBSCRIPTION_EXPIRED",
      currentStatus: workspace.billingStatus,
    }
  }

  // ACTIVE
  return {
    isEntitledToWrite: true,
    currentStatus: workspace.billingStatus,
  }
}

export async function getUserPrimaryWorkspace(userId: number): Promise<WorkspaceScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  })
  if (!user) throw workspaceError("User not found", 401)

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { id: "asc" },
  })

  if (membership) {
    return {
      workspaceId: membership.workspaceId,
      workspace: membership.workspace,
      membership: {
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
      },
    }
  }

  // If user is platform admin with no workspace, or user belongs to a default workspace
  if (user.isPlatformAdmin) {
    const firstWs = await prisma.workspace.findFirst({ orderBy: { id: "asc" } })
    if (firstWs) {
      return {
        workspaceId: firstWs.id,
        workspace: firstWs,
        membership: {
          id: 0,
          userId,
          role: "OWNER",
        },
      }
    }
  }

  throw workspaceError("No workspace found for user", 404)
}

export async function resolveWorkspaceScope(workspaceId: number, actorId: number): Promise<WorkspaceScope> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  })
  if (!workspace) throw workspaceError("Workspace not found", 404)

  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, isPlatformAdmin: true },
  })

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actorId } },
  })

  if (!membership) {
    if (user?.isPlatformAdmin) {
      return {
        workspaceId,
        workspace,
        membership: {
          id: 0,
          userId: actorId,
          role: "OWNER",
        },
      }
    }
    throw workspaceError("Workspace access denied", 403)
  }

  return {
    workspaceId,
    workspace,
    membership,
  }
}

export function requireWorkspaceEntitlement(options: { write?: boolean } = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = authenticatedUserId(req)
      let scope = req.workspaceScope
      if (!scope) {
        scope = await getUserPrimaryWorkspace(actorId)
        req.workspaceScope = scope
      }

      if (options.write) {
        const entitlement = evaluateWorkspaceEntitlement(scope.workspace)
        if (!entitlement.isEntitledToWrite) {
          return res.status(402).json({
            error: "La suscripción o período de prueba de tu cuenta no permite operaciones de escritura.",
            code: entitlement.reason,
            billingStatus: scope.workspace.billingStatus,
            trialEndsAt: scope.workspace.trialEndsAt?.toISOString(),
          })
        }
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}
