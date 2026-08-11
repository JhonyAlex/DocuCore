-- Preventives are standalone (decoupled from dynamic fields): the plan template
-- owns the recurrence and the task checklist, and the asset assignment references
-- the template. Existing date values preserve their old recurrence by becoming
-- schedules with a first pending occurrence.
CREATE TABLE "Task" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Task_projectId_code_key" ON "Task"("projectId", "code");
CREATE INDEX "Task_projectId_isActive_idx" ON "Task"("projectId", "isActive");
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PreventivePlan" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "periodicity" TEXT NOT NULL,
  "periodicityMode" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreventivePlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PreventivePlan_projectId_isActive_idx" ON "PreventivePlan"("projectId", "isActive");
ALTER TABLE "PreventivePlan" ADD CONSTRAINT "PreventivePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PreventivePlanTask" ("planId" INTEGER NOT NULL, "taskId" INTEGER NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "PreventivePlanTask_pkey" PRIMARY KEY ("planId", "taskId"));
CREATE INDEX "PreventivePlanTask_taskId_idx" ON "PreventivePlanTask"("taskId");
ALTER TABLE "PreventivePlanTask" ADD CONSTRAINT "PreventivePlanTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PreventivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreventivePlanTask" ADD CONSTRAINT "PreventivePlanTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PreventivePlanAssetType" ("planId" INTEGER NOT NULL, "assetTypeId" INTEGER NOT NULL, CONSTRAINT "PreventivePlanAssetType_pkey" PRIMARY KEY ("planId", "assetTypeId"));
CREATE INDEX "PreventivePlanAssetType_assetTypeId_idx" ON "PreventivePlanAssetType"("assetTypeId");
ALTER TABLE "PreventivePlanAssetType" ADD CONSTRAINT "PreventivePlanAssetType_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PreventivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreventivePlanAssetType" ADD CONSTRAINT "PreventivePlanAssetType_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetDateSchedule" ("id" SERIAL NOT NULL, "assetId" INTEGER NOT NULL, "definitionId" INTEGER NOT NULL, "periodicity" TEXT, "periodicityMode" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AssetDateSchedule_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AssetDateSchedule_assetId_definitionId_key" ON "AssetDateSchedule"("assetId", "definitionId");
CREATE INDEX "AssetDateSchedule_definitionId_idx" ON "AssetDateSchedule"("definitionId");
ALTER TABLE "AssetDateSchedule" ADD CONSTRAINT "AssetDateSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetDateSchedule" ADD CONSTRAINT "AssetDateSchedule_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DynamicFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetDateSchedule" ADD CONSTRAINT "AssetDateSchedule_assetId_definitionId_fkey" FOREIGN KEY ("assetId", "definitionId") REFERENCES "AssetDynamicFieldValue"("assetId", "definitionId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetDateOccurrence" ("id" SERIAL NOT NULL, "scheduleId" INTEGER NOT NULL, "scheduledDate" DATE NOT NULL, "completedAt" TIMESTAMP(3), "completedDate" DATE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AssetDateOccurrence_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AssetDateOccurrence_scheduleId_completedAt_scheduledDate_idx" ON "AssetDateOccurrence"("scheduleId", "completedAt", "scheduledDate");
ALTER TABLE "AssetDateOccurrence" ADD CONSTRAINT "AssetDateOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AssetDateSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetPreventivePlan" ("id" SERIAL NOT NULL, "assetId" INTEGER NOT NULL, "planId" INTEGER, "name" TEXT NOT NULL, "periodicity" TEXT NOT NULL, "periodicityMode" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AssetPreventivePlan_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AssetPreventivePlan_assetId_isActive_idx" ON "AssetPreventivePlan"("assetId", "isActive");
CREATE INDEX "AssetPreventivePlan_planId_idx" ON "AssetPreventivePlan"("planId");
ALTER TABLE "AssetPreventivePlan" ADD CONSTRAINT "AssetPreventivePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetPreventivePlan" ADD CONSTRAINT "AssetPreventivePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PreventivePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PreventiveExecution" ("id" SERIAL NOT NULL, "planId" INTEGER NOT NULL, "scheduledDate" DATE NOT NULL, "completedAt" TIMESTAMP(3), "completedDate" DATE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PreventiveExecution_pkey" PRIMARY KEY ("id"));
CREATE INDEX "PreventiveExecution_planId_completedAt_scheduledDate_idx" ON "PreventiveExecution"("planId", "completedAt", "scheduledDate");
ALTER TABLE "PreventiveExecution" ADD CONSTRAINT "PreventiveExecution_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AssetPreventivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "PreventiveExecutionTask" ("id" SERIAL NOT NULL, "executionId" INTEGER NOT NULL, "taskId" INTEGER, "code" TEXT NOT NULL, "name" VARCHAR(100) NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, "completedAt" TIMESTAMP(3), CONSTRAINT "PreventiveExecutionTask_pkey" PRIMARY KEY ("id"));
CREATE INDEX "PreventiveExecutionTask_executionId_sortOrder_idx" ON "PreventiveExecutionTask"("executionId", "sortOrder");
ALTER TABLE "PreventiveExecutionTask" ADD CONSTRAINT "PreventiveExecutionTask_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "PreventiveExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssetEventAcknowledgement" ("id" SERIAL NOT NULL, "assetId" INTEGER NOT NULL, "sourceKey" TEXT NOT NULL, "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedDate" DATE NOT NULL, CONSTRAINT "AssetEventAcknowledgement_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AssetEventAcknowledgement_assetId_sourceKey_key" ON "AssetEventAcknowledgement"("assetId", "sourceKey");
CREATE INDEX "AssetEventAcknowledgement_assetId_completedAt_idx" ON "AssetEventAcknowledgement"("assetId", "completedAt");
ALTER TABLE "AssetEventAcknowledgement" ADD CONSTRAINT "AssetEventAcknowledgement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AssetDateSchedule" ("assetId", "definitionId", "periodicity", "periodicityMode", "updatedAt")
SELECT v."assetId", v."definitionId", d."periodicity", d."periodicityMode", CURRENT_TIMESTAMP
FROM "AssetDynamicFieldValue" v JOIN "DynamicFieldDefinition" d ON d."id" = v."definitionId"
WHERE d."fieldType" = 'DATE' AND v."dateValue" IS NOT NULL;
INSERT INTO "AssetDateOccurrence" ("scheduleId", "scheduledDate")
SELECT s."id", v."dateValue"::date FROM "AssetDateSchedule" s JOIN "AssetDynamicFieldValue" v ON v."assetId"=s."assetId" AND v."definitionId"=s."definitionId";

ALTER TABLE "DynamicFieldDefinition" DROP COLUMN "periodicity", DROP COLUMN "periodicityMode", DROP COLUMN "eventTitle";
