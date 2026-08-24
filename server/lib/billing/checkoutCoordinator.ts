import { randomBytes } from "crypto"
import type { PrismaClient } from "@prisma/client"
import prisma from "../prisma"
import type { PlanKey } from "../entitlements"
import type { BillingProvider, RetrievedCheckoutSession } from "./types"

export const CHECKOUT_LEASE_TTL_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 5_000

export function isStripeNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const err = error as Record<string, unknown>
  return (
    err.statusCode === 404 ||
    err.status === 404 ||
    err.code === "resource_missing" ||
    (typeof err.message === "string" && err.message.includes("No such checkout.session"))
  )
}

export function validateSessionOwnership(
  session: RetrievedCheckoutSession,
  workspaceId: number,
  transitionId: string,
): boolean {
  return (
    session.metadata?.workspaceId === String(workspaceId) &&
    session.metadata?.transitionId === transitionId
  )
}

export interface ExecuteCheckoutParams {
  workspaceId: number
  actorId: number
  planKey: PlanKey
  transitionId: string
  customerEmail: string
  customerName?: string
  customerId?: string | null
  stripeCustomerId?: string | null
  priceId?: string
  projectLimit?: number
  baseUrl: string
  trialEndTimestamp?: number | null
}

export type ExecuteCheckoutResult =
  | {
      nextAction: "REDIRECT_TO_CHECKOUT"
      checkoutUrl: string
      sessionId: string
      reused: boolean
      status: "CHECKOUT_CREATED" | "CHECKOUT_REUSED" | "CHECKOUT_ALREADY_CREATED"
      message?: string
    }
  | {
      nextAction: "REFRESH_BILLING"
      checkoutUrl: null
      sessionId: string
      reused: boolean
      status: "CHECKOUT_ALREADY_COMPLETED"
      message?: string
    }

export interface CheckoutCoordinatorOptions {
  leaseTtlMs?: number
  heartbeatIntervalMs?: number
  pollIntervalMs?: number
  maxPollAttempts?: number
}

export class CheckoutCoordinator {
  private readonly leaseTtlMs: number
  private readonly heartbeatIntervalMs: number
  private readonly pollIntervalMs: number
  private readonly maxPollAttempts: number

  constructor(
    private billingProvider: BillingProvider,
    private prismaClient: PrismaClient = prisma,
    options?: CheckoutCoordinatorOptions,
  ) {
    this.leaseTtlMs = options?.leaseTtlMs ?? CHECKOUT_LEASE_TTL_MS
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
    this.pollIntervalMs = options?.pollIntervalMs ?? 200
    this.maxPollAttempts = options?.maxPollAttempts ?? 25
  }

