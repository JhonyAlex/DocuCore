import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../lib/asyncHandler"
import { authenticatedUserId, requireAuth } from "../lib/auth"
import {
  createCheckoutSession,
  createCustomerPortalSession,
  handleBillingWebhook,
  reconcileWorkspace,
} from "../lib/billing"
import { evaluateWorkspaceEntitlement, getUserPrimaryWorkspace } from "../lib/workspaceScope"
import { fetchWorkspaceCompliance } from "../lib/entitlements"
import { getStripePriceIdForPlan, resolveWorkspacePlan } from "../lib/plans"
import { PLAN_CATALOG } from "../../shared/planCatalog"
import prisma from "../lib/prisma"

const router = Router()

const checkoutInputSchema = z.object({
  planKey: z.enum(["STARTER", "PRO"]),
  transitionId: z.string().min(1).max(100).optional(),
  selectedProjectId: z.number().int().positive().optional(),
  selectedMemberIds: z.array(z.number().int().positive()).max(15).optional(),
}).strict()

// Webhook endpoint needs raw body for signature verification
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const signature = req.headers["stripe-signature"] as string | undefined
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? req.body
    const result = await handleBillingWebhook(rawBody, signature)
    res.json({ received: true, handled: result.handled, eventType: result.eventType })
  }),
)

router.use(requireAuth)

router.get("/status", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  const entitlement = evaluateWorkspaceEntitlement(wsScope.workspace)
  const planInfo = resolveWorkspacePlan(wsScope.workspace)
  const compliance = await fetchWorkspaceCompliance(wsScope.workspace.id)

  const [archivedProjectsCount] = await Promise.all([
    prisma.project.count({ where: { workspaceId: wsScope.workspace.id, status: "ARCHIVED" } }),
  ])

  res.json({
    workspaceId: wsScope.workspace.id,
    name: wsScope.workspace.name,
    slug: wsScope.workspace.slug,
    billingStatus: wsScope.workspace.billingStatus,
    billingSource: wsScope.workspace.billingSource,
    planKey: planInfo.planKey,
    planName: planInfo.planName,
    maxActiveProjects: planInfo.maxActiveProjects,
    activeProjectsCount: compliance.activeProjectsCount,
    archivedProjectsCount,
    maxActiveMembers: planInfo.maxActiveMembers,
    activeMembersCount: compliance.activeMembersCount,
    planLockedMembersCount: compliance.planLockedMembersCount,
    suspendedMembersCount: compliance.suspendedMembersCount,
    remainingMemberSeats: compliance.remainingMemberSeats,
    projectsCompliant: compliance.projectsCompliant,
    membersCompliant: compliance.membersCompliant,
    complianceStatus: compliance.complianceStatus,
    canDowngradeToStarter: compliance.activeProjectsCount <= PLAN_CATALOG.STARTER.maxActiveProjects && compliance.activeMembersCount <= PLAN_CATALOG.STARTER.maxActiveMembers,
    canInviteMember: compliance.canInviteMember,
    canActivateMember: compliance.canActivateMember,
    trialStartedAt: wsScope.workspace.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: wsScope.workspace.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: entitlement.trialDaysLeft ?? 0,
    isEntitledToWrite: entitlement.isEntitledToWrite,
    entitlementReason: entitlement.reason ?? null,
    hasSubscription: Boolean(wsScope.workspace.stripeSubscriptionId),
    currentPeriodEnd: wsScope.workspace.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: wsScope.workspace.cancelAtPeriodEnd,
    stripeCustomerId: wsScope.workspace.stripeCustomerId,
    stripeSubscriptionId: wsScope.workspace.stripeSubscriptionId,
    role: wsScope.membership.role,
    isOwner: wsScope.membership.role === "OWNER",
  })
}))

