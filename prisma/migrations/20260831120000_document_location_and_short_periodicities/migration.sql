-- Los documentos pueden pertenecer opcionalmente a una ubicación. La relación
-- se nulifica al borrar la ubicación para preservar el documento y sus versiones.
ALTER TABLE "Document" ADD COLUMN "locationId" INTEGER;
ALTER TABLE "Document" ADD CONSTRAINT "Document_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Document_projectId_locationId_updatedAt_id_idx"
  ON "Document"("projectId", "locationId", "updatedAt", "id");

-- Los eventos manuales usan la misma regla de recurrencia que documentos,
-- fechas de activo y preventivos. Al completarlos se crea la siguiente cita.
ALTER TABLE "Event" ADD COLUMN "periodicity" TEXT;
ALTER TABLE "Event" ADD COLUMN "periodicityMode" TEXT;
