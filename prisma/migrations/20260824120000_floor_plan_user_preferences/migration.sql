-- Personal, non-business presentation preferences. Existing users receive the
-- enabled default without a backfill: an absent row is interpreted as true.
CREATE TABLE "FloorPlanUserPreference" (
    "id" SERIAL NOT NULL,
    "floorPlanId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "backgroundDimmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlanUserPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FloorPlanUserPreference_floorPlanId_userId_key"
  ON "FloorPlanUserPreference"("floorPlanId", "userId");
CREATE INDEX "FloorPlanUserPreference_userId_updatedAt_idx"
  ON "FloorPlanUserPreference"("userId", "updatedAt");

ALTER TABLE "FloorPlanUserPreference"
  ADD CONSTRAINT "FloorPlanUserPreference_floorPlanId_fkey"
  FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanUserPreference"
  ADD CONSTRAINT "FloorPlanUserPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
