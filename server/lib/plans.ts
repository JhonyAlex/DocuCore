import type { BillingStatus, Prisma } from "@prisma/client"
import prisma from "./prisma"

export type PlanKey = "STARTER" | "PRO"

export interface PlanConfig {
  key: PlanKey
  name: string
  monthlyPriceUsd: number
  maxActiveProjects: number
  envVar: string
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  STARTER: {
    key: "STARTER",
    name: "Starter",
    monthlyPriceUsd: 15,
    maxActiveProjects: 1,
    envVar: "STRIPE_PRICE_STARTER",
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    monthlyPriceUsd: 39,
    maxActiveProjects: 15,
    envVar: "STRIPE_PRICE_PRO",
  },
}

export const TRIAL_MAX_ACTIVE_PROJECTS = 15
export const TRIAL_DURATION_DAYS = 14

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "STARTER" || value === "PRO"
}

export function getStripePriceIdForPlan(planKey: PlanKey): string | null {
  if (planKey === "STARTER") {
    return process.env.STRIPE_PRICE_STARTER || null
  }
  if (planKey === "PRO") {
    return process.env.STRIPE_PRICE_PRO || null
  }
  return null
}

export function getPlanKeyFromPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null
  const starterPrice = process.env.STRIPE_PRICE_STARTER
  const proPrice = process.env.STRIPE_PRICE_PRO

  if (starterPrice && priceId === starterPrice) return "STARTER"
  if (proPrice && priceId === proPrice) return "PRO"

  // Test / fake provider aliases
  if (priceId === "fake_price_starter" || priceId.includes("starter")) return "STARTER"
  if (priceId === "fake_price_pro" || priceId.includes("pro")) return "PRO"

  return null
}

export interface WorkspacePlanInfo {
  planKey: PlanKey | null
  planName: string
  maxActiveProjects: number
  isTrial: boolean
}

export function resolveWorkspacePlan(workspace: {
  billingStatus: BillingStatus
  planKey?: string | null
  stripePriceId?: string | null
  trialEndsAt?: Date | null
  currentPeriodEnd?: Date | null
}): WorkspacePlanInfo {
  if (workspace.billingStatus === "TRIAL") {
    return {
      planKey: null,
      planName: "Prueba gratuita (14 días)",
      maxActiveProjects: TRIAL_MAX_ACTIVE_PROJECTS,
      isTrial: true,
    }
  }

  const explicitPlanKey = workspace.planKey && isPlanKey(workspace.planKey) ? (workspace.planKey as PlanKey) : null
  const derivedPlanKey = explicitPlanKey ?? getPlanKeyFromPriceId(workspace.stripePriceId)

  if (derivedPlanKey === "PRO") {
    return {
      planKey: "PRO",
      planName: PLANS.PRO.name,
      maxActiveProjects: PLANS.PRO.maxActiveProjects,
      isTrial: false,
    }
  }

  if (derivedPlanKey === "STARTER") {
    return {
      planKey: "STARTER",
      planName: PLANS.STARTER.name,
      maxActiveProjects: PLANS.STARTER.maxActiveProjects,
      isTrial: false,
    }
  }

  // Active workspaces without explicit plan default to Pro (15 projects)
  if (workspace.billingStatus === "ACTIVE") {
    return {
      planKey: "PRO",
      planName: PLANS.PRO.name,
      maxActiveProjects: PLANS.PRO.maxActiveProjects,
      isTrial: false,
    }
  }

  return {
    planKey: null,
    planName: "Sin suscripción activa",
    maxActiveProjects: 0,
    isTrial: false,
  }
}

export async function requireProjectCapacity(
  workspaceId: number,
  options?: { actorId?: number; tx?: Prisma.TransactionClient },
): Promise<{ activeCount: number; maxAllowed: number; planName: string }> {
  const client = options?.tx ?? prisma

  if (options?.actorId) {
    const user = await client.user.findUnique({
      where: { id: options.actorId },
      select: { isPlatformAdmin: true },
    })
    if (user?.isPlatformAdmin) {
      return { activeCount: 0, maxAllowed: Infinity, planName: "Platform Admin" }
    }
  }

  const workspace = await client.workspace.findUnique({
    where: { id: workspaceId },
  })
  if (!workspace) {
    throw Object.assign(new Error("Workspace not found"), { status: 404 })
  }

  const activeCount = await client.project.count({
    where: {
      workspaceId,
      status: "ACTIVE",
    },
  })

  const planInfo = resolveWorkspacePlan(workspace)

  if (activeCount >= planInfo.maxActiveProjects) {
    const err = Object.assign(
      new Error(
        `Has alcanzado el límite de ${planInfo.maxActiveProjects} proyecto(s) activo(s) para tu plan (${planInfo.planName}). Para activar o crear un nuevo proyecto, archiva alguno de tus proyectos existentes o actualiza tu plan en la sección de facturación.`,
      ),
      {
        status: 409,
        code: "PROJECT_LIMIT_EXCEEDED",
        activeCount,
        maxAllowed: planInfo.maxActiveProjects,
        planKey: planInfo.planKey,
        planName: planInfo.planName,
      },
    )
    throw err
  }

  return {
    activeCount,
    maxAllowed: planInfo.maxActiveProjects,
    planName: planInfo.planName,
  }
}
