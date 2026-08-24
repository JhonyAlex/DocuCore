import type { PlanKey } from "../../shared/planCatalog"
import { resolveEntitlement, type PlanResolution } from "./entitlements"

export type { PlanKey }

/**
 * Stripe-only mapping: turns a plan key into its configured price id. This is a
 * server environment concern and lives here rather than in the shared catalog,
 * which carries no Stripe identifiers.
 */
export function getStripePriceIdForPlan(planKey: PlanKey): string | null {
  if (planKey === "STARTER") {
    return process.env.STRIPE_PRICE_STARTER || (process.env.BILLING_PROVIDER === "fake" || process.env.NODE_ENV === "test" ? "fake_price_starter" : null)
  }
  if (planKey === "PRO") {
    return process.env.STRIPE_PRICE_PRO || (process.env.BILLING_PROVIDER === "fake" || process.env.NODE_ENV === "test" ? "fake_price_pro" : null)
  }
  return null
}

/**
 * The single, canonical plan resolution is `resolveEntitlement` in
 * entitlements.ts. This alias exists only so older display call sites can keep
 * their name without maintaining a second resolver.
 */
export const resolveWorkspacePlan = resolveEntitlement
export type WorkspacePlanInfo = PlanResolution
