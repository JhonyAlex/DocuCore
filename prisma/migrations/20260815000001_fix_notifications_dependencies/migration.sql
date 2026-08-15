-- Fix de arranque limpio: 20260814182446_notifications referenciaba estructuras
-- creadas por las migraciones 20260815000000_* (Status.updatedAt y el índice
-- AuditLog_projectId_timestamp_desc_idx), que en el orden lineal se aplican
-- después. Esas dos piezas se movieron aquí, tras ambas, con estado final
-- idéntico. La migración de notifications nunca pudo aplicarse en el orden
-- lineal (P3009 en cualquier BD limpia), por lo que editarla no altera ninguna
-- migración ya aplicada.

-- AlterTable
ALTER TABLE "Status" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "AuditLog_projectId_timestamp_desc_idx" RENAME TO "AuditLog_projectId_timestamp_idx";
