-- Location deja de guardar `parent`/`responsible` como texto libre y el
-- contador denormalizado `assetCount`: la jerarquía pasa a ser una
-- auto-referencia (`parentId`), el responsable una FK a "User" y los activos
-- se cuentan desde la relación real con "Item".
--
-- Item.location (texto libre) se sustituye por la FK obligatoria
-- `locationId`. Los valores existentes se migran por coincidencia de nombre
-- contra "Location"; las filas sin coincidencia se eliminan (entorno
-- pre-release: el seed canónico vuelve a crearlas correctamente).

-- DropIndex
DROP INDEX "Item_location_idx";

-- Item: añadir locationId, migrar por nombre y exigir la FK.
ALTER TABLE "Item" ADD COLUMN "locationId" INTEGER;

UPDATE "Item" i
SET "locationId" = l."id"
FROM "Location" l
WHERE l."name" = i."location";

DELETE FROM "Item" WHERE "locationId" IS NULL;

ALTER TABLE "Item" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Item" DROP COLUMN "location";

-- Location: nueva estructura jerárquica.
ALTER TABLE "Location" ADD COLUMN "parentId" INTEGER;
ALTER TABLE "Location" ADD COLUMN "responsibleId" INTEGER;
ALTER TABLE "Location" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Location" l
SET "responsibleId" = u."id"
FROM "User" u
WHERE u."name" = l."responsible";

UPDATE "Location"
SET "responsibleId" = (SELECT MIN("id") FROM "User")
WHERE "responsibleId" IS NULL;

ALTER TABLE "Location" ALTER COLUMN "responsibleId" SET NOT NULL;
ALTER TABLE "Location" DROP COLUMN "assetCount";
ALTER TABLE "Location" DROP COLUMN "parent";
ALTER TABLE "Location" DROP COLUMN "responsible";
ALTER TABLE "Location" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Document: sincronizar el default de updatedAt con el datamodel.
ALTER TABLE "Document" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Item_locationId_idx" ON "Item"("locationId");

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");

-- CreateIndex
CREATE INDEX "Location_projectId_idx" ON "Location"("projectId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
