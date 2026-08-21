import Stripe from "stripe"
import prisma from "../prisma"
import { planKeyFromPriceId, type PlanKey } from "../entitlements"
import { getStripePriceIdForPlan } from "../plans"
import type {
  BillingProvider,
  ChangePlanResult,
  ChangeSubscriptionPlanParams,
  CustomerPortalParams,
  InitialCheckoutParams,
  ReconcileResult,
  WebhookEventResult,
} from "./types"

const DOCUCORE_SCHEDULE_MANAGER = "docucore"

type RawSubscription = Stripe.Subscription & {
  current_period_end?: number
  schedule?: string | { id: string } | null
}

function scheduleConflict(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 409, code: "STRIPE_SCHEDULE_CONFLICT" })
}

function isDocuCoreSchedule(schedule: Stripe.SubscriptionSchedule, workspaceId: number): boolean {
  return schedule.metadata?.managedBy === DOCUCORE_SCHEDULE_MANAGER
    && schedule.metadata?.workspaceId === String(workspaceId)
}

function scheduleTransitionMatches(schedule: Stripe.SubscriptionSchedule, transitionId: string): boolean {
  return schedule.metadata?.transitionId === transitionId
}

function phaseItems(phase: Stripe.SubscriptionSchedule.Phase | undefined, fallbackPriceId: string): Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] {
  return phase?.items?.map((item) => ({
    price: typeof item.price === "string" ? item.price : item.price.id,
    quantity: item.quantity ?? 1,
  })) ?? [{ price: fallbackPriceId, quantity: 1 }]
}

/**
 * Preserve the current phase by copying only fields documented by the installed
 * SDK's SubscriptionScheduleUpdateParams.Phase type. Never spread Stripe's
 * response object into an update request.
 */
function currentPhaseUpdate(
  phase: Stripe.SubscriptionSchedule.Phase | undefined,
  fallbackPriceId: string,
  startDate: number,
  endDate: number,
): Stripe.SubscriptionScheduleUpdateParams.Phase {
  const update: Stripe.SubscriptionScheduleUpdateParams.Phase = {
    items: phaseItems(phase, fallbackPriceId),
    start_date: phase?.start_date ?? startDate,
    end_date: endDate,
  }

  if (phase?.application_fee_percent !== null && phase?.application_fee_percent !== undefined) update.application_fee_percent = phase.application_fee_percent
  if (phase?.billing_cycle_anchor) update.billing_cycle_anchor = phase.billing_cycle_anchor
  if (phase?.collection_method) update.collection_method = phase.collection_method
  if (phase?.default_payment_method) update.default_payment_method = typeof phase.default_payment_method === "string" ? phase.default_payment_method : phase.default_payment_method.id
  if (phase?.default_tax_rates?.length) update.default_tax_rates = phase.default_tax_rates.map((taxRate) => typeof taxRate === "string" ? taxRate : taxRate.id)
  if (phase?.metadata) update.metadata = phase.metadata
  if (phase?.proration_behavior) update.proration_behavior = phase.proration_behavior
  if (phase?.trial_end) update.trial_end = phase.trial_end

  return update
}

