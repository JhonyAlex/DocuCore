/**
 * Single source of truth for the commercial plan catalog.
 *
 * This module is deliberately pure and dependency-free: it carries only public
 * product metadata (names, prices, and capacity limits) so it can be consumed
 * by the backend, the application frontend, and the public landing page
 * without pulling server code or exposing any Stripe secret or private price
 * id. The backend remains the enforcement authority; price ids and environment
 * lookups live in `server/lib/plans.ts`.
 */

export type PlanKey = 'STARTER' | 'PRO'

export interface PlanDefinition {
  key: PlanKey
  name: string
  monthlyPriceUsd: number
  maxActiveProjects: number
  maxActiveMembers: number
}

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  STARTER: {
    key: 'STARTER',
    name: 'Starter',
    monthlyPriceUsd: 15,
    maxActiveProjects: 1,
    maxActiveMembers: 3,
  },
  PRO: {
    key: 'PRO',
    name: 'Pro',
    monthlyPriceUsd: 39,
    maxActiveProjects: 15,
    maxActiveMembers: 15,
  },
}

export const PLAN_KEYS: readonly PlanKey[] = ['STARTER', 'PRO'] as const

export const TRIAL_DURATION_DAYS = 14
export const TRIAL_MAX_ACTIVE_PROJECTS = 15
export const TRIAL_MAX_ACTIVE_MEMBERS = 15

/** Window during which an OWNER/ADMIN may swap which project stays active after
 *  a downgrade plan-locked the rest. */
export const PLAN_GRACE_DAYS = 30

export function isPlanKey(value: unknown): value is PlanKey {
  return value === 'STARTER' || value === 'PRO'
}

export function planDefinitionFor(value: unknown): PlanDefinition | null {
  return isPlanKey(value) ? PLAN_CATALOG[value] : null
}
