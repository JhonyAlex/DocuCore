-- HIST-01: AuditLog associated with Project with performance indexes for global/filtered history
ALTER TABLE "AuditLog" ADD COLUMN "projectId" INTEGER;

-- Migrate existing rows to default project (PRJ-2026-001 = id 1) if any
UPDATE "AuditLog" SET "projectId" = 1 WHERE "projectId" IS NULL;

-- Add foreign key constraint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Performance indexes
CREATE INDEX "AuditLog_projectId_timestamp_desc_idx" ON "AuditLog"("projectId", "timestamp" DESC);
CREATE INDEX "AuditLog_projectId_userId_idx" ON "AuditLog"("projectId", "userId");
