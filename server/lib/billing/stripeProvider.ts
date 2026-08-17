import Stripe from "stripe"
import prisma from "../prisma"
import { getPlanKeyFromPriceId, getStripePriceIdForPlan } from "../plans"
import type { BillingProvider, CheckoutSessionParams, CustomerPortalParams, ReconcileResult, WebhookEventResult } from "./types"

export class StripeBillingProvider implements BillingProvider {
  private stripe: Stripe
  private webhookSecret: string

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey)
    this.webhookSecret = webhookSecret
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    const priceId = params.priceId || (params.planKey ? getStripePriceIdForPlan(params.planKey) : null) || process.env.STRIPE_PRICE_STARTER
    if (!priceId) {
      throw Object.assign(new Error("Stripe price ID is not configured for the requested plan"), { status: 500 })
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: String(params.workspaceId),
      metadata: {
        workspaceId: String(params.workspaceId),
        planKey: params.planKey ?? "",
        projectLimit: String(params.projectLimit ?? ""),
      },
      subscription_data: {
        metadata: {
          workspaceId: String(params.workspaceId),
          planKey: params.planKey ?? "",
          projectLimit: String(params.projectLimit ?? ""),
        },
        ...(params.trialEndTimestamp && params.trialEndTimestamp > Math.floor(Date.now() / 1000)
          ? { trial_end: params.trialEndTimestamp }
          : {}),
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams)
    if (!session.url) {
      throw Object.assign(new Error("Failed to create Stripe Checkout session URL"), { status: 502 })
    }

    return { checkoutUrl: session.url, sessionId: session.id }
  }

  async createCustomerPortalSession(params: CustomerPortalParams): Promise<{ portalUrl: string }> {
    const portalSession = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    })
    return { portalUrl: portalSession.url }
  }

  async handleWebhook(rawBody: Buffer | string, signature?: string): Promise<WebhookEventResult> {
    if (!signature) {
      throw Object.assign(new Error("Missing Stripe webhook signature"), { status: 400 })
    }

    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Webhook signature verification failed"
      throw Object.assign(new Error(`Webhook signature verification failed: ${message}`), { status: 400 })
    }

    // Idempotency check
    const existing = await prisma.processedWebhookEvent.findUnique({ where: { id: event.id } })
    if (existing) {
      return { handled: true, eventType: event.type, eventId: event.id, message: "Duplicate event ignored" }
    }

    const obj = event.data.object as unknown as Record<string, unknown>
    const metadata = (obj.metadata as Record<string, string> | undefined) ?? {}
    const workspaceId = metadata.workspaceId ? Number(metadata.workspaceId) : undefined

    await prisma.$transaction(async (tx) => {
      await tx.processedWebhookEvent.create({
        data: {
          id: event.id,
          provider: "stripe",
        },
      })

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session
          const wsId = workspaceId ?? (session.client_reference_id ? Number(session.client_reference_id) : undefined)
          if (wsId && Number.isInteger(wsId)) {
            const target = await tx.workspace.findUnique({ where: { id: wsId } })
            if (!target || target.billingSource === "MANUAL") break
            const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id
            const cusId = typeof session.customer === "string" ? session.customer : session.customer?.id
            const sessionMetadata = (session.metadata as Record<string, string> | undefined) ?? {}
            const metaPlanKey = sessionMetadata.planKey === "STARTER" || sessionMetadata.planKey === "PRO" ? sessionMetadata.planKey : null
            await tx.workspace.update({
              where: { id: wsId },
              data: {
                billingStatus: "ACTIVE",
                ...(metaPlanKey ? { planKey: metaPlanKey } : {}),
                stripeCustomerId: cusId ?? null,
                stripeSubscriptionId: subId ?? null,
              },
            })
          }
          break
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription
          const cusId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
          const wsId = sub.metadata?.workspaceId ? Number(sub.metadata.workspaceId) : undefined

          const target = wsId
            ? await tx.workspace.findUnique({ where: { id: wsId } })
            : cusId
              ? await tx.workspace.findUnique({ where: { stripeCustomerId: cusId } })
              : await tx.workspace.findUnique({ where: { stripeSubscriptionId: sub.id } })

          if (target && target.billingSource !== "MANUAL") {
            let mappedStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL" = "ACTIVE"
            if (sub.status === "past_due") mappedStatus = "PAST_DUE"
            else if (sub.status === "canceled" || sub.status === "unpaid") mappedStatus = "CANCELED"
            else if (sub.status === "trialing") mappedStatus = "TRIAL"

            const priceId = sub.items.data[0]?.price?.id ?? target.stripePriceId
            const mappedPlanKey = getPlanKeyFromPriceId(priceId)
            const rawSub = sub as unknown as { current_period_end?: number }
            await tx.workspace.update({
              where: { id: target.id },
              data: {
                billingStatus: mappedStatus,
                planKey: mappedPlanKey ?? target.planKey,
                stripeSubscriptionId: sub.id,
                stripeCustomerId: cusId ?? target.stripeCustomerId,
                stripePriceId: priceId,
                currentPeriodEnd: rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : target.currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
              },
            })
          }
          break
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription
          const target = await tx.workspace.findFirst({ where: { stripeSubscriptionId: sub.id, billingSource: "STRIPE" } })
          if (target) {
            await tx.workspace.update({
              where: { id: target.id },
              data: {
                billingStatus: "CANCELED",
                cancelAtPeriodEnd: false,
              },
            })
          }
          break
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice
          const cusId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
          if (cusId) {
            const target = await tx.workspace.findFirst({ where: { stripeCustomerId: cusId, billingSource: "STRIPE" } })
            if (target) {
              await tx.workspace.update({
                where: { id: target.id },
                data: {
                  billingStatus: "PAST_DUE",
                },
              })
            }
          }
          break
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice
          const cusId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
          if (cusId) {
            const target = await tx.workspace.findFirst({ where: { stripeCustomerId: cusId, billingSource: "STRIPE" } })
            if (target && target.billingStatus === "PAST_DUE") {
              await tx.workspace.update({
                where: { id: target.id },
                data: {
                  billingStatus: "ACTIVE",
                },
              })
            }
          }
          break
        }
      }
    })

    return { handled: true, eventType: event.type, eventId: event.id, workspaceId }
  }

  async reconcileWorkspace(workspaceId: number): Promise<ReconcileResult> {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
    if (ws.billingSource === "MANUAL") {
      return {
        workspaceId: ws.id,
        billingStatus: ws.billingStatus,
        billingSource: ws.billingSource,
        planKey: ws.planKey,
        currentPeriodEnd: ws.currentPeriodEnd,
        cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
        stripeCustomerId: ws.stripeCustomerId,
        stripeSubscriptionId: ws.stripeSubscriptionId,
        stripePriceId: ws.stripePriceId,
      }
    }
    if (!ws.stripeSubscriptionId && !ws.stripeCustomerId) {
      return {
        workspaceId: ws.id,
        billingStatus: ws.billingStatus,
        billingSource: ws.billingSource,
        planKey: ws.planKey,
        currentPeriodEnd: ws.currentPeriodEnd,
        cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
      }
    }

    if (ws.stripeSubscriptionId) {
      const sub = await this.stripe.subscriptions.retrieve(ws.stripeSubscriptionId)
      let mappedStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL" = "ACTIVE"
      if (sub.status === "past_due") mappedStatus = "PAST_DUE"
      else if (sub.status === "canceled" || sub.status === "unpaid") mappedStatus = "CANCELED"
      else if (sub.status === "trialing") mappedStatus = "TRIAL"

      const priceId = sub.items.data[0]?.price?.id ?? ws.stripePriceId
      const mappedPlanKey = getPlanKeyFromPriceId(priceId)
      const rawSub = sub as unknown as { current_period_end?: number }
      const updated = await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          billingStatus: mappedStatus,
          planKey: mappedPlanKey ?? ws.planKey,
          stripePriceId: priceId,
          currentPeriodEnd: rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : ws.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      })
      return {
        workspaceId: updated.id,
        billingStatus: updated.billingStatus,
        billingSource: updated.billingSource,
        planKey: updated.planKey,
        currentPeriodEnd: updated.currentPeriodEnd,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        stripeCustomerId: updated.stripeCustomerId,
        stripeSubscriptionId: updated.stripeSubscriptionId,
        stripePriceId: updated.stripePriceId,
      }
    }

    return {
      workspaceId: ws.id,
      billingStatus: ws.billingStatus,
      billingSource: ws.billingSource,
      planKey: ws.planKey,
      currentPeriodEnd: ws.currentPeriodEnd,
      cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
      stripeCustomerId: ws.stripeCustomerId,
      stripeSubscriptionId: ws.stripeSubscriptionId,
      stripePriceId: ws.stripePriceId,
    }
  }
}
