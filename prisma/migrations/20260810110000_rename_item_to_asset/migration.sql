-- Renombrado ítem → activo (ITEM-06): la tabla, sus índices y constraints
-- propias se renombran automáticamente con RENAME TABLE en PostgreSQL; los
-- índices de columna se renombran con RENAME COLUMN. Los datos se conservan.
ALTER TABLE "Item" RENAME TO "Asset";
ALTER TABLE "ItemType" RENAME TO "AssetType";

ALTER TABLE "DocumentItem" RENAME COLUMN "itemId" TO "assetId";
ALTER TABLE "Event" RENAME COLUMN "itemId" TO "assetId";
ALTER TABLE "FloorPlanMarker" RENAME COLUMN "itemId" TO "assetId";
ALTER TABLE "DynamicFieldDefinition" RENAME COLUMN "itemTypeId" TO "assetTypeId";
