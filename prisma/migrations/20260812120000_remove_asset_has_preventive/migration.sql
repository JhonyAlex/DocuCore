-- Preventive maintenance is represented exclusively by active
-- AssetPreventivePlan assignments. The denormalized flag was writable through
-- the generic asset contract and could therefore desynchronize that model.
ALTER TABLE "Asset" DROP COLUMN "hasPreventive";
