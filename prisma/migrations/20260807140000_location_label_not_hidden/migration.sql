-- Sustituye el flag `hidden` por un modelo jerárquico real: todas las
-- ubicaciones son administrables y visibles al expandir su rama. La etiqueta
-- larga que muestra la tabla de Activos pasa a ser un campo de presentación
-- (`label`), inicializado con el nombre existente; el seed canónico lo ajusta
-- al texto del prototipo sin duplicar filas ocultas.
ALTER TABLE "Location" ADD COLUMN "label" TEXT NOT NULL DEFAULT '';
UPDATE "Location" SET "label" = "name" WHERE "label" = '';
ALTER TABLE "Location" DROP COLUMN "hidden";
