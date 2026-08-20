import type { BillingStatus, Prisma, WorkspaceMemberStatus } from "@prisma/client"
import prisma from "./prisma"
import {
  PLAN_CATALOG,
  PLAN_GRACE_DAYS,
  TRIAL_DURATION_DAYS,
  TRIAL_MAX_ACTIVE_MEMBERS,
  TRIAL_MAX_ACTIVE_PROJECTS,
  isPlanKey,
  type PlanKey,
} from "../../shared/planCatalog"

/**
 * Entitlement & compliance engine.
 *
 * This module is the single authority for:
 *  - plan resolution (plan key + billing status -> project & member capacity);
 *  - compliance computation (is a workspace silently out of compliance?);
 *  - plan transitions (persisted decisions applied transactionally);
 *  - plan-limit archiving vs manual archiving (data is NEVER destroyed);
 *  - member seat limits (ACTIVE consumes a seat; SUSPENDED and PLAN_LOCKED do
 *    not) and the capacity guard behind every activation path.
 *
 * No route may duplicate these rules. See docs/architecture/PLANS_AND_ENTITLEMENTS.md.
 */

export { PLAN_CATALOG, PLAN_GRACE_DAYS, TRIAL_DURATION_DAYS, TRIAL_MAX_ACTIVE_MEMBERS, TRIAL_MAX_ACTIVE_PROJECTS, isPlanKey, type PlanKey }

/** Commercial decision: a platform admin acting inside a normal workspace
 *  consumes the workspace's entitlement exactly like any other member. */
export interface PlanResolution {
  planKey: PlanKey | null
  planName: string
  maxActiveProjects: number
  maxActiveMembers: number
  isTrial: boolean
}

function trialInfo(now: Date, trialEndsAt: Date | null): PlanResolution {
  const remaining = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : 0
  const daysLeft = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)))
  return {
    planKey: null,
    planName: daysLeft > 0 ? "Prueba gratuita (14 días)" : "Prueba finalizada",
    maxActiveProjects: TRIAL_MAX_ACTIVE_PROJECTS,
    maxActiveMembers: TRIAL_MAX_ACTIVE_MEMBERS,
    isTrial: true,
  }
}

export function resolveEntitlement(input: {
  billingStatus: BillingStatus
  planKey?: string | null
  stripePriceId?: string | null
  trialEndsAt?: Date | null
  currentPeriodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
  now?: Date
}): PlanResolution {
  const now = input.now ?? new Date()

  if (input.billingStatus === "TRIAL") {
    return trialInfo(now, input.trialEndsAt ?? null)
  }

  const explicit = input.planKey && isPlanKey(input.planKey) ? (input.planKey as PlanKey) : null
  const derived = explicit ?? (input.stripePriceId ? planKeyFromPriceId(input.stripePriceId) : null)

  if (derived === "STARTER") {
    return { planKey: "STARTER", planName: "Starter", maxActiveProjects: PLAN_CATALOG.STARTER.maxActiveProjects, maxActiveMembers: PLAN_CATALOG.STARTER.maxActiveMembers, isTrial: false }
  }
  if (derived === "PRO") {
    return { planKey: "PRO", planName: "Pro", maxActiveProjects: PLAN_CATALOG.PRO.maxActiveProjects, maxActiveMembers: PLAN_CATALOG.PRO.maxActiveMembers, isTrial: false }
  }

  // Historical default: active workspaces without an explicit plan behave as Pro.
  if (input.billingStatus === "ACTIVE") {
    return { planKey: "PRO", planName: "Pro", maxActiveProjects: PLAN_CATALOG.PRO.maxActiveProjects, maxActiveMembers: PLAN_CATALOG.PRO.maxActiveMembers, isTrial: false }
  }

  return { planKey: null, planName: "Sin suscripción activa", maxActiveProjects: 0, maxActiveMembers: 0, isTrial: false }
}

export function planKeyFromPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null
  const starterPrice = process.env.STRIPE_PRICE_STARTER
  const proPrice = process.env.STRIPE_PRICE_PRO
  if (starterPrice && priceId === starterPrice) return "STARTER"
  if (proPrice && priceId === proPrice) return "PRO"
  if (priceId === "fake_price_starter" || priceId.includes("starter")) return "STARTER"
  if (priceId === "fake_price_pro" || priceId.includes("pro")) return "PRO"
  return null
}

