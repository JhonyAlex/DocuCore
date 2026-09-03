import Stripe from "stripe"
import { createHash } from "crypto"
import prisma from "../prisma"
import { planKeyFromPriceId, type PlanKey } from "../entitlements"
import { getStripePriceIdForPlan } from "../plans"
import { isStripeNotFoundError } from "./checkoutCoordinator"
import type {
  BillingProvider,
  ChangePlanResult,
  ChangeSubscriptionPlanParams,
  CustomerPortalParams,
  InitialCheckoutParams,
  ReconcileResult,
  RetrievedCheckoutSession,
  WebhookEventResult,
} from "./types"

const DOCUCORE_SCHEDULE_MANAGER = "docucore"

type RawSubscription = Stripe.Subscription & {
  current_period_end?: number
  schedule?: string | { id: string } | null
}

export function getStableTransitionSuffix(transitionId: string): string {
  const hash = createHash("sha256").update(transitionId).digest()
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  let suffix = ""
  for (let i = 0; i < 8; i++) {
    suffix += alphabet[hash[i] % alphabet.length]
  }
  return suffix
}

/**
 * Central fail-closed predicate for PlanTransition eligibility.
 * Only subscriptions in 'active' or 'trialing' status without pending_update
 * and with matching target plan price can apply a PlanTransition.
 */
export function isSubscriptionEligibleForPlanTransition(
  subscription: Stripe.Subscription | {
    status?: string
    pending_update?: unknown
    items?: { data?: Array<{ price?: { id?: string } }> }
  } | null | undefined,
  targetPlanKey: PlanKey,
): boolean {
  if (!subscription) return false
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return false
  }
  if (subscription.pending_update) {
    return false
  }
  const targetPriceId = getStripePriceIdForPlan(targetPlanKey)
  if (!targetPriceId) {
    return false
  }
  const priceId = subscription.items?.data?.[0]?.price?.id
  if (!priceId) {
    return false
  }
  return priceId === targetPriceId
}

/**
 * Requirement 4: Centralized fail-closed Stripe subscription status to BillingStatus mapper.
 * Only 'active' and 'trialing' can grant active access.
 * 'paused' and any unknown or null status must fail-closed as 'PAST_DUE', never 'ACTIVE'.
 */
