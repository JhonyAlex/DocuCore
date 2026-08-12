import { Prisma, type PrismaClient } from '@prisma/client'
import { asUtcDate, completeAssetDateOccurrence, createPreventiveExecution } from './assetSchedules'
import { assetEventClock } from './assetEvents'
import {
  CALENDAR_EVENT_CATEGORIES,
  CALENDAR_EVENT_SOURCES,
  calendarCategoryFromText,
  calendarCategoryLabel,
  createCalendarOccurrence,
  type CalendarEventCategory,
  type CalendarEventOccurrence,
  type CalendarEventSource,
} from './calendarDomain'
import { calculateNextExpiry, type DocumentPeriodicity, type DocumentPeriodicityMode } from './periodicity'

export { CALENDAR_EVENT_CATEGORIES, CALENDAR_EVENT_SOURCES }
export type { CalendarEventCategory, CalendarEventOccurrence, CalendarEventSource }

type DatabaseClient = PrismaClient | Prisma.TransactionClient

export interface CalendarListInput {
  projectId: number
  from?: string
  to?: string
  source?: CalendarEventSource
  status?: CalendarEventOccurrence['status']
  assetId?: number
  search?: string
}

export interface CalendarListResult {
  today: string
  events: CalendarEventOccurrence[]
  counts: { total: number; overdue: number; today: number; upcoming: number }
}

const assetSelect = {
  id: true,
  projectId: true,
  code: true,
  name: true,
  location: { select: { label: true, name: true } },
} satisfies Prisma.AssetSelect

function rangeWhere(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: asUtcDate(from) } : {}),
    ...(to ? { lte: asUtcDate(to) } : {}),
  }
}

function toAssetRef(asset: { id: number; code: string; name: string; location: { label: string; name: string } } | null): CalendarEventOccurrence['asset'] {
  return asset ? { id: asset.id, code: asset.code, name: asset.name, location: asset.location.label || asset.location.name } : null
}

function matchesSearch(event: CalendarEventOccurrence, search?: string): boolean {
  if (!search) return true
  const needle = search.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')
  return [event.title, event.sourceLabel, event.asset?.code, event.asset?.name, event.asset?.location]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').includes(needle))
}

/**
 * Fuente de lectura común del calendario. Consulta por rango y por proyecto,
 * normalizando todas las ocurrencias sin trasladar reglas de negocio a React.
 */
