-- Elimina el DEFAULT '' residual de Location.label: el campo de presentación
-- siempre se escribe explícitamente (name al crear, regla de seguimiento del
-- nombre al renombrar, o valor personalizado), de modo que el valor por defecto
-- ya no tiene sentido y dejaría un estado inconsistente si se usara.
ALTER TABLE "Location" ALTER COLUMN "label" DROP DEFAULT;