export type ProjectArchivalReason = "MANUAL" | "PLAN_LIMIT"

export interface WorkspaceMemberCounts {
  activeMembers: number
  planLockedMembers: number
  suspendedMembers: number
}

export interface ComplianceSnapshot {
  planKey: PlanKey | null
  planName: string
  billingStatus: BillingStatus
  maxActiveProjects: number
  activeProjectsCount: number
  planLockedProjectsCount: number
  maxActiveMembers: number
  activeMembersCount: number
  planLockedMembersCount: number
  suspendedMembersCount: number
  remainingMemberSeats: number
  projectsCompliant: boolean
  membersCompliant: boolean
  compliant: boolean
  complianceStatus: "COMPLIANT" | "PLAN_ACTION_REQUIRED" | "BLOCKED_FOR_PAYMENT" | "SUSPENDED" | "NO_PLAN"
  graceEndsAt: Date | null
  canCreateProject: boolean
  canRestoreProject: boolean
  canInviteMember: boolean
  canActivateMember: boolean
  canWrite: boolean
  reason: string | null
}

export interface WorkspaceEntitlementInput {
  id: number
  billingStatus: BillingStatus
  planKey: string | null
  stripePriceId: string | null
  trialStartedAt: Date | null
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  graceEndsAt: Date | null
  planComplianceStartedAt: Date | null
}

/** Payment-ish states that block writes regardless of plan. */
export function isPaymentBlocked(billingStatus: BillingStatus): boolean {
  return billingStatus === "PAST_DUE" || billingStatus === "SUSPENDED" || billingStatus === "PENDING_VERIFICATION"
}

export interface WorkspaceCounts extends WorkspaceMemberCounts {
  activeProjects: number
  planLockedProjects: number
}

export function emptyCounts(): WorkspaceCounts {
  return { activeProjects: 0, planLockedProjects: 0, activeMembers: 0, planLockedMembers: 0, suspendedMembers: 0 }
}

/**
 * Compute a full compliance snapshot for a workspace, in-memory and with no
 * side effects. All counts come from the caller (server) so the same function
 * works inside a transaction.
 */
