-- Expand/contract (forward-only) migration: per-workspace member seat limits.
-- No existing data is modified or removed.
--
-- 1. WorkspaceMember gains a third status, PLAN_LOCKED, which is distinct from
--    SUSPENDED: a plan-locked member was active but fell outside the plan's
--    seat limit after a downgrade. It keeps identity, role and all project
--    memberships, does not access the workspace and does not consume a seat,
--    and can be reactivated when capacity exists. SUSPENDED is a manual,
--    administrative suspension that must NOT be auto-reactivated by an upgrade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = '"WorkspaceMemberStatus"'::regtype::oid
      AND enumlabel = 'PLAN_LOCKED'
  ) THEN
    ALTER TYPE "WorkspaceMemberStatus" ADD VALUE 'PLAN_LOCKED';
  END IF;
END $$;

-- 2. PlanTransition records which members were chosen to keep (and which were
--    plan-locked) during a downgrade, so the decision is auditable and the
--    transition is idempotent.
ALTER TABLE "PlanTransition"
ADD COLUMN IF NOT EXISTS "selectedMemberIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PlanTransition"
ADD COLUMN IF NOT EXISTS "planLockedMemberIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
