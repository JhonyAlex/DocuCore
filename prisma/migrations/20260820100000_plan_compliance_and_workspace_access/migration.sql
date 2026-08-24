-- Expand/contract (forward-only) migration: entitlement compliance + workspace
-- access. No existing data is modified or removed. Every new column is nullable
-- or has a safe default, so existing records remain valid.
--
-- The local dev database may have partially applied an earlier draft of these
-- objects, so every statement is guarded (IF NOT EXISTS / DO $$) to converge
-- both a fresh database and a drifted one without ever dropping data.

-- 1. Enums.
DO $$ BEGIN
  CREATE TYPE "ProjectArchivalReason" AS ENUM ('MANUAL', 'PLAN_LIMIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PlanTransitionStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkspaceMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Project archival reason.
ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "archivedByPlan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "planLockedAt" TIMESTAMP(3);

-- 3. Workspace compliance / grace state.
ALTER TABLE "Workspace"
ADD COLUMN IF NOT EXISTS "graceEndsAt" TIMESTAMP(3);
ALTER TABLE "Workspace"
ADD COLUMN IF NOT EXISTS "planComplianceStartedAt" TIMESTAMP(3);
ALTER TABLE "Workspace"
ADD COLUMN IF NOT EXISTS "activeWorkspaceId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_activeWorkspaceId_key"
  ON "Workspace"("activeWorkspaceId");

-- 4. Per-workspace member suspension.
ALTER TABLE "WorkspaceMember"
ADD COLUMN IF NOT EXISTS "status" "WorkspaceMemberStatus" NOT NULL DEFAULT 'ACTIVE';

-- 5. Persistent plan transitions.
CREATE TABLE IF NOT EXISTS "PlanTransition" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "targetPlanKey" TEXT NOT NULL,
    "selectedProjectId" INTEGER NOT NULL,
    "planLockedProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effectiveAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "status" "PlanTransitionStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlanTransition_workspaceId_status_createdAt_idx"
    ON "PlanTransition"("workspaceId", "status", "createdAt" DESC);

-- 6. Invitations.
CREATE TABLE IF NOT EXISTS "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "workspaceRole" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_tokenHash_key"
  ON "WorkspaceInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_status_createdAt_idx"
  ON "WorkspaceInvitation"("workspaceId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_email_idx" ON "WorkspaceInvitation"("email");

CREATE TABLE IF NOT EXISTS "WorkspaceInvitationProjectRole" (
    "invitationId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    CONSTRAINT "WorkspaceInvitationProjectRole_pkey" PRIMARY KEY ("invitationId","projectId")
);

CREATE INDEX IF NOT EXISTS "WorkspaceInvitationProjectRole_projectId_idx"
  ON "WorkspaceInvitationProjectRole"("projectId");

-- 7. Foreign keys (guarded against a drifted DB that already added them).
DO $$ BEGIN
  ALTER TABLE "PlanTransition" ADD CONSTRAINT "PlanTransition_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlanTransition" ADD CONSTRAINT "PlanTransition_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkspaceInvitationProjectRole" ADD CONSTRAINT "WorkspaceInvitationProjectRole_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "WorkspaceInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkspaceInvitationProjectRole" ADD CONSTRAINT "WorkspaceInvitationProjectRole_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
