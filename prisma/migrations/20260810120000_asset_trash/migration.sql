-- ITEM-05: papelera de activos. deletedAt != null indica activo eliminado
-- (recuperable hasta 30 días; la purga lo borra físicamente).
ALTER TABLE "Asset" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);
CREATE INDEX "Asset_deletedAt_idx" ON "Asset"("deletedAt");
