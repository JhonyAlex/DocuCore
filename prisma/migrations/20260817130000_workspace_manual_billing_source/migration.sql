-- Preserve all existing billing records as Stripe-managed while allowing an
-- explicit platform-admin manual entitlement. No existing subscription data is
-- modified or removed by this migration.
CREATE TYPE "BillingSource" AS ENUM ('STRIPE', 'MANUAL');

ALTER TABLE "Workspace"
ADD COLUMN "billingSource" "BillingSource" NOT NULL DEFAULT 'STRIPE';
