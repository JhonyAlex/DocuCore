import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../lib/asyncHandler"
import { authenticatedUserId, requireAuth } from "../lib/auth"
import {
  changeExistingSubscriptionPlan,
  createCustomerPortalSession,
  getBillingProvider,
  handleBillingWebhook,
  reconcileWorkspace,
  CheckoutCoordinator,
} from "../lib/billing"
import { evaluateWorkspaceEntitlement, getUserPrimaryWorkspace } from "../lib/workspaceScope"
import { fetchWorkspaceCompliance } from "../lib/entitlements"
import { getStripePriceIdForPlan, resolveWorkspacePlan } from "../lib/plans"
import { PLAN_CATALOG } from "../../shared/planCatalog"
import prisma from "../lib/prisma"

const router = Router()

const checkoutInputSchema = z.object({
  planKey: z.enum(["STARTER", "PRO"]),
  transitionId: z.string().min(1).max(100),
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

  // Unify write authority (§12): if out of compliance or billing blocked, isEntitledToWrite must be false.
  const isEntitledToWrite = entitlement.isEntitledToWrite && compliance.canWrite && compliance.complianceStatus === "COMPLIANT"
  const entitlementReason = isEntitledToWrite ? null : (compliance.reason ?? entitlement.reason ?? "PLAN_ACTION_REQUIRED")

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
    planLockedProjectsCount: compliance.planLockedProjectsCount,
    graceEndsAt: compliance.graceEndsAt?.toISOString() ?? null,
    projectsCompliant: compliance.projectsCompliant,
    membersCompliant: compliance.membersCompliant,
    complianceStatus: compliance.complianceStatus,
    canDowngradeToStarter: compliance.activeProjectsCount <= PLAN_CATALOG.STARTER.maxActiveProjects && compliance.activeMembersCount <= PLAN_CATALOG.STARTER.maxActiveMembers,
    canInviteMember: compliance.canInviteMember,
    canActivateMember: compliance.canActivateMember,
    trialStartedAt: wsScope.workspace.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: wsScope.workspace.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: entitlement.trialDaysLeft ?? 0,
    isEntitledToWrite,
    entitlementReason,
    hasSubscription: Boolean(wsScope.workspace.stripeSubscriptionId),
    currentPeriodEnd: wsScope.workspace.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: wsScope.workspace.cancelAtPeriodEnd,
    stripeCustomerId: wsScope.workspace.stripeCustomerId,
    stripeSubscriptionId: wsScope.workspace.stripeSubscriptionId,
    stripeScheduleId: wsScope.workspace.stripeScheduleId,
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

  // A MANUAL-license workspace can never use Stripe checkout: reject it before
  // any transition/schema validation so the 409 is stable regardless of body.
  if (wsScope.workspace.billingSource === "MANUAL") {
    return res.status(409).json({ error: "Esta licencia está gestionada manualmente por la plataforma. La contratación mediante Stripe no está disponible para esta cuenta." })
  }

  const parsed = checkoutInputSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos de solicitud inválidos", details: parsed.error.format() })
  }
  const input = parsed.data

  // Workspace owner check
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: wsScope.workspace.id, userId: actorId, status: "ACTIVE" },
  })
  if (!member || member.role !== "OWNER") {
    return res.status(403).json({ error: "Solo los propietarios del espacio pueden gestionar la facturación." })
  }

  // Load the persisted canonical PlanTransition from DB (§3)
  const transitionRecord = await prisma.planTransition.findUnique({
    where: { id: input.transitionId },
  })
  if (
    !transitionRecord ||
    transitionRecord.workspaceId !== wsScope.workspace.id ||
    transitionRecord.status !== "PENDING" ||
    transitionRecord.targetPlanKey !== input.planKey
  ) {
    return res.status(409).json({
      error: "La transición de plan indicada no es válida para esta cuenta.",
      code: "INVALID_TRANSITION",
    })
  }

  // Case B (§1): Workspace HAS an existing active Stripe subscription.
  // Plan upgrades/downgrades modify the subscription directly or schedule a change.
  if (wsScope.workspace.stripeSubscriptionId && wsScope.workspace.billingSource === "STRIPE") {
    const result = await changeExistingSubscriptionPlan({
      workspaceId: wsScope.workspace.id,
      actorId,
      targetPlanKey: input.planKey,
      transitionId: input.transitionId,
    })
    if (result.code !== "SUBSCRIPTION_TERMINATED") {
      return res.json({
        nextAction: "REFRESH_BILLING",
        checkoutUrl: null,
        success: result.success,
        planKey: result.planKey,
        effectiveAt: result.effectiveAt?.toISOString() ?? null,
        message: result.message,
        status: result.status,
        stripeScheduleId: result.stripeScheduleId ?? null,
      })
    }
    // B1: la suscripción anterior está en estado final y el vínculo obsoleto se
    // liberó de forma auditable; continuar con el flujo de contratación inicial.
  }

  // Case A (§1): Workspace does NOT have an active subscription (initial purchase).
  // Downgrade protection: a STARTER selection with several active projects or
  // members must come with a persisted transition; uses exclusively persisted selections (§4).
  if (input.planKey === "STARTER") {
    const [activeProjectsCount, activeMembersCount] = await Promise.all([
      prisma.project.count({ where: { workspaceId: wsScope.workspace.id, status: "ACTIVE" } }),
      prisma.workspaceMember.count({ where: { workspaceId: wsScope.workspace.id, status: "ACTIVE" } }),
    ])
    if (activeProjectsCount > PLAN_CATALOG.STARTER.maxActiveProjects && !transitionRecord.selectedProjectId) {
      return res.status(409).json({
        error: "Para cambiar al plan Starter debes seleccionar qué proyecto conservar (transición de plan).",
        code: "DOWNGRADE_PROJECT_LIMIT_EXCEEDED",
        activeProjectsCount,
        maxAllowed: PLAN_CATALOG.STARTER.maxActiveProjects,
      })
    }
    if (activeMembersCount > PLAN_CATALOG.STARTER.maxActiveMembers && !transitionRecord.selectedMemberIds.length) {
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

  const coordinator = new CheckoutCoordinator(getBillingProvider(), prisma)
  const result = await coordinator.executeCheckout({
    workspaceId: wsScope.workspace.id,
    actorId,
    planKey: input.planKey,
    transitionId: input.transitionId,
    customerEmail: user.email,
    customerName: user.name,
    customerId: wsScope.workspace.stripeCustomerId,
    stripeCustomerId: wsScope.workspace.stripeCustomerId,
    priceId: priceId ?? undefined,
    projectLimit,
    baseUrl,
    trialEndTimestamp,
  })

  return res.json(result)
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
  const result = await reconcileWorkspace(wsScope.workspace.id, actorId)
  res.json(result)
}))

export default router
