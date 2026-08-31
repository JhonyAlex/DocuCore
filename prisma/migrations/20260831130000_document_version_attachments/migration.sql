-- Una entrega documental puede contener varios ficheros complementarios sin
-- crear varias versiones ni avanzar varias veces el vencimiento.
-- DocumentVersion conserva su fichero principal para compatibilidad con datos
-- y enlaces existentes; esta tabla guarda únicamente los adjuntos adicionales.

CREATE TABLE "DocumentVersionAttachment" (
    "id" SERIAL NOT NULL,
    "documentVersionId" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersionAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentVersionAttachment_storageKey_key" ON "DocumentVersionAttachment"("storageKey");
CREATE INDEX "DocumentVersionAttachment_documentVersionId_sortOrder_idx" ON "DocumentVersionAttachment"("documentVersionId", "sortOrder");

ALTER TABLE "DocumentVersionAttachment"
  ADD CONSTRAINT "DocumentVersionAttachment_documentVersionId_fkey"
  FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
