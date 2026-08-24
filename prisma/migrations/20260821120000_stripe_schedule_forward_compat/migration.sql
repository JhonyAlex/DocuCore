-- Forward-only compatibility migration for fields introduced after abc16af.
-- It preserves all existing data and is safe after the four published plan/workspace
-- migrations. It intentionally does not rewrite their history or checksums.

-- A partially converged local database can already have the enum but lack this value.
-- Do not rely on CREATE TYPE duplicate_object: explicitly converge the enum value.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'WorkspaceMemberStatus'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'WorkspaceMemberStatus'
      AND enum_value.enumlabel = 'PLAN_LOCKED'
  ) THEN
    ALTER TYPE "WorkspaceMemberStatus" ADD VALUE 'PLAN_LOCKED';
  END IF;
END $$;

-- Stripe Subscription Schedule ownership is persisted separately from the subscription.
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "stripeScheduleId" TEXT;

-- PlanTransition carries the same schedule binding and allows a no-project transition.
ALTER TABLE "PlanTransition"
  ADD COLUMN IF NOT EXISTS "stripeScheduleId" TEXT;

ALTER TABLE "PlanTransition"
  ALTER COLUMN "selectedProjectId" DROP NOT NULL;
