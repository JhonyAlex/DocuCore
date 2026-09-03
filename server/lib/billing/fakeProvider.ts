import prisma from "../prisma"
import { planKeyFromPriceId, type PlanKey } from "../entitlements"
import { mapStripeSubscriptionStatusToBillingStatus, isSubscriptionEligibleForPlanTransition } from "./stripeProvider"
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
  return Object.assign(new Error("La suscripción ya tiene una programación Stripe no gestionada por Report Map Online."), { status: 409, code: "STRIPE_SCHEDULE_CONFLICT" })
}

export class FakeBillingProvider implements BillingProvider {
  private schedules = new Map<string, FakeSchedule>()
  private sessions = new Map<string, { id: string; url: string; status: string; metadata: Record<string, string> }>()

  async createInitialSubscriptionCheckout(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    if (!params.transitionId) {
      throw Object.assign(new Error("Toda contratación requiere una transición persistida."), { status: 400, code: "TRANSITION_REQUIRED" })
    }
    const plan = params.planKey || "STARTER"
    const sessionId = `fake_cs_${params.transitionId}`
    const checkoutUrl = `https://checkout.stripe.test/c/${sessionId}?plan=${plan}&return_to=${encodeURIComponent(params.successUrl)}`
    this.sessions.set(sessionId, {
      id: sessionId,
      url: checkoutUrl,
      status: "open",
      metadata: {
        workspaceId: String(params.workspaceId),
        transitionId: params.transitionId,
        planKey: params.planKey ?? "STARTER",
      },
    })
    return { checkoutUrl, sessionId }
  }

  async createCheckoutSession(params: InitialCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    return this.createInitialSubscriptionCheckout(params)
  }

