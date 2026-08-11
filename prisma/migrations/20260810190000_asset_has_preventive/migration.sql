-- Denormalized flag so lists and filters can tell whether an asset has an
-- active preventive plan assignment without joining. Kept in sync by the API.
ALTER TABLE "Asset" ADD COLUMN "hasPreventive" BOOLEAN NOT NULL DEFAULT false;
