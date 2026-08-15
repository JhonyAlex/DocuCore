import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import fs from "node:fs"
import path from "node:path"

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ""
  let inDollarBlock = false

  const lines = sql.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("--")) continue

    if (line.includes("$$")) {
      inDollarBlock = !inDollarBlock
    }

    current += line + "\n"

    if (!inDollarBlock && trimmed.endsWith(";")) {
      const stmt = current.trim()
      if (stmt.length > 0) {
        statements.push(stmt)
      }
      current = ""
    }
  }

  if (current.trim().length > 0) {
    statements.push(current.trim())
  }

  return statements
}

describe("SAAS-09 Database Upgrade & Backfill Verification (from 02b1203 to SAAS-PROD-01)", () => {
  it("applies SAAS-PROD-01 migration to an existing pre-SaaS database and preserves 100% of data with automated workspace backfill", async () => {
    const testSchema = `upgrade_test_${Date.now()}`

    // 1. Create isolated schema
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}";`)

    try {
      // 2. Read and apply all migrations up to 20260815120000_auth_persistent_sessions
      const migrationsDir = path.join(process.cwd(), "prisma/migrations")
      const migrationFolders = fs.readdirSync(migrationsDir).filter((f) => {
        return fs.statSync(path.join(migrationsDir, f)).isDirectory() && f !== "20260816000000_saas_workspace_billing"
      }).sort()

      // Set search_path to isolated schema + public (for pg_trgm extension)
      await prisma.$executeRawUnsafe(`SET search_path TO "${testSchema}", public;`)

      for (const folder of migrationFolders) {
        const sqlPath = path.join(migrationsDir, folder, "migration.sql")
        if (fs.existsSync(sqlPath)) {
          const sql = fs.readFileSync(sqlPath, "utf8")
          const statements = splitSqlStatements(sql)
          for (const stmt of statements) {
            await prisma.$executeRawUnsafe(stmt)
          }
        }
      }

      // 3. Insert pre-SaaS data (User, Project, Asset, Document, Location, AuditLog)
      const userRes = await prisma.$queryRawUnsafe<Array<{ id: number; email: string }>>(`
        INSERT INTO "${testSchema}"."User" ("name", "email", "passwordHash", "role", "initials", "color", "isActive", "createdAt", "updatedAt")
        VALUES ('Pre-SaaS Admin', 'presass@docucore.test', 'hash123', 'Administrador', 'PA', 'brand', true, '2026-08-01 10:00:00', '2026-08-01 10:00:00')
        RETURNING "id", "email";
      `)
      const userId = userRes[0]!.id

      const projRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`
        INSERT INTO "${testSchema}"."Project" ("code", "name", "description", "status", "themeKey", "createdAt", "updatedAt")
        VALUES ('PRJ-LEGACY-01', 'Planta Legado', 'Proyecto anterior a SaaS', 'ACTIVE', 'blue', '2026-08-01 11:00:00', '2026-08-01 11:00:00')
        RETURNING "id";
      `)
      const projectId = projRes[0]!.id

      await prisma.$queryRawUnsafe(`
        INSERT INTO "${testSchema}"."ProjectMember" ("projectId", "userId", "role", "createdAt")
        VALUES (${projectId}, ${userId}, 'OWNER', '2026-08-01 11:05:00');
      `)

      const locRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`
        INSERT INTO "${testSchema}"."Location" ("projectId", "responsibleId", "name", "code", "label", "surface", "createdAt", "updatedAt")
        VALUES (${projectId}, ${userId}, 'Nave A', 'NV-A', 'NV-A · Nave A', '500 m²', '2026-08-01 11:10:00', '2026-08-01 11:10:00')
        RETURNING "id";
      `)
      const locationId = locRes[0]!.id

      const typeRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`
        INSERT INTO "${testSchema}"."AssetType" ("projectId", "name", "iconKey", "createdAt", "updatedAt")
        VALUES (${projectId}, 'Compresor', 'compressor', '2026-08-01 11:15:00', '2026-08-01 11:15:00')
        RETURNING "id";
      `)
      const typeId = typeRes[0]!.id

      const statusRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`
        INSERT INTO "${testSchema}"."Status" ("projectId", "name", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
        VALUES (${projectId}, 'Operativo', 'emerald', 0, true, '2026-08-01 11:20:00', '2026-08-01 11:20:00')
        RETURNING "id";
      `)
      const statusId = statusRes[0]!.id

      await prisma.$queryRawUnsafe(`
        INSERT INTO "${testSchema}"."Asset" ("projectId", "typeId", "locationId", "statusId", "responsibleId", "code", "name", "serialNumber", "installDate", "initials", "createdAt", "updatedAt")
        VALUES (${projectId}, ${typeId}, ${locationId}, ${statusId}, ${userId}, 'CMP-01', 'Compresor Principal', 'SN-CMP-01', '2026-08-01 11:25:00', 'PA', '2026-08-01 11:25:00', '2026-08-01 11:25:00');
      `)

      const docRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`
        INSERT INTO "${testSchema}"."Document" ("projectId", "name", "type", "createdAt", "updatedAt")
        VALUES (${projectId}, 'Manual Compresor', 'Manual', '2026-08-01 11:30:00', '2026-08-01 11:30:00')
        RETURNING "id";
      `)
      const docId = docRes[0]!.id

      await prisma.$queryRawUnsafe(`
        INSERT INTO "${testSchema}"."DocumentVersion" ("documentId", "version", "originalName", "storageKey", "mimeType", "sizeBytes", "issueDate", "uploadedAt")
        VALUES (${docId}, 1, 'manual.pdf', 'manual_legacy.pdf', 'application/pdf', 4096, '2026-08-01 11:30:00', '2026-08-01 11:30:00');
      `)

      await prisma.$queryRawUnsafe(`
        INSERT INTO "${testSchema}"."AuditLog" ("projectId", "userId", "action", "entityId", "detail", "timestamp", "createdAt")
        VALUES (${projectId}, ${userId}, 'Alta de activo legado', 'CMP-01', 'Compresor creado', '2026-08-01 11:35:00', '2026-08-01 11:35:00');
      `)

      // 4. Run SAAS-PROD-01 migration
      const saasMigrationSql = fs.readFileSync(path.join(migrationsDir, "20260816000000_saas_workspace_billing/migration.sql"), "utf8")
      const saasStatements = splitSqlStatements(saasMigrationSql)
      for (const stmt of saasStatements) {
        await prisma.$executeRawUnsafe(stmt)
      }

      // 5. Verify data preservation & automated backfill
      const workspaces = await prisma.$queryRawUnsafe<Array<{ id: number; name: string; slug: string; billingStatus: string }>>(`SELECT * FROM "${testSchema}"."Workspace";`)
      expect(workspaces.length).toBe(1)
      expect(workspaces[0]?.name).toBe("Espacio Principal")
      expect(workspaces[0]?.slug).toBe("espacio-principal")
      expect(workspaces[0]?.billingStatus).toBe("ACTIVE")

      const defaultWsId = workspaces[0]!.id

      const projects = await prisma.$queryRawUnsafe<Array<{ workspaceId: number; code: string }>>(`SELECT * FROM "${testSchema}"."Project" WHERE "id" = ${projectId};`)
      expect(projects.length).toBe(1)
      expect(projects[0]?.workspaceId).toBe(defaultWsId)
      expect(projects[0]?.code).toBe("PRJ-LEGACY-01")

      const members = await prisma.$queryRawUnsafe<Array<{ userId: number; role: string }>>(`SELECT * FROM "${testSchema}"."WorkspaceMember" WHERE "workspaceId" = ${defaultWsId};`)
      expect(members.length).toBe(1)
      expect(members[0]?.userId).toBe(userId)
      expect(members[0]?.role).toBe("OWNER")

      const users = await prisma.$queryRawUnsafe<Array<{ emailVerifiedAt: Date | null }>>(`SELECT * FROM "${testSchema}"."User" WHERE "id" = ${userId};`)
      expect(users.length).toBe(1)
      expect(users[0]?.emailVerifiedAt).not.toBeNull()

      const auditLogs = await prisma.$queryRawUnsafe<Array<{ workspaceId: number; action: string }>>(`SELECT * FROM "${testSchema}"."AuditLog" WHERE "projectId" = ${projectId};`)
      expect(auditLogs.length).toBe(1)
      expect(auditLogs[0]?.workspaceId).toBe(defaultWsId)
      expect(auditLogs[0]?.action).toBe("Alta de activo legado")

      const assets = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT * FROM "${testSchema}"."Asset" WHERE "projectId" = ${projectId};`)
      expect(assets.length).toBe(1)
      expect(assets[0]?.name).toBe("Compresor Principal")

      const docs = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT * FROM "${testSchema}"."Document" WHERE "projectId" = ${projectId};`)
      expect(docs.length).toBe(1)
      expect(docs[0]?.name).toBe("Manual Compresor")
    } finally {
      await prisma.$executeRawUnsafe(`SET search_path TO public;`)
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE;`)
    }
  })
})
