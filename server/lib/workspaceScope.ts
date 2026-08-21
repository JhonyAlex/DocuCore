import type { BillingStatus, Workspace, WorkspaceRole } from "@prisma/client"
import prisma from "./prisma"
import { fetchWorkspaceCompliance } from "./entitlements"

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
  /** True only for an explicit PlatformAdmin support context without membership. */
  supportAccess: boolean
}

declare module "express" {
  interface Request {
    workspaceScope?: WorkspaceScope
  }
}

function workspaceError(message: string, status: number, code?: string, extra?: Record<string, unknown>): Error & { status: number; code?: string } {
  return Object.assign(new Error(message), { status, code, ...extra })
}

function platformSupportScope(workspace: Workspace, userId: number): WorkspaceScope {
  return {
    workspaceId: workspace.id,
    workspace,
    // This is an authorization scope, never a persisted WorkspaceMember or seat.
    membership: { id: 0, userId, role: "ADMIN" },
    supportAccess: true,
  }
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

  return {
    isEntitledToWrite: true,
    currentStatus: workspace.billingStatus,
  }
}

export async function getUserPrimaryWorkspace(userId: number): Promise<WorkspaceScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true, activeWorkspaceId: true },
  })
  if (!user) throw workspaceError("User not found", 401)

  // PlatformAdmin access is deliberately explicit: it never falls back to an
  // arbitrary workspace. With an explicit selection, a real membership keeps
  // its role and a membership-less context becomes support access. Without a
  // selection, a real ACTIVE membership is still the source of authority (its
  // own role, never a synthetic one); only a Platform admin without any
  // membership must select a support context before continuing.
  if (user.isPlatformAdmin) {
    if (user.activeWorkspaceId) {
      const selectedMembership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: user.activeWorkspaceId, userId } },
        include: { workspace: true },
      })
      if (selectedMembership) {
        if (selectedMembership.status !== "ACTIVE") throw workspaceError("Workspace access denied", 403)
        return {
          workspaceId: selectedMembership.workspaceId,
          workspace: selectedMembership.workspace,
          membership: { id: selectedMembership.id, userId, role: selectedMembership.role },
          supportAccess: false,
        }
      }

      const selectedWorkspace = await prisma.workspace.findUnique({ where: { id: user.activeWorkspaceId } })
      if (!selectedWorkspace) throw workspaceError("Workspace not found", 404)
      return platformSupportScope(selectedWorkspace, userId)
    }

    const realMembership = await prisma.workspaceMember.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { workspace: true },
      orderBy: { id: "asc" },
    })
    if (realMembership) {
      return {
        workspaceId: realMembership.workspaceId,
        workspace: realMembership.workspace,
        membership: { id: realMembership.id, userId, role: realMembership.role },
        supportAccess: false,
      }
    }
    const anyMembership = await prisma.workspaceMember.findFirst({ where: { userId }, select: { id: true } })
    if (anyMembership) throw workspaceError("Workspace access denied", 403)
    throw workspaceError("Platform admin must select a workspace before continuing", 409, "WORKSPACE_SELECTION_REQUIRED")
  }

  // A normal user may only use an ACTIVE membership as their selected context.
  if (user.activeWorkspaceId) {
    const activeMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: user.activeWorkspaceId, userId } },
      include: { workspace: true },
    })
    if (activeMember && activeMember.status === "ACTIVE") {
      return {
        workspaceId: activeMember.workspaceId,
        workspace: activeMember.workspace,
        membership: { id: activeMember.id, userId, role: activeMember.role },
        supportAccess: false,
      }
    }
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { workspace: true },
    orderBy: { id: "asc" },
  })
  if (!membership) {
    // A membership that exists but is not ACTIVE (SUSPENDED / PLAN_LOCKED) is
    // an access-denied state, not a missing workspace: keep the 403 semantic
    // that the scope resolvers rely on.
    const anyMembership = await prisma.workspaceMember.findFirst({ where: { userId }, select: { id: true } })
    if (anyMembership) throw workspaceError("Workspace access denied", 403)
    throw workspaceError("No workspace found for user", 404)
  }

  return {
    workspaceId: membership.workspaceId,
    workspace: membership.workspace,
    membership: {
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
    },
    supportAccess: false,
  }
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

  if (membership) {
    if (membership.status !== "ACTIVE") throw workspaceError("Workspace access denied", 403)
    return {
      workspaceId,
      workspace,
      membership,
      supportAccess: false,
    }
  }

  if (user?.isPlatformAdmin) return platformSupportScope(workspace, actorId)
  throw workspaceError("Workspace access denied", 403)
}

/**
 * Blocks writes on a workspace that is out of compliance with its plan (project
 * or member overage). Read/export/download stay available; the OWNER must
 * resolve which projects/members to keep first. This is the enforcement behind
 * an external Stripe downgrade that carried no prepared transition (§11).
 */
export async function assertWorkspaceWriteAllowed(workspaceId: number): Promise<void> {
  const snapshot = await fetchWorkspaceCompliance(workspaceId)
  if (snapshot.complianceStatus === "PLAN_ACTION_REQUIRED") {
    throw workspaceError(
      "Tu workspace supera el límite de proyectos o usuarios de su plan. Resuelve qué proyectos y usuarios conservar antes de continuar.",
      402,
      "PLAN_ACTION_REQUIRED",
    )
  }
}
