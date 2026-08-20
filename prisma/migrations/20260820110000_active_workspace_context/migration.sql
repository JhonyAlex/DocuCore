-- Move the per-user active workspace context from Workspace (draft) to User,
-- where it belongs conceptually: a person may belong to several workspaces and
-- carries a single active context at a time (§15 multi-workspace). Forward-only:
-- no data is destroyed.

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "activeWorkspaceId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "User_activeWorkspaceId_key"
  ON "User"("activeWorkspaceId");

-- Drop the earlier draft column from Workspace (it carried no meaningful data).
ALTER TABLE "Workspace"
DROP COLUMN IF EXISTS "activeWorkspaceId";
