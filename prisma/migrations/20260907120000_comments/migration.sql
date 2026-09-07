
-- COM-01: comentarios sobre Activos o Documentos (nunca ambos, nunca ninguno).
-- La exclusividad se garantiza en la BD con un CHECK sobre los ids de las
-- entidades anfitrionas: num_nonnulls = 1 exige exactamente un anfitrión.
-- ⚠ Prisma no modela CHECKs nativamente: si una migración futura regenera
-- esta tabla (p. ej. un reset del esquema), debe volver a añadir esta
-- constraint; el modelo `Comment` en prisma/schema.prisma lo documenta.
-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "assetId" INTEGER,
    "documentId" INTEGER,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Comment_host_xor_check" CHECK (num_nonnulls("assetId", "documentId") = 1)
);

-- CreateIndex
CREATE INDEX "Comment_projectId_assetId_createdAt_id_idx" ON "Comment"("projectId", "assetId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Comment_projectId_documentId_createdAt_id_idx" ON "Comment"("projectId", "documentId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Comment_assetId_idx" ON "Comment"("assetId");

-- CreateIndex
CREATE INDEX "Comment_documentId_idx" ON "Comment"("documentId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