  async retrieveCheckoutSession(sessionId: string): Promise<import("./types").RetrievedCheckoutSession> {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      return existing
    }
    const transition = await prisma.planTransition.findFirst({ where: { stripeSessionId: sessionId } })
    if (transition) {
      return {
        id: sessionId,
        url: `https://checkout.stripe.test/c/${sessionId}`,
        status: "open",
        metadata: {
          workspaceId: String(transition.workspaceId),
          transitionId: transition.id,
          planKey: transition.targetPlanKey,
        },
      }
    }
    return {
      id: sessionId,
      url: `https://checkout.stripe.test/c/${sessionId}`,
      status: "open",
      metadata: {},
    }
  }

  async changeExistingSubscriptionPlan(params: ChangeSubscriptionPlanParams): Promise<ChangePlanResult> {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: params.workspaceId } })
    if (!ws.stripeSubscriptionId) {
      throw Object.assign(new Error("El workspace no dispone de una suscripción activa para modificar."), { status: 400 })
    }

    // B1 (simulación del retrieve real): un workspace CANCELED refleja una
    // suscripción en estado final; se libera el vínculo obsoleto de forma
    // auditable y se permite una nueva contratación por el flujo inicial.
    if (ws.billingStatus === "CANCELED") {
      const actorId = params.actorId ?? (await prisma.planTransition.findUnique({ where: { id: params.transitionId } }))?.actorId ?? null
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
            entityId: `subscription:${ws.stripeSubscriptionId}`,
            detail: JSON.stringify({ status: "canceled", motivo: "estado final; se permite nueva contratación" }),
            timestamp: new Date(),
          },
        })
      }
      return {
        success: false,
        planKey: (ws.planKey as PlanKey) ?? "STARTER",
        effectiveAt: null,
        status: "canceled",
        stripeSubscriptionId: ws.stripeSubscriptionId,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: null,
        code: "SUBSCRIPTION_TERMINATED",
        message: "La suscripción anterior está en estado final y el vínculo local se ha liberado; puedes iniciar una nueva contratación.",
      }
    }

    const now = new Date()
    const isUpgrade = params.targetPlanKey === "PRO"
    const existingSchedule = ws.stripeScheduleId ? this.schedules.get(ws.stripeScheduleId) : undefined
    if (ws.stripeScheduleId && (!existingSchedule || existingSchedule.workspaceId !== ws.id)) {
      throw fakeScheduleConflict()
    }

    if (isUpgrade) {
      const targetPriceId = params.targetPriceId ?? (process.env.STRIPE_PRICE_PRO || "fake_price_pro")
      const subSnapshot = {
        status: "active",
        items: { data: [{ price: { id: targetPriceId } }] },
      }
      const isEligible = isSubscriptionEligibleForPlanTransition(subSnapshot, "PRO")
      if (isEligible) {
        if (ws.stripeScheduleId) {
          // B3: al liberar el schedule simulado, la transición PENDING vinculada
          // a él ya no puede ejecutarse; se cancela solo esa transición.
          const zombie = existingSchedule?.transitionId
            ? await prisma.planTransition.findFirst({ where: { id: existingSchedule.transitionId, workspaceId: ws.id, status: "PENDING" } })
            : null
          if (zombie) {
            await prisma.planTransition.update({ where: { id: zombie.id }, data: { status: "CANCELED" } })
            await prisma.auditLog.create({
              data: {
                workspaceId: ws.id,
                userId: zombie.actorId,
                action: "Transición de plan cancelada (schedule liberado)",
                entityId: `plan-transition:${zombie.id}`,
                detail: JSON.stringify({ scheduleId: ws.stripeScheduleId, motivo: "schedule Report Map Online liberado por cambio a Pro" }),
                timestamp: new Date(),
              },
            })
          }
          this.schedules.delete(ws.stripeScheduleId)
        }
        await prisma.workspace.update({
          where: { id: ws.id },
          data: {
            planKey: "PRO",
            stripePriceId: targetPriceId,
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

      return {
        success: false,
        planKey: (ws.planKey as PlanKey) ?? "STARTER",
        effectiveAt: null,
        status: "active",
        stripeSubscriptionId: ws.stripeSubscriptionId,
        stripeCustomerId: ws.stripeCustomerId,
        stripeScheduleId: null,
        message: "La actualización al plan Pro no pudo completarse porque la suscripción no cumple las condiciones exactas de pago o precio.",
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
            const rawPriceId = (obj.priceId as string) || (obj.price as string) || (obj.items as { data?: Array<{ price?: { id?: string } }> })?.data?.[0]?.price?.id
            const metaPlanKey = metadata.planKey === "STARTER" || metadata.planKey === "PRO" ? metadata.planKey : null
            const subStatus = (obj.subscription_status as string) || (obj.status as string) || "active"
            const subSnapshot = {
              status: subStatus,
              pending_update: obj.pending_update,
              items: { data: [{ price: { id: rawPriceId } }] },
            }

            const isTrialActive = targetWorkspace.billingStatus === "TRIAL" && targetWorkspace.trialEndsAt && targetWorkspace.trialEndsAt.getTime() > now.getTime()
            const mappedBillingStatus = isTrialActive ? "TRIAL" : "ACTIVE"
            const shouldApplyPlanKey = metaPlanKey ? isSubscriptionEligibleForPlanTransition(subSnapshot, metaPlanKey) : false

            await tx.workspace.update({
              where: { id: wsId },
              data: {
                billingStatus: mappedBillingStatus,
                ...(shouldApplyPlanKey ? { planKey: metaPlanKey } : {}),
                stripeCustomerId: (obj.customer as string) || `fake_cus_${wsId}`,
                stripeSubscriptionId: (obj.subscription as string) || `fake_sub_${wsId}`,
                stripePriceId: rawPriceId ?? null,
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              },
            })

            // A persisted transition is loaded CANONICALLY from DB (§3).
            // It is applied only if effectiveAt <= now (§2).
            const transitionId = metadata.transitionId
            if (transitionId && metaPlanKey && shouldApplyPlanKey) {
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
                      targetPlanKey: metaPlanKey,
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
          const isTrialActive = Boolean(targetWorkspace.billingStatus === "TRIAL" && targetWorkspace.trialEndsAt && targetWorkspace.trialEndsAt.getTime() > now.getTime())
          const mappedStatus = mapStripeSubscriptionStatusToBillingStatus(status, isTrialActive)

          const subSnapshot = {
            status: status || "active",
            pending_update: obj.pending_update,
            items: { data: [{ price: { id: rawPriceId } }] },
          }

          const metaPlanKey = metadata.planKey === "STARTER" || metadata.planKey === "PRO" ? metadata.planKey : null
          const resolvedPlanKey = (metaPlanKey ?? planKeyFromPriceId(rawPriceId) ?? targetWorkspace.planKey) as PlanKey | null
          const shouldApplyPlanKey = resolvedPlanKey ? isSubscriptionEligibleForPlanTransition(subSnapshot, resolvedPlanKey) : false
          const currentPeriodEnd = currentPeriodEndSec ? new Date(currentPeriodEndSec * 1000) : targetWorkspace.currentPeriodEnd
          const stripeScheduleId = scheduleId ?? targetWorkspace.stripeScheduleId

          await tx.workspace.update({
            where: { id: targetWorkspace.id },
            data: {
              billingStatus: mappedStatus,
              ...(shouldApplyPlanKey ? { planKey: resolvedPlanKey } : {}),
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
            const isEligible = isSubscriptionEligibleForPlanTransition(subSnapshot, pending.targetPlanKey as PlanKey)
            if (isEligible && (!pending.effectiveAt || pending.effectiveAt.getTime() <= now.getTime())) {
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

  async reconcileWorkspace(workspaceId: number, _actorId?: number): Promise<ReconcileResult> {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
    const now = new Date()

    // Reconcile pending transitions whose effectiveAt is due
    const pending = await prisma.planTransition.findFirst({
      where: { workspaceId: ws.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    })
    const subSnapshot = {
      status: ws.billingStatus === "TRIAL" ? "trialing" : ws.billingStatus === "ACTIVE" ? "active" : "past_due",
      items: { data: [{ price: { id: ws.stripePriceId ?? undefined } }] },
    }
    const isEligible = pending ? isSubscriptionEligibleForPlanTransition(subSnapshot, pending.targetPlanKey as PlanKey) : false
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
