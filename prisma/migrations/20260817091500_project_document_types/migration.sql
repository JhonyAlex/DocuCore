-- CreateTable
CREATE TABLE "DocumentType" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL DEFAULT 'file-text',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "typeId" INTEGER;

-- Populate default document types for all existing projects
INSERT INTO "DocumentType" ("projectId", "name", "iconKey", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT p.id, t.name, t."iconKey", t."sortOrder", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project" p
CROSS JOIN (
  VALUES
    ('Certificado', 'badge-check', 0),
    ('Calibración', 'gauge', 1),
    ('Manual', 'book-open', 2),
    ('Acta', 'clipboard-list', 3),
    ('Contrato', 'file-signature', 4)
) AS t(name, "iconKey", "sortOrder")
ON CONFLICT DO NOTHING;

-- Insert any additional custom types already in use by documents
INSERT INTO "DocumentType" ("projectId", "name", "iconKey", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT d."projectId", d."type", 'file-text', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Document" d
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentType" dt
  WHERE dt."projectId" = d."projectId" AND LOWER(dt."name") = LOWER(d."type")
)
ON CONFLICT DO NOTHING;

-- Update existing Document rows to link to their DocumentType
UPDATE "Document" d
SET "typeId" = dt.id
FROM "DocumentType" dt
WHERE dt."projectId" = d."projectId" AND LOWER(dt."name") = LOWER(d."type");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_projectId_name_key" ON "DocumentType"("projectId", "name");

-- CreateIndex
CREATE INDEX "DocumentType_projectId_isActive_sortOrder_idx" ON "DocumentType"("projectId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Document_typeId_idx" ON "Document"("typeId");

-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
