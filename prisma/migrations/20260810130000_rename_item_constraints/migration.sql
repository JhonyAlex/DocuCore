-- ITEM-06: renombrar constraints e índices que conservaban el nombre "Item"
-- tras RENAME TABLE/COLUMN (PostgreSQL no los renombra automáticamente).
ALTER TABLE "Asset" RENAME CONSTRAINT "Item_pkey" TO "Asset_pkey";
ALTER TABLE "AssetType" RENAME CONSTRAINT "ItemType_pkey" TO "AssetType_pkey";

ALTER TABLE "Asset" RENAME CONSTRAINT "Item_locationId_fkey" TO "Asset_locationId_fkey";
ALTER TABLE "Asset" RENAME CONSTRAINT "Item_projectId_fkey" TO "Asset_projectId_fkey";
ALTER TABLE "Asset" RENAME CONSTRAINT "Item_responsibleId_fkey" TO "Asset_responsibleId_fkey";
ALTER TABLE "Asset" RENAME CONSTRAINT "Item_statusId_fkey" TO "Asset_statusId_fkey";
ALTER TABLE "Asset" RENAME CONSTRAINT "Item_typeId_fkey" TO "Asset_typeId_fkey";
ALTER TABLE "DocumentItem" RENAME CONSTRAINT "DocumentItem_itemId_fkey" TO "DocumentItem_assetId_fkey";
ALTER TABLE "DynamicFieldDefinition" RENAME CONSTRAINT "DynamicFieldDefinition_itemTypeId_fkey" TO "DynamicFieldDefinition_assetTypeId_fkey";
ALTER TABLE "Event" RENAME CONSTRAINT "Event_itemId_fkey" TO "Event_assetId_fkey";
ALTER TABLE "FloorPlanMarker" RENAME CONSTRAINT "FloorPlanMarker_itemId_fkey" TO "FloorPlanMarker_assetId_fkey";

ALTER INDEX "Item_code_key" RENAME TO "Asset_code_key";
ALTER INDEX "Item_locationId_idx" RENAME TO "Asset_locationId_idx";
ALTER INDEX "Item_projectId_idx" RENAME TO "Asset_projectId_idx";
ALTER INDEX "Item_responsibleId_idx" RENAME TO "Asset_responsibleId_idx";
ALTER INDEX "Item_serialNumber_key" RENAME TO "Asset_serialNumber_key";
ALTER INDEX "Item_statusId_idx" RENAME TO "Asset_statusId_idx";
ALTER INDEX "Item_typeId_idx" RENAME TO "Asset_typeId_idx";
ALTER INDEX "ItemType_name_key" RENAME TO "AssetType_name_key";
ALTER INDEX "DocumentItem_itemId_idx" RENAME TO "DocumentItem_assetId_idx";
ALTER INDEX "DynamicFieldDefinition_itemTypeId_idx" RENAME TO "DynamicFieldDefinition_assetTypeId_idx";
ALTER INDEX "Event_itemId_idx" RENAME TO "Event_assetId_idx";
ALTER INDEX "FloorPlanMarker_itemId_idx" RENAME TO "FloorPlanMarker_assetId_idx";