export function computeCompliance(
  workspace: WorkspaceEntitlementInput,
  counts: WorkspaceCounts,
  opts: { now?: Date } = {},
): ComplianceSnapshot {
  const now = opts.now ?? new Date()
  const resolution = resolveEntitlement({ billingStatus: workspace.billingStatus, planKey: workspace.planKey, stripePriceId: workspace.stripePriceId, trialEndsAt: workspace.trialEndsAt, currentPeriodEnd: workspace.currentPeriodEnd, cancelAtPeriodEnd: workspace.cancelAtPeriodEnd, now })
  let maxAllowedProjects = resolution.maxActiveProjects
  const maxAllowedMembers = resolution.maxActiveMembers

  // Cancellation at period end keeps entitlements until the period actually ends
  // (§8), even if the plan key is no longer explicit.
  if (workspace.billingStatus === "CANCELED" && workspace.currentPeriodEnd && now <= workspace.currentPeriodEnd && maxAllowedProjects === 0) {
    maxAllowedProjects = PLAN_CATALOG.PRO.maxActiveProjects
  }

  const remainingMemberSeats = Math.max(0, maxAllowedMembers - counts.activeMembers)

  const base = {
    planKey: resolution.planKey,
    planName: resolution.planName,
    billingStatus: workspace.billingStatus,
    maxActiveProjects: maxAllowedProjects,
    activeProjectsCount: counts.activeProjects,
    planLockedProjectsCount: counts.planLockedProjects,
    maxActiveMembers: maxAllowedMembers,
    activeMembersCount: counts.activeMembers,
    planLockedMembersCount: counts.planLockedMembers,
    suspendedMembersCount: counts.suspendedMembers,
    remainingMemberSeats,
    graceEndsAt: workspace.graceEndsAt,
  }

  const projectsOverLimit = maxAllowedProjects > 0 && counts.activeProjects > maxAllowedProjects
  const membersOverLimit = maxAllowedMembers > 0 && counts.activeMembers > maxAllowedMembers
  const overLimit = projectsOverLimit || membersOverLimit
  const projectsCompliant = !projectsOverLimit
  const membersCompliant = !membersOverLimit

  if (workspace.billingStatus === "SUSPENDED") {
    return {
      ...base,
      projectsCompliant,
      membersCompliant,
      compliant: true,
      complianceStatus: "SUSPENDED",
      canCreateProject: false,
      canRestoreProject: false,
      canInviteMember: false,
      canActivateMember: false,
      canWrite: false,
      reason: "WORKSPACE_SUSPENDED",
    }
  }

  if (workspace.billingStatus === "PAST_DUE") {
    return {
      ...base,
      projectsCompliant,
      membersCompliant,
      compliant: true,
      complianceStatus: "BLOCKED_FOR_PAYMENT",
      canCreateProject: false,
      canRestoreProject: false,
      canInviteMember: false,
      canActivateMember: false,
      canWrite: false,
      reason: "PAST_DUE",
    }
  }

  if (workspace.billingStatus === "PENDING_VERIFICATION") {
    return {
      ...base,
      projectsCompliant,
      membersCompliant,
      compliant: true,
      complianceStatus: "BLOCKED_FOR_PAYMENT",
      canCreateProject: false,
      canRestoreProject: false,
      canInviteMember: false,
      canActivateMember: false,
      canWrite: false,
      reason: "EMAIL_UNVERIFIED",
    }
  }

  // Capacity rules: project overage OR member overage both require resolution.
  const effectivePlan = resolution.planKey
  const hasPlan = effectivePlan !== null || resolution.isTrial
  const isExpiredTrial = workspace.billingStatus === "TRIAL" && workspace.trialEndsAt !== null && now > workspace.trialEndsAt

  // An expired trial is read-only regardless of counts.
  if (isExpiredTrial) {
    return {
      ...base,
      planKey: null,
      maxActiveProjects: 0,
      maxActiveMembers: 0,
      projectsCompliant,
      membersCompliant,
      compliant: true,
      complianceStatus: "NO_PLAN",
      canCreateProject: false,
      canRestoreProject: false,
      canInviteMember: false,
      canActivateMember: false,
      canWrite: false,
      reason: "TRIAL_EXPIRED",
    }
  }

  // Overage (projects OR members) makes the workspace non-compliant. This also
  // covers an ACTIVE trial that exceeds its 15/15 capacity: invalid/imported
  // states must stay semantically coherent, never silently "compliant".
  if (overLimit && hasPlan) {
    return {
      ...base,
      projectsCompliant,
      membersCompliant,
      compliant: false,
      complianceStatus: "PLAN_ACTION_REQUIRED",
      canCreateProject: false,
      canRestoreProject: false,
      canInviteMember: false,
      canActivateMember: false,
      canWrite: false,
      reason: "PLAN_ACTION_REQUIRED",
    }
  }

  if (!hasPlan && maxAllowedProjects === 0) {
    return {
      ...base,
      maxActiveProjects: 0,
      maxActiveMembers: 0,
      projectsCompliant,
      membersCompliant,
      compliant: true,
      complianceStatus: "NO_PLAN",
      canCreateProject: false,
      canRestoreProject: false,
      canInviteMember: false,
      canActivateMember: false,
      canWrite: false,
      reason: "NO_PLAN",
    }
  }

  const canWrite = workspace.billingStatus === "ACTIVE" || workspace.billingStatus === "TRIAL" || (workspace.billingStatus === "CANCELED" && workspace.currentPeriodEnd !== null && now <= workspace.currentPeriodEnd)

  return {
    ...base,
    projectsCompliant,
    membersCompliant,
    compliant: true,
    complianceStatus: "COMPLIANT",
    canCreateProject: canWrite && counts.activeProjects < maxAllowedProjects,
    canRestoreProject: canWrite && counts.activeProjects < maxAllowedProjects,
    canInviteMember: canWrite && counts.activeMembers < maxAllowedMembers,
    canActivateMember: canWrite && counts.activeMembers < maxAllowedMembers,
    canWrite,
    reason: canWrite ? null : "SUBSCRIPTION_EXPIRED",
  }
}

