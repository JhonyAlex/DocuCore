import { Prisma, type PrismaClient } from '@prisma/client'
import { assetEventClock, type DerivedAssetEvent } from './assetEvents'

type DatabaseClient = PrismaClient | Prisma.TransactionClient

type ManualEventRow = { assetId: number; id: number; title: string; date: Date; type: string }
type DocumentEventRow = { assetId: number; id: number; name: string; eventTitle: string | null; type: string; expiryDate: Date }
type DynamicDateRow = { assetId: number; id: number; fieldName: string; scheduledDate: Date }
type PreventiveEventRow = { assetId: number; id: number; name: string; scheduledDate: Date; completedTasks: bigint; totalTasks: bigint }

const DAY_MS = 86_400_000

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function derived(id: string, title: string, date: Date, source: DerivedAssetEvent['source'], sourceLabel: string, now: Date): DerivedAssetEvent {
  const daysUntil = Math.round((utcDay(date) - utcDay(now)) / DAY_MS)
  return {
    id,
    title,
    date: `${date.toISOString().slice(0, 10)}T00:00:00.000Z`,
    daysUntil,
    urgency: daysUntil < 0 ? 'red' : daysUntil <= 21 ? 'amber' : 'slate',
    source,
    sourceLabel,
  }
}

/**
 * Obtiene el siguiente evento visible de cada activo indicado sin hidratar sus
 * historiales. Cada LATERAL contiene un `LIMIT 1`, por lo que el trabajo y el
 * DTO crecen con la página de activos, no con el número de ocurrencias.
 */
export async function nextAssetEventsById(db: DatabaseClient, assetIds: number[], now = assetEventClock()): Promise<Map<number, DerivedAssetEvent>> {
  const ids = [...new Set(assetIds)]
  if (ids.length === 0) return new Map()
  const selected = Prisma.sql`(SELECT UNNEST(ARRAY[${Prisma.join(ids)}]::int[]) AS id)`
  const [manualRows, documentRows, dynamicRows, preventiveRows] = await Promise.all([
    db.$queryRaw<ManualEventRow[]>(Prisma.sql`
      SELECT selected.id AS "assetId", event.id, event.title, event.date, event.type
      FROM ${selected} selected
      JOIN LATERAL (
        SELECT id, title, date, type
        FROM "Event"
        WHERE "assetId" = selected.id AND "completedAt" IS NULL
        ORDER BY date ASC, id ASC
        LIMIT 1
      ) event ON TRUE
    `),
    db.$queryRaw<DocumentEventRow[]>(Prisma.sql`
      SELECT selected.id AS "assetId", document.id, document.name, document."eventTitle", document.type, document."expiryDate"
      FROM ${selected} selected
      JOIN LATERAL (
        SELECT document.id, document.name, document."eventTitle", document.type, version."expiryDate" AS "expiryDate"
        FROM "DocumentItem" item
        JOIN "Document" document ON document.id = item."documentId"
        JOIN LATERAL (
          SELECT "expiryDate"
          FROM "DocumentVersion"
          WHERE "documentId" = document.id
          ORDER BY version DESC
          LIMIT 1
        ) version ON version."expiryDate" IS NOT NULL
        LEFT JOIN "AssetEventAcknowledgement" acknowledgement
          ON acknowledgement."assetId" = selected.id
          AND acknowledgement."sourceKey" = CONCAT('document:', document.id)
        WHERE item."assetId" = selected.id AND acknowledgement."sourceKey" IS NULL
        ORDER BY version."expiryDate" ASC, document.id ASC
        LIMIT 1
      ) document ON TRUE
    `),
    db.$queryRaw<DynamicDateRow[]>(Prisma.sql`
      SELECT selected.id AS "assetId", occurrence.id, definition."fieldName", occurrence."scheduledDate"
      FROM ${selected} selected
      JOIN LATERAL (
        SELECT occurrence.id, occurrence."scheduledDate", schedule."definitionId"
        FROM "AssetDateSchedule" schedule
        JOIN "AssetDateOccurrence" occurrence ON occurrence."scheduleId" = schedule.id
        WHERE schedule."assetId" = selected.id AND schedule."isActive" = TRUE AND occurrence."completedAt" IS NULL
        ORDER BY occurrence."scheduledDate" ASC, occurrence.id ASC
        LIMIT 1
      ) occurrence ON TRUE
      JOIN "DynamicFieldDefinition" definition ON definition.id = occurrence."definitionId"
    `),
    db.$queryRaw<PreventiveEventRow[]>(Prisma.sql`
      SELECT selected.id AS "assetId", execution.id, execution.name, execution."scheduledDate",
        (SELECT COUNT(*)::bigint FROM "PreventiveExecutionTask" task WHERE task."executionId" = execution.id AND task."completedAt" IS NOT NULL) AS "completedTasks",
        (SELECT COUNT(*)::bigint FROM "PreventiveExecutionTask" task WHERE task."executionId" = execution.id) AS "totalTasks"
      FROM ${selected} selected
      JOIN LATERAL (
        SELECT assignment.name, execution.id, execution."scheduledDate"
        FROM "AssetPreventivePlan" assignment
        JOIN "PreventiveExecution" execution ON execution."planId" = assignment.id
        WHERE assignment."assetId" = selected.id AND assignment."isActive" = TRUE AND execution."completedAt" IS NULL
        ORDER BY execution."scheduledDate" ASC, execution.id ASC
        LIMIT 1
      ) execution ON TRUE
    `),
  ])

  const candidates = new Map<number, DerivedAssetEvent[]>()
  const add = (assetId: number, event: DerivedAssetEvent) => {
    const events = candidates.get(assetId) ?? []
    events.push(event)
    candidates.set(assetId, events)
  }
  for (const row of manualRows) add(row.assetId, derived(`event:${row.id}`, row.title, row.date, 'event', row.type, now))
  for (const row of documentRows) add(row.assetId, derived(`document:${row.id}`, row.eventTitle ?? row.name, row.expiryDate, 'document', row.type, now))
  for (const row of dynamicRows) add(row.assetId, derived(`dynamic-date:${row.id}`, row.fieldName, row.scheduledDate, 'dynamic-date', 'Fecha', now))
  // Counts arrive as SQL aggregates: no execution task is materialized merely
  // to format the one visible next preventive event of a list row.
  for (const row of preventiveRows) add(row.assetId, derived(`preventive:${row.id}`, row.name, row.scheduledDate, 'preventive', `${row.completedTasks}/${row.totalTasks} tareas`, now))

  return new Map([...candidates].map(([assetId, events]) => [assetId, events.sort((left, right) => Date.parse(left.date) - Date.parse(right.date) || left.id.localeCompare(right.id))[0]!]))
}
