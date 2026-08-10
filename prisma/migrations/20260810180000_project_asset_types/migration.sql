-- CFG-TYPE-01: los tipos dejan de ser globales y pasan a pertenecer al
-- proyecto. DocuCore sigue en pre-release: los tipos existentes se asignan al
-- primer proyecto, que es el proyecto operativo actual y el único con activos
-- reales en el seed canónico.
DROP INDEX IF EXISTS "AssetType_name_key";

ALTER TABLE "AssetType"
  ADD COLUMN "projectId" INTEGER,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "AssetType"
SET "projectId" = (SELECT "id" FROM "Project" ORDER BY "id" ASC LIMIT 1),
    "sortOrder" = "id" - 1;

ALTER TABLE "AssetType" ALTER COLUMN "projectId" SET NOT NULL;

CREATE UNIQUE INDEX "AssetType_projectId_name_key" ON "AssetType"("projectId", "name");
CREATE INDEX "AssetType_projectId_isActive_sortOrder_idx" ON "AssetType"("projectId", "isActive", "sortOrder");

ALTER TABLE "AssetType" ADD CONSTRAINT "AssetType_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