export function mapStripeSubscriptionStatusToBillingStatus(
  status: string | undefined | null,
  isTrialActive: boolean = false,
): "ACTIVE" | "TRIAL" | "PAST_DUE" | "CANCELED" {
  if (!status) return "PAST_DUE"
  switch (status) {
    case "active":
      return isTrialActive ? "TRIAL" : "ACTIVE"
    case "trialing":
      return "TRIAL"
    case "past_due":
    case "incomplete":
    case "paused":
      return "PAST_DUE"
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "CANCELED"
    default:
      return "PAST_DUE"
  }
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

function isScheduleExact(
  schedule: Stripe.SubscriptionSchedule,
  proPriceId: string,
  targetPriceId: string,
  periodEndUnix: number,
  workspaceId: number,
  transitionId: string,
): boolean {
  if (schedule.phases?.length !== 2) return false
  if (schedule.end_behavior !== "release") return false

  if (
    schedule.metadata?.managedBy !== DOCUCORE_SCHEDULE_MANAGER ||
    schedule.metadata?.workspaceId !== String(workspaceId) ||
    schedule.metadata?.transitionId !== transitionId ||
    schedule.metadata?.planKey !== "STARTER"
  ) {
    return false
  }

  const phase0 = schedule.phases[0]
  const phase1 = schedule.phases[1]

  if (!phase0 || phase0.end_date !== periodEndUnix) return false
  if (!phase0.items || phase0.items.length !== 1) return false
  const p0Item = phase0.items[0]
  const p0Price = typeof p0Item.price === "string" ? p0Item.price : p0Item.price?.id
  if (p0Price !== proPriceId || (p0Item.quantity ?? 1) !== 1) return false

  if (!phase1 || phase1.start_date !== periodEndUnix) return false
  if (phase1.proration_behavior !== "none") return false
  if (!phase1.items || phase1.items.length !== 1) return false
  const p1Item = phase1.items[0]
  const p1Price = typeof p1Item.price === "string" ? p1Item.price : p1Item.price?.id
  if (p1Price !== targetPriceId || (p1Item.quantity ?? 1) !== 1) return false

  if (
    phase1.metadata?.managedBy !== DOCUCORE_SCHEDULE_MANAGER ||
    phase1.metadata?.workspaceId !== String(workspaceId) ||
    phase1.metadata?.transitionId !== transitionId ||
    phase1.metadata?.planKey !== "STARTER"
  ) {
    return false
  }

  return true
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

    const customerId = params.customerId || params.stripeCustomerId
    const stableSuffix = getStableTransitionSuffix(params.transitionId)

    const sessionParams = {
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: String(params.workspaceId),
      integration_identifier: `docucore_${stableSuffix}`,
      metadata: {
        workspaceId: String(params.workspaceId),
        planKey: params.planKey ?? "",
        projectLimit: String(params.projectLimit ?? ""),
        integration_identifier: `docucore_${stableSuffix}`,
        ...(params.transitionId ? { transitionId: params.transitionId } : {}),
      },
      subscription_data: {
        metadata: {
          workspaceId: String(params.workspaceId),
          planKey: params.planKey ?? "",
          projectLimit: String(params.projectLimit ?? ""),
          integration_identifier: `docucore_${stableSuffix}`,
          ...(params.transitionId ? { transitionId: params.transitionId } : {}),
        },
        ...(params.trialEndTimestamp && params.trialEndTimestamp > Math.floor(Date.now() / 1000)
          ? { trial_end: params.trialEndTimestamp }
          : {}),
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      ...(customerId ? { customer: customerId } : { customer_email: params.customerEmail }),
    } as unknown as Stripe.Checkout.SessionCreateParams

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

  async retrieveCheckoutSession(sessionId: string): Promise<RetrievedCheckoutSession> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId)
    return {
      id: session.id,
      url: session.url,
      status: session.status ?? null,
      metadata: (session.metadata as Record<string, string> | undefined) ?? {},
      expiresAt: session.expires_at ?? null,
    }
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

    const sub = await this.retrieveSubscriptionOrFailClosed(ws.stripeSubscriptionId)

    // B1: la suscripción está en un estado final que no puede reactivarse.
    // No se intenta modificarla: se libera el vínculo local obsoleto de forma
    // auditable para permitir una nueva contratación por el flujo inicial.
    if (sub.status === "canceled" || sub.status === "incomplete_expired") {
      const actorId = await this.resolveTransitionActor(params)
      await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          stripeSubscriptionId: null,
          stripeScheduleId: null,
          billingStatus: "CANCELED",
          cancelAtPeriodEnd: false,
        },
      })
      if (actorId !== null) {
        await prisma.auditLog.create({
          data: {
            workspaceId: ws.id,
            userId: actorId,
            action: "Vínculo de suscripción obsoleto liberado",
            entityId: `subscription:${sub.id}`,
            detail: JSON.stringify({ status: sub.status, motivo: "estado final; se permite nueva contratación" }),
            timestamp: new Date(),
          },
        })
      }
      return {
        success: false,
        planKey: (ws.planKey as PlanKey) ?? "STARTER",
        effectiveAt: null,
        status: sub.status,
        stripeSubscriptionId: ws.stripeSubscriptionId,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: null,
        code: "SUBSCRIPTION_TERMINATED",
        message: "La suscripción anterior está en estado final y el vínculo local se ha liberado; puedes iniciar una nueva contratación.",
      }
    }

    const itemId = sub.items.data[0]?.id
    if (!itemId) {
      throw Object.assign(new Error("No se encontró el ítem de suscripción en Stripe."), { status: 500 })
    }

    const isUpgrade = params.targetPlanKey === "PRO"

    if (isUpgrade) {
      const rawSchedule = (sub as RawSubscription).schedule
      if (rawSchedule) {
        const scheduleId = typeof rawSchedule === "string" ? rawSchedule : rawSchedule.id
        const schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId)
        if (isDocuCoreSchedule(schedule, ws.id)) {
          await this.stripe.subscriptionSchedules.release(scheduleId)
          // B3: al liberar nuestro schedule, la transición PENDING que estaba
          // vinculada a él ya no puede ejecutarse nunca; se cancela solo esa
          // transición (ownership por schedule.metadata), nunca otras PENDING.
          const linkedTransitionId = schedule.metadata?.transitionId
          if (linkedTransitionId) {
            const zombie = await prisma.planTransition.findFirst({
              where: { id: linkedTransitionId, workspaceId: ws.id, status: "PENDING" },
            })
            if (zombie) {
              await prisma.planTransition.update({
                where: { id: zombie.id },
                data: { status: "CANCELED" },
              })
              await prisma.auditLog.create({
                data: {
                  workspaceId: ws.id,
                  userId: zombie.actorId,
                  action: "Transición de plan cancelada (schedule liberado)",
                  entityId: `plan-transition:${zombie.id}`,
                  detail: JSON.stringify({ scheduleId, motivo: "schedule Report Map Online liberado por cambio a Pro" }),
                  timestamp: new Date(),
                },
              })
            }
          }
        } else {
          throw scheduleConflict("La suscripción ya tiene una programación Stripe no gestionada por Report Map Online.")
        }
      }

      const updatedSub = await this.stripe.subscriptions.update(
        ws.stripeSubscriptionId,
        {
          items: [{ id: itemId, price: targetPriceId }],
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
          metadata: {
            workspaceId: String(params.workspaceId),
            planKey: "PRO",
            transitionId: params.transitionId,
          },
        },
        {
          idempotencyKey: `docucore_upgrade_${params.transitionId}`,
        },
      )

      const isEligible = isSubscriptionEligibleForPlanTransition(updatedSub, "PRO")

      if (isEligible) {
        const now = new Date()
        await prisma.workspace.update({
          where: { id: ws.id },
          data: {
            billingStatus: "ACTIVE",
            planKey: "PRO",
            stripePriceId: targetPriceId,
            stripeScheduleId: null,
          },
        })

        const { applyPlanTransition } = await import("../entitlements")
        const pending = await prisma.planTransition.findUnique({ where: { id: params.transitionId } })
        if (pending && pending.status === "PENDING" && pending.workspaceId === ws.id) {
          const selectedMemberIds = pending.selectedMemberIds.length ? pending.selectedMemberIds.map(Number) : undefined
          await applyPlanTransition(prisma, {
            workspaceId: ws.id,
            actorId: pending.actorId,
            targetPlanKey: "PRO",
            selectedProjectId: pending.selectedProjectId,
            selectedMemberIds,
            effectiveAt: now,
            transitionId: params.transitionId,
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
      }

      return {
        success: false,
        planKey: (ws.planKey as PlanKey) ?? "STARTER",
        effectiveAt: null,
        status: updatedSub.status,
        stripeSubscriptionId: updatedSub.id,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: null,
        message: "La actualización al plan Pro no pudo completarse porque la suscripción no cumple las condiciones exactas de pago o precio.",
      }
    } else {
      const rawSchedule = (sub as RawSubscription).schedule
      let schedule: Stripe.SubscriptionSchedule
      let scheduleId: string

      if (rawSchedule) {
        scheduleId = typeof rawSchedule === "string" ? rawSchedule : rawSchedule.id
        schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId)
        if (schedule.status === "released" || schedule.status === "canceled") {
          schedule = await this.stripe.subscriptionSchedules.create(
            {
              from_subscription: ws.stripeSubscriptionId,
              metadata: {
                managedBy: DOCUCORE_SCHEDULE_MANAGER,
                workspaceId: String(params.workspaceId),
                transitionId: params.transitionId,
              },
            },
            {
              idempotencyKey: `docucore_schedule_create_${params.transitionId}`,
            },
          )
          scheduleId = schedule.id
        } else {
          if (!isDocuCoreSchedule(schedule, ws.id)) {
            throw scheduleConflict("La suscripción ya tiene una programación Stripe no gestionada por DocuCore.")
          }
          if (!scheduleTransitionMatches(schedule, params.transitionId)) {
            throw scheduleConflict("La programación Report Map Online existente pertenece a otra transición y requiere resolución explícita.")
          }
        }
      } else {
        schedule = await this.stripe.subscriptionSchedules.create(
          {
            from_subscription: ws.stripeSubscriptionId,
            metadata: {
              managedBy: DOCUCORE_SCHEDULE_MANAGER,
              workspaceId: String(params.workspaceId),
              transitionId: params.transitionId,
            },
          },
          {
            idempotencyKey: `docucore_schedule_create_${params.transitionId}`,
          },
        )
        scheduleId = schedule.id
      }

      const rawSub = sub as RawSubscription
      const periodEndUnix = typeof rawSub.current_period_end === "number"
        ? rawSub.current_period_end
        : (schedule.phases[0]?.end_date ?? Math.floor(Date.now() / 1000) + 30 * 86400)
      const periodEndDate = new Date(periodEndUnix * 1000)
      const proPriceId = ws.stripePriceId || getStripePriceIdForPlan("PRO")!

      const isExact = isScheduleExact(schedule, proPriceId, targetPriceId, periodEndUnix, ws.id, params.transitionId)

      if (!isExact) {
        const phase0 = schedule.phases?.[0]
        schedule = await this.stripe.subscriptionSchedules.update(
          scheduleId,
          {
            end_behavior: "release",
            proration_behavior: "none",
            phases: [
              currentPhaseUpdate(
                phase0,
                proPriceId,
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
          },
          {
            idempotencyKey: `docucore_schedule_update_${params.transitionId}`,
          },
        )
      }

      // Always check and repair subscription metadata on partial retries
      const isSubMetadataSynced = Boolean(
        sub.metadata?.scheduledPlanKey === "STARTER" &&
        sub.metadata?.stripeScheduleId === scheduleId &&
        sub.metadata?.transitionId === params.transitionId,
      )

      if (!isSubMetadataSynced) {
        await this.stripe.subscriptions.update(
          ws.stripeSubscriptionId,
          {
            metadata: {
              workspaceId: String(params.workspaceId),
              scheduledPlanKey: "STARTER",
              stripeScheduleId: scheduleId,
              transitionId: params.transitionId,
            },
          },
          {
            idempotencyKey: `docucore_sub_meta_${params.transitionId}`,
          },
        )
      }

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
        message: "El cambio al plan Starter ya está programado para el final del período actual.",
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

  async handleWebhook(rawBody: string | Buffer, signature?: string): Promise<WebhookEventResult> {
    if (!this.webhookSecret) {
      throw Object.assign(new Error("Stripe webhook secret is not configured"), { status: 500 })
    }
    if (!signature) {
      throw Object.assign(new Error("Missing Stripe signature header"), { status: 400 })
    }

    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Webhook signature verification failed"
      throw Object.assign(new Error(`Webhook signature verification failed: ${message}`), { status: 400 })
    }

    const existing = await prisma.processedWebhookEvent.findUnique({ where: { id: event.id } })
    if (existing) {
      return { handled: true, eventType: event.type, eventId: event.id, message: "Duplicate event ignored" }
    }

    const obj = event.data.object as unknown as Record<string, unknown>
    const metadata = (obj.metadata as Record<string, string> | undefined) ?? {}
    const workspaceId = metadata.workspaceId ? Number(metadata.workspaceId) : undefined

    let authoritativeSub: Stripe.Subscription | null = null
    if (event.type.startsWith("customer.subscription.")) {
      const eventSub = event.data.object as Stripe.Subscription
      if (eventSub?.id) {
        try {
          authoritativeSub = await this.stripe.subscriptions.retrieve(eventSub.id)
        } catch (err: unknown) {
          const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : null
          const is404 = errObj !== null && (errObj.statusCode === 404 || errObj.code === "resource_missing" || errObj.status === 404)
          if (event.type === "customer.subscription.deleted" && is404) {
            authoritativeSub = null
          } else {
            throw err
          }
        }
      }
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id
      if (subId) {
        authoritativeSub = await this.stripe.subscriptions.retrieve(subId)
      }
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice
      const rawInvoice = invoice as unknown as { subscription?: string | { id: string } | null }
      const subId = typeof rawInvoice.subscription === "string" ? rawInvoice.subscription : rawInvoice.subscription?.id
      if (subId) {
        authoritativeSub = await this.stripe.subscriptions.retrieve(subId)
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: { id: event.id, provider: "stripe" },
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

              const isTrialActive = Boolean(target.billingStatus === "TRIAL" && target.trialEndsAt && target.trialEndsAt.getTime() > now.getTime())
              const mappedBillingStatus = mapStripeSubscriptionStatusToBillingStatus(authoritativeSub?.status, isTrialActive)

              const isSubEligible = Boolean(
                metaPlanKey && authoritativeSub && isSubscriptionEligibleForPlanTransition(authoritativeSub, metaPlanKey as PlanKey),
              )

              const shouldApplyPlanKey = isSubEligible && metaPlanKey

              await tx.workspace.update({
                where: { id: wsId },
                data: {
                  billingStatus: mappedBillingStatus,
                  ...(shouldApplyPlanKey ? { planKey: metaPlanKey } : {}),
                  stripeCustomerId: cusId ?? null,
                  stripeSubscriptionId: subId ?? null,
                },
              })

              if (transitionId && metaPlanKey && isSubEligible) {
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
            const sub = authoritativeSub ?? (event.data.object as Stripe.Subscription)
            const cusId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
            const wsId = sub.metadata?.workspaceId ? Number(sub.metadata.workspaceId) : undefined

            const target = wsId
              ? await tx.workspace.findUnique({ where: { id: wsId } })
              : cusId
                ? await tx.workspace.findUnique({ where: { stripeCustomerId: cusId } })
                : await tx.workspace.findUnique({ where: { stripeSubscriptionId: sub.id } })

            if (target && target.billingSource !== "MANUAL") {
              const isTrialActive = Boolean(target.billingStatus === "TRIAL" && target.trialEndsAt && target.trialEndsAt.getTime() > now.getTime())
              const mappedStatus = mapStripeSubscriptionStatusToBillingStatus(sub.status, isTrialActive)

              const rawSub = sub as unknown as { current_period_end?: number; schedule?: string | { id: string } | null; pending_update?: unknown }
              const hasPendingUpdate = Boolean(rawSub.pending_update)
              const priceId = sub.items.data[0]?.price?.id ?? target.stripePriceId
              const mappedPlanKey = hasPendingUpdate ? target.planKey : planKeyFromPriceId(priceId)
              const currentPeriodEnd = rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : target.currentPeriodEnd
              const stripeScheduleId = typeof rawSub.schedule === "string" ? rawSub.schedule : (rawSub.schedule?.id ?? target.stripeScheduleId)

              await tx.workspace.update({
                where: { id: target.id },
                data: {
                  billingStatus: mappedStatus,
                  planKey: mappedPlanKey ?? target.planKey,
                  stripeSubscriptionId: sub.id,
                  stripeCustomerId: cusId ?? target.stripeCustomerId,
                  stripePriceId: hasPendingUpdate ? target.stripePriceId : priceId,
                  stripeScheduleId: stripeScheduleId ?? null,
                  currentPeriodEnd,
                  cancelAtPeriodEnd: sub.cancel_at_period_end,
                },
              })

              const transitionId = sub.metadata?.transitionId
              const pending = transitionId
                ? await tx.planTransition.findUnique({ where: { id: transitionId } })
                : await tx.planTransition.findFirst({ where: { workspaceId: target.id, status: "PENDING" }, orderBy: { createdAt: "desc" } })

              if (pending && pending.status === "PENDING" && pending.workspaceId === target.id) {
                const isEligible = isSubscriptionEligibleForPlanTransition(sub, pending.targetPlanKey as PlanKey)
                if (isEligible && (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime())) {
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
            const sub = authoritativeSub ?? (event.data.object as Stripe.Subscription)
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
            const rawInvoice = invoice as unknown as { subscription?: string | { id: string } | null }
            const subId = typeof rawInvoice.subscription === "string" ? rawInvoice.subscription : rawInvoice.subscription?.id

            if (!subId) {
              break
            }

            const cusId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
            if (!cusId) {
              break
            }

            if (authoritativeSub && (authoritativeSub.status === "active" || authoritativeSub.status === "trialing")) {
              break
            }

            const target = await tx.workspace.findFirst({
              where: {
                stripeSubscriptionId: subId,
                stripeCustomerId: cusId,
                billingSource: "STRIPE",
              },
            })
            if (target) {
              await tx.workspace.update({
                where: { id: target.id },
                data: {
                  billingStatus: "PAST_DUE",
                },
              })
            }
            break
          }

          case "invoice.payment_succeeded": {
            break
          }
        }
      })
    } catch (err: unknown) {
      const isUniqueConstraint = typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002"
      if (isUniqueConstraint) {
        return { handled: true, eventType: event.type, eventId: event.id, message: "Duplicate event ignored" }
      }
      throw err
    }

    return { handled: true, eventType: event.type, eventId: event.id, workspaceId }
  }

  /** Retrieve a subscription, translating a 404 into a controlled fail-closed
   *  error: the local link is never cleared nor replaced automatically, because
   *  a 404 may mean account/key/mode misconfiguration instead of cancellation. */
  private async retrieveSubscriptionOrFailClosed(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(stripeSubscriptionId)
    } catch (err: unknown) {
      if (isStripeNotFoundError(err)) {
        throw Object.assign(new Error("La suscripción Stripe vinculada a esta cuenta no existe o no es accesible con la configuración actual (posible mezcla de cuenta o de modo test/live). El vínculo se conserva para diagnóstico; revisa la configuración de Stripe o contacta con soporte."), { status: 409, code: "STRIPE_SUBSCRIPTION_NOT_FOUND" })
      }
      throw err
    }
  }

  private async resolveTransitionActor(params: ChangeSubscriptionPlanParams): Promise<number | null> {
    if (params.actorId) return params.actorId
    const transition = await prisma.planTransition.findUnique({ where: { id: params.transitionId } })
    return transition?.actorId ?? null
  }

  async reconcileWorkspace(workspaceId: number, actorId?: number): Promise<ReconcileResult> {
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
      let sub: Stripe.Subscription
      try {
        sub = await this.stripe.subscriptions.retrieve(ws.stripeSubscriptionId)
      } catch (err: unknown) {
        if (isStripeNotFoundError(err)) {
          // B2: Stripe no puede confirmar la suscripción (vínculo inconsistente,
          // cuenta/modo incorrecto o webhook perdido). Fail-closed: acceso
          // bloqueado, identificador conservado para diagnóstico/reparación,
          // nunca una nueva suscripción automática ni un 500 genérico.
          const updated = await prisma.workspace.update({
            where: { id: ws.id },
            data: { billingStatus: "PAST_DUE" },
          })
          if (actorId) {
            await prisma.auditLog.create({
              data: {
                workspaceId: ws.id,
                userId: actorId,
                action: "Reconciliación: suscripción Stripe no encontrada",
                entityId: `subscription:${ws.stripeSubscriptionId}`,
                detail: "retrieve devolvió 404; acceso bloqueado y vínculo conservado para diagnóstico",
                timestamp: new Date(),
              },
            })
          }
          return {
            workspaceId: ws.id,
            billingStatus: updated.billingStatus,
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
        throw err
      }
      const isTrialActive = Boolean(ws.billingStatus === "TRIAL" && ws.trialEndsAt && ws.trialEndsAt.getTime() > Date.now())
      const mappedStatus = mapStripeSubscriptionStatusToBillingStatus(sub.status, isTrialActive)

      const rawSub = sub as unknown as { current_period_end?: number; schedule?: string | { id: string } | null; pending_update?: unknown }
      const hasPendingUpdate = Boolean(rawSub.pending_update)
      const priceId = sub.items.data[0]?.price?.id ?? ws.stripePriceId
      const mappedPlanKey = hasPendingUpdate ? ws.planKey : planKeyFromPriceId(priceId)
      const currentPeriodEnd = rawSub.current_period_end ? new Date(rawSub.current_period_end * 1000) : ws.currentPeriodEnd
      const stripeScheduleId = typeof rawSub.schedule === "string" ? rawSub.schedule : (rawSub.schedule?.id ?? ws.stripeScheduleId)

      const updated = await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          billingStatus: mappedStatus,
          planKey: mappedPlanKey ?? ws.planKey,
          stripePriceId: hasPendingUpdate ? ws.stripePriceId : priceId,
          stripeScheduleId: stripeScheduleId ?? null,
          currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      })

      const now = new Date()
      const pending = await prisma.planTransition.findFirst({
        where: { workspaceId: ws.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      })
      const isEligible = pending ? isSubscriptionEligibleForPlanTransition(sub, pending.targetPlanKey as PlanKey) : false
      if (pending && (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime()) && isEligible) {
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
        workspaceId: ws.id,
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
