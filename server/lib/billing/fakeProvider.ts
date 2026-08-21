import prisma from "../prisma"
import { planKeyFromPriceId, type PlanKey } from "../entitlements"
import type {
  BillingProvider,
  ChangePlanResult,
  ChangeSubscriptionPlanParams,
  CustomerPortalParams,
  InitialCheckoutParams,
  ReconcileResult,
  WebhookEventResult,
} from "./types"

type FakeSchedule = { workspaceId: number; transitionId: string; managedBy: "docucore" }

function fakeScheduleConflict(): Error & { status: number; code: string } {
  return Object.assign(new Error("La suscripción ya tiene una programación Stripe no gestionada por DocuCore."), { status: 409, code: "STRIPE_SCHEDULE_CONFLICT" })
}

export class FakeBillingProvider implements BillingProvider {
  private schedules = new Map<string, FakeSchedule>()

  async createInitialSubscriptionCheckout(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    if (!params.transitionId) {
      throw Object.assign(new Error("Toda contratación requiere una transición persistida."), { status: 400, code: "TRANSITION_REQUIRED" })
    }
    const plan = params.planKey || "STARTER"
    const sessionId = `fake_cs_${params.transitionId}`
    const checkoutUrl = `https://checkout.stripe.test/c/${sessionId}?plan=${plan}&return_to=${encodeURIComponent(params.successUrl)}`
    return { checkoutUrl, sessionId }
  }

  async createCheckoutSession(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    return this.createInitialSubscriptionCheckout(params)
  }