  async executeCheckout(params: ExecuteCheckoutParams): Promise<ExecuteCheckoutResult> {
    const transitionRecord = await this.prismaClient.planTransition.findUnique({
      where: { id: params.transitionId },
    })
    if (
      !transitionRecord ||
      transitionRecord.workspaceId !== params.workspaceId ||
      transitionRecord.status !== "PENDING" ||
      transitionRecord.targetPlanKey !== params.planKey
    ) {
      throw Object.assign(new Error("La transición de plan indicada no es válida para esta cuenta."), {
        status: 409,
        code: "INVALID_TRANSITION",
      })
    }

    // 1. If stripeSessionId is already saved on PlanTransition, recover and validate it strictly
    if (transitionRecord.stripeSessionId) {
      try {
        const recoveredSession = await this.billingProvider.retrieveCheckoutSession(transitionRecord.stripeSessionId)
        const hasValidOwnership = validateSessionOwnership(recoveredSession, params.workspaceId, params.transitionId)

        if (!hasValidOwnership) {
          throw Object.assign(new Error("La sesión de checkout existente no coincide con este workspace o transición."), {
            status: 409,
            code: "CHECKOUT_SESSION_CONFLICT",
          })
        }

        if (recoveredSession.status === "open") {
          if (!recoveredSession.url) {
            throw Object.assign(new Error("La sesión de pago no dispone de una URL válida."), {
              status: 502,
              code: "INVALID_CHECKOUT_SESSION_URL",
            })
          }
          return {
            nextAction: "REDIRECT_TO_CHECKOUT",
            checkoutUrl: recoveredSession.url,
            sessionId: recoveredSession.id,
            reused: true,
            status: "CHECKOUT_REUSED",
          }
        }
        if (recoveredSession.status === "complete") {
          return {
            nextAction: "REFRESH_BILLING",
            checkoutUrl: null,
            sessionId: recoveredSession.id,
            reused: true,
            status: "CHECKOUT_ALREADY_COMPLETED",
            message: "Esta sesión de pago ya ha sido completada.",
          }
        }
        if (recoveredSession.status === "expired") {
          await this.prismaClient.planTransition.updateMany({
            where: {
              id: params.transitionId,
              stripeSessionId: transitionRecord.stripeSessionId,
              status: "PENDING",
            },
            data: { stripeSessionId: null },
          })
        } else {
          // Status is null, undefined, or unknown: fail-closed, DO NOT clear binding, throw error
          throw Object.assign(new Error(`La sesión de pago tiene un estado no reconocido (${recoveredSession.status}).`), {
            status: 502,
            code: "CHECKOUT_SESSION_INVALID_STATUS",
          })
        }
      } catch (error: unknown) {
        if (error && typeof error === "object" && ((error as { code?: string }).code === "CHECKOUT_SESSION_CONFLICT" || (error as { code?: string }).code === "CHECKOUT_SESSION_INVALID_STATUS")) {
          throw error
        }
        if (isStripeNotFoundError(error)) {
          await this.prismaClient.planTransition.updateMany({
            where: {
              id: params.transitionId,
              stripeSessionId: transitionRecord.stripeSessionId,
              status: "PENDING",
            },
            data: { stripeSessionId: null },
          })
        } else {
          // Timeout, 500, or network error: propagate and preserve binding
          throw error
        }
      }
    }

    // 2. Distributed lease acquisition in PostgreSQL using compare-and-set
    const ownerToken = randomBytes(16).toString("hex")
    const now = new Date()
    const leaseExpiresAt = new Date(now.getTime() + this.leaseTtlMs)

    let acquired = false
    const updateResult = await this.prismaClient.planTransition.updateMany({
      where: {
        id: params.transitionId,
        workspaceId: params.workspaceId,
        status: "PENDING",
        targetPlanKey: params.planKey,
        stripeSessionId: null,
        OR: [
          { checkoutClaimExpiresAt: null },
          { checkoutClaimExpiresAt: { lte: now } },
        ],
      },
      data: {
        checkoutClaimToken: ownerToken,
        checkoutClaimExpiresAt: leaseExpiresAt,
      },
    })

    if (updateResult.count === 1) {
      acquired = true
    } else {
      // Another replica holds an active lease. Wait for the other replica to complete.
      for (let i = 0; i < this.maxPollAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs))
        const current = await this.prismaClient.planTransition.findUnique({ where: { id: params.transitionId } })
        if (current?.stripeSessionId) {
          try {
            const recovered = await this.billingProvider.retrieveCheckoutSession(current.stripeSessionId)
            const hasValidOwnership = validateSessionOwnership(recovered, params.workspaceId, params.transitionId)
            if (!hasValidOwnership) {
              throw Object.assign(new Error("La sesión de checkout de otra réplica no coincide con la transición."), {
                status: 409,
                code: "CHECKOUT_SESSION_CONFLICT",
              })
            }

            if (recovered.status === "open") {
              if (!recovered.url) {
                throw Object.assign(new Error("La sesión de pago recuperada no dispone de una URL válida."), {
                  status: 502,
                  code: "INVALID_CHECKOUT_SESSION_URL",
                })
              }
              return {
                nextAction: "REDIRECT_TO_CHECKOUT",
                checkoutUrl: recovered.url,
                sessionId: recovered.id,
                reused: true,
                status: "CHECKOUT_ALREADY_CREATED",
              }
            }
            if (recovered.status === "complete") {
              return {
                nextAction: "REFRESH_BILLING",
                checkoutUrl: null,
                sessionId: recovered.id,
                reused: true,
                status: "CHECKOUT_ALREADY_COMPLETED",
                message: "Esta sesión de pago ya ha sido completada.",
              }
            }
            if (recovered.status === "expired") {
              await this.prismaClient.planTransition.updateMany({
                where: {
                  id: params.transitionId,
                  stripeSessionId: current.stripeSessionId,
                  status: "PENDING",
                },
                data: { stripeSessionId: null },
              })
            } else {
              // Status is null, undefined, or unknown: fail-closed, DO NOT clear binding, throw error
              throw Object.assign(new Error(`La sesión de pago tiene un estado no reconocido (${recovered.status}).`), {
                status: 502,
                code: "CHECKOUT_SESSION_INVALID_STATUS",
              })
            }
          } catch (error: unknown) {
            if (error && typeof error === "object" && ((error as { code?: string }).code === "CHECKOUT_SESSION_CONFLICT" || (error as { code?: string }).code === "CHECKOUT_SESSION_INVALID_STATUS")) {
              throw error
            }
            if (isStripeNotFoundError(error)) {
              await this.prismaClient.planTransition.updateMany({
                where: {
                  id: params.transitionId,
                  stripeSessionId: current.stripeSessionId,
                  status: "PENDING",
                },
                data: { stripeSessionId: null },
              })
            } else {
              // Timeout / 500: propagate
              throw error
            }
          }
        }

        const reNow = new Date()
        if (current && (!current.checkoutClaimExpiresAt || current.checkoutClaimExpiresAt <= reNow) && !current.stripeSessionId) {
          const reAcquire = await this.prismaClient.planTransition.updateMany({
            where: {
              id: params.transitionId,
              workspaceId: params.workspaceId,
              status: "PENDING",
              targetPlanKey: params.planKey,
              stripeSessionId: null,
              OR: [
                { checkoutClaimExpiresAt: null },
                { checkoutClaimExpiresAt: { lte: reNow } },
              ],
            },
            data: {
              checkoutClaimToken: ownerToken,
              checkoutClaimExpiresAt: new Date(reNow.getTime() + this.leaseTtlMs),
            },
          })
          if (reAcquire.count === 1) {
            acquired = true
            break
          }
        }
      }
    }

    if (!acquired) {
      throw Object.assign(new Error("La sesión de pago está siendo generada por otra réplica. Inténtalo de nuevo."), {
        status: 409,
        code: "CHECKOUT_IN_PROGRESS",
      })
    }

    // 3. Perform external Stripe call with background heartbeat lease renewal
    let heartbeatTimer: NodeJS.Timeout | null = null

    try {
      heartbeatTimer = setInterval(async () => {
        try {
          await this.prismaClient.planTransition.updateMany({
            where: {
              id: params.transitionId,
              checkoutClaimToken: ownerToken,
              status: "PENDING",
            },
            data: {
              checkoutClaimExpiresAt: new Date(Date.now() + this.leaseTtlMs),
            },
          })
        } catch {
          // Ignore heartbeat query errors
        }
      }, this.heartbeatIntervalMs)

      const session = await this.billingProvider.createInitialSubscriptionCheckout({
        workspaceId: params.workspaceId,
        customerEmail: params.customerEmail,
        customerName: params.customerName,
        customerId: params.customerId,
        stripeCustomerId: params.stripeCustomerId,
        planKey: params.planKey,
        priceId: params.priceId,
        projectLimit: params.projectLimit,
        successUrl: `${params.baseUrl}/account?checkout=success`,
        cancelUrl: `${params.baseUrl}/account?checkout=cancel`,
        trialEndTimestamp: params.trialEndTimestamp,
        transitionId: params.transitionId,
      })

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      // Compare-and-set: Persist stripeSessionId ONLY IF this replica still owns the claim token!
      const persistResult = await this.prismaClient.planTransition.updateMany({
        where: {
          id: params.transitionId,
          checkoutClaimToken: ownerToken,
          status: "PENDING",
        },
        data: {
          stripeSessionId: session.sessionId,
          checkoutClaimToken: null,
          checkoutClaimExpiresAt: null,
        },
      })

      if (persistResult.count === 0) {
        // Lost the claim! Do not return session.checkoutUrl as CHECKOUT_CREATED
        const current = await this.prismaClient.planTransition.findUnique({ where: { id: params.transitionId } })
        if (current?.stripeSessionId) {
          try {
            const recovered = await this.billingProvider.retrieveCheckoutSession(current.stripeSessionId)
            const hasValidOwnership = validateSessionOwnership(recovered, params.workspaceId, params.transitionId)
            if (hasValidOwnership && recovered.status === "open" && recovered.url) {
              return {
                nextAction: "REDIRECT_TO_CHECKOUT",
                checkoutUrl: recovered.url,
                sessionId: recovered.id,
                reused: true,
                status: "CHECKOUT_ALREADY_CREATED",
              }
            }
          } catch {
            // fall through
          }
        }
        throw Object.assign(new Error("El lease de checkout se perdió durante la operación. Inténtalo de nuevo."), {
          status: 409,
          code: "CLAIM_LOST",
        })
      }

      return {
        nextAction: "REDIRECT_TO_CHECKOUT",
        checkoutUrl: session.checkoutUrl,
        sessionId: session.sessionId,
        reused: false,
        status: "CHECKOUT_CREATED",
      }
    } catch (error) {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      // Release lease ONLY IF this replica still owns the claim token
      await this.prismaClient.planTransition.updateMany({
        where: {
          id: params.transitionId,
          checkoutClaimToken: ownerToken,
        },
        data: {
          checkoutClaimToken: null,
          checkoutClaimExpiresAt: null,
        },
      }).catch(() => {})
      throw error
    }
  }
}