/** Whether a project's read-only state is caused by plan limits. */
export function isPlanLocked(project: { status: string; archivedByPlan: boolean | null; planLockedAt: Date | null }): boolean {
  return project.status === "ARCHIVED" && (project.archivedByPlan === true || project.planLockedAt !== null)
}

export interface ActiveProjectInput {
  id: number
  workspaceId?: number
  code?: string
  status: string
  archivedByPlan: boolean | null
  planLockedAt: Date | null
}

export interface ActiveMemberInput {
  id: number
  userId: number
  role: string
  status: string
}

/** Counts active (non-archived) and plan-locked projects from already-loaded rows. */
export function countProjects(rows: ActiveProjectInput[]): { activeProjects: number; planLockedProjects: number } {
  let activeProjects = 0
  let planLockedProjects = 0
  for (const row of rows) {
    if (row.status === "ACTIVE") activeProjects += 1
    if (isPlanLocked(row)) planLockedProjects += 1
  }
  return { activeProjects, planLockedProjects }
}

/** Counts member seats by status. Only ACTIVE consumes a seat (§2). */
export function countMembers(rows: Array<{ status: string }>): WorkspaceMemberCounts {
  let activeMembers = 0
  let planLockedMembers = 0
  let suspendedMembers = 0
  for (const row of rows) {
    if (row.status === "ACTIVE") activeMembers += 1
    else if (row.status === "PLAN_LOCKED") planLockedMembers += 1
    else if (row.status === "SUSPENDED") suspendedMembers += 1
  }
  return { activeMembers, planLockedMembers, suspendedMembers }
}

export interface PlanTransitionSpec {
  workspaceId: number
  actorId: number
  targetPlanKey: PlanKey
  /** Which active project must remain active after a downgrade with >1 active. */
  selectedProjectId: number
  /** Which active members must remain ACTIVE after a downgrade that exceeds the seat limit. */
  selectedMemberIds?: number[]
  /** When the transition must take effect (Stripe effective date when known). */
  effectiveAt: Date | null
  /** Optional transition id persisted earlier and being confirmed now. */
  transitionId?: string
}

export type PlanTransitionStatus = "PENDING" | "APPLIED" | "CANCELED"

export interface AppliedPlanTransition {
  transitionId: string
  status: PlanTransitionStatus
  effectiveAt: Date | null
  appliedAt: Date | null
  targetPlanKey: PlanKey
  keptProjectId: number
  planLockedProjectIds: number[]
  selectedMemberIds: number[]
  planLockedMemberIds: number[]
}

export interface LockedWorkspaceState {
  workspace: WorkspaceEntitlementInput & { stripeCustomerId: string | null; stripeSubscriptionId: string | null; billingSource: string; name: string; slug: string }
  counts: WorkspaceCounts
  projects: ActiveProjectInput[]
  members: ActiveMemberInput[]
}

/**
 * Load the plan-limit + active project/member state needed by the compliance
 * engine within an existing transaction, and lock the workspace row FOR UPDATE
 * so two concurrent create/restore/swap/transition/accept operations cannot all
 * observe the same capacity. This is the concurrency strategy required by §9.
 */
