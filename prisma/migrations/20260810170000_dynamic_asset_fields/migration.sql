-- CFG-DYN-01: los modelos preliminares estaban sin uso en el entorno pre-release
-- (0 definiciones y 0 activos con JSON dinámico). Se reemplazan por relaciones
-- tipadas, estables y configurables por proyecto.
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'TEXTAREA';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'MULTISELECT';

DROP TABLE "DynamicFieldDefinition";
ALTER TABLE "Asset" DROP COLUMN "dynamicFields";

CREATE TABLE "DynamicFieldDefinition" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "description" TEXT,
    "groupName" TEXT NOT NULL DEFAULT 'General',
    "fieldType" "FieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "unit" TEXT,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "decimalPlaces" INTEGER,
    "defaultValue" JSONB,
    "periodicity" TEXT,
    "periodicityMode" TEXT,
    "eventTitle" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DynamicFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DynamicFieldDefinitionAssetType" (
    "definitionId" INTEGER NOT NULL,
    "assetTypeId" INTEGER NOT NULL,
    CONSTRAINT "DynamicFieldDefinitionAssetType_pkey" PRIMARY KEY ("definitionId", "assetTypeId")
);

CREATE TABLE "DynamicFieldOption" (
    "id" SERIAL NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DynamicFieldOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetDynamicFieldValue" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "dateValue" DATE,
    "booleanValue" BOOLEAN,
    "jsonValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetDynamicFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DynamicFieldDefinition_projectId_key_key" ON "DynamicFieldDefinition"("projectId", "key");
CREATE INDEX "DynamicFieldDefinition_projectId_isActive_sortOrder_idx" ON "DynamicFieldDefinition"("projectId", "isActive", "sortOrder");
CREATE INDEX "DynamicFieldDefinitionAssetType_assetTypeId_idx" ON "DynamicFieldDefinitionAssetType"("assetTypeId");
CREATE UNIQUE INDEX "DynamicFieldOption_definitionId_key_key" ON "DynamicFieldOption"("definitionId", "key");
CREATE INDEX "DynamicFieldOption_definitionId_sortOrder_idx" ON "DynamicFieldOption"("definitionId", "sortOrder");
CREATE UNIQUE INDEX "AssetDynamicFieldValue_assetId_definitionId_key" ON "AssetDynamicFieldValue"("assetId", "definitionId");
CREATE INDEX "AssetDynamicFieldValue_definitionId_idx" ON "AssetDynamicFieldValue"("definitionId");
CREATE INDEX "AssetDynamicFieldValue_dateValue_idx" ON "AssetDynamicFieldValue"("dateValue");

ALTER TABLE "DynamicFieldDefinition" ADD CONSTRAINT "DynamicFieldDefinition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DynamicFieldDefinitionAssetType" ADD CONSTRAINT "DynamicFieldDefinitionAssetType_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DynamicFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DynamicFieldDefinitionAssetType" ADD CONSTRAINT "DynamicFieldDefinitionAssetType_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DynamicFieldOption" ADD CONSTRAINT "DynamicFieldOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DynamicFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetDynamicFieldValue" ADD CONSTRAINT "AssetDynamicFieldValue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetDynamicFieldValue" ADD CONSTRAINT "AssetDynamicFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DynamicFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
