import prisma from "../prisma"
import { getPlanKeyFromPriceId } from "../plans"
import type { BillingProvider, CheckoutSessionParams, CustomerPortalParams, ReconcileResult, WebhookEventResult } from "./types"

export class FakeBillingProvider implements BillingProvider {
  async createCheckoutSession(params: CheckoutSessionParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    const plan = params.planKey || "STARTER"
    const sessionId = `fake_cs_${params.workspaceId}_${plan}_${Date.now()}`
    const checkoutUrl = `https://checkout.stripe.test/c/${sessionId}?plan=${plan}&return_to=${encodeURIComponent(params.successUrl)}`
    return { checkoutUrl, sessionId }
  }

  async createCustomerPortalSession(params: CustomerPortalParams): Promise<{ portalUrl: string }> {
    const portalUrl = `https://billing.stripe.test/p/fake_bps_${params.workspaceId}?return_to=${encodeURIComponent(params.returnUrl)}`
    return { portalUrl }
  }

  async handleWebhook(rawBody: Buffer | string, signature?: string): Promise<WebhookEventResult> {
    const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")
    let payload: { id: string; type: string; data?: { object?: Record<string, unknown> } }
    try {
      payload = JSON.parse(bodyStr)
    } catch {
      throw Object.assign(new Error("Invalid JSON webhook body"), { status: 400 })
    }

    if (signature === "invalid_signature") {
      throw Object.assign(new Error("Invalid webhook signature"), { status: 400 })
    }

    const eventId = payload.id || `fake_evt_${Date.now()}`
    const eventType = payload.type || "unknown"

    // Idempotency check via ProcessedWebhookEvent
    const existing = await prisma.processedWebhookEvent.findUnique({ where: { id: eventId } })
    if (existing) {
      return { handled: true, eventType, eventId, message: "Duplicate event ignored" }
    }

    const obj = payload.data?.object ?? {}
    const metadata = (obj.metadata as Record<string, string> | undefined) ?? {}
    const workspaceId = metadata.workspaceId ? Number(metadata.workspaceId) : undefined

    await prisma.$transaction(async (tx) => {
      await tx.processedWebhookEvent.create({
        data: {
          id: eventId,
          provider: "fake_stripe",
        },
      })

      if (eventType === "checkout.session.completed") {
        const wsId = workspaceId ?? Number(obj.client_reference_id)
        if (wsId && Number.isInteger(wsId)) {
          const rawPriceId = (obj.priceId as string) || (obj.price as string)
          const metaPlanKey = metadata.planKey === "STARTER" || metadata.planKey === "PRO" ? metadata.planKey : null
          const resolvedPlanKey = metaPlanKey ?? getPlanKeyFromPriceId(rawPriceId) ?? "STARTER"
          await tx.workspace.update({
            where: { id: wsId },
            data: {
              billingStatus: "ACTIVE",
              planKey: resolvedPlanKey,
              stripeCustomerId: (obj.customer as string) || `fake_cus_${wsId}`,
              stripeSubscriptionId: (obj.subscription as string) || `fake_sub_${wsId}`,
              stripePriceId: rawPriceId ?? null,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
        }
      } else if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.created") {
        const subId = obj.id as string | undefined
        const customerId = obj.customer as string | undefined
        const status = obj.status as string | undefined
        const currentPeriodEndSec = obj.current_period_end as number | undefined
        const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end)
        const rawPriceId = (obj.priceId as string) || (obj.items as { data?: Array<{ price?: { id?: string } }> })?.data?.[0]?.price?.id

        const targetWorkspace = workspaceId
          ? await tx.workspace.findUnique({ where: { id: workspaceId } })
          : customerId
            ? await tx.workspace.findUnique({ where: { stripeCustomerId: customerId } })
            : subId
              ? await tx.workspace.findUnique({ where: { stripeSubscriptionId: subId } })
              : null

        if (targetWorkspace) {
          let mappedStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL" = "ACTIVE"
          if (status === "past_due") mappedStatus = "PAST_DUE"
          else if (status === "canceled" || status === "unpaid") mappedStatus = "CANCELED"
          else if (status === "trialing") mappedStatus = "TRIAL"

          const metaPlanKey = metadata.planKey === "STARTER" || metadata.planKey === "PRO" ? metadata.planKey : null
          const resolvedPlanKey = metaPlanKey ?? getPlanKeyFromPriceId(rawPriceId) ?? targetWorkspace.planKey

          await tx.workspace.update({
            where: { id: targetWorkspace.id },
            data: {
              billingStatus: mappedStatus,
              planKey: resolvedPlanKey,
              stripeSubscriptionId: subId ?? targetWorkspace.stripeSubscriptionId,
              stripeCustomerId: customerId ?? targetWorkspace.stripeCustomerId,
              stripePriceId: rawPriceId ?? targetWorkspace.stripePriceId,
              currentPeriodEnd: currentPeriodEndSec ? new Date(currentPeriodEndSec * 1000) : targetWorkspace.currentPeriodEnd,
              cancelAtPeriodEnd,
            },
          })
        }
      } else if (eventType === "customer.subscription.deleted") {
        const subId = obj.id as string | undefined
        const targetWorkspace = subId ? await tx.workspace.findUnique({ where: { stripeSubscriptionId: subId } }) : null
        if (targetWorkspace) {
          await tx.workspace.update({
            where: { id: targetWorkspace.id },
            data: {
              billingStatus: "CANCELED",
              cancelAtPeriodEnd: false,
            },
          })
        }
      } else if (eventType === "invoice.payment_failed") {
        const customerId = obj.customer as string | undefined
        const targetWorkspace = customerId ? await tx.workspace.findUnique({ where: { stripeCustomerId: customerId } }) : null
        if (targetWorkspace) {
          await tx.workspace.update({
            where: { id: targetWorkspace.id },
            data: {
              billingStatus: "PAST_DUE",
            },
          })
        }
      } else if (eventType === "invoice.payment_succeeded") {
        const customerId = obj.customer as string | undefined
        const targetWorkspace = customerId ? await tx.workspace.findUnique({ where: { stripeCustomerId: customerId } }) : null
        if (targetWorkspace && targetWorkspace.billingStatus === "PAST_DUE") {
          await tx.workspace.update({
            where: { id: targetWorkspace.id },
            data: {
              billingStatus: "ACTIVE",
            },
          })
        }
      }
    })

    return { handled: true, eventType, eventId, workspaceId }
  }

  async reconcileWorkspace(workspaceId: number): Promise<ReconcileResult> {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
    return {
      workspaceId: ws.id,
      billingStatus: ws.billingStatus,
      planKey: ws.planKey,
      currentPeriodEnd: ws.currentPeriodEnd,
      cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
      stripeCustomerId: ws.stripeCustomerId,
      stripeSubscriptionId: ws.stripeSubscriptionId,
      stripePriceId: ws.stripePriceId,
    }
  }
}
