import { FakeBillingProvider } from "./fakeProvider"
import { StripeBillingProvider } from "./stripeProvider"
import type {
  BillingProvider,
  ChangePlanResult,
  ChangeSubscriptionPlanParams,
  CheckoutSessionParams,
  CustomerPortalParams,
  InitialCheckoutParams,
  ReconcileResult,
  WebhookEventResult,
} from "./types"

export * from "./types"
export { FakeBillingProvider } from "./fakeProvider"
export { StripeBillingProvider } from "./stripeProvider"

let billingProviderInstance: BillingProvider | null = null

export function validateBillingConfiguration(): { valid: boolean; error?: string } {
  const isProduction = process.env.NODE_ENV === "production"
  const providerType = process.env.BILLING_PROVIDER || (isProduction ? "stripe" : "fake")

  if (isProduction && providerType === "fake") {
    return { valid: false, error: "FakeBillingProvider is strictly forbidden in production environment." }
  }

  if (providerType === "stripe") {
    const missing: string[] = []
    if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY")
    if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET")
    if (!process.env.STRIPE_PRICE_STARTER) missing.push("STRIPE_PRICE_STARTER")
    if (!process.env.STRIPE_PRICE_PRO) missing.push("STRIPE_PRICE_PRO")

    if (missing.length > 0) {
      return {
        valid: false,
        error: `Incomplete Stripe configuration. Missing required variables: ${missing.join(", ")}`,
      }
    }
  }

  return { valid: true }
}

export function getBillingProvider(): BillingProvider {
  if (billingProviderInstance) return billingProviderInstance

  const isProduction = process.env.NODE_ENV === "production"
  const providerType = process.env.BILLING_PROVIDER || (isProduction ? "stripe" : "fake")

  const validation = validateBillingConfiguration()
  if (!validation.valid) {
    throw new Error(`[Billing Config Error] ${validation.error}`)
  }

  if (providerType === "stripe") {
    billingProviderInstance = new StripeBillingProvider(
      process.env.STRIPE_SECRET_KEY!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } else if (providerType === "fake" && !isProduction) {
    billingProviderInstance = new FakeBillingProvider()
  } else {
    throw new Error(`[Billing Config Error] Invalid billing provider: "${providerType}"`)
  }

  return billingProviderInstance
}

export function setBillingProvider(provider: BillingProvider | null): void {
  billingProviderInstance = provider
}

export async function createInitialSubscriptionCheckout(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
  return getBillingProvider().createInitialSubscriptionCheckout(params)
}

export async function createCheckoutSession(params: CheckoutSessionParams): Promise<{ checkoutUrl: string; sessionId: string }> {
  return getBillingProvider().createCheckoutSession(params)
}

export async function changeExistingSubscriptionPlan(params: ChangeSubscriptionPlanParams): Promise<ChangePlanResult> {
  return getBillingProvider().changeExistingSubscriptionPlan(params)
}

export async function createCustomerPortalSession(params: CustomerPortalParams): Promise<{ portalUrl: string }> {
  return getBillingProvider().createCustomerPortalSession(params)
}

export async function handleBillingWebhook(rawBody: Buffer | string, signature?: string): Promise<WebhookEventResult> {
  return getBillingProvider().handleWebhook(rawBody, signature)
}

export async function reconcileWorkspace(workspaceId: number): Promise<ReconcileResult> {
  return getBillingProvider().reconcileWorkspace(workspaceId)
}