export class StripeBillingProvider implements BillingProvider {
  private stripe: Stripe
  private webhookSecret: string

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey)
    this.webhookSecret = webhookSecret
  }

  async createInitialSubscriptionCheckout(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    if (!params.transitionId) {
      throw Object.assign(new Error("Toda contratación requiere una transición persistida."), { status: 400, code: "TRANSITION_REQUIRED" })
    }
    const priceId = params.priceId || (params.planKey ? getStripePriceIdForPlan(params.planKey) : null) || process.env.STRIPE_PRICE_STARTER
    if (!priceId) {
      throw Object.assign(new Error("Stripe price ID is not configured for the requested plan"), { status: 500 })
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
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
        ...(params.transitionId ? { transitionId: params.transitionId } : {}),
      },
      subscription_data: {
        metadata: {
          workspaceId: String(params.workspaceId),
          planKey: params.planKey ?? "",
          projectLimit: String(params.projectLimit ?? ""),
          ...(params.transitionId ? { transitionId: params.transitionId } : {}),
        },
        ...(params.trialEndTimestamp && params.trialEndTimestamp > Math.floor(Date.now() / 1000)
          ? { trial_end: params.trialEndTimestamp }
          : {}),
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `docucore_checkout_${params.transitionId}`,
    })
    if (!session.url) {
      throw Object.assign(new Error("Failed to create Stripe Checkout session URL"), { status: 502 })
    }

    return { checkoutUrl: session.url, sessionId: session.id }
  }

  async createCheckoutSession(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    return this.createInitialSubscriptionCheckout(params)
  }

  async changeExistingSubscriptionPlan(params: ChangeSubscriptionPlanParams): Promise<ChangePlanResult> {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: params.workspaceId } })
    if (!ws.stripeSubscriptionId) {
      throw Object.assign(new Error("El workspace no dispone de una suscripción Stripe activa para modificar."), { status: 400 })
    }

    const targetPriceId = params.targetPriceId || getStripePriceIdForPlan(params.targetPlanKey)
    if (!targetPriceId) {
      throw Object.assign(new Error("Stripe price ID is not configured for the target plan"), { status: 500 })
    }
    if (!params.transitionId) {
      throw Object.assign(new Error("Toda contratación o cambio de plan requiere una transición persistida."), { status: 400, code: "TRANSITION_REQUIRED" })
    }

    const sub = await this.stripe.subscriptions.retrieve(ws.stripeSubscriptionId)
    const itemId = sub.items.data[0]?.id
    if (!itemId) {
      throw Object.assign(new Error("No se encontró el ítem de suscripción en Stripe."), { status: 500 })
    }

    const isUpgrade = params.targetPlanKey === "PRO"

    if (isUpgrade) {
      // Starter -> Pro: immediate upgrade. Only an explicitly DocuCore-managed
      // downgrade may be released; foreign schedules are never modified.
      const rawSchedule = (sub as RawSubscription).schedule
      if (rawSchedule) {
        const scheduleId = typeof rawSchedule === "string" ? rawSchedule : rawSchedule.id
        const schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId)
        if (!isDocuCoreSchedule(schedule, ws.id)) {
          throw scheduleConflict("La suscripción ya tiene una programación Stripe no gestionada por DocuCore.")
        }
        await this.stripe.subscriptionSchedules.release(scheduleId)
      }

      // Upgrade policy: always_invoice + pending_if_incomplete
      // Rationale: In a self-service SaaS, immediate invoice generation ensures Stripe attempts payment immediately
      // for the prorated difference. If payment fails (e.g. card declined or 3DS required), subscription status becomes
      // 'past_due' or 'incomplete', preventing the workspace from accessing Pro entitlements without paying the prorated difference.
      const updatedSub = await this.stripe.subscriptions.update(ws.stripeSubscriptionId, {
        items: [
          {
            id: itemId,
            price: targetPriceId,
          },
        ],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
        metadata: {
          workspaceId: String(params.workspaceId),
          planKey: "PRO",
          ...(params.transitionId ? { transitionId: params.transitionId } : {}),
        },
      })

      const rawSub = updatedSub as unknown as { current_period_end?: number }
      const periodEnd = rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : ws.currentPeriodEnd
      const now = new Date()

      // Only grant PRO in workspace if subscription remains in good standing (active/trialing)
      if (updatedSub.status === "active" || updatedSub.status === "trialing") {
        await prisma.workspace.update({
          where: { id: ws.id },
          data: {
            billingStatus: updatedSub.status === "trialing" ? "TRIAL" : "ACTIVE",
            planKey: "PRO",
            stripePriceId: targetPriceId,
            stripeScheduleId: null,
            currentPeriodEnd: periodEnd,
          },
        })
      } else if (updatedSub.status === "past_due" || updatedSub.status === "incomplete") {
        await prisma.workspace.update({
          where: { id: ws.id },
          data: {
            billingStatus: "PAST_DUE",
            stripePriceId: targetPriceId,
            stripeScheduleId: null,
            currentPeriodEnd: periodEnd,
          },
        })
      }

      if (params.transitionId) {
        await prisma.planTransition.update({
          where: { id: params.transitionId },
          data: {
            stripeSessionId: updatedSub.id,
            stripeScheduleId: null,
          },
        })
      }

      return {
        success: true,
        planKey: "PRO",
        effectiveAt: now,
        status: updatedSub.status,
        stripeSubscriptionId: updatedSub.id,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: null,
      }
    } else {
      // Pro -> Starter: downgrade scheduled for end of current billing period via Subscription Schedule.
      const rawSchedule = (sub as RawSubscription).schedule
      let schedule: Stripe.SubscriptionSchedule
      let scheduleId: string

      if (rawSchedule) {
        scheduleId = typeof rawSchedule === "string" ? rawSchedule : rawSchedule.id
        schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId)
        if (!isDocuCoreSchedule(schedule, ws.id)) {
          throw scheduleConflict("La suscripción ya tiene una programación Stripe no gestionada por DocuCore.")
        }
        if (!scheduleTransitionMatches(schedule, params.transitionId)) {
          throw scheduleConflict("La programación DocuCore existente pertenece a otra transición y requiere resolución explícita.")
        }
      } else {
        schedule = await this.stripe.subscriptionSchedules.create({
          from_subscription: ws.stripeSubscriptionId,
          metadata: {
            managedBy: DOCUCORE_SCHEDULE_MANAGER,
            workspaceId: String(params.workspaceId),
            transitionId: params.transitionId,
          },
        })
        scheduleId = schedule.id
      }

      const rawSub = sub as RawSubscription
      const periodEndUnix = typeof rawSub.current_period_end === "number"
        ? rawSub.current_period_end
        : (schedule.phases[0]?.end_date ?? Math.floor(Date.now() / 1000) + 30 * 86400)
      const periodEndDate = new Date(periodEndUnix * 1000)

      // A schedule owned by this exact transition is already the durable Stripe
      // binding. Reuse it instead of rewriting its phases on a retry.
      if (rawSchedule && scheduleTransitionMatches(schedule, params.transitionId)) {
        await prisma.workspace.update({ where: { id: ws.id }, data: { stripeScheduleId: scheduleId } })
        await prisma.planTransition.update({
          where: { id: params.transitionId },
          data: { stripeSessionId: ws.stripeSubscriptionId, stripeScheduleId: scheduleId, effectiveAt: periodEndDate },
        })
        return {
          success: true,
          planKey: "STARTER",
          effectiveAt: periodEndDate,
          status: sub.status,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: ws.stripeCustomerId,
          stripeScheduleId: scheduleId,
          message: "El cambio al plan Starter ya está programado para el final del período actual.",
        }
      }

      const currentPhase = schedule.phases[0]
      await this.stripe.subscriptionSchedules.update(scheduleId, {
        end_behavior: "release",
        phases: [
          currentPhaseUpdate(
            currentPhase,
            ws.stripePriceId || getStripePriceIdForPlan("PRO")!,
            Math.floor(Date.now() / 1000),
            periodEndUnix,
          ),
          {
            items: [{ price: targetPriceId, quantity: 1 }],
            start_date: periodEndUnix,
            proration_behavior: "none",
            metadata: {
              managedBy: DOCUCORE_SCHEDULE_MANAGER,
              workspaceId: String(params.workspaceId),
              planKey: "STARTER",
              transitionId: params.transitionId,
            },
          },
        ],
        metadata: {
          managedBy: DOCUCORE_SCHEDULE_MANAGER,
          workspaceId: String(params.workspaceId),
          planKey: "STARTER",
          transitionId: params.transitionId,
        },
      })

      // Also update subscription metadata to link the schedule and transition
      await this.stripe.subscriptions.update(ws.stripeSubscriptionId, {
        metadata: {
          workspaceId: String(params.workspaceId),
          scheduledPlanKey: "STARTER",
          stripeScheduleId: scheduleId,
          transitionId: params.transitionId,
        },
      })

      // Save scheduleId on Workspace, but keep planKey as PRO and current entitlements intact until periodEnd
      await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          stripeScheduleId: scheduleId,
        },
      })

      await prisma.planTransition.update({
        where: { id: params.transitionId },
        data: {
          stripeSessionId: ws.stripeSubscriptionId,
          stripeScheduleId: scheduleId,
          effectiveAt: periodEndDate,
        },
      })

      return {
        success: true,
        planKey: "STARTER",
        effectiveAt: periodEndDate,
        status: sub.status,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: scheduleId,
        message: "El cambio al plan Starter se aplicará al finalizar el período actual.",
      }
    }
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

      const now = new Date()

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
            const transitionId = sessionMetadata.transitionId

            // Trial preservation: If the workspace is currently in an active trial (trialEndsAt > now),
            // its billingStatus remains TRIAL so it preserves trial entitlements (15 projects, 15 members)
            // until the trial period ends. Otherwise, status becomes ACTIVE.
            const isTrialActive = target.billingStatus === "TRIAL" && target.trialEndsAt && target.trialEndsAt.getTime() > now.getTime()
            const mappedBillingStatus = isTrialActive ? "TRIAL" : "ACTIVE"

            await tx.workspace.update({
              where: { id: wsId },
              data: {
                billingStatus: mappedBillingStatus,
                ...(metaPlanKey ? { planKey: metaPlanKey } : {}),
                stripeCustomerId: cusId ?? null,
                stripeSubscriptionId: subId ?? null,
              },
            })

            // A persisted transition is loaded CANONICALLY from DB (§3).
            // It is applied only if effectiveAt <= now (§2).
            if (transitionId && metaPlanKey) {
              const pending = await tx.planTransition.findUnique({ where: { id: transitionId } })
              if (pending && pending.status === "PENDING" && pending.workspaceId === wsId && pending.targetPlanKey === metaPlanKey) {
                if (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime()) {
                  const { applyPlanTransition } = await import("../entitlements")
                  const selectedMemberIds = pending.selectedMemberIds.length
                    ? pending.selectedMemberIds.map(Number)
                    : undefined
                  try {
                    await applyPlanTransition(tx, {
                      workspaceId: wsId,
                      actorId: pending.actorId,
                      targetPlanKey: metaPlanKey as PlanKey,
                      selectedProjectId: pending.selectedProjectId,
                      selectedMemberIds,
                      effectiveAt: now,
                      transitionId,
                    })
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    await tx.auditLog.create({
                      data: { workspaceId: wsId, userId: pending.actorId, action: "Transición de plan no aplicable", entityId: `plan-transition:${transitionId}`, detail: message, timestamp: now },
                    })
                  }
                }
              }
            }
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
            if (sub.status === "past_due" || sub.status === "incomplete") mappedStatus = "PAST_DUE"
            else if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired") mappedStatus = "CANCELED"
            else if (sub.status === "trialing") mappedStatus = "TRIAL"

            const priceId = sub.items.data[0]?.price?.id ?? target.stripePriceId
            const mappedPlanKey = planKeyFromPriceId(priceId)
            const rawSub = sub as unknown as { current_period_end?: number; schedule?: string | { id: string } | null }
            const currentPeriodEnd = rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : target.currentPeriodEnd
            const stripeScheduleId = typeof rawSub.schedule === "string" ? rawSub.schedule : (rawSub.schedule?.id ?? target.stripeScheduleId)

            await tx.workspace.update({
              where: { id: target.id },
              data: {
                billingStatus: mappedStatus,
                planKey: mappedPlanKey ?? target.planKey,
                stripeSubscriptionId: sub.id,
                stripeCustomerId: cusId ?? target.stripeCustomerId,
                stripePriceId: priceId,
                stripeScheduleId: stripeScheduleId ?? null,
                currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
              },
            })

            // Check if there is a pending transition whose effectiveAt has arrived
            const transitionId = sub.metadata?.transitionId
            const pending = transitionId
              ? await tx.planTransition.findUnique({ where: { id: transitionId } })
              : await tx.planTransition.findFirst({ where: { workspaceId: target.id, status: "PENDING" }, orderBy: { createdAt: "desc" } })

            if (pending && pending.status === "PENDING" && pending.workspaceId === target.id) {
              const effectivePlan = mappedPlanKey ?? target.planKey
              if (pending.targetPlanKey === effectivePlan && (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime())) {
                const { applyPlanTransition } = await import("../entitlements")
                try {
                  await applyPlanTransition(tx, {
                    workspaceId: target.id,
                    actorId: pending.actorId,
                    targetPlanKey: pending.targetPlanKey as PlanKey,
                    selectedProjectId: pending.selectedProjectId,
                    selectedMemberIds: pending.selectedMemberIds.length ? pending.selectedMemberIds.map(Number) : undefined,
                    effectiveAt: now,
                    transitionId: pending.id,
                  })
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error)
                  await tx.auditLog.create({
                    data: { workspaceId: target.id, userId: pending.actorId, action: "Transición de plan no aplicable", entityId: `plan-transition:${pending.id}`, detail: message, timestamp: now },
                  })
                }
              }
            }
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
          // Invoice events are deliberately non-authoritative for entitlement.
          // Stripe can deliver them out of order, so only subscription
          // created/updated/deleted or an explicit reconcile may restore ACTIVE.
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
        stripeScheduleId: ws.stripeScheduleId,
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
        stripeScheduleId: ws.stripeScheduleId,
      }
    }

    if (ws.stripeSubscriptionId) {
      const sub = await this.stripe.subscriptions.retrieve(ws.stripeSubscriptionId)
      let mappedStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL" = "ACTIVE"
      if (sub.status === "past_due" || sub.status === "incomplete") mappedStatus = "PAST_DUE"
      else if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired") mappedStatus = "CANCELED"
      else if (sub.status === "trialing") mappedStatus = "TRIAL"

      const priceId = sub.items.data[0]?.price?.id ?? ws.stripePriceId
      const mappedPlanKey = planKeyFromPriceId(priceId)
      const rawSub = sub as unknown as { current_period_end?: number; schedule?: string | { id: string } | null }
      const currentPeriodEnd = rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : ws.currentPeriodEnd
      const stripeScheduleId = typeof rawSub.schedule === "string" ? rawSub.schedule : (rawSub.schedule?.id ?? ws.stripeScheduleId)

      const updated = await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          billingStatus: mappedStatus,
          planKey: mappedPlanKey ?? ws.planKey,
          stripePriceId: priceId,
          stripeScheduleId: stripeScheduleId ?? null,
          currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      })

      // Reconcile pending transitions whose effectiveAt is due
      const now = new Date()
      const pending = await prisma.planTransition.findFirst({
        where: { workspaceId: ws.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      })
      if (pending && (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime()) && (mappedPlanKey ?? ws.planKey) === pending.targetPlanKey) {
        const { applyPlanTransition } = await import("../entitlements")
        await prisma.$transaction(async (tx) => {
          try {
            await applyPlanTransition(tx, {
              workspaceId: ws.id,
              actorId: pending.actorId,
              targetPlanKey: pending.targetPlanKey as PlanKey,
              selectedProjectId: pending.selectedProjectId,
              selectedMemberIds: pending.selectedMemberIds.length ? pending.selectedMemberIds.map(Number) : undefined,
              effectiveAt: now,
              transitionId: pending.id,
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await tx.auditLog.create({
              data: { workspaceId: ws.id, userId: pending.actorId, action: "Transición de plan no aplicable", entityId: `plan-transition:${pending.id}`, detail: message, timestamp: now },
            })
          }
        })
      }

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
        stripeScheduleId: updated.stripeScheduleId,
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
      stripeScheduleId: ws.stripeScheduleId,
    }
  }
}