  async changeExistingSubscriptionPlan(params: ChangeSubscriptionPlanParams): Promise<ChangePlanResult> {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: params.workspaceId } })
    if (!ws.stripeSubscriptionId) {
      throw Object.assign(new Error("El workspace no dispone de una suscripción activa para modificar."), { status: 400 })
    }

    const now = new Date()
    const isUpgrade = params.targetPlanKey === "PRO"
    const existingSchedule = ws.stripeScheduleId ? this.schedules.get(ws.stripeScheduleId) : undefined
    if (ws.stripeScheduleId && (!existingSchedule || existingSchedule.workspaceId !== ws.id)) {
      throw fakeScheduleConflict()
    }

    if (isUpgrade) {
      if (ws.stripeScheduleId) this.schedules.delete(ws.stripeScheduleId)
      await prisma.workspace.update({
        where: { id: ws.id },
        data: {
          planKey: "PRO",
          stripePriceId: params.targetPriceId ?? "fake_price_pro",
          stripeScheduleId: null,
        },
      })
      await prisma.planTransition.update({
        where: { id: params.transitionId },
        data: { stripeSessionId: ws.stripeSubscriptionId, stripeScheduleId: null },
      })
      return {
        success: true,
        planKey: "PRO",
        effectiveAt: now,
        status: "active",
        stripeSubscriptionId: ws.stripeSubscriptionId,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: null,
      }
    }

    const effectiveAt = ws.currentPeriodEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    if (existingSchedule) {
      if (existingSchedule.transitionId !== params.transitionId) throw fakeScheduleConflict()
      await prisma.planTransition.update({
        where: { id: params.transitionId },
        data: { stripeSessionId: ws.stripeSubscriptionId, stripeScheduleId: ws.stripeScheduleId, effectiveAt },
      })
      return {
        success: true,
        planKey: "STARTER",
        effectiveAt,
        status: "active",
        stripeSubscriptionId: ws.stripeSubscriptionId,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: ws.stripeScheduleId,
        message: "El cambio al plan Starter ya está programado para el final del período actual.",
      }
    }

    const scheduleId = `fake_sub_sched_${params.transitionId}`
    this.schedules.set(scheduleId, { workspaceId: ws.id, transitionId: params.transitionId, managedBy: "docucore" })
    await prisma.workspace.update({ where: { id: ws.id }, data: { stripeScheduleId: scheduleId } })
    await prisma.planTransition.update({
      where: { id: params.transitionId },
      data: { stripeSessionId: ws.stripeSubscriptionId, stripeScheduleId: scheduleId, effectiveAt },
    })
    return {
      success: true,
      planKey: "STARTER",
      effectiveAt,
      status: "active",
      stripeSubscriptionId: ws.stripeSubscriptionId,
      stripeCustomerId: ws.stripeCustomerId,
      stripeScheduleId: scheduleId,
      message: "El cambio al plan Starter se aplicará al finalizar el período actual.",
    }
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

      const now = new Date()

      if (eventType === "checkout.session.completed") {
        const wsId = workspaceId ?? Number(obj.client_reference_id)
        if (wsId && Number.isInteger(wsId)) {
          const targetWorkspace = await tx.workspace.findUnique({ where: { id: wsId } })
          if (targetWorkspace && targetWorkspace.billingSource !== "MANUAL") {
            const rawPriceId = (obj.priceId as string) || (obj.price as string)
            const metaPlanKey = metadata.planKey === "STARTER" || metadata.planKey === "PRO" ? metadata.planKey : null
            const resolvedPlanKey = metaPlanKey ?? planKeyFromPriceId(rawPriceId) ?? "STARTER"

            // Trial preservation: If the workspace is currently in an active trial (trialEndsAt > now),
            // its billingStatus remains TRIAL so it preserves trial entitlements (15 projects, 15 members)
            // until the trial period ends. Otherwise, status becomes ACTIVE.
            const isTrialActive = targetWorkspace.billingStatus === "TRIAL" && targetWorkspace.trialEndsAt && targetWorkspace.trialEndsAt.getTime() > now.getTime()
            const mappedBillingStatus = isTrialActive ? "TRIAL" : "ACTIVE"

            await tx.workspace.update({
              where: { id: wsId },
              data: {
                billingStatus: mappedBillingStatus,
                planKey: resolvedPlanKey,
                stripeCustomerId: (obj.customer as string) || `fake_cus_${wsId}`,
                stripeSubscriptionId: (obj.subscription as string) || `fake_sub_${wsId}`,
                stripePriceId: rawPriceId ?? null,
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              },
            })

            // A persisted transition is loaded CANONICALLY from DB (§3).
            // It is applied only if effectiveAt <= now (§2).
            const transitionId = metadata.transitionId
            if (transitionId && resolvedPlanKey) {
              const pending = await tx.planTransition.findUnique({ where: { id: transitionId } })
              if (pending && pending.status === "PENDING" && pending.workspaceId === wsId && pending.targetPlanKey === resolvedPlanKey) {
                if (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime()) {
                  const { applyPlanTransition } = await import("../entitlements")
                  const selectedMemberIds = pending.selectedMemberIds.length
                    ? pending.selectedMemberIds.map(Number)
                    : undefined
                  try {
                    await applyPlanTransition(tx, {
                      workspaceId: wsId,
                      actorId: pending.actorId,
                      targetPlanKey: resolvedPlanKey,
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
        }
      } else if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.created") {
        const subId = obj.id as string | undefined
        const customerId = obj.customer as string | undefined
        const status = obj.status as string | undefined
        const currentPeriodEndSec = obj.current_period_end as number | undefined
        const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end)
        const rawPriceId = (obj.priceId as string) || (obj.items as { data?: Array<{ price?: { id?: string } }> })?.data?.[0]?.price?.id
        const scheduleId = (obj.schedule as string) || ((obj.schedule as { id?: string })?.id)

        const targetWorkspace = workspaceId
          ? await tx.workspace.findUnique({ where: { id: workspaceId } })
          : customerId
            ? await tx.workspace.findUnique({ where: { stripeCustomerId: customerId } })
            : subId
              ? await tx.workspace.findUnique({ where: { stripeSubscriptionId: subId } })
              : null

        if (targetWorkspace && targetWorkspace.billingSource !== "MANUAL") {
          let mappedStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIAL" = "ACTIVE"
          if (status === "past_due" || status === "incomplete") mappedStatus = "PAST_DUE"
          else if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") mappedStatus = "CANCELED"
          else if (status === "trialing") mappedStatus = "TRIAL"

          const metaPlanKey = metadata.planKey === "STARTER" || metadata.planKey === "PRO" ? metadata.planKey : null
          const resolvedPlanKey = metaPlanKey ?? planKeyFromPriceId(rawPriceId) ?? targetWorkspace.planKey
          const currentPeriodEnd = currentPeriodEndSec ? new Date(currentPeriodEndSec * 1000) : targetWorkspace.currentPeriodEnd
          const stripeScheduleId = scheduleId ?? targetWorkspace.stripeScheduleId

          await tx.workspace.update({
            where: { id: targetWorkspace.id },
            data: {
              billingStatus: mappedStatus,
              planKey: resolvedPlanKey,
              stripeSubscriptionId: subId ?? targetWorkspace.stripeSubscriptionId,
              stripeCustomerId: customerId ?? targetWorkspace.stripeCustomerId,
              stripePriceId: rawPriceId ?? targetWorkspace.stripePriceId,
              stripeScheduleId: stripeScheduleId ?? null,
              currentPeriodEnd,
              cancelAtPeriodEnd,
            },
          })

          // Check if there is a pending transition whose effectiveAt has arrived
          const transitionId = metadata.transitionId
          const pending = transitionId
            ? await tx.planTransition.findUnique({ where: { id: transitionId } })
            : await tx.planTransition.findFirst({ where: { workspaceId: targetWorkspace.id, status: "PENDING" }, orderBy: { createdAt: "desc" } })

          if (pending && pending.status === "PENDING" && pending.workspaceId === targetWorkspace.id) {
            const effectivePlan = resolvedPlanKey ?? targetWorkspace.planKey
            if (pending.targetPlanKey === effectivePlan && (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime())) {
              const { applyPlanTransition } = await import("../entitlements")
              try {
                await applyPlanTransition(tx, {
                  workspaceId: targetWorkspace.id,
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
                  data: { workspaceId: targetWorkspace.id, userId: pending.actorId, action: "Transición de plan no aplicable", entityId: `plan-transition:${pending.id}`, detail: message, timestamp: now },
                })
              }
            }
          }
        }
      } else if (eventType === "customer.subscription.deleted") {
        const subId = obj.id as string | undefined
        const targetWorkspace = subId ? await tx.workspace.findFirst({ where: { stripeSubscriptionId: subId, billingSource: "STRIPE" } }) : null
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
        const targetWorkspace = customerId ? await tx.workspace.findFirst({ where: { stripeCustomerId: customerId, billingSource: "STRIPE" } }) : null
        if (targetWorkspace) {
          await tx.workspace.update({
            where: { id: targetWorkspace.id },
            data: {
              billingStatus: "PAST_DUE",
            },
          })
        }
      } else if (eventType === "invoice.payment_succeeded") {
        // Keep fake semantics aligned with production: this event alone never
        // restores entitlement because it may arrive after a newer failure.
      }
    })

    return { handled: true, eventType, eventId, workspaceId }
  }

  async reconcileWorkspace(workspaceId: number): Promise<ReconcileResult> {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
    const now = new Date()

    // Reconcile pending transitions whose effectiveAt is due
    const pending = await prisma.planTransition.findFirst({
      where: { workspaceId: ws.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    })
    if (pending && (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime()) && ws.planKey === pending.targetPlanKey) {
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
