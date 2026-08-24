import type { BillingSource, BillingStatus } from "@prisma/client"
import type { PlanKey } from "../entitlements"

export interface InitialCheckoutParams {
  workspaceId: number
  customerEmail: string
  customerName?: string
  customerId?: string | null
  stripeCustomerId?: string | null
  successUrl: string
  cancelUrl: string
  priceId?: string
  planKey?: "STARTER" | "PRO"
  projectLimit?: number
  trialEndTimestamp?: number | null
  /** Persisted PlanTransition id that makes every billing operation idempotent. */
  transitionId: string
}

export type CheckoutSessionParams = InitialCheckoutParams

export interface ChangeSubscriptionPlanParams {
  workspaceId: number
  targetPlanKey: "STARTER" | "PRO"
  targetPriceId?: string
  transitionId: string
  /** Actor performing the operation; used for audit entries when the provider mutates local state. */
  actorId?: number
}

export interface ChangePlanResult {
  success: boolean
  planKey: PlanKey
  effectiveAt: Date | null
  status: string
  stripeSubscriptionId: string
  stripeCustomerId?: string | null
  stripeScheduleId?: string | null
  message?: string
  /** Machine-readable outcome code (e.g. SUBSCRIPTION_TERMINATED). */
  code?: string
}

export interface CustomerPortalParams {
  workspaceId: number
  customerId: string
  returnUrl: string
}

export interface WebhookEventResult {
  handled: boolean
  eventType: string
  eventId?: string
  workspaceId?: number
  message?: string
}

export interface ReconcileResult {
  workspaceId: number
  billingStatus: BillingStatus
  billingSource?: BillingSource
  planKey?: string | null
  currentPeriodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePriceId?: string | null
  stripeScheduleId?: string | null
}

export interface RetrievedCheckoutSession {
  id: string
  url: string | null
  status: "open" | "complete" | "expired" | string | null
  metadata?: Record<string, string>
  expiresAt?: number | null
}

export interface BillingProvider {
  createInitialSubscriptionCheckout(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }>
  createCheckoutSession(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }>
  retrieveCheckoutSession(sessionId: string): Promise<RetrievedCheckoutSession>
  changeExistingSubscriptionPlan(params: ChangeSubscriptionPlanParams): Promise<ChangePlanResult>
  createCustomerPortalSession(params: CustomerPortalParams): Promise<{ portalUrl: string }>
  handleWebhook(rawBody: Buffer | string, signature?: string): Promise<WebhookEventResult>
  reconcileWorkspace(workspaceId: number, actorId?: number): Promise<ReconcileResult>
}
