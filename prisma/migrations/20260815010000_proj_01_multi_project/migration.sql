-- PROJ-01: project is the data boundary. Legacy presentation counters are
-- removed (they are now calculated by the project list DTO), appearance moves
-- to a closed theme catalog, and identity uniqueness becomes tenant-scoped.

CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

ALTER TABLE "Project"
  ADD COLUMN "themeKey" TEXT NOT NULL DEFAULT 'blue';

UPDATE "Project"
SET "themeKey" = CASE "gradient"
  WHEN 'from-brand-500 to-violet-600' THEN 'blue'
  WHEN 'from-emerald-500 to-teal-600' THEN 'emerald'
  WHEN 'from-amber-500 to-orange-600' THEN 'amber'
  WHEN 'from-rose-500 to-pink-600' THEN 'rose'
  WHEN 'from-slate-500 to-slate-700' THEN 'slate'
  ELSE 'blue'
END;

ALTER TABLE "Project"
  DROP COLUMN "gradient",
  DROP COLUMN "assetCount",
  DROP COLUMN "userCount",
  DROP COLUMN "locationCount",
  DROP COLUMN "docCount";

UPDATE "ProjectMember"
SET "role" = CASE
  WHEN lower("role") IN ('owner', 'propietario', 'administradora', 'administrador') THEN 'OWNER'
  WHEN lower("role") IN ('admin', 'administradora del proyecto') THEN 'ADMIN'
  WHEN lower("role") IN ('viewer', 'lector', 'lectora') THEN 'VIEWER'
  ELSE 'EDITOR'
END;

ALTER TABLE "ProjectMember"
  ALTER COLUMN "role" TYPE "ProjectRole" USING "role"::"ProjectRole";

DROP INDEX IF EXISTS "Asset_code_key";
DROP INDEX IF EXISTS "Asset_serialNumber_key";
DROP INDEX IF EXISTS "Location_code_key";

CREATE UNIQUE INDEX "Asset_projectId_code_key" ON "Asset"("projectId", "code");
CREATE UNIQUE INDEX "Asset_projectId_serialNumber_key" ON "Asset"("projectId", "serialNumber");
CREATE UNIQUE INDEX "Location_projectId_code_key" ON "Location"("projectId", "code");
CREATE INDEX "Project_status_updatedAt_id_idx" ON "Project"("status", "updatedAt", "id");
