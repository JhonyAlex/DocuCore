-- AUTH-01: local credentials and server-revocable opaque sessions.
-- Existing pre-release users receive an unusable empty hash until the canonical
-- development seed is run; no plaintext password is introduced by migration.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_isActive_idx" ON "User"("isActive");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
