-- El color pertenece al tipo de activo, no a cada activo: así un cambio se
-- propaga de forma consistente al catálogo y a las listas.
ALTER TABLE "AssetType" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'cyan';

-- Conserva el aspecto aprobado de los cinco tipos canónicos existentes. Los
-- tipos personalizados previos reciben el nuevo color de reserva (cyan).
UPDATE "AssetType"
SET "color" = CASE "name"
  WHEN 'Máquina' THEN 'brand'
  WHEN 'Extintor' THEN 'red'
  WHEN 'Instrumento' THEN 'indigo'
  WHEN 'Servidor' THEN 'slate'
  WHEN 'Vehículo' THEN 'purple'
  ELSE "color"
END
WHERE "name" IN ('Máquina', 'Extintor', 'Instrumento', 'Servidor', 'Vehículo');
