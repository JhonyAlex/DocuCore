-- Retira los dos datos del modelo preventivo anterior. Los mantenimientos
-- válidos continúan en sus planes y las fechas dinámicas independientes no se
-- modifican.
DELETE FROM "Event"
WHERE "title" = 'Mant. preventivo'
  AND "type" = 'Recurrente cada 3 meses';

DELETE FROM "DynamicFieldDefinition" AS definition
USING "DynamicFieldDefinitionAssetType" AS assignment,
      "AssetType" AS asset_type
WHERE definition."id" = assignment."definitionId"
  AND assignment."assetTypeId" = asset_type."id"
  AND definition."fieldName" = 'Próximo mantenimiento'
  AND asset_type."name" = 'Máquina';
