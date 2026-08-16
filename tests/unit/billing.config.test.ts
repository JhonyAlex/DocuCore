import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { getBillingProvider, setBillingProvider, validateBillingConfiguration } from "../../server/lib/billing"

describe("Billing Fail-Closed Policy", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    setBillingProvider(null)
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    setBillingProvider(null)
    process.env = { ...originalEnv }
  })

  it("blocks FakeBillingProvider in production", () => {
    process.env.NODE_ENV = "production"
    process.env.BILLING_PROVIDER = "fake"

    const validation = validateBillingConfiguration()
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain("strictly forbidden in production")

    expect(() => getBillingProvider()).toThrow(/strictly forbidden in production/)
  })

  it("fails closed when Stripe configuration is incomplete", () => {
    process.env.NODE_ENV = "production"
    process.env.BILLING_PROVIDER = "stripe"
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_PRICE_STARTER
    delete process.env.STRIPE_PRICE_PRO

    const validation = validateBillingConfiguration()
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain("STRIPE_SECRET_KEY")
    expect(validation.error).toContain("STRIPE_WEBHOOK_SECRET")
    expect(validation.error).toContain("STRIPE_PRICE_STARTER")
    expect(validation.error).toContain("STRIPE_PRICE_PRO")

    expect(() => getBillingProvider()).toThrow(/Incomplete Stripe configuration/)
  })

  it("permits StripeBillingProvider when all required keys are present", () => {
    process.env.NODE_ENV = "production"
    process.env.BILLING_PROVIDER = "stripe"
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_key_12345"
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock_webhook_secret_12345"
    process.env.STRIPE_PRICE_STARTER = "price_starter_mock_12345"
    process.env.STRIPE_PRICE_PRO = "price_pro_mock_12345"

    const validation = validateBillingConfiguration()
    expect(validation.valid).toBe(true)

    const provider = getBillingProvider()
    expect(provider).toBeDefined()
  })

  it("allows FakeBillingProvider in development or test environments", () => {
    process.env.NODE_ENV = "test"
    process.env.BILLING_PROVIDER = "fake"

    const validation = validateBillingConfiguration()
    expect(validation.valid).toBe(true)

    const provider = getBillingProvider()
    expect(provider).toBeDefined()
  })
})
