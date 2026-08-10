-- IMG-01: imagen del activo. El binario vive en el storage gestionado de
-- DocuCore; en BD solo la clave (nombre UUID, única), el MIME y el tamaño.
ALTER TABLE "Asset" ADD COLUMN "imageStorageKey" TEXT;
ALTER TABLE "Asset" ADD COLUMN "imageMimeType" TEXT;
ALTER TABLE "Asset" ADD COLUMN "imageSizeBytes" INTEGER;
CREATE UNIQUE INDEX "Asset_imageStorageKey_key" ON "Asset"("imageStorageKey");
