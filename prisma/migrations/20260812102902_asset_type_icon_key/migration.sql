-- AlterTable
ALTER TABLE "AssetType" ADD COLUMN     "iconKey" TEXT NOT NULL DEFAULT 'package';

-- AlterTable
ALTER TABLE "FloorPlan" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FloorPlanMarker" ALTER COLUMN "updatedAt" DROP DEFAULT;
