-- Soporte de hasta 5 imágenes por activo (AssetImage).
-- Migra cualquier imagen existente en Asset y elimina las columnas singulares.

CREATE TABLE "AssetImage" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetImage_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AssetImage" ("assetId", "storageKey", "mimeType", "sizeBytes", "sortOrder")
SELECT "id", "imageStorageKey", "imageMimeType", "imageSizeBytes", 0
FROM "Asset"
WHERE "imageStorageKey" IS NOT NULL AND "imageMimeType" IS NOT NULL AND "imageSizeBytes" IS NOT NULL;

CREATE UNIQUE INDEX "AssetImage_storageKey_key" ON "AssetImage"("storageKey");
CREATE INDEX "AssetImage_assetId_sortOrder_idx" ON "AssetImage"("assetId", "sortOrder");
CREATE INDEX "AssetImage_assetId_createdAt_idx" ON "AssetImage"("assetId", "createdAt");

ALTER TABLE "AssetImage" ADD CONSTRAINT "AssetImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset" DROP COLUMN IF EXISTS "imageStorageKey";
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "imageMimeType";
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "imageSizeBytes";
