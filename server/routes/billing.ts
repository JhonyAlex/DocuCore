import { Router } from "express"
import { asyncHandler } from "../lib/asyncHandler"
import { authenticatedUserId, requireAuth } from "../lib/auth"
import {
  createCheckoutSession,
  createCustomerPortalSession,
  handleBillingWebhook,
  reconcileWorkspace,
} from "../lib/billing"
import { evaluateWorkspaceEntitlement, getUserPrimaryWorkspace } from "../lib/workspaceScope"
import prisma from "../lib/prisma"

const router = Router()

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

  res.json({
    workspaceId: wsScope.workspace.id,
    name: wsScope.workspace.name,
    slug: wsScope.workspace.slug,
    billingStatus: wsScope.workspace.billingStatus,
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

  const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId } })
  const baseUrl = (process.env.APP_PUBLIC_URL || "https://report-map.online").replace(/\/+$/, "")

  // Preserve remaining trial period if still active
  let trialEndTimestamp: number | null = null
  if (wsScope.workspace.billingStatus === "TRIAL" && wsScope.workspace.trialEndsAt) {
    const trialEndMs = wsScope.workspace.trialEndsAt.getTime()
    if (trialEndMs > Date.now()) {
      trialEndTimestamp = Math.floor(trialEndMs / 1000)
    }
  }

  const session = await createCheckoutSession({
    workspaceId: wsScope.workspace.id,
    customerEmail: user.email,
    customerName: user.name,
    successUrl: `${baseUrl}/account?checkout=success`,
    cancelUrl: `${baseUrl}/account?checkout=cancel`,
    trialEndTimestamp,
  })

  res.json({ checkoutUrl: session.checkoutUrl })
}))

router.post("/portal", asyncHandler(async (req, res) => {
  const actorId = authenticatedUserId(req)
  const wsScope = await getUserPrimaryWorkspace(actorId)
  if (wsScope.membership.role !== "OWNER" && wsScope.membership.role !== "ADMIN") {
    return res.status(403).json({ error: "Solo los administradores o propietarios de la cuenta pueden gestionar facturación." })
  }

  if (!wsScope.workspace.stripeCustomerId) {
    return res.status(400).json({ error: "La cuenta todavía no dispone de cliente de facturación registrado." })
  }

  const baseUrl = (process.env.APP_PUBLIC_URL || "https://report-map.online").replace(/\/+$/, "")
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
  const result = await reconcileWorkspace(wsScope.workspace.id)
  res.json(result)
}))

export default router