router.post("/checkout", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden gestionar suscripciones." })
  }

  const input = checkoutInputSchema.parse(req.body)

  // A transition id must belong to this workspace, still be PENDING, and match
  // the plan being checked out (never apply a transition under the wrong plan).
  if (input.transitionId) {
    const transition = await prisma.planTransition.findUnique({ where: { id: input.transitionId } })
    if (!transition || transition.workspaceId !== wsScope.workspace.id || transition.status !== "PENDING" || transition.targetPlanKey !== input.planKey) {
      return res.status(409).json({ error: "La transición de plan indicada no es válida para esta cuenta.", code: "INVALID_TRANSITION" })
    }
  }

  if (wsScope.workspace.billingSource === "MANUAL") {
    return res.status(409).json({ error: "Esta licencia está gestionada manualmente por la plataforma. La contratación mediante Stripe no está disponible para esta cuenta." })
  }

  // Downgrade protection: a STARTER selection with several active projects or
  // members must come with a persisted transition (the wizard stores it and its
  // selections); otherwise the workspace must already be within the limits.
  if (input.planKey === "STARTER") {
    const [activeProjectsCount, activeMembersCount] = await Promise.all([
      prisma.project.count({ where: { workspaceId: wsScope.workspace.id, status: "ACTIVE" } }),
      prisma.workspaceMember.count({ where: { workspaceId: wsScope.workspace.id, status: "ACTIVE" } }),
    ])
    if (activeProjectsCount > PLAN_CATALOG.STARTER.maxActiveProjects && !(input.transitionId && input.selectedProjectId)) {
      return res.status(409).json({
        error: "Para cambiar al plan Starter debes seleccionar qué proyecto conservar (transición de plan).",
        code: "DOWNGRADE_PROJECT_LIMIT_EXCEEDED",
        activeProjectsCount,
        maxAllowed: PLAN_CATALOG.STARTER.maxActiveProjects,
      })
    }
    if (activeMembersCount > PLAN_CATALOG.STARTER.maxActiveMembers && !(input.transitionId && input.selectedMemberIds?.length)) {
      return res.status(409).json({
        error: "Para cambiar al plan Starter debes seleccionar qué usuarios conservarán acceso (transición de plan).",
        code: "DOWNGRADE_MEMBER_LIMIT_EXCEEDED",
        activeMembersCount,
        maxAllowed: PLAN_CATALOG.STARTER.maxActiveMembers,
      })
    }
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId } })
  const baseUrl = (process.env.APP_PUBLIC_URL || "https://app.report-map.online").replace(/\/+$/, "")

  // Preserve remaining trial period if still active
  let trialEndTimestamp: number | null = null
  if (wsScope.workspace.billingStatus === "TRIAL" && wsScope.workspace.trialEndsAt) {
    const trialEndMs = wsScope.workspace.trialEndsAt.getTime()
    if (trialEndMs > Date.now()) {
      trialEndTimestamp = Math.floor(trialEndMs / 1000)
    }
  }

  const priceId = getStripePriceIdForPlan(input.planKey)
  const projectLimit = input.planKey === "STARTER" ? PLAN_CATALOG.STARTER.maxActiveProjects : PLAN_CATALOG.PRO.maxActiveProjects

  const session = await createCheckoutSession({
    workspaceId: wsScope.workspace.id,
    customerEmail: user.email,
    customerName: user.name,
    planKey: input.planKey,
    priceId: priceId ?? undefined,
    projectLimit,
    successUrl: `${baseUrl}/account?checkout=success`,
    cancelUrl: `${baseUrl}/account?checkout=cancel`,
    trialEndTimestamp,
    transitionId: input.transitionId,
    selectedProjectId: input.selectedProjectId,
    selectedMemberIds: input.selectedMemberIds,
  })

  res.json({ checkoutUrl: session.checkoutUrl })
}))

router.post("/portal", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden gestionar facturación." })
  }

  if (wsScope.workspace.billingSource === "MANUAL") {
    return res.status(409).json({ error: "Esta licencia está gestionada manualmente por la plataforma. La facturación de Stripe no está disponible para esta cuenta." })
  }

  if (!wsScope.workspace.stripeCustomerId) {
    return res.status(400).json({ error: "La cuenta todavía no dispone de cliente de facturación registrado." })
  }

  const baseUrl = (process.env.APP_PUBLIC_URL || "https://app.report-map.online").replace(/\/+$/, "")
  const session = await createCustomerPortalSession({
    workspaceId: wsScope.workspace.id,
    customerId: wsScope.workspace.stripeCustomerId,
    returnUrl: `${baseUrl}/account`,
  })

  res.json({ portalUrl: session.portalUrl })
}))

router.post("/reconcile", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden reconciliar la facturación.", code: "WORKSPACE_ACCESS_DENIED" })
  }
  const result = await reconcileWorkspace(wsScope.workspace.id)
  res.json(result)
}))

export default router
