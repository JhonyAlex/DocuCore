-- DropIndex
DROP INDEX "Asset_code_trgm_idx";

-- DropIndex
DROP INDEX "Asset_name_trgm_idx";

-- DropIndex
DROP INDEX "Asset_serialNumber_trgm_idx";

-- DropIndex
DROP INDEX "Document_name_trgm_idx";

-- DropIndex
DROP INDEX "Document_projectId_updatedAt_id_idx";

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "readAt" TIMESTAMP(3),
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "Notification"("sourceKey");

-- CreateIndex
CREATE INDEX "Notification_projectId_readAt_idx" ON "Notification"("projectId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_projectId_createdAt_idx" ON "Notification"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Document_projectId_updatedAt_id_idx" ON "Document"("projectId", "updatedAt", "id");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DocumentVersion_documentId_version_desc_idx" RENAME TO "DocumentVersion_documentId_version_idx";
