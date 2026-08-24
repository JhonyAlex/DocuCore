-- Forward-only: activeWorkspaceId must NOT be globally unique — many users may
-- have the same workspace as their active context. Drop the index/constraint.
DROP INDEX IF EXISTS "User_activeWorkspaceId_key";
