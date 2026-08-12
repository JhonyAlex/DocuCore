-- PLAN-01: la maqueta de un único plano por ubicación se sustituye por planos
-- versionados con almacenamiento gestionado y marcadores normalizados.
-- DocuCore sigue en pre-release: los antiguos pines mock se descartan.

DROP TABLE "FloorPlanMarker";

-- No se conserva el plano mock que apuntaba a una URL externa. Las versiones
-- reales solo referenciarán claves de almacenamiento gestionadas.
TRUNCATE TABLE "FloorPlan";

DROP INDEX "FloorPlan_locationId_key";

ALTER TABLE "FloorPlan"
  DROP COLUMN "imageUrl",
  DROP COLUMN "version",
  DROP COLUMN "uploadedAt",
  ADD COLUMN "projectId" INTEGER NOT NULL,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "FloorPlanVersion" (
  "id" SERIAL NOT NULL,
  "floorPlanId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "dziKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FloorPlanVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FloorPlanMarker" (
  "id" SERIAL NOT NULL,
  "floorPlanId" INTEGER NOT NULL,
  "assetId" INTEGER NOT NULL,
  "x" DOUBLE PRECISION NOT NULL,
  "y" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FloorPlanMarker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FloorPlan_locationId_name_key" ON "FloorPlan"("locationId", "name");
CREATE INDEX "FloorPlan_projectId_locationId_idx" ON "FloorPlan"("projectId", "locationId");
CREATE UNIQUE INDEX "FloorPlanVersion_storageKey_key" ON "FloorPlanVersion"("storageKey");
CREATE UNIQUE INDEX "FloorPlanVersion_dziKey_key" ON "FloorPlanVersion"("dziKey");
CREATE UNIQUE INDEX "FloorPlanVersion_floorPlanId_version_key" ON "FloorPlanVersion"("floorPlanId", "version");
CREATE INDEX "FloorPlanVersion_floorPlanId_uploadedAt_idx" ON "FloorPlanVersion"("floorPlanId", "uploadedAt");
CREATE UNIQUE INDEX "FloorPlanMarker_floorPlanId_assetId_key" ON "FloorPlanMarker"("floorPlanId", "assetId");
CREATE INDEX "FloorPlanMarker_floorPlanId_idx" ON "FloorPlanMarker"("floorPlanId");
CREATE INDEX "FloorPlanMarker_assetId_idx" ON "FloorPlanMarker"("assetId");

ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanVersion" ADD CONSTRAINT "FloorPlanVersion_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanMarker" ADD CONSTRAINT "FloorPlanMarker_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FloorPlanMarker" ADD CONSTRAINT "FloorPlanMarker_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
