-- DOC-03: periodicidad de documentos basada en el vencimiento.
-- periodicity: 'Mensual' | 'Bimestral' | 'Trimestral' | 'Cuatrimestral' | 'Semestral' | 'Anual' | NULL (sin periodicidad)
-- periodicityMode: 'Calendario' (el vencimiento salta desde el vigente) | 'Subida' (desde la emisión) | NULL
ALTER TABLE "Document" ADD COLUMN "periodicity" TEXT;
ALTER TABLE "Document" ADD COLUMN "periodicityMode" TEXT;
