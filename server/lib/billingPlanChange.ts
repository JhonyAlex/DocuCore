import { Router } from "express"
import { z } from "zod"
import prisma from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { authenticatedUserId, requireAuth } from "../lib/auth"
import { getUserPrimaryWorkspace } from "../lib/workspaceScope"
import {
  applyPlanTransition,
  computeCompliance,
  countMembers,
  countProjects,
  lockWorkspaceForEntitlement,
  swapActiveProject,
  type PlanKey,
  type WorkspaceEntitlementInput,
} from "../lib/entitlements"
import { PLAN_CATALOG } from "../../shared/planCatalog"

const router = Router()

export type { PlanKey }

const targetSchema = z.object({
  targetPlanKey: z.enum(["STARTER", "PRO"]),
}).strict()

const initiateSchema = z.object({
  targetPlanKey: z.enum(["STARTER", "PRO"]),
  selectedProjectId: z.number().int().positive().optional(),
  selectedMemberIds: z.array(z.number().int().positive()).max(15).optional(),
  // When provided, this confirms an already-persisted pending transition.
  transitionId: z.string().min(1).max(100).optional(),
}).strict()

const applySchema = z.object({
  targetPlanKey: z.enum(["STARTER", "PRO"]).default("STARTER"),
  selectedProjectId: z.number().int().positive(),
  selectedMemberIds: z.array(z.number().int().positive()).max(15).optional(),
}).strict()

const swapSchema = z.object({
  keepProjectId: z.number().int().positive(),
}).strict()

function loadWorkspace(scope: { workspaceId: number }) {
  return prisma.workspace.findUnique({ where: { id: scope.workspaceId } })
}

/** One pending plan-change per workspace and target plan: a deterministic id
 *  makes the initiate operation idempotent under double-submit and retries. */
function deterministicTransitionId(workspaceId: number, targetPlanKey: PlanKey): string {
  return `pct_${workspaceId}_${targetPlanKey}`
}

interface MemberPreview {
  id: number
  name: string
  email: string
  role: string
}

/** The canonical "what would happen" answer used by Preview and the UI wizard. */
export async function buildPreview(workspaceId: number, targetPlanKey: PlanKey) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) throw Object.assign(new Error("Workspace not found"), { status: 404 })

  const [rows, members] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId },
      select: { id: true, code: true, name: true, status: true, archivedByPlan: true, planLockedAt: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { id: true, role: true, status: true, user: { select: { id: true, name: true, email: true } } },
    }),
  ])
  const counts = { ...countProjects(rows), ...countMembers(members) }
  const current = computeCompliance(workspace as unknown as WorkspaceEntitlementInput, counts)
  const targetMaxProjects = targetPlanKey === "STARTER" ? PLAN_CATALOG.STARTER.maxActiveProjects : PLAN_CATALOG.PRO.maxActiveProjects
  const targetMaxMembers = targetPlanKey === "STARTER" ? PLAN_CATALOG.STARTER.maxActiveMembers : PLAN_CATALOG.PRO.maxActiveMembers

  const affectedProjects = rows
    .filter((p) => p.status === "ACTIVE")
    .map((p) => ({ id: p.id, code: p.code, name: p.name }))

  const affectedMembers: MemberPreview[] = members
    .filter((m) => m.status === "ACTIVE")
    .map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, role: m.role }))

  const requiresProjectSelection = targetPlanKey === "STARTER" && counts.activeProjects > targetMaxProjects
  const requiresMemberSelection = targetMaxMembers > 0 && counts.activeMembers > targetMaxMembers

  return {
    currentPlanKey: current.planKey,
    targetPlanKey,
    maxActiveProjects: targetMaxProjects,
    maxActiveMembers: targetMaxMembers,
    activeProjects: counts.activeProjects,
    planLockedProjects: counts.planLockedProjects,
    activeMembers: counts.activeMembers,
    planLockedMembers: counts.planLockedMembers,
    suspendedMembers: counts.suspendedMembers,
    affectedProjects,
    affectedMembers,
    requiresSelection: requiresProjectSelection || requiresMemberSelection,
    requiresProjectSelection,
    requiresMemberSelection,
    wouldLockProjectIds:
      requiresProjectSelection
        ? affectedProjects.map((p) => p.id).slice(0, Math.max(0, counts.activeProjects - targetMaxProjects))
        : [],
    wouldLockMemberIds:
      requiresMemberSelection
        ? affectedMembers.map((m) => m.id).slice(0, Math.max(0, counts.activeMembers - targetMaxMembers))
        : [],
    canProceed: !requiresMemberSelection && (targetPlanKey === "STARTER" ? counts.activeProjects <= targetMaxProjects : true),
    complianceStatus: current.complianceStatus,
  }
}

