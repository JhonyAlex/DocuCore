import { Prisma, type PrismaClient } from '@prisma/client'

type Queryable = PrismaClient | Prisma.TransactionClient

/**
 * Runs hierarchy traversal inside PostgreSQL. Do not replace this with a
 * full location findMany plus an in-process graph walk: locations can grow
 * independently from the current screen.
 */
export async function descendantLocationIds(db: Queryable, rootId: number): Promise<number[]> {
  const rows = await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT "id" FROM "Location" WHERE "id" = ${rootId}
      UNION ALL
      SELECT child."id"
      FROM "Location" child
      INNER JOIN subtree parent ON child."parentId" = parent."id"
    )
    SELECT "id" AS id FROM subtree
  `)
  return rows.map((row) => Number(row.id))
}

export async function isLocationDescendantOf(db: Queryable, locationId: number, ancestorId: number): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    WITH RECURSIVE ancestors AS (
      SELECT "id", "parentId" FROM "Location" WHERE "id" = ${locationId}
      UNION ALL
      SELECT parent."id", parent."parentId"
      FROM "Location" parent
      INNER JOIN ancestors child ON child."parentId" = parent."id"
    )
    SELECT "id" AS id FROM ancestors WHERE "id" = ${ancestorId} LIMIT 1
  `)
  return rows.length > 0
}
