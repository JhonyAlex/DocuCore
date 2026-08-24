-- Forward-only migration: Add distributed lease fields for checkout claim in PlanTransition
ALTER TABLE "PlanTransition"
  ADD COLUMN IF NOT EXISTS "checkoutClaimToken" TEXT,
  ADD COLUMN IF NOT EXISTS "checkoutClaimExpiresAt" TIMESTAMP(3);
