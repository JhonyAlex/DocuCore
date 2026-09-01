import type { BillingStatus, Workspace, WorkspaceMemberStatus, WorkspaceRole } from "@prisma/client"
import prisma from "./prisma"
import { fetchWorkspaceCompliance, type ComplianceSnapshot } from "./entitlements"

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
    status: WorkspaceMemberStatus
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
    membership: { id: 0, userId, role: "ADMIN", status: "ACTIVE" },
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
        if (selectedMembership.status === "PLAN_LOCKED") throw workspaceError("Workspace access denied", 403)
        return {
          workspaceId: selectedMembership.workspaceId,
          workspace: selectedMembership.workspace,
          membership: { id: selectedMembership.id, userId, role: selectedMembership.role, status: selectedMembership.status },
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
        membership: { id: realMembership.id, userId, role: realMembership.role, status: realMembership.status },
        supportAccess: false,
      }
    }
    const anyMembership = await prisma.workspaceMember.findFirst({ where: { userId }, select: { id: true } })
    if (anyMembership) throw workspaceError("Workspace access denied", 403)
    throw workspaceError("Platform admin must select a workspace before continuing", 409, "WORKSPACE_SELECTION_REQUIRED")
  }

  // A suspended member keeps the selected context solely to consult and
  // download information. PLAN_LOCKED remains an access-denied state.
  if (user.activeWorkspaceId) {
    const selectedMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: user.activeWorkspaceId, userId } },
      include: { workspace: true },
    })
    if (selectedMember && selectedMember.status !== "PLAN_LOCKED") {
      return {
        workspaceId: selectedMember.workspaceId,
        workspace: selectedMember.workspace,
        membership: { id: selectedMember.id, userId, role: selectedMember.role, status: selectedMember.status },
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
    const suspendedMembership = await prisma.workspaceMember.findFirst({
      where: { userId, status: "SUSPENDED" },
      include: { workspace: true },
      orderBy: { id: "asc" },
    })
    if (suspendedMembership) {
      return {
        workspaceId: suspendedMembership.workspaceId,
        workspace: suspendedMembership.workspace,
        membership: { id: suspendedMembership.id, userId, role: suspendedMembership.role, status: suspendedMembership.status },
        supportAccess: false,
      }
    }
    // PLAN_LOCKED is an access-denied state, not a missing workspace.
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
      status: membership.status,
    },
    supportAccess: false,
  }
}

/** A suspended member may read/download, but cannot mutate workspace data. */
export function assertWorkspaceMemberWriteAllowed(scope: Pick<WorkspaceScope, "membership">): void {
  if (scope.membership.status !== "SUSPENDED") return
  throw workspaceError(
    "Tu acceso a este espacio está suspendido. Puedes consultar y descargar la información, pero no realizar cambios.",
    403,
    "WORKSPACE_MEMBER_SUSPENDED",
  )
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
    if (membership.status === "PLAN_LOCKED") throw workspaceError("Workspace access denied", 403)
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
export async function assertWorkspaceWriteAllowed(workspaceId: number): Promise<ComplianceSnapshot> {
  const snapshot = await fetchWorkspaceCompliance(workspaceId)
  if (!snapshot.canWrite) {
    if (snapshot.complianceStatus === "PLAN_ACTION_REQUIRED") {
      throw workspaceError(
        "Tu workspace supera el límite de proyectos o usuarios de su plan. Resuelve qué proyectos y usuarios conservar antes de continuar.",
        402,
        "PLAN_ACTION_REQUIRED",
      )
    }
    if (snapshot.complianceStatus === "SUSPENDED" || snapshot.reason === "WORKSPACE_SUSPENDED") {
      throw workspaceError("Este workspace está suspendido.", 403, "WORKSPACE_SUSPENDED")
    }
    if (snapshot.complianceStatus === "BLOCKED_FOR_PAYMENT" || snapshot.reason === "PAST_DUE") {
      throw workspaceError("La suscripción de este workspace tiene un pago pendiente.", 402, "PAST_DUE")
    }
    if (snapshot.reason === "EMAIL_UNVERIFIED") {
      throw workspaceError("Debes verificar tu correo electrónico antes de continuar.", 403, "EMAIL_UNVERIFIED")
    }
    if (snapshot.reason === "TRIAL_EXPIRED") {
      throw workspaceError("El período de prueba de este workspace ha finalizado.", 402, "TRIAL_EXPIRED")
    }
    throw workspaceError(
      "La suscripción o período de prueba de tu cuenta no permite realizar cambios.",
      402,
      snapshot.reason ?? "SUBSCRIPTION_EXPIRED",
    )
  }
  return snapshot
}
