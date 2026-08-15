import type { BillingStatus } from "@prisma/client"

export interface CheckoutSessionParams {
  workspaceId: number
  customerEmail: string
  customerName?: string
  successUrl: string
  cancelUrl: string
  priceId?: string
  trialEndTimestamp?: number | null
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
  currentPeriodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePriceId?: string | null
}

export interface BillingProvider {
  createCheckoutSession(params: CheckoutSessionParams): Promise<{ checkoutUrl: string; sessionId: string }>
  createCustomerPortalSession(params: CustomerPortalParams): Promise<{ portalUrl: string }>
  handleWebhook(rawBody: Buffer | string, signature?: string): Promise<WebhookEventResult>
  reconcileWorkspace(workspaceId: number): Promise<ReconcileResult>
}
