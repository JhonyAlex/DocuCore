-- DOC-02: un documento puede estar asociado a varios activos (N-N).
-- La columna itemId de Document (1-N) se sustituye por la tabla intermedia
-- DocumentItem; las relaciones existentes se conservan migrando los datos.

CREATE TABLE "DocumentItem" (
    "documentId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,

    CONSTRAINT "DocumentItem_pkey" PRIMARY KEY ("documentId","itemId")
);

INSERT INTO "DocumentItem" ("documentId", "itemId")
SELECT "id", "itemId" FROM "Document" WHERE "itemId" IS NOT NULL;

ALTER TABLE "Document" DROP COLUMN "itemId";

CREATE INDEX "DocumentItem_itemId_idx" ON "DocumentItem"("itemId");

ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