export async function lockWorkspaceForEntitlement(
  client: Prisma.TransactionClient,
  workspaceId: number,
): Promise<LockedWorkspaceState> {
  const [workspaceRow, projects, members] = await Promise.all([
    client.$queryRaw<Array<{
      id: number
      name: string
      slug: string
      billingStatus: string
      billingSource: string
      trialStartedAt: Date | null
      trialEndsAt: Date | null
      stripeCustomerId: string | null
      stripeSubscriptionId: string | null
      stripePriceId: string | null
      currentPeriodEnd: Date | null
      cancelAtPeriodEnd: boolean
      planKey: string | null
      graceEndsAt: Date | null
      planComplianceStartedAt: Date | null
    }>>`SELECT id, name, slug, "billingStatus", "billingSource", "trialStartedAt", "trialEndsAt", "stripeCustomerId", "stripeSubscriptionId", "stripePriceId", "currentPeriodEnd", "cancelAtPeriodEnd", "planKey", "graceEndsAt", "planComplianceStartedAt" FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`,
    client.project.findMany({
      where: { workspaceId },
      select: { id: true, workspaceId: true, code: true, status: true, archivedByPlan: true, planLockedAt: true },
    }),
    client.workspaceMember.findMany({
      where: { workspaceId },
      select: { id: true, userId: true, role: true, status: true },
    }),
  ])

  if (workspaceRow.length === 0) {
    throw Object.assign(new Error("Workspace not found"), { status: 404 })
  }
  const row = workspaceRow[0]

  const workspace: WorkspaceEntitlementInput & { stripeCustomerId: string | null; stripeSubscriptionId: string | null; billingSource: string; name: string; slug: string } = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    billingStatus: row.billingStatus as BillingStatus,
    billingSource: row.billingSource,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripePriceId: row.stripePriceId,
    planKey: row.planKey,
    trialStartedAt: row.trialStartedAt,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    graceEndsAt: row.graceEndsAt,
    planComplianceStartedAt: row.planComplianceStartedAt,
  }

  const projectCounts = countProjects(projects as ActiveProjectInput[])
  const memberCounts = countMembers(members as Array<{ status: string }>)

  return {
    workspace,
    counts: { ...projectCounts, ...memberCounts },
    projects: projects as ActiveProjectInput[],
    members: members as ActiveMemberInput[],
  }
}

/** Throw a structured error when no ACTIVE seat remains. */
export function assertMemberSeatAvailable(maxActiveMembers: number, activeMembers: number): void {
  if (activeMembers >= maxActiveMembers) {
    throw Object.assign(
      new Error(`Has alcanzado el límite de ${maxActiveMembers} usuario(s) activo(s) para tu plan.`),
      { status: 409, code: "WORKSPACE_MEMBER_LIMIT_REACHED", maxActiveMembers, activeMembers },
    )
  }
}

function ownerRequiredError(): Error & { status: number; code: string } {
  return Object.assign(new Error("El workspace debe conservar al menos una persona propietaria activa."), { status: 409, code: "OWNER_REQUIRED" })
}

/** Validate a downgrade member selection: exactly the seats to keep, all ACTIVE, with an OWNER preserved. */
function validateMemberSelection(activeMembers: ActiveMemberInput[], selectedMemberIds: number[], maxActiveMembers: number): void {
  const active = activeMembers.filter((m) => m.status === "ACTIVE")
  const selectedSet = new Set(selectedMemberIds)

  if (selectedSet.size !== selectedMemberIds.length) {
    throw Object.assign(new Error("La selección de usuarios contiene duplicados."), { status: 409, code: "INVALID_MEMBER_SELECTION" })
  }
  if (selectedSet.size !== maxActiveMembers) {
    throw Object.assign(new Error(`Debes conservar exactamente ${maxActiveMembers} usuario(s) activo(s).`), { status: 409, code: "INVALID_MEMBER_SELECTION" })
  }
  for (const id of selectedMemberIds) {
    if (!active.some((m) => m.id === id)) {
      throw Object.assign(new Error("La selección debe contener únicamente miembros activos del workspace."), { status: 409, code: "INVALID_MEMBER_SELECTION" })
    }
  }

  const owners = active.filter((m) => m.role === "OWNER")
  if (owners.length === 1) {
    if (!selectedSet.has(owners[0].id)) throw ownerRequiredError()
  } else if (!selectedMemberIds.some((id) => active.some((m) => m.id === id && m.role === "OWNER"))) {
    throw ownerRequiredError()
  }
}