export async function listCalendarOccurrences(db: DatabaseClient, input: CalendarListInput): Promise<CalendarListResult> {
  const now = assetEventClock()
  const from = input.from
  const to = input.to
  const dateRange = rangeWhere(from, to)
  const activeAssetWhere = { projectId: input.projectId, deletedAt: null, ...(input.assetId ? { id: input.assetId } : {}) }
  const requested = input.source ? new Set<CalendarEventSource>([input.source]) : new Set<CalendarEventSource>(CALENDAR_EVENT_SOURCES)
  const sources = await Promise.all([
    requested.has('event')
      ? db.event.findMany({
        where: { projectId: input.projectId, ...(input.assetId ? { assetId: input.assetId } : {}), ...(dateRange ? { date: dateRange } : {}) },
        include: { asset: { select: assetSelect } },
      })
      : Promise.resolve([]),
    requested.has('document')
      ? db.document.findMany({
        where: {
          projectId: input.projectId,
          ...(input.assetId ? { assets: { some: { assetId: input.assetId } } } : {}),
          // Un archivo genérico del proyecto sin activo ni título de evento no
          // es una ocurrencia accionable. Los documentos sin activo que sí
          // definen un hito aparecen igualmente como eventos de proyecto.
          OR: [{ assets: { some: { asset: { deletedAt: null } } } }, { eventTitle: { not: null } }],
          versions: { some: { expiryDate: dateRange ?? { not: null } } },
        },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1, select: { expiryDate: true } },
          assets: { where: { asset: activeAssetWhere }, include: { asset: { select: assetSelect } } },
        },
      })
      : Promise.resolve([]),
    requested.has('dynamic-date')
      ? db.assetDateOccurrence.findMany({
        where: { ...(dateRange ? { scheduledDate: dateRange } : {}), schedule: { asset: activeAssetWhere } },
        include: { schedule: { include: { definition: { select: { fieldName: true } }, asset: { select: assetSelect } } } },
      })
      : Promise.resolve([]),
    requested.has('preventive')
      ? db.preventiveExecution.findMany({
        where: {
          ...(dateRange ? { scheduledDate: dateRange } : {}),
          plan: { asset: activeAssetWhere },
          OR: [{ plan: { isActive: true } }, { completedAt: { not: null } }],
        },
        include: { plan: { include: { asset: { select: assetSelect } } }, tasks: { select: { completedAt: true } } },
      })
      : Promise.resolve([]),
  ])

  const [manualEvents, documents, dateOccurrences, preventiveExecutions] = sources
  const documentIds = documents.map((document) => document.id)
  const assetIds = documents.flatMap((document) => document.assets.map((entry) => entry.assetId))
  const acknowledgements = documentIds.length === 0 || assetIds.length === 0
    ? []
    : await db.assetEventAcknowledgement.findMany({
      where: { assetId: { in: assetIds }, sourceKey: { in: documentIds.map((id) => `document:${id}`) } },
      select: { assetId: true, sourceKey: true, completedAt: true, completedDate: true },
    })
  const acknowledgementByAsset = new Map(acknowledgements.map((entry) => [`${entry.assetId}:${entry.sourceKey}`, entry]))

  const events: CalendarEventOccurrence[] = [
    ...manualEvents.map((event) => createCalendarOccurrence({
      source: 'event', sourceId: event.id, projectId: event.projectId, assetId: event.assetId,
      title: event.title, sourceLabel: calendarCategoryLabel(calendarCategoryFromText(event.type)), category: calendarCategoryFromText(event.type),
      date: event.date, completedAt: event.completedAt, today: now, asset: toAssetRef(event.asset), progress: null,
    })),
    ...documents.flatMap((document) => {
      const expiryDate = document.versions[0]?.expiryDate
      if (!expiryDate || (from && expiryDate < asUtcDate(from)) || (to && expiryDate > asUtcDate(to))) return []
      const category = calendarCategoryFromText(`${document.type} ${document.eventTitle ?? ''}`)
      if (document.assets.length === 0) return [createCalendarOccurrence({
        source: 'document', sourceId: document.id, projectId: document.projectId, assetId: null,
        title: document.eventTitle ?? document.name, sourceLabel: document.type, category, date: expiryDate,
        today: now, asset: null, progress: null,
      })]
      return document.assets.map((link) => {
        const acknowledgement = acknowledgementByAsset.get(`${link.assetId}:document:${document.id}`)
        return createCalendarOccurrence({
          source: 'document', sourceId: document.id, projectId: document.projectId, assetId: link.assetId,
          title: document.eventTitle ?? document.name, sourceLabel: document.type, category, date: expiryDate,
          completedAt: acknowledgement?.completedAt, completedDate: acknowledgement?.completedDate, today: now,
          asset: toAssetRef(link.asset), progress: null,
        })
      })
    }),
    ...dateOccurrences.map((occurrence) => createCalendarOccurrence({
      source: 'dynamic-date', sourceId: occurrence.id, projectId: occurrence.schedule.asset.projectId, assetId: occurrence.schedule.assetId,
      title: occurrence.schedule.definition.fieldName, sourceLabel: 'Fecha dinámica', category: calendarCategoryFromText(occurrence.schedule.definition.fieldName),
      date: occurrence.scheduledDate, completedAt: occurrence.completedAt, completedDate: occurrence.completedDate, today: now,
      asset: toAssetRef(occurrence.schedule.asset), progress: null,
    })),
    ...preventiveExecutions.map((execution) => {
      const completed = execution.tasks.filter((task) => task.completedAt).length
      return createCalendarOccurrence({
        source: 'preventive', sourceId: execution.id, projectId: execution.plan.asset.projectId, assetId: execution.plan.assetId,
        title: execution.plan.name, sourceLabel: 'Plan preventivo', category: 'maintenance', date: execution.scheduledDate,
        completedAt: execution.completedAt, completedDate: execution.completedDate, today: now, asset: toAssetRef(execution.plan.asset),
        progress: { completed, total: execution.tasks.length },
      })
    }),
  ]
  const visibleEvents = events
    .filter((event) => !input.status || event.status === input.status)
    .filter((event) => matchesSearch(event, input.search))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
  return {
    today: now.toISOString().slice(0, 10),
    events: visibleEvents,
    counts: {
      total: visibleEvents.length,
      overdue: visibleEvents.filter((event) => event.status === 'overdue').length,
      today: visibleEvents.filter((event) => event.status === 'today').length,
      upcoming: visibleEvents.filter((event) => event.status === 'upcoming').length,
    },
  }
}

