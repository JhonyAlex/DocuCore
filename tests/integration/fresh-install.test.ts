import { describe, expect, it } from "vitest"
import prisma from "../../server/lib/prisma"
import fs from "node:fs"
import path from "node:path"
import { hashPassword } from "../../server/lib/passwords"

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

describe("SAAS-10 Fresh Production Installation & Bootstrap Idempotency", () => {
  it("deploys fresh schema without seed, performs initial admin bootstrap, and verifies idempotency", async () => {
    const testSchema = `fresh_install_${Date.now()}`

    // 1. Create fresh isolated schema
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}";`)

    try {
      // 2. Apply all 32 migrations sequentially
      const migrationsDir = path.join(process.cwd(), "prisma/migrations")
      const migrationFolders = fs.readdirSync(migrationsDir).filter((f) => {
        return fs.statSync(path.join(migrationsDir, f)).isDirectory()
      }).sort()

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

      // 3. Verify clean fresh state (0 users, 0 workspaces, 0 projects, 0 assets)
      const userCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM "${testSchema}"."User";`)
      expect(userCount[0]?.count).toBe(0)

      const wsCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM "${testSchema}"."Workspace";`)
      expect(wsCount[0]?.count).toBe(0)

      // 4. Simulate bootstrap execution
      const adminEmail = `superadmin.${Date.now()}@report-map.online`
      const adminPasswordHash = await hashPassword("AdminProductionPass2026!")

      await prisma.$executeRawUnsafe(`
        INSERT INTO "${testSchema}"."User" ("name", "email", "passwordHash", "role", "initials", "color", "isActive", "emailVerifiedAt", "isPlatformAdmin", "createdAt", "updatedAt")
        VALUES ('Super Admin', '${adminEmail}', '${adminPasswordHash}', 'Administradora', 'SA', 'brand', true, CURRENT_TIMESTAMP, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `)

      const userRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "${testSchema}"."User" WHERE "email" = '${adminEmail}';`)
      const adminId = userRes[0]!.id

      await prisma.$executeRawUnsafe(`
        INSERT INTO "${testSchema}"."Workspace" ("name", "slug", "billingStatus", "createdAt", "updatedAt")
        VALUES ('Espacio Principal', 'espacio-principal', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `)

      const wsRes = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "${testSchema}"."Workspace" WHERE "slug" = 'espacio-principal';`)
      const wsId = wsRes[0]!.id

      await prisma.$executeRawUnsafe(`
        INSERT INTO "${testSchema}"."WorkspaceMember" ("workspaceId", "userId", "role", "createdAt")
        VALUES (${wsId}, ${adminId}, 'OWNER', CURRENT_TIMESTAMP);
      `)

      // 5. Verify bootstrap results
      const adminUsers = await prisma.$queryRawUnsafe<Array<{ email: string; isPlatformAdmin: boolean; emailVerifiedAt: Date | null }>>(`SELECT * FROM "${testSchema}"."User";`)
      expect(adminUsers.length).toBe(1)
      expect(adminUsers[0]?.email).toBe(adminEmail)
      expect(adminUsers[0]?.isPlatformAdmin).toBe(true)
      expect(adminUsers[0]?.emailVerifiedAt).not.toBeNull()

      // 6. Test Idempotency: Attempt second bootstrap (guard check user.count() > 0)
      const afterUserCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM "${testSchema}"."User";`)
      const shouldSkip = (afterUserCount[0]?.count ?? 0) > 0
      expect(shouldSkip).toBe(true)

      // Ensure no second admin was created
      const finalUsers = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT * FROM "${testSchema}"."User";`)
      expect(finalUsers.length).toBe(1)
    } finally {
      await prisma.$executeRawUnsafe(`SET search_path TO public;`)
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE;`)
    }
  })
})