/** Apply a plan transition transactionally: exactly the target capacity stays active. */
export async function applyPlanTransition(
  client: Prisma.TransactionClient,
  spec: PlanTransitionSpec,
  opts: { now?: Date } = {},
): Promise<AppliedPlanTransition> {
  const now = opts.now ?? new Date()
  const { counts, projects, members } = await lockWorkspaceForEntitlement(client, spec.workspaceId)

  const active = projects.filter((p) => p.status === "ACTIVE")
  const selected = active.find((p) => p.id === spec.selectedProjectId)
  if (!selected) {
    throw Object.assign(new Error("El proyecto seleccionado debe ser un proyecto activo del workspace."), { status: 409, code: "INVALID_PROJECT_SELECTION" })
  }

  // Capacity for the TARGET plan. A downgrade only plan-locks projects/members
  // when the resolved target plan cannot hold them.
  const resolution = resolveEntitlement({ billingStatus: "ACTIVE", planKey: spec.targetPlanKey })
  const maxAllowedProjects = resolution.maxActiveProjects
  const maxAllowedMembers = resolution.maxActiveMembers

  const planLockIds: number[] = []
  const nowDate = now
  if (counts.activeProjects > maxAllowedProjects) {
    // Sort deterministically and keep the SELECTED project active.
    const toLock = [...active]
      .filter((p) => p.id !== spec.selectedProjectId)
      .sort((a, b) => a.id - b.id)
      .slice(0, Math.max(0, counts.activeProjects - maxAllowedProjects))
    for (const project of toLock) {
      planLockIds.push(project.id)
      await client.project.update({
        where: { id: project.id },
        data: { status: "ARCHIVED", archivedByPlan: true, planLockedAt: nowDate },
      })
    }
  }

  // Member seats: a downgrade plan-locks ACTIVE members beyond the target limit.
  // The operator's selection is persisted and auditable; associations are kept.
  let selectedMemberIds: number[] = []
  let planLockedMemberIds: number[] = []
  if (counts.activeMembers > maxAllowedMembers) {
    const selected = spec.selectedMemberIds ?? []
    validateMemberSelection(members, selected, maxAllowedMembers)
    selectedMemberIds = selected
    const selectedSet = new Set(selected)
    const toLock = members
      .filter((m) => m.status === "ACTIVE" && !selectedSet.has(m.id))
      .sort((a, b) => a.id - b.id)
    planLockedMemberIds = toLock.map((m) => m.id)
    for (const member of toLock) {
      await client.workspaceMember.update({ where: { id: member.id }, data: { status: "PLAN_LOCKED" } })
    }
  }

  // Record grace window only when this transition actually plan-locked projects.
  const needsGrace = planLockIds.length > 0
  const graceEndsAt = needsGrace ? new Date(now.getTime() + PLAN_GRACE_DAYS * 24 * 60 * 60 * 1000) : null

  await client.workspace.update({
    where: { id: spec.workspaceId },
    data: {
      planKey: spec.targetPlanKey,
      graceEndsAt: needsGrace ? graceEndsAt : null,
      planComplianceStartedAt: needsGrace ? now : null,
    },
  })

  const transitionId = spec.transitionId ?? `pct_${spec.workspaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await client.planTransition.upsert({
    where: { id: transitionId },
    create: {
      id: transitionId,
      workspaceId: spec.workspaceId,
      actorId: spec.actorId,
      targetPlanKey: spec.targetPlanKey,
      selectedProjectId: spec.selectedProjectId,
      planLockedProjectIds: planLockIds.map(String),
      selectedMemberIds: selectedMemberIds.map(String),
      planLockedMemberIds: planLockedMemberIds.map(String),
      effectiveAt: spec.effectiveAt ?? now,
      appliedAt: now,
      status: "APPLIED",
    },
    update: {
      targetPlanKey: spec.targetPlanKey,
      selectedProjectId: spec.selectedProjectId,
      planLockedProjectIds: planLockIds.map(String),
      selectedMemberIds: selectedMemberIds.map(String),
      planLockedMemberIds: planLockedMemberIds.map(String),
      effectiveAt: spec.effectiveAt ?? now,
      appliedAt: now,
      status: "APPLIED",
    },
  })

  await client.auditLog.create({
    data: {
      workspaceId: spec.workspaceId,
      userId: spec.actorId,
      action: "Transición de plan aplicada",
      entityId: `plan-transition:${transitionId}`,
      detail: JSON.stringify({
        targetPlanKey: spec.targetPlanKey,
        keptProjectId: spec.selectedProjectId,
        planLockedProjectIds: planLockIds,
        selectedMemberIds,
        planLockedMemberIds,
        graceEndsAt: graceEndsAt?.toISOString() ?? null,
      }),
      timestamp: now,
    },
  })

  return {
    transitionId,
    status: "APPLIED",
    effectiveAt: spec.effectiveAt ?? now,
    appliedAt: now,
    targetPlanKey: spec.targetPlanKey,
    keptProjectId: spec.selectedProjectId,
    planLockedProjectIds: planLockIds,
    selectedMemberIds,
    planLockedMemberIds,
  }
}

/** Swap the single active project during the grace window (§4). Atomic: never two active. */
export async function swapActiveProject(
  client: Prisma.TransactionClient,
  args: { workspaceId: number; actorId: number; keepProjectId: number },
  opts: { now?: Date } = {},
): Promise<{ keptProjectId: number; lockedProjectIds: number[]; graceEndsAt: Date | null }> {
  const now = opts.now ?? new Date()
  const { workspace, counts, projects } = await lockWorkspaceForEntitlement(client, args.workspaceId)

  const resolution = resolveEntitlement({ billingStatus: workspace.billingStatus, planKey: workspace.planKey, stripePriceId: workspace.stripePriceId, trialEndsAt: workspace.trialEndsAt })
  if (resolution.maxActiveProjects === 0) {
    throw Object.assign(new Error("El workspace no tiene un plan con capacidad de proyectos."), { status: 409, code: "NO_PLAN_CAPACITY" })
  }

  if (workspace.graceEndsAt && now > workspace.graceEndsAt) {
    throw Object.assign(new Error("La ventana de gracia para seleccionar el proyecto activo ha finalizado."), { status: 409, code: "GRACE_PERIOD_EXPIRED" })
  }

  const target = projects.find((p) => p.id === args.keepProjectId)
  if (!target || target.status !== "ARCHIVED" || !isPlanLocked(target)) {
    throw Object.assign(new Error("El proyecto elegido debe ser un proyecto bloqueado por límite de plan."), { status: 409, code: "INVALID_PROJECT_SELECTION" })
  }

  const currentlyActive = projects.filter((p) => p.status === "ACTIVE")
  const nowDate = now
  const lockedIds: number[] = []
  for (const project of currentlyActive) {
    lockedIds.push(project.id)
    await client.project.update({ where: { id: project.id }, data: { status: "ARCHIVED", archivedByPlan: true, planLockedAt: nowDate } })
  }
  await client.project.update({
    where: { id: args.keepProjectId },
    data: { status: "ACTIVE", archivedByPlan: false, planLockedAt: null },
  })

  await client.auditLog.create({
    data: {
      workspaceId: args.workspaceId,
      userId: args.actorId,
      action: "Proyecto activo intercambiado (gracia)",
      entityId: `project:${args.keepProjectId}`,
      detail: JSON.stringify({ keptProjectId: args.keepProjectId, lockedProjectIds: lockedIds, previouslyActive: counts.activeProjects }),
      timestamp: now,
    },
  })

  return { keptProjectId: args.keepProjectId, lockedProjectIds: lockedIds, graceEndsAt: workspace.graceEndsAt }
}

/** Restore a project (manual archive or plan-locked) only while capacity allows. */
export async function restoreProjectTransactional(
  client: Prisma.TransactionClient,
  args: { workspaceId: number; actorId: number; projectId: number },
  opts: { now?: Date } = {},
): Promise<{ projectId: number }> {
  const now = opts.now ?? new Date()
  const { workspace, counts } = await lockWorkspaceForEntitlement(client, args.workspaceId)

  const resolution = resolveEntitlement({ billingStatus: workspace.billingStatus, planKey: workspace.planKey, stripePriceId: workspace.stripePriceId, trialEndsAt: workspace.trialEndsAt })
  if (resolution.maxActiveProjects === 0) {
    throw Object.assign(new Error("El workspace no tiene un plan con capacidad de proyectos."), { status: 409, code: "NO_PLAN_CAPACITY" })
  }

  const project = await client.project.findUnique({ where: { id: args.projectId }, select: { id: true, status: true, archivedByPlan: true, planLockedAt: true } })
  if (!project || project.status !== "ARCHIVED") {
    throw Object.assign(new Error("El proyecto no está archivado."), { status: 409, code: "PROJECT_NOT_ARCHIVED" })
  }

  // Plan-locked projects can only be restored when the plan allows (Starter → Pro).
  if (isPlanLocked(project) && resolution.planKey === "STARTER") {
    throw Object.assign(new Error("Este proyecto está bloqueado por el límite del plan Starter. Actualiza a Pro para restaurarlo."), { status: 409, code: "PLAN_LOCKED_PROJECT" })
  }

  if (counts.activeProjects >= resolution.maxActiveProjects) {
    throw Object.assign(new Error("Has alcanzado el límite de proyectos activos para tu plan."), { status: 409, code: "PROJECT_LIMIT_EXCEEDED" })
  }

  await client.project.update({
    where: { id: args.projectId },
    data: { status: "ACTIVE", archivedByPlan: false, planLockedAt: null },
  })

  await client.auditLog.create({
    data: {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      userId: args.actorId,
      action: "Reactivación",
      entityId: `project:${args.projectId}`,
      detail: "Proyecto reactivado",
      timestamp: now,
    },
  })

  return { projectId: args.projectId }
}

/**
 * Reactivate a PLAN_LOCKED member only while a seat is available (§4, §7).
 * SUSPENDED members are never reactivated here: that is an explicit
 * administrative action, kept distinct so an upgrade cannot silently restore
 * a manually suspended member.
 */
export async function reactivateMemberTransactional(
  client: Prisma.TransactionClient,
  args: { workspaceId: number; actorId: number; memberId: number },
  opts: { now?: Date } = {},
): Promise<{ memberId: number; status: WorkspaceMemberStatus }> {
  const now = opts.now ?? new Date()
  const { workspace, counts } = await lockWorkspaceForEntitlement(client, args.workspaceId)

  const member = await client.workspaceMember.findFirst({ where: { id: args.memberId, workspaceId: args.workspaceId }, select: { id: true, userId: true, status: true } })
  if (!member) throw Object.assign(new Error("El usuario no pertenece a este workspace."), { status: 404, code: "WORKSPACE_ACCESS_DENIED" })
  if (member.status !== "PLAN_LOCKED") {
    throw Object.assign(new Error("Este miembro no está bloqueado por límite de plan."), { status: 409, code: "MEMBER_PLAN_LOCKED" })
  }

  const resolution = resolveEntitlement({ billingStatus: workspace.billingStatus, planKey: workspace.planKey, stripePriceId: workspace.stripePriceId, trialEndsAt: workspace.trialEndsAt })
  assertMemberSeatAvailable(resolution.maxActiveMembers, counts.activeMembers)

  const updated = await client.workspaceMember.update({ where: { id: member.id }, data: { status: "ACTIVE" } })

  await client.auditLog.create({
    data: {
      workspaceId: args.workspaceId,
      userId: args.actorId,
      action: "Miembro reactivado (plaza disponible)",
      entityId: `workspace-member:${member.id}`,
      detail: JSON.stringify({ targetUserId: member.userId, from: "PLAN_LOCKED" }),
      timestamp: now,
    },
  })

  return { memberId: member.id, status: updated.status }
}

export async function fetchWorkspaceEntitlement(workspaceId: number): Promise<ComplianceSnapshot> {
  return fetchWorkspaceCompliance(workspaceId)
}

/** Read-only compliance snapshot (no lock) for status surfaces and write gates. */
export async function fetchWorkspaceCompliance(workspaceId: number): Promise<ComplianceSnapshot> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) throw Object.assign(new Error("Workspace not found"), { status: 404 })
  const [projects, members] = await Promise.all([
    prisma.project.findMany({ where: { workspaceId }, select: { status: true, archivedByPlan: true, planLockedAt: true } }),
    prisma.workspaceMember.findMany({ where: { workspaceId }, select: { status: true } }),
  ])
  const counts: WorkspaceCounts = {
    ...countProjects(projects as ActiveProjectInput[]),
    ...countMembers(members),
  }
  return computeCompliance(workspace as unknown as WorkspaceEntitlementInput, counts)
}
