-- La etiqueta de serie era una copia editable del número de serie. La
-- presentación (SN, Lote o Mat.) se deriva ahora del tipo de activo.
ALTER TABLE "Item" DROP COLUMN "serialLabel";

-- Un número de serie identifica un único activo y no puede reutilizarse al
-- crear o duplicar ítems.
CREATE UNIQUE INDEX "Item_serialNumber_key" ON "Item"("serialNumber");
