-- CFG-STATUS-01: los estados dejan de ser globales y pasan a pertenecer al
-- proyecto. DocuCore sigue en pre-release: los estados existentes se asignan al
-- primer proyecto, y se añaden color, sortOrder, isActive y updatedAt.
DROP INDEX IF EXISTS "Status_name_key";

ALTER TABLE "Status"
  ADD COLUMN "projectId" INTEGER,
  ADD COLUMN "color" TEXT NOT NULL DEFAULT 'emerald',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Status"
SET "projectId" = (SELECT "id" FROM "Project" ORDER BY "id" ASC LIMIT 1),
    "sortOrder" = "id" - 1,
    "color" = CASE
      WHEN "name" = 'Activo' THEN 'emerald'
      WHEN "name" = 'En revisión' THEN 'amber'
      WHEN "name" = 'Fuera de servicio' THEN 'red'
      WHEN "name" = 'Vencido' THEN 'red'
      WHEN "name" = 'Alerta' THEN 'amber'
      ELSE 'emerald'
    END;

ALTER TABLE "Status" ALTER COLUMN "projectId" SET NOT NULL;

CREATE UNIQUE INDEX "Status_projectId_name_key" ON "Status"("projectId", "name");
CREATE INDEX "Status_projectId_isActive_sortOrder_idx" ON "Status"("projectId", "isActive", "sortOrder");

ALTER TABLE "Status" ADD CONSTRAINT "Status_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