router.use(requireAuth)

router.post("/preview", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const input = targetSchema.parse(req.body)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden gestionar planes.", code: "WORKSPACE_ACCESS_DENIED" })
  }
  const preview = await buildPreview(wsScope.workspace.id, input.targetPlanKey)
  res.json(preview)
}))

router.post("/initiate", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const input = initiateSchema.parse(req.body)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden gestionar planes.", code: "WORKSPACE_ACCESS_DENIED" })
  }

  const workspace = await loadWorkspace(wsScope)
  if (!workspace) throw Object.assign(new Error("Workspace not found"), { status: 404 })

  const [rows, members] = await Promise.all([
    prisma.project.findMany({ where: { workspaceId: workspace.id }, select: { id: true, status: true, archivedByPlan: true, planLockedAt: true } }),
    prisma.workspaceMember.findMany({ where: { workspaceId: workspace.id }, select: { id: true, role: true, status: true } }),
  ])
  const counts = { ...countProjects(rows), ...countMembers(members) }
  const snapshot = computeCompliance(workspace as unknown as WorkspaceEntitlementInput, counts)
  const targetMaxProjects = input.targetPlanKey === "STARTER" ? PLAN_CATALOG.STARTER.maxActiveProjects : PLAN_CATALOG.PRO.maxActiveProjects
  const targetMaxMembers = input.targetPlanKey === "STARTER" ? PLAN_CATALOG.STARTER.maxActiveMembers : PLAN_CATALOG.PRO.maxActiveMembers

  // A downgrade with multiple active projects requires an explicit selection.
  if (input.targetPlanKey === "STARTER" && counts.activeProjects > targetMaxProjects) {
    const selected = input.selectedProjectId
    const selectedProject = rows.find((p) => p.id === selected && p.status === "ACTIVE")
    if (!selectedProject) {
      return res.status(409).json({
        error: "Debes seleccionar qué proyecto deseas conservar activo.",
        code: "PLAN_COMPLIANCE_REQUIRED",
        metadata: { affectedProjectIds: rows.filter((p) => p.status === "ACTIVE").map((p) => p.id) },
      })
    }
  } else if (input.targetPlanKey === "STARTER" && counts.activeProjects <= targetMaxProjects && snapshot.complianceStatus === "PLAN_ACTION_REQUIRED") {
    // Out-of-compliance inherited state: selection is mandatory to resolve.
    if (!input.selectedProjectId) {
      return res.status(409).json({ error: "Debes seleccionar qué proyecto deseas conservar activo.", code: "PLAN_COMPLIANCE_REQUIRED" })
    }
  }

  // A downgrade that exceeds the seat limit requires an explicit member selection.
  const selectedMemberIds = input.selectedMemberIds ?? []
  if (counts.activeMembers > targetMaxMembers) {
    if (selectedMemberIds.length !== targetMaxMembers) {
      return res.status(409).json({
        error: `Debes seleccionar exactamente ${targetMaxMembers} usuario(s) que conservarán acceso.`,
        code: "MEMBER_SELECTION_REQUIRED",
        metadata: { maxActiveMembers: targetMaxMembers, activeMembers: counts.activeMembers },
      })
    }
    const activeMembers = members.filter((m) => m.status === "ACTIVE")
    const owners = activeMembers.filter((m) => m.role === "OWNER")
    if (!selectedMemberIds.every((id) => activeMembers.some((m) => m.id === id))) {
      return res.status(409).json({ error: "La selección debe contener únicamente miembros activos del workspace.", code: "INVALID_MEMBER_SELECTION" })
    }
    if (owners.length === 1 ? !selectedMemberIds.includes(owners[0].id) : !selectedMemberIds.some((id) => activeMembers.some((m) => m.id === id && m.role === "OWNER"))) {
      return res.status(409).json({ error: "El workspace debe conservar al menos una persona propietaria activa.", code: "OWNER_REQUIRED" })
    }
  }

  // Persist the transition decision (never browser memory, §5).
  const now = new Date()
  const effectiveAt = workspace.currentPeriodEnd && workspace.currentPeriodEnd.getTime() > now.getTime() ? workspace.currentPeriodEnd : now

  const selectedProjectId = input.selectedProjectId ?? rows.find((p) => p.status === "ACTIVE")?.id ?? null
  if (selectedProjectId === null) {
    return res.status(409).json({ error: "No hay un proyecto activo que conservar.", code: "PLAN_COMPLIANCE_REQUIRED" })
  }

  // Idempotency: the same plan-change decision maps to a DETERMINISTIC id, so a
  // double submit, an HTTP retry or a re-send after timeout reuses the single
  // PENDING transition instead of creating functionally-equivalent orphans. A
  // caller may also confirm an already-persisted transition by its id.
  let transitionId = input.transitionId ?? deterministicTransitionId(workspace.id, input.targetPlanKey)
  if (input.transitionId) {
    const existing = await prisma.planTransition.findUnique({ where: { id: input.transitionId } })
    if (!existing || existing.workspaceId !== workspace.id || existing.status !== "PENDING") {
      return res.status(409).json({ error: "La transición indicada no es válida o ya fue aplicada.", code: "INVALID_TRANSITION" })
    }
  } else {
    const existing = await prisma.planTransition.findUnique({ where: { id: transitionId } })
    // A completed transition (APPLIED/CANCELED) is history: mint a fresh id so
    // a later downgrade never overwrites the previous one.
    if (existing && existing.status !== "PENDING") {
      transitionId = `pct_${workspace.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    }
  }

  const transition = await prisma.planTransition.upsert({
    where: { id: transitionId },
    create: {
      id: transitionId,
      workspaceId: workspace.id,
      actorId,
      targetPlanKey: input.targetPlanKey,
      selectedProjectId,
      selectedMemberIds: selectedMemberIds.map(String),
      planLockedProjectIds: [],
      planLockedMemberIds: [],
      effectiveAt,
      status: "PENDING",
    },
    update: {
      targetPlanKey: input.targetPlanKey,
      selectedProjectId,
      selectedMemberIds: selectedMemberIds.map(String),
      effectiveAt,
    },
  })

  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      userId: actorId,
      action: "Cambio de plan iniciado",
      entityId: `plan-transition:${transition.id}`,
      detail: JSON.stringify({ targetPlanKey: input.targetPlanKey, selectedProjectId, selectedMemberIds, effectiveAt: effectiveAt.toISOString() }),
      timestamp: now,
    },
  })

  res.status(201).json({
    transitionId: transition.id,
    status: transition.status,
    targetPlanKey: transition.targetPlanKey,
    selectedProjectId: transition.selectedProjectId,
    selectedMemberIds: transition.selectedMemberIds.map(Number),
    effectiveAt: transition.effectiveAt?.toISOString() ?? null,
  })
}))

/** Resolve a workspace already in a non-compliant state (STARTER + overage). */
router.post("/resolve", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const input = applySchema.parse(req.body)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden gestionar planes.", code: "WORKSPACE_ACCESS_DENIED" })
  }

  // This endpoint resolves a non-compliant STARTER state. It must NEVER be a
  // self-upgrade path: upgrading to PRO requires a confirmed Stripe checkout
  // (the webhook marks PENDING -> applied). Reject PRO here.
  if (input.targetPlanKey === "PRO") {
    const ws = await prisma.workspace.findUnique({ where: { id: wsScope.workspace.id }, select: { planKey: true } })
    if (ws?.planKey !== "PRO") {
      return res.status(409).json({
        error: "La mejora a Pro se debe completar mediante el pago en Stripe, no desde esta operación de resolución.",
        code: "PLAN_UPGRADE_REQUIRES_CHECKOUT",
      })
    }
  }

  const applied = await prisma.$transaction(async (tx) => {
    return applyPlanTransition(tx, {
      workspaceId: wsScope.workspace.id,
      actorId,
      targetPlanKey: input.targetPlanKey,
      selectedProjectId: input.selectedProjectId,
      selectedMemberIds: input.selectedMemberIds,
      effectiveAt: new Date(),
    })
  })

  res.json({
    transitionId: applied.transitionId,
    status: applied.status,
    keptProjectId: applied.keptProjectId,
    planLockedProjectIds: applied.planLockedProjectIds,
    selectedMemberIds: applied.selectedMemberIds,
    planLockedMemberIds: applied.planLockedMemberIds,
    graceEndsAt: await graceEndsAt(wsScope.workspace.id),
  })
}))

/** Swap the single active project within the 30-day grace window. */
router.post("/swap", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const input = swapSchema.parse(req.body)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden gestionar planes.", code: "WORKSPACE_ACCESS_DENIED" })
  }

  const result = await prisma.$transaction(async (tx) => {
    const swapped = await swapActiveProject(tx, { workspaceId: wsScope.workspace.id, actorId, keepProjectId: input.keepProjectId })
    await lockWorkspaceForEntitlement(tx, wsScope.workspace.id) // ensure lock is held through transaction end
    return swapped
  })

  res.json(result)
}))

async function graceEndsAt(workspaceId: number): Promise<string | null> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { graceEndsAt: true } })
  return ws?.graceEndsAt?.toISOString() ?? null
}

export default router
