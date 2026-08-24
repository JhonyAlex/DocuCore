import { describe, expect, it } from "vitest"
import {
  computeCompliance,
  PLAN_CATALOG,
  resolveEntitlement,
  type WorkspaceCounts,
  type WorkspaceEntitlementInput,
} from "../../server/lib/entitlements"

function ws(overrides: Partial<WorkspaceEntitlementInput> = {}): WorkspaceEntitlementInput {
  return {
    id: 1,
    billingStatus: "ACTIVE",
    planKey: "STARTER",
    stripePriceId: null,
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    planComplianceStartedAt: null,
    ...overrides,
  }
}

function counts(overrides: Partial<WorkspaceCounts> = {}): WorkspaceCounts {
  return { activeProjects: 0, planLockedProjects: 0, activeMembers: 0, planLockedMembers: 0, suspendedMembers: 0, ...overrides }
}

describe("entitlements domain engine", () => {
  it("resolves Trial / Starter / Pro capacities", () => {
    expect(resolveEntitlement(ws({ billingStatus: "TRIAL", planKey: null })).maxActiveProjects).toBe(15)
    expect(resolveEntitlement(ws({ planKey: "STARTER" })).maxActiveProjects).toBe(1)
    expect(resolveEntitlement(ws({ planKey: "PRO" })).maxActiveProjects).toBe(15)
    expect(PLAN_CATALOG.STARTER.maxActiveProjects).toBe(1)
    expect(PLAN_CATALOG.PRO.maxActiveProjects).toBe(15)
  })

  it("resolves member seat capacities (Starter 3, Pro 15, Trial 15)", () => {
    expect(resolveEntitlement(ws({ planKey: "STARTER" })).maxActiveMembers).toBe(3)
    expect(resolveEntitlement(ws({ planKey: "PRO" })).maxActiveMembers).toBe(15)
    expect(resolveEntitlement(ws({ billingStatus: "TRIAL", planKey: null })).maxActiveMembers).toBe(15)
    expect(PLAN_CATALOG.STARTER.maxActiveMembers).toBe(3)
    expect(PLAN_CATALOG.PRO.maxActiveMembers).toBe(15)
  })

  it("flags a Starter with 4 ACTIVE members as PLAN_ACTION_REQUIRED and blocks invite/activation", () => {
    const snap = computeCompliance(ws({ planKey: "STARTER" }), counts({ activeProjects: 1, activeMembers: 4, planLockedMembers: 5 }))
    expect(snap.membersCompliant).toBe(false)
    expect(snap.complianceStatus).toBe("PLAN_ACTION_REQUIRED")
    expect(snap.canInviteMember).toBe(false)
    expect(snap.canActivateMember).toBe(false)
    expect(snap.canWrite).toBe(false)
    expect(snap.remainingMemberSeats).toBe(0)
  })

  it("only ACTIVE members consume a seat; SUSPENDED and PLAN_LOCKED do not", () => {
    const snap = computeCompliance(
      ws({ planKey: "STARTER" }),
      counts({ activeProjects: 1, activeMembers: 1, planLockedMembers: 4, suspendedMembers: 2 }),
    )
    expect(snap.activeMembersCount).toBe(1)
    expect(snap.planLockedMembersCount).toBe(4)
    expect(snap.suspendedMembersCount).toBe(2)
    expect(snap.remainingMemberSeats).toBe(2)
    expect(snap.membersCompliant).toBe(true)
    expect(snap.canInviteMember).toBe(true)
  })

  it("flags a Starter with two ACTIVE projects as PLAN_ACTION_REQUIRED and blocks writes/creation", () => {
    const snap = computeCompliance(ws({ planKey: "STARTER" }), counts({ activeProjects: 2 }))
    expect(snap.compliant).toBe(false)
    expect(snap.complianceStatus).toBe("PLAN_ACTION_REQUIRED")
    expect(snap.canCreateProject).toBe(false)
    expect(snap.canRestoreProject).toBe(false)
  })

  it("keeps a compliant Starter writable with room for one active project", () => {
    const snap = computeCompliance(ws({ planKey: "STARTER" }), counts({ planLockedProjects: 3 }))
    expect(snap.compliant).toBe(true)
    expect(snap.complianceStatus).toBe("COMPLIANT")
    expect(snap.canCreateProject).toBe(true)
    expect(snap.canWrite).toBe(true)
  })

  it("treats an expired TRIAL as no-plan read-only without destroying projects", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const snap = computeCompliance(
      ws({ billingStatus: "TRIAL", planKey: null, trialEndsAt: past }),
      counts({ activeProjects: 3 }),
    )
    expect(snap.complianceStatus).toBe("NO_PLAN")
    expect(snap.canWrite).toBe(false)
    expect(snap.reason).toBe("TRIAL_EXPIRED")
  })

  it("treats an ACTIVE trial at 15 projects / 15 members as compliant", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const snap = computeCompliance(
      ws({ billingStatus: "TRIAL", planKey: null, trialEndsAt: future }),
      counts({ activeProjects: 15, activeMembers: 15 }),
    )
    expect(snap.complianceStatus).toBe("COMPLIANT")
    expect(snap.projectsCompliant).toBe(true)
    expect(snap.membersCompliant).toBe(true)
    expect(snap.canWrite).toBe(true)
  })

  it("treats an ACTIVE trial with 16 projects as non-compliant (not silently compliant)", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const snap = computeCompliance(
      ws({ billingStatus: "TRIAL", planKey: null, trialEndsAt: future }),
      counts({ activeProjects: 16, activeMembers: 1 }),
    )
    expect(snap.complianceStatus).toBe("PLAN_ACTION_REQUIRED")
    expect(snap.projectsCompliant).toBe(false)
    expect(snap.compliant).toBe(false)
    expect(snap.canCreateProject).toBe(false)
  })

  it("treats an ACTIVE trial with 16 members as non-compliant (not silently compliant)", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const snap = computeCompliance(
      ws({ billingStatus: "TRIAL", planKey: null, trialEndsAt: future }),
      counts({ activeProjects: 1, activeMembers: 16 }),
    )
    expect(snap.complianceStatus).toBe("PLAN_ACTION_REQUIRED")
    expect(snap.membersCompliant).toBe(false)
    expect(snap.compliant).toBe(false)
    expect(snap.canInviteMember).toBe(false)
  })

  it("blocks writes on PAST_DUE and SUSPENDED regardless of plan", () => {
    for (const st of ["PAST_DUE", "SUSPENDED", "PENDING_VERIFICATION"] as const) {
      const snap = computeCompliance(ws({ billingStatus: st }), counts({ activeProjects: 1 }))
      expect(snap.canWrite).toBe(false)
      expect(snap.canCreateProject).toBe(false)
    }
  })

  it("honors cancellation at period end (writes stay allowed until the period ends)", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const snap = computeCompliance(
      ws({ billingStatus: "CANCELED", planKey: "PRO", currentPeriodEnd: future }),
      counts({ activeProjects: 2 }),
    )
    // CANCELED without committed planKey resolves to no explicit plan, but
    // currentPeriodEnd still in the future keeps the contract alive.
    expect(snap.canWrite).toBe(true)
  })
})
