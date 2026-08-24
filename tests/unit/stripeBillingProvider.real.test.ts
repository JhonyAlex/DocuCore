import { describe, expect, it, vi, beforeEach } from "vitest"
import Stripe from "stripe"
import prisma from "../../server/lib/prisma"
import { StripeBillingProvider, mapStripeSubscriptionStatusToBillingStatus, isSubscriptionEligibleForPlanTransition } from "../../server/lib/billing/stripeProvider"

describe("StripeBillingProvider Real Unit Tests", () => {
  let provider: StripeBillingProvider
  let mockStripe: {
    checkout: { sessions: { create: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> } }
    billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } }
    subscriptions: { retrieve: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    subscriptionSchedules: {
      retrieve: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      release: ReturnType<typeof vi.fn>
    }
    webhooks: {
      constructEvent: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    process.env.STRIPE_PRICE_STARTER = "price_starter_test"
    process.env.STRIPE_PRICE_PRO = "price_pro_test"

    provider = new StripeBillingProvider("sk_test_mock_key", "whsec_mock_key")
    mockStripe = {
      checkout: {
        sessions: {
          create: vi.fn(),
          retrieve: vi.fn(),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(),
        },
      },
      subscriptions: {
        retrieve: vi.fn(),
        update: vi.fn(),
      },
      subscriptionSchedules: {
        retrieve: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        release: vi.fn(),
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    }
    // Inject mock stripe client into provider instance
    ;(provider as unknown as { stripe: typeof mockStripe }).stripe = mockStripe
  })

  describe("Finding E: Stripe Customer reuse on initial checkout", () => {
    it("reuses existing customerId and omits customer_email when customerId is provided", async () => {
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: "cs_test_123",
        url: "https://checkout.stripe.test/cs_test_123",
      })

      const res = await provider.createInitialSubscriptionCheckout({
        workspaceId: 101,
        customerId: "cus_existing_999",
        customerEmail: "owner@docucore.test",
        customerName: "Owner Corp",
        planKey: "PRO",
        projectLimit: 15,
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
        transitionId: "pct_init_1",
      })

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
      const callArgs = mockStripe.checkout.sessions.create.mock.calls[0]
      const params = callArgs[0] as Stripe.Checkout.SessionCreateParams
      const options = callArgs[1] as Stripe.RequestOptions

      expect(params.customer).toBe("cus_existing_999")
      expect(params.customer_email).toBeUndefined()
      expect(options.idempotencyKey).toBe("docucore_checkout_pct_init_1")
      expect(res.sessionId).toBe("cs_test_123")
      expect(res.checkoutUrl).toBe("https://checkout.stripe.test/cs_test_123")
    })

    it("passes customer_email when customerId is not present", async () => {
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: "cs_test_456",
        url: "https://checkout.stripe.test/cs_test_456",
      })

      await provider.createInitialSubscriptionCheckout({
        workspaceId: 102,
        customerEmail: "new@docucore.test",
        customerName: "New Corp",
        planKey: "STARTER",
        projectLimit: 1,
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
        transitionId: "pct_init_2",
      })

      const callArgs = mockStripe.checkout.sessions.create.mock.calls[0]
      const params = callArgs[0] as Stripe.Checkout.SessionCreateParams
      expect(params.customer).toBeUndefined()
      expect(params.customer_email).toBe("new@docucore.test")
    })
  })

  describe("Finding A, B & C: Upgrade to Pro with pending_if_incomplete, 3DS, and idempotency", () => {
    it("asserts always_invoice, pending_if_incomplete, idempotencyKey, and blocks entitlement when pending_update is returned", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Test WS ${stamp}`,
          slug: `test-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner",
          email: `owner.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OW",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_upg_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      const starterPrice = "price_starter_test"
      const proPrice = "price_pro_test"

      // Mock subscription retrieval: currently Starter
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: {
          data: [{ id: "si_1", price: { id: starterPrice } }],
        },
      })

      // Mock subscription update: payment requires 3DS or failed -> returns pending_update!
      mockStripe.subscriptions.update.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: {
          data: [{ id: "si_1", price: { id: starterPrice } }], // Still starter
        },
        pending_update: {
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "PRO",
        transitionId: transition.id,
      })

      // Assert parameters sent to Stripe SDK
      expect(mockStripe.subscriptions.update).toHaveBeenCalledTimes(1)
      const updateArgs = mockStripe.subscriptions.update.mock.calls[0]
      const updateParams = updateArgs[1] as Stripe.SubscriptionUpdateParams
      const updateOptions = updateArgs[2] as Stripe.RequestOptions

      expect(updateParams.proration_behavior).toBe("always_invoice")
      expect(updateParams.payment_behavior).toBe("pending_if_incomplete")
      expect(updateParams.items).toEqual([{ id: "si_1", price: proPrice }])
      expect(updateOptions.idempotencyKey).toBe(`docucore_upgrade_${transition.id}`)

      // Result must NOT grant Pro entitlement
      expect(result.success).toBe(false)
      expect(result.planKey).toBe("STARTER")
      expect(result.effectiveAt).toBeNull()

      // Workspace must remain on STARTER
      const refreshedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(refreshedWs.planKey).toBe("STARTER")

      // Transition must remain PENDING
      const refreshedTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(refreshedTransition.status).toBe("PENDING")
    })

    it("grants Pro entitlement when payment succeeds and no pending_update exists", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Test WS ${stamp}`,
          slug: `test-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner 2",
          email: `owner2.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OW",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_upg_clean_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      const starterPrice = "price_starter_test"
      const proPrice = "price_pro_test"

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: {
          data: [{ id: "si_2", price: { id: starterPrice } }],
        },
      })

      mockStripe.subscriptions.update.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: {
          data: [{ id: "si_2", price: { id: proPrice } }],
        },
        pending_update: null,
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "PRO",
        transitionId: transition.id,
      })

      expect(result.success).toBe(true)
      expect(result.planKey).toBe("PRO")
      expect(result.effectiveAt).toBeInstanceOf(Date)

      const refreshedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(refreshedWs.planKey).toBe("PRO")
      expect(refreshedWs.stripePriceId).toBe(proPrice)
    })
  })

  describe("Finding C & D: Subscription Schedule idempotency & retry after partial failure", () => {
    it("creates schedule and updates phases with deterministic idempotency keys for Pro -> Starter downgrade", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Test WS ${stamp}`,
          slug: `test-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner 3",
          email: `owner3.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OW",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_down_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 15

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_3", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: null,
      })

      mockStripe.subscriptionSchedules.create.mockResolvedValue({
        id: `sub_sched_${stamp}`,
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id },
        phases: [{ start_date: periodEnd - 86400 * 15, end_date: periodEnd, items: [{ price: proPrice }] }],
      })

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: `sub_sched_${stamp}`,
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 15, end_date: periodEnd, items: [{ price: proPrice }] },
          { start_date: periodEnd, items: [{ price: starterPrice }] },
        ],
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      expect(mockStripe.subscriptionSchedules.create).toHaveBeenCalledTimes(1)
      const createOpts = mockStripe.subscriptionSchedules.create.mock.calls[0][1] as Stripe.RequestOptions
      expect(createOpts.idempotencyKey).toBe(`docucore_schedule_create_${transition.id}`)

      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledTimes(1)
      const updateArgs = mockStripe.subscriptionSchedules.update.mock.calls[0]
      const updateParams = updateArgs[1] as Stripe.SubscriptionScheduleUpdateParams
      const updateOpts = updateArgs[2] as Stripe.RequestOptions

      expect(updateParams.end_behavior).toBe("release")
      expect(updateParams.phases).toHaveLength(2)
      expect(updateParams.phases?.[1].items?.[0].price).toBe(starterPrice)
      expect(updateOpts.idempotencyKey).toBe(`docucore_schedule_update_${transition.id}`)

      expect(result.success).toBe(true)
      expect(result.planKey).toBe("STARTER")
      expect(result.effectiveAt).toEqual(new Date(periodEnd * 1000))
    })

    it("repairs an incomplete 1-phase schedule on retry without creating a second schedule", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Test WS ${stamp}`,
          slug: `test-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_partial_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner 4",
          email: `owner4.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OW",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_down_retry_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 10

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_4", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_partial_${stamp}`,
      })

      // Schedule exists with only 1 phase (partial failure during previous attempt)
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_partial_${stamp}`,
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id },
        phases: [{ start_date: periodEnd - 86400 * 20, end_date: periodEnd, items: [{ price: proPrice }] }],
      })

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: `sub_sched_partial_${stamp}`,
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 20, end_date: periodEnd, items: [{ price: proPrice }] },
          { start_date: periodEnd, items: [{ price: starterPrice }] },
        ],
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      // Did NOT call create again
      expect(mockStripe.subscriptionSchedules.create).not.toHaveBeenCalled()

      // Called update with the 2-phase configuration
      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.planKey).toBe("STARTER")
      expect(result.effectiveAt).toEqual(new Date(periodEnd * 1000))
    })

    it("returns immediately without updating when schedule is already fully configured", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Test WS ${stamp}`,
          slug: `test-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_done_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner 5",
          email: `owner5.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OW",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_down_done_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 5

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_5", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_done_${stamp}`,
        metadata: {
          workspaceId: String(ws.id),
          scheduledPlanKey: "STARTER",
          stripeScheduleId: `sub_sched_done_${stamp}`,
          transitionId: transition.id,
        },
      })

      // Schedule is already completely configured (2 phases, second is starter with proration_behavior: "none", end_behavior release)
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_done_${stamp}`,
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id, planKey: "STARTER" },
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 25, end_date: periodEnd, items: [{ price: proPrice, quantity: 1 }] },
          {
            start_date: periodEnd,
            items: [{ price: starterPrice, quantity: 1 }],
            proration_behavior: "none",
            metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id, planKey: "STARTER" },
          },
        ],
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      expect(mockStripe.subscriptionSchedules.create).not.toHaveBeenCalled()
      expect(mockStripe.subscriptionSchedules.update).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.planKey).toBe("STARTER")
      expect(result.effectiveAt).toEqual(new Date(periodEnd * 1000))
    })

    it("creates a new schedule when existing schedule is in 'released' status", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Test WS ${stamp}`,
          slug: `test-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_released_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Released",
          email: `owner.rel.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OR",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_down_rel_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 15

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_rel", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_released_${stamp}`,
      })

      // Old schedule is released
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_released_${stamp}`,
        status: "released",
        metadata: { managedBy: "docucore", workspaceId: String(ws.id) },
        phases: [{ start_date: periodEnd - 86400 * 30, end_date: periodEnd, items: [{ price: proPrice }] }],
      })

      mockStripe.subscriptionSchedules.create.mockResolvedValue({
        id: `sub_sched_fresh_${stamp}`,
        status: "active",
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id },
        phases: [{ start_date: periodEnd - 86400 * 15, end_date: periodEnd, items: [{ price: proPrice }] }],
      })

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: `sub_sched_fresh_${stamp}`,
        status: "active",
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 15, end_date: periodEnd, items: [{ price: proPrice }] },
          { start_date: periodEnd, items: [{ price: starterPrice }] },
        ],
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      expect(mockStripe.subscriptionSchedules.create).toHaveBeenCalledTimes(1)
      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.planKey).toBe("STARTER")
    })

    it("repairs subscription schedule when Phase 0 or Phase 1 has incorrect dates or prices", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Incorrect Phase WS ${stamp}`,
          slug: `incorrect-phase-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_inc_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Phase",
          email: `owner.phase.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OP",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_down_phase_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 15

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_inc", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_inc_${stamp}`,
        metadata: {
          scheduledPlanKey: "STARTER",
          stripeScheduleId: `sub_sched_inc_${stamp}`,
          transitionId: transition.id,
        },
      })

      // Schedule exists with 2 phases but Phase 0 has wrong end_date and Phase 1 has wrong price
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_inc_${stamp}`,
        status: "active",
        end_behavior: "release",
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id },
        phases: [
          { start_date: periodEnd - 86400 * 30, end_date: periodEnd - 1000, items: [{ price: proPrice }] }, // wrong end_date
          { start_date: periodEnd - 1000, items: [{ price: "wrong_price" }] }, // wrong price
        ],
      })

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: `sub_sched_inc_${stamp}`,
        status: "active",
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 30, end_date: periodEnd, items: [{ price: proPrice }] },
          { start_date: periodEnd, items: [{ price: starterPrice }] },
        ],
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      // Must call update to repair incorrect phases
      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.planKey).toBe("STARTER")
    })

    it("repairs subscription metadata when schedule is complete but sub metadata is missing or desynchronized", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Missing Meta WS ${stamp}`,
          slug: `missing-meta-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_meta_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Meta",
          email: `owner.meta.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OM",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_down_meta_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 15

      // Subscription metadata is EMPTY (failed in previous partial attempt)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_meta", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_meta_${stamp}`,
        metadata: {},
      })

      // Schedule is already correctly configured
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_meta_${stamp}`,
        status: "active",
        end_behavior: "release",
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id, planKey: "STARTER" },
        phases: [
          { start_date: periodEnd - 86400 * 30, end_date: periodEnd, items: [{ price: proPrice, quantity: 1 }] },
          {
            start_date: periodEnd,
            items: [{ price: starterPrice, quantity: 1 }],
            proration_behavior: "none",
            metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id, planKey: "STARTER" },
          },
        ],
      })

      mockStripe.subscriptions.update.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      // Schedule update is skipped (already configured), but subscription metadata update MUST be called
      expect(mockStripe.subscriptionSchedules.update).not.toHaveBeenCalled()
      expect(mockStripe.subscriptions.update).toHaveBeenCalledTimes(1)
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        `sub_${stamp}`,
        {
          metadata: {
            workspaceId: String(ws.id),
            scheduledPlanKey: "STARTER",
            stripeScheduleId: `sub_sched_meta_${stamp}`,
            transitionId: transition.id,
          },
        },
        {
          idempotencyKey: `docucore_sub_meta_${transition.id}`,
        },
      )
      expect(result.success).toBe(true)
    })
  })

  describe("Finding G: Webhook processing & idempotency", () => {
    it("handles duplicate webhook event gracefully when Prisma throws P2002 unique constraint", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const event: Stripe.Event = {
        id: `evt_duplicate_test_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "customer.subscription.updated",
        data: {
          object: {
            id: `sub_mock_${stamp}`,
            customer: `cus_mock_${stamp}`,
            status: "active",
          } as Stripe.Subscription,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      // Record the event first in the database
      await prisma.processedWebhookEvent.create({
        data: { id: event.id, provider: "stripe" },
      })

      // Retrieve will be called authoritatively
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_mock_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_1", price: { id: "price_starter_test" } }] },
      })

      const result = await provider.handleWebhook(JSON.stringify(event), "fake_sig_123")
      expect(result.handled).toBe(true)
      expect(result.eventId).toBe(event.id)
      expect(result.message).toBe("Duplicate event ignored")
    })

    it("sets PAST_DUE and blocks transition application when checkout subscription is incomplete", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Incomplete WS ${stamp}`,
          slug: `incomplete-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Incomplete",
          email: `owner.inc.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OI",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_inc_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      const event: Stripe.Event = {
        id: `evt_chk_inc_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_inc_${stamp}`,
            client_reference_id: String(ws.id),
            customer: `cus_inc_${stamp}`,
            subscription: `sub_inc_${stamp}`,
            payment_status: "unpaid",
            status: "complete",
            metadata: {
              workspaceId: String(ws.id),
              planKey: "PRO",
              transitionId: transition.id,
            },
          } as unknown as Stripe.Checkout.Session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_inc_${stamp}`,
        status: "incomplete",
        items: { data: [{ id: "si_inc", price: { id: "price_pro_test" } }] },
      })

      const result = await provider.handleWebhook(JSON.stringify(event), "fake_sig_123")
      expect(result.handled).toBe(true)

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("PAST_DUE")
      expect(updatedWs.planKey).toBe("STARTER") // Must NOT promote to PRO

      const updatedTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(updatedTransition.status).toBe("PENDING") // Must NOT apply transition
    })

    it("throws error when subscriptions.retrieve fails during checkout.session.completed (status: complete, payment_status: unpaid) to force retry", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Unpaid Fail WS ${stamp}`,
          slug: `unpaid-fail-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Unpaid Fail",
          email: `owner.unpaid.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OU",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_unpaid_fail_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      const event: Stripe.Event = {
        id: `evt_chk_unpaid_fail_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_unpaid_fail_${stamp}`,
            client_reference_id: String(ws.id),
            customer: `cus_unpaid_fail_${stamp}`,
            subscription: `sub_unpaid_fail_${stamp}`,
            payment_status: "unpaid",
            status: "complete",
            metadata: {
              workspaceId: String(ws.id),
              planKey: "PRO",
              transitionId: transition.id,
            },
          } as unknown as Stripe.Checkout.Session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      // subscriptions.retrieve fails with network timeout
      mockStripe.subscriptions.retrieve.mockRejectedValue(new Error("Stripe network timeout"))

      await expect(provider.handleWebhook(JSON.stringify(event), "fake_sig_123")).rejects.toThrow("Stripe network timeout")

      // Workspace plan must not be promoted
      const currentWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(currentWs.planKey).toBe("STARTER")
    })

    it("throws error when subscriptions.retrieve fails during customer.subscription.updated to force retry", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const event: Stripe.Event = {
        id: `evt_sub_upd_fail_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "customer.subscription.updated",
        data: {
          object: {
            id: `sub_upd_fail_${stamp}`,
            customer: `cus_upd_fail_${stamp}`,
            status: "active",
          } as Stripe.Subscription,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockStripe.subscriptions.retrieve.mockRejectedValue(new Error("Stripe 500 Service Unavailable"))

      await expect(provider.handleWebhook(JSON.stringify(event), "fake_sig_123")).rejects.toThrow("Stripe 500 Service Unavailable")
    })

    it("throws error when subscriptions.retrieve fails during invoice.payment_failed to force retry", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const event: Stripe.Event = {
        id: `evt_inv_fail_err_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "invoice.payment_failed",
        data: {
          object: {
            id: `in_fail_err_${stamp}`,
            customer: `cus_err_${stamp}`,
            subscription: `sub_err_${stamp}`,
          } as unknown as Stripe.Invoice,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockStripe.subscriptions.retrieve.mockRejectedValue(new Error("Stripe connection reset"))

      await expect(provider.handleWebhook(JSON.stringify(event), "fake_sig_123")).rejects.toThrow("Stripe connection reset")
    })

    it("handles customer.subscription.deleted when subscriptions.retrieve returns 404 resource_missing by using deletion object", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Delete 404 WS ${stamp}`,
          slug: `del-404-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_del_404_${stamp}`,
          stripeSubscriptionId: `sub_del_404_${stamp}`,
        },
      })

      const event: Stripe.Event = {
        id: `evt_sub_del_404_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: `sub_del_404_${stamp}`,
            customer: `cus_del_404_${stamp}`,
            status: "canceled",
          } as Stripe.Subscription,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      const err404 = Object.assign(new Error("No such subscription"), { statusCode: 404, code: "resource_missing" })
      mockStripe.subscriptions.retrieve.mockRejectedValue(err404)

      const result = await provider.handleWebhook(JSON.stringify(event), "fake_sig_123")
      expect(result.handled).toBe(true)

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("CANCELED")
    })

    it("ignores out-of-order invoice.payment_failed when authoritative subscription is active", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Active WS ${stamp}`,
          slug: `active-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_active_${stamp}`,
          stripeSubscriptionId: `sub_active_${stamp}`,
        },
      })

      const event: Stripe.Event = {
        id: `evt_inv_fail_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "invoice.payment_failed",
        data: {
          object: {
            id: `in_fail_${stamp}`,
            customer: `cus_active_${stamp}`,
            subscription: `sub_active_${stamp}`,
          } as unknown as Stripe.Invoice,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_active_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_act", price: { id: "price_pro_test" } }] },
      })

      const result = await provider.handleWebhook(JSON.stringify(event), "fake_sig_123")
      expect(result.handled).toBe(true)

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("ACTIVE")
    })

    it("ignores invoice.payment_failed when invoice has no subscription", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `No Sub WS ${stamp}`,
          slug: `nosub-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_nosub_${stamp}`,
          stripeSubscriptionId: `sub_nosub_${stamp}`,
        },
      })

      const event: Stripe.Event = {
        id: `evt_inv_nosub_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "invoice.payment_failed",
        data: {
          object: {
            id: `in_nosub_${stamp}`,
            customer: `cus_nosub_${stamp}`,
            subscription: null,
          } as unknown as Stripe.Invoice,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const result = await provider.handleWebhook(JSON.stringify(event), "fake_sig_123")
      expect(result.handled).toBe(true)

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("ACTIVE") // Ignored, not changed to PAST_DUE
    })

    it("ignores invoice.payment_failed when customer matches but invoice belongs to a different subscription", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Diff Sub WS ${stamp}`,
          slug: `diffsub-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_shared_${stamp}`,
          stripeSubscriptionId: `sub_actual_${stamp}`,
        },
      })

      const event: Stripe.Event = {
        id: `evt_inv_diffsub_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "invoice.payment_failed",
        data: {
          object: {
            id: `in_diffsub_${stamp}`,
            customer: `cus_shared_${stamp}`,
            subscription: `sub_other_${stamp}`, // Different subscription
          } as unknown as Stripe.Invoice,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_other_${stamp}`,
        status: "past_due",
      })

      const result = await provider.handleWebhook(JSON.stringify(event), "fake_sig_123")
      expect(result.handled).toBe(true)

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("ACTIVE") // Must NOT degrade ws with different subscription
    })

    it("checkout.session.completed without recoverable subscription does not set billingStatus to ACTIVE and does not apply transition", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `No Sub Chk WS ${stamp}`,
          slug: `nosubchk-ws-${stamp}`,
          billingStatus: "TRIAL",
          planKey: "STARTER",
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner No Sub",
          email: `ownernosub.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "ON",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_nosub_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      const event: Stripe.Event = {
        id: `evt_chk_nosub_${stamp}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_nosub_${stamp}`,
            client_reference_id: String(ws.id),
            customer: `cus_nosub_${stamp}`,
            subscription: null, // No subscription attached
            status: "complete",
            metadata: {
              workspaceId: String(ws.id),
              planKey: "PRO",
              transitionId: transition.id,
            },
          } as unknown as Stripe.Checkout.Session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const result = await provider.handleWebhook(JSON.stringify(event), "fake_sig_123")
      expect(result.handled).toBe(true)

      const updatedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(updatedWs.billingStatus).toBe("PAST_DUE") // Fail-closed
      expect(updatedWs.planKey).toBe("STARTER") // Not promoted

      const updatedTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(updatedTransition.status).toBe("PENDING") // Not applied
    })
  })

  describe("Requirement 4: Fail-closed Status Mapper", () => {
    it("maps subscription statuses strictly and fails closed on unknown or paused statuses", () => {
      expect(mapStripeSubscriptionStatusToBillingStatus("active", false)).toBe("ACTIVE")
      expect(mapStripeSubscriptionStatusToBillingStatus("active", true)).toBe("TRIAL")
      expect(mapStripeSubscriptionStatusToBillingStatus("trialing", false)).toBe("TRIAL")
      expect(mapStripeSubscriptionStatusToBillingStatus("past_due", false)).toBe("PAST_DUE")
      expect(mapStripeSubscriptionStatusToBillingStatus("incomplete", false)).toBe("PAST_DUE")
      expect(mapStripeSubscriptionStatusToBillingStatus("paused", false)).toBe("PAST_DUE")
      expect(mapStripeSubscriptionStatusToBillingStatus("canceled", false)).toBe("CANCELED")
      expect(mapStripeSubscriptionStatusToBillingStatus("unpaid", false)).toBe("CANCELED")
      expect(mapStripeSubscriptionStatusToBillingStatus("incomplete_expired", false)).toBe("CANCELED")
      // Unknown / null / undefined must fail-closed as PAST_DUE
      expect(mapStripeSubscriptionStatusToBillingStatus("some_unknown_status" as string, false)).toBe("PAST_DUE")
      expect(mapStripeSubscriptionStatusToBillingStatus(undefined, false)).toBe("PAST_DUE")
      expect(mapStripeSubscriptionStatusToBillingStatus(null, false)).toBe("PAST_DUE")
    })
  })

  describe("Requirement 6: Subscription Schedule Exact Phase Validation", () => {
    it("re-configures schedule when proration_behavior in phase 1 is missing or not 'none'", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Sched Pror WS ${stamp}`,
          slug: `sched-pror-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_pror_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Pror",
          email: `owner.pror.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OP",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_pror_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 5

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_pror", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_pror_${stamp}`,
        metadata: {
          workspaceId: String(ws.id),
          scheduledPlanKey: "STARTER",
          stripeScheduleId: `sub_sched_pror_${stamp}`,
          transitionId: transition.id,
        },
      })

      // Phase 1 has missing proration_behavior (defaults to create_prorations)
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_pror_${stamp}`,
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id, planKey: "STARTER" },
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 25, end_date: periodEnd, items: [{ price: proPrice, quantity: 1 }] },
          { start_date: periodEnd, items: [{ price: starterPrice, quantity: 1 }] }, // Missing proration_behavior: "none"
        ],
      })

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: `sub_sched_pror_${stamp}`,
        end_behavior: "release",
        phases: [],
      })

      await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      // Must call update to repair proration_behavior
      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledTimes(1)
      const updateParams = mockStripe.subscriptionSchedules.update.mock.calls[0][1] as Stripe.SubscriptionScheduleUpdateParams
      expect(updateParams.phases?.[1].proration_behavior).toBe("none")
    })

    it("re-configures schedule when extra item exists in phase 1", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Sched ExtraItem WS ${stamp}`,
          slug: `sched-item-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_item_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Item",
          email: `owner.item.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OI",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_item_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 5

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_item", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_item_${stamp}`,
      })

      // Phase 1 has 2 items instead of 1
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_item_${stamp}`,
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id, planKey: "STARTER" },
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 25, end_date: periodEnd, items: [{ price: proPrice, quantity: 1 }] },
          {
            start_date: periodEnd,
            items: [{ price: starterPrice, quantity: 1 }, { price: "extra_price", quantity: 1 }],
            proration_behavior: "none",
          },
        ],
      })

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: `sub_sched_item_${stamp}`,
        end_behavior: "release",
        phases: [],
      })

      await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledTimes(1)
      const updateParams = mockStripe.subscriptionSchedules.update.mock.calls[0][1] as Stripe.SubscriptionScheduleUpdateParams
      expect(updateParams.phases?.[1].items).toHaveLength(1)
    })

    it("re-configures schedule when extra 3rd future phase exists", async () => {
      const stamp = Date.now() + Math.floor(Math.random() * 100000)
      const ws = await prisma.workspace.create({
        data: {
          name: `Sched ExtraPhase WS ${stamp}`,
          slug: `sched-phase-ws-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_${stamp}`,
          stripeSubscriptionId: `sub_${stamp}`,
          stripeScheduleId: `sub_sched_phase_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Owner Phase",
          email: `owner.phase.${stamp}@docucore.test`,
          passwordHash: "hash",
          role: "Propietario",
          initials: "OP",
          color: "brand",
        },
      })
      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_phase_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      const proPrice = "price_pro_test"
      const starterPrice = "price_starter_test"
      const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 5

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_phase", price: { id: proPrice } }] },
        current_period_end: periodEnd,
        schedule: `sub_sched_phase_${stamp}`,
      })

      // 3 phases instead of exactly 2
      mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
        id: `sub_sched_phase_${stamp}`,
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: transition.id, planKey: "STARTER" },
        end_behavior: "release",
        phases: [
          { start_date: periodEnd - 86400 * 25, end_date: periodEnd, items: [{ price: proPrice, quantity: 1 }] },
          { start_date: periodEnd, end_date: periodEnd + 86400 * 30, items: [{ price: starterPrice, quantity: 1 }], proration_behavior: "none" },
          { start_date: periodEnd + 86400 * 30, items: [{ price: starterPrice, quantity: 1 }], proration_behavior: "none" },
        ],
      })

      mockStripe.subscriptionSchedules.update.mockResolvedValue({
        id: `sub_sched_phase_${stamp}`,
        end_behavior: "release",
        phases: [],
      })

      await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "STARTER",
        transitionId: transition.id,
      })

      expect(mockStripe.subscriptionSchedules.update).toHaveBeenCalledTimes(1)
      const updateParams = mockStripe.subscriptionSchedules.update.mock.calls[0][1] as Stripe.SubscriptionScheduleUpdateParams
      expect(updateParams.phases).toHaveLength(2)
    })
  })

  describe("Item 1: Exact Price ID matching and PlanTransition eligibility", () => {
    it("rejects price_professional_unrelated when target is PRO", () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const sub = {
        status: "active",
        items: { data: [{ price: { id: "price_professional_unrelated" } }] },
      }
      expect(isSubscriptionEligibleForPlanTransition(sub, "PRO")).toBe(false)
    })

    it("rejects price_starter_legacy_unrelated when target is STARTER", () => {
      process.env.STRIPE_PRICE_STARTER = "price_starter_exact"
      const sub = {
        status: "active",
        items: { data: [{ price: { id: "price_starter_legacy_unrelated" } }] },
      }
      expect(isSubscriptionEligibleForPlanTransition(sub, "STARTER")).toBe(false)
    })

    it("rejects when price is missing or null", () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const sub1 = { status: "active", items: { data: [] } }
      const sub2 = { status: "active", items: { data: [{ price: { id: "" } }] } }
      const sub3 = { status: "active" }
      expect(isSubscriptionEligibleForPlanTransition(sub1, "PRO")).toBe(false)
      expect(isSubscriptionEligibleForPlanTransition(sub2, "PRO")).toBe(false)
      expect(isSubscriptionEligibleForPlanTransition(sub3, "PRO")).toBe(false)
    })

    it("rejects when pending_update is present even with exact price", () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const sub = {
        status: "active",
        pending_update: { expires_at: 123456 },
        items: { data: [{ price: { id: "price_pro_exact" } }] },
      }
      expect(isSubscriptionEligibleForPlanTransition(sub, "PRO")).toBe(false)
    })

    it("accepts only exact price matching with active or trialing status and no pending_update", () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const subActive = {
        status: "active",
        items: { data: [{ price: { id: "price_pro_exact" } }] },
      }
      const subTrialing = {
        status: "trialing",
        items: { data: [{ price: { id: "price_pro_exact" } }] },
      }
      expect(isSubscriptionEligibleForPlanTransition(subActive, "PRO")).toBe(true)
      expect(isSubscriptionEligibleForPlanTransition(subTrialing, "PRO")).toBe(true)
    })

    it("webhook with price_professional_unrelated leaves transition PENDING and does not mutate workspace or projects", async () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const stamp = Date.now() + 888
      const ws = await prisma.workspace.create({
        data: {
          name: "Adversarial Price WS",
          slug: `adv-price-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_adv_${stamp}`,
          stripeSubscriptionId: `sub_adv_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Adv User",
          email: `adv.${stamp}@docucore.test`,
          passwordHash: "hash123",
          role: "Propietario",
          initials: "AU",
          color: "brand",
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

      const p1 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `ADV1_${stamp}`.slice(0, 30), name: "Project 1", description: "", status: "ACTIVE" },
      })
      const p2 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `ADV2_${stamp}`.slice(0, 30), name: "Project 2", description: "", status: "ACTIVE" },
      })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_adv_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: `evt_adv_${stamp}`,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: `sub_adv_${stamp}`,
            customer: `cus_adv_${stamp}`,
            status: "active",
            items: { data: [{ price: { id: "price_professional_unrelated" } }] },
            metadata: { workspaceId: String(ws.id), transitionId: transition.id },
          },
        },
      })

      const result = await provider.handleWebhook(Buffer.from("{}"), "sig")
      expect(result.handled).toBe(true)

      // Transition MUST remain PENDING because price was price_professional_unrelated!
      const finalTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(finalTransition.status).toBe("PENDING")
      expect(finalTransition.appliedAt).toBeNull()

      // Projects remain untouched
      const [refreshedP1, refreshedP2] = await Promise.all([
        prisma.project.findUniqueOrThrow({ where: { id: p1.id } }),
        prisma.project.findUniqueOrThrow({ where: { id: p2.id } }),
      ])
      expect(refreshedP1.status).toBe("ACTIVE")
      expect(refreshedP2.status).toBe("ACTIVE")
    })

    it("changeExistingSubscriptionPlan rejects price_professional_unrelated and keeps workspace in STARTER and transition PENDING", async () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const stamp = Date.now() + 901
      const ws = await prisma.workspace.create({
        data: {
          name: "Adv Upgrade WS",
          slug: `adv-upg-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_upg_${stamp}`,
          stripeSubscriptionId: `sub_upg_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Adv Upg User",
          email: `adv.upg.${stamp}@docucore.test`,
          passwordHash: "hash123",
          role: "Propietario",
          initials: "AU",
          color: "brand",
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

      const p1 = await prisma.project.create({
        data: { workspaceId: ws.id, code: `UPG1_${stamp}`.slice(0, 30), name: "Project 1", description: "", status: "ACTIVE" },
      })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_upg_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_upg_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_mock", price: { id: "price_starter_test" } }] },
      })
      mockStripe.subscriptions.update.mockResolvedValue({
        id: `sub_upg_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_mock", price: { id: "price_professional_unrelated" } }] },
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "PRO",
        transitionId: transition.id,
      })

      // 1. success must NOT be true
      expect(result.success).toBe(false)

      // 2. Workspace continues in STARTER
      const refreshedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(refreshedWs.planKey).toBe("STARTER")

      // 3. PlanTransition continues PENDING
      const refreshedTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(refreshedTransition.status).toBe("PENDING")
      expect(refreshedTransition.appliedAt).toBeNull()

      // 4. Projects and members do not change
      const refreshedP1 = await prisma.project.findUniqueOrThrow({ where: { id: p1.id } })
      expect(refreshedP1.status).toBe("ACTIVE")
    })

    it("changeExistingSubscriptionPlan rejects active + missing price", async () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const stamp = Date.now() + 902
      const ws = await prisma.workspace.create({
        data: {
          name: "Missing Price Upgrade WS",
          slug: `adv-miss-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_miss_${stamp}`,
          stripeSubscriptionId: `sub_miss_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Adv Miss User",
          email: `adv.miss.${stamp}@docucore.test`,
          passwordHash: "hash123",
          role: "Propietario",
          initials: "AM",
          color: "brand",
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_miss_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_miss_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_mock", price: { id: "price_starter_test" } }] },
      })
      mockStripe.subscriptions.update.mockResolvedValue({
        id: `sub_miss_${stamp}`,
        status: "active",
        items: { data: [] }, // Price is missing
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "PRO",
        transitionId: transition.id,
      })

      expect(result.success).toBe(false)
      const refreshedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(refreshedWs.planKey).toBe("STARTER")
      const refreshedTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(refreshedTransition.status).toBe("PENDING")
    })

    it("changeExistingSubscriptionPlan applies PRO when trialing + exact price", async () => {
      process.env.STRIPE_PRICE_PRO = "price_pro_exact"
      const stamp = Date.now() + 903
      const ws = await prisma.workspace.create({
        data: {
          name: "Trialing Exact Upgrade WS",
          slug: `adv-tri-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "STARTER",
          stripeCustomerId: `cus_tri_${stamp}`,
          stripeSubscriptionId: `sub_tri_${stamp}`,
        },
      })
      const user = await prisma.user.create({
        data: {
          name: "Adv Tri User",
          email: `adv.tri.${stamp}@docucore.test`,
          passwordHash: "hash123",
          role: "Propietario",
          initials: "AT",
          color: "brand",
        },
      })
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } })

      const transition = await prisma.planTransition.create({
        data: {
          id: `pct_tri_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: `sub_tri_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_mock", price: { id: "price_starter_test" } }] },
      })
      mockStripe.subscriptions.update.mockResolvedValue({
        id: `sub_tri_${stamp}`,
        status: "trialing",
        items: { data: [{ id: "si_mock", price: { id: "price_pro_exact" } }] },
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        targetPlanKey: "PRO",
        transitionId: transition.id,
      })

      expect(result.success).toBe(true)
      expect(result.planKey).toBe("PRO")
      const refreshedWs = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(refreshedWs.planKey).toBe("PRO")
      const refreshedTransition = await prisma.planTransition.findUniqueOrThrow({ where: { id: transition.id } })
      expect(refreshedTransition.status).toBe("APPLIED")
    })
  })

  describe("Item 3: Checkout Session null/unknown status handling", () => {
    it("returns null status as null without coercing to open", async () => {
      mockStripe.checkout.sessions.retrieve = vi.fn().mockResolvedValue({
        id: "cs_null_status",
        url: null,
        status: null,
        metadata: { workspaceId: "123", transitionId: "pct_test" },
      })

      const retrieved = await provider.retrieveCheckoutSession("cs_null_status")
      expect(retrieved.status).toBeNull()
      expect(retrieved.status).not.toBe("open")
    })
  })

  describe("B1 fix: subscription en estado final libera el vínculo; retrieve 404 es fail-closed", () => {
    it("changeExistingSubscriptionPlan con retrieve 404 → 409 STRIPE_SUBSCRIPTION_NOT_FOUND sin limpiar ni crear", async () => {
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const ws = await prisma.workspace.create({
        data: {
          name: `B1 404 WS ${stamp}`,
          slug: `b1-404-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_404_${stamp}`,
          stripeSubscriptionId: `sub_404_${stamp}`,
          stripePriceId: "price_pro_test",
        },
      })
      await prisma.planTransition.create({
        data: {
          id: `pct_404_${stamp}`,
          workspaceId: ws.id,
          actorId: 1,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })

      mockStripe.subscriptions.retrieve = vi.fn().mockRejectedValue(
        Object.assign(new Error("No such subscription"), { statusCode: 404, code: "resource_missing" }),
      )
      mockStripe.subscriptions.update = vi.fn().mockRejectedValue(new Error("subscriptions.update no debe llamarse"))

      await expect(
        provider.changeExistingSubscriptionPlan({ workspaceId: ws.id, targetPlanKey: "STARTER", transitionId: `pct_404_${stamp}` }),
      ).rejects.toMatchObject({ status: 409, code: "STRIPE_SUBSCRIPTION_NOT_FOUND" })

      const after = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(after.stripeSubscriptionId).toBe(`sub_404_${stamp}`) // vínculo preservado
      expect(after.billingStatus).toBe("ACTIVE") // no se asumió cancelación
      expect(mockStripe.subscriptions.update).not.toHaveBeenCalled()
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
    })

    it("reconcileWorkspace con retrieve 404 → PAST_DUE fail-closed, vínculo conservado, auditable, sin throw", async () => {
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const user = await prisma.user.create({
        data: {
          name: `B1 User ${stamp}`,
          email: `b1.user.${stamp}@docucore.test`,
          passwordHash: "x",
          role: "Propietario",
          initials: "BU",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      const ws = await prisma.workspace.create({
        data: {
          name: `B2 404 WS ${stamp}`,
          slug: `b2-404-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_r_${stamp}`,
          stripeSubscriptionId: `sub_r_${stamp}`,
          stripePriceId: "price_pro_test",
        },
      })

      mockStripe.subscriptions.retrieve = vi.fn().mockRejectedValue(
        Object.assign(new Error("No such subscription"), { statusCode: 404, code: "resource_missing" }),
      )

      const result = await provider.reconcileWorkspace(ws.id, user.id)
      expect(result.billingStatus).toBe("PAST_DUE")
      expect(result.stripeSubscriptionId).toBe(`sub_r_${stamp}`) // vínculo conservado

      const after = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(after.billingStatus).toBe("PAST_DUE")
      expect(after.stripeSubscriptionId).toBe(`sub_r_${stamp}`)

      const audit = await prisma.auditLog.findFirst({
        where: { workspaceId: ws.id, action: "Reconciliación: suscripción Stripe no encontrada" },
      })
      expect(audit).not.toBeNull()
    })

    it("changeExistingSubscriptionPlan con sub cancelada libera el vínculo de forma auditable (B1)", async () => {
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const user = await prisma.user.create({
        data: {
          name: `B1 User ${stamp}`,
          email: `b1.term.${stamp}@docucore.test`,
          passwordHash: "x",
          role: "Propietario",
          initials: "BT",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      const ws = await prisma.workspace.create({
        data: {
          name: `B1 Term WS ${stamp}`,
          slug: `b1-term-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_term_${stamp}`,
          stripeSubscriptionId: `sub_term_${stamp}`,
          stripePriceId: "price_pro_test",
        },
      })
      await prisma.planTransition.create({
        data: {
          id: `pct_term_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      mockStripe.subscriptions.retrieve = vi.fn().mockResolvedValue({
        id: `sub_term_${stamp}`,
        status: "canceled",
        customer: `cus_term_${stamp}`,
        items: { data: [{ id: "si_term", price: { id: "price_pro_test" } }] },
      })
      mockStripe.subscriptions.update = vi.fn().mockRejectedValue(new Error("no debe modificar la sub cancelada"))

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        actorId: user.id,
        targetPlanKey: "PRO",
        transitionId: `pct_term_${stamp}`,
      })

      expect(result.code).toBe("SUBSCRIPTION_TERMINATED")
      expect(result.success).toBe(false)

      const after = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })
      expect(after.stripeSubscriptionId).toBeNull() // vínculo obsoleto liberado
      expect(after.stripeScheduleId).toBeNull()
      expect(after.billingStatus).toBe("CANCELED")
      expect(after.stripeCustomerId).toBe(`cus_term_${stamp}`) // customer conservado

      const audit = await prisma.auditLog.findFirst({
        where: { workspaceId: ws.id, action: "Vínculo de suscripción obsoleto liberado" },
      })
      expect(audit).not.toBeNull()
      expect(mockStripe.subscriptions.update).not.toHaveBeenCalled()
    })
  })

  describe("B3 fix: el upgrade libera el schedule DocuCore y cancela solo la transición PENDING vinculada", () => {
    it("cancela la transición zombie y aplica la de upgrade sin tocar otras PENDING", async () => {
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const user = await prisma.user.create({
        data: {
          name: `B3 User ${stamp}`,
          email: `b3.user.${stamp}@docucore.test`,
          passwordHash: "x",
          role: "Propietario",
          initials: "B3",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })
      const ws = await prisma.workspace.create({
        data: {
          name: `B3 WS ${stamp}`,
          slug: `b3-${stamp}`,
          billingStatus: "ACTIVE",
          planKey: "PRO",
          stripeCustomerId: `cus_b3_${stamp}`,
          stripeSubscriptionId: `sub_b3_${stamp}`,
          stripePriceId: "price_pro_test",
          currentPeriodEnd: new Date(Date.now() + 20 * 86400 * 1000),
        },
      })
      const zombie = await prisma.planTransition.create({
        data: {
          id: `pct_zombie_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
          stripeScheduleId: "sub_sched_zombie",
        },
      })
      const unrelatedPending = await prisma.planTransition.create({
        data: {
          id: `pct_unrelated_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "STARTER",
          status: "PENDING",
        },
      })
      const upgradeTransition = await prisma.planTransition.create({
        data: {
          id: `pct_up_${stamp}`,
          workspaceId: ws.id,
          actorId: user.id,
          targetPlanKey: "PRO",
          status: "PENDING",
        },
      })

      mockStripe.subscriptions.retrieve = vi.fn().mockResolvedValue({
        id: `sub_b3_${stamp}`,
        status: "active",
        customer: `cus_b3_${stamp}`,
        current_period_end: Math.floor(Date.now() / 1000) + 20 * 86400,
        items: { data: [{ id: "si_b3", price: { id: "price_pro_test" } }] },
        schedule: "sub_sched_zombie",
      })
      mockStripe.subscriptionSchedules.retrieve = vi.fn().mockResolvedValue({
        id: "sub_sched_zombie",
        status: "active",
        metadata: { managedBy: "docucore", workspaceId: String(ws.id), transitionId: zombie.id },
        phases: [{ start_date: 1000, end_date: 2000, items: [{ price: "price_pro_test", quantity: 1 }] }],
      })
      mockStripe.subscriptionSchedules.release = vi.fn().mockResolvedValue({ id: "sub_sched_zombie", status: "released" })
      mockStripe.subscriptions.update = vi.fn().mockResolvedValue({
        id: `sub_b3_${stamp}`,
        status: "active",
        items: { data: [{ id: "si_b3", price: { id: "price_pro_test" } }] },
      })

      const result = await provider.changeExistingSubscriptionPlan({
        workspaceId: ws.id,
        actorId: user.id,
        targetPlanKey: "PRO",
        transitionId: upgradeTransition.id,
      })

      expect(result.success).toBe(true)
      expect(mockStripe.subscriptionSchedules.release).toHaveBeenCalledTimes(1)

      const zombieAfter = await prisma.planTransition.findUniqueOrThrow({ where: { id: zombie.id } })
      expect(zombieAfter.status).toBe("CANCELED")

      const unrelatedAfter = await prisma.planTransition.findUniqueOrThrow({ where: { id: unrelatedPending.id } })
      expect(unrelatedAfter.status).toBe("PENDING") // nunca cancela otras PENDING

      const upgradeAfter = await prisma.planTransition.findUniqueOrThrow({ where: { id: upgradeTransition.id } })
      expect(upgradeAfter.status).toBe("APPLIED")

      const audit = await prisma.auditLog.findFirst({
        where: { workspaceId: ws.id, action: "Transición de plan cancelada (schedule liberado)" },
      })
      expect(audit).not.toBeNull()
      expect(audit?.entityId).toBe(`plan-transition:${zombie.id}`)
    })
  })
})