export interface CompleteCalendarOccurrenceInput {
  source: CalendarEventSource
  sourceId: number
  assetId?: number | null
  projectId?: number
  performedDate: string
  actorId: number
}

/** Shared mutation used by calendar and asset event panels. */
export async function completeCalendarOccurrence(tx: Prisma.TransactionClient, input: CompleteCalendarOccurrenceInput): Promise<void> {
  const performed = asUtcDate(input.performedDate)
  let entityId = `event:${input.sourceId}`
  if (input.source === 'event') {
    const event = await tx.event.findFirst({ where: { id: input.sourceId, completedAt: null, ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.assetId !== undefined ? { assetId: input.assetId } : {}) }, include: { asset: { select: { code: true } } } })
    if (!event) throw Object.assign(new Error('Event is not pending'), { status: 409 })
    await tx.event.update({ where: { id: event.id }, data: { completedAt: new Date() } })
    entityId = event.asset?.code ?? `event:${event.id}`
  } else if (input.source === 'document') {
    if (!input.assetId) throw Object.assign(new Error('A document occurrence requires an asset'), { status: 400 })
    const document = await tx.documentItem.findFirst({ where: { documentId: input.sourceId, assetId: input.assetId, asset: { deletedAt: null, ...(input.projectId ? { projectId: input.projectId } : {}) } }, include: { asset: { select: { code: true } } } })
    if (!document) throw Object.assign(new Error('Document does not belong to this asset'), { status: 404 })
    await tx.assetEventAcknowledgement.upsert({ where: { assetId_sourceKey: { assetId: input.assetId, sourceKey: `document:${input.sourceId}` } }, create: { assetId: input.assetId, sourceKey: `document:${input.sourceId}`, completedDate: performed }, update: { completedAt: new Date(), completedDate: performed } })
    entityId = document.asset.code
  } else if (input.source === 'dynamic-date') {
    if (!input.assetId) throw Object.assign(new Error('A date occurrence requires an asset'), { status: 400 })
    const occurrence = await tx.assetDateOccurrence.findFirst({ where: { id: input.sourceId, completedAt: null, schedule: { assetId: input.assetId, asset: { deletedAt: null, ...(input.projectId ? { projectId: input.projectId } : {}) } } }, include: { schedule: { include: { asset: { select: { code: true } } } } } })
    if (!occurrence) throw Object.assign(new Error('Date occurrence is not pending'), { status: 409 })
    await completeAssetDateOccurrence(tx, occurrence.id, performed)
    entityId = occurrence.schedule.asset.code
  } else {
    if (!input.assetId) throw Object.assign(new Error('A preventive occurrence requires an asset'), { status: 400 })
    const execution = await tx.preventiveExecution.findFirst({ where: { id: input.sourceId, completedAt: null, plan: { assetId: input.assetId, isActive: true, asset: { deletedAt: null, ...(input.projectId ? { projectId: input.projectId } : {}) } } }, include: { plan: { include: { asset: { select: { code: true } } } }, tasks: true } })
    if (!execution) throw Object.assign(new Error('Preventive execution is not pending'), { status: 409 })
    if (execution.tasks.some((task) => !task.completedAt)) throw Object.assign(new Error('Complete all preventive tasks first'), { status: 409 })
    await tx.preventiveExecution.update({ where: { id: execution.id }, data: { completedAt: new Date(), completedDate: performed } })
    const next = calculateNextExpiry(execution.scheduledDate, performed, execution.plan.periodicityMode as DocumentPeriodicityMode, execution.plan.periodicity as DocumentPeriodicity)
    await createPreventiveExecution(tx, execution.planId, next)
    entityId = execution.plan.asset.code
  }
  await tx.auditLog.create({ data: { userId: input.actorId, action: 'Realización', entityId, detail: `Evento ${input.source}:${input.sourceId} completado el ${input.performedDate}`, timestamp: new Date() } })
}
