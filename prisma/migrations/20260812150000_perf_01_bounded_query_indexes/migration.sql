-- PERF-01: indexes match bounded list, hierarchy and range queries. Trigram
-- indexes make the explicit ILIKE search contract scale without changing API
-- semantics.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Asset_projectId_deletedAt_id_idx" ON "Asset"("projectId", "deletedAt", "id");
CREATE INDEX "Asset_projectId_deletedAt_typeId_statusId_idx" ON "Asset"("projectId", "deletedAt", "typeId", "statusId");
CREATE INDEX "Asset_name_trgm_idx" ON "Asset" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Asset_code_trgm_idx" ON "Asset" USING GIN ("code" gin_trgm_ops);
CREATE INDEX "Asset_serialNumber_trgm_idx" ON "Asset" USING GIN ("serialNumber" gin_trgm_ops);

CREATE INDEX "Document_projectId_updatedAt_id_idx" ON "Document"("projectId", "updatedAt" DESC, "id");
CREATE INDEX "Document_name_trgm_idx" ON "Document" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "DocumentVersion_documentId_version_desc_idx" ON "DocumentVersion"("documentId", "version" DESC);

CREATE INDEX "Event_projectId_date_idx" ON "Event"("projectId", "date");
CREATE INDEX "Location_projectId_parentId_idx" ON "Location"("projectId", "parentId");
CREATE INDEX "AssetDateOccurrence_scheduledDate_idx" ON "AssetDateOccurrence"("scheduledDate");
CREATE INDEX "PreventiveExecution_scheduledDate_completedAt_idx" ON "PreventiveExecution"("scheduledDate", "completedAt");
