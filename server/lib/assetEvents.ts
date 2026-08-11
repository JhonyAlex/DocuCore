export type DerivedEventUrgency = 'amber' | 'red' | 'slate'
export type DerivedEventSource = 'event' | 'document' | 'dynamic-date' | 'preventive'

export interface DerivedAssetEvent {
  id: string
  title: string
  date: string
  daysUntil: number
  urgency: DerivedEventUrgency
  source: DerivedEventSource
  sourceLabel: string
}

interface RelatedEvent {
  id: number
  title: string
  date: Date
  type: string
  completedAt?: Date | null
}

interface RelatedDocument {
  id: number
  name: string
  eventTitle: string | null
  type: string
  versions: Array<{ expiryDate: Date | null }>
}

interface DateFieldValue {
  id: number
  dateValue: Date | null
  definition: {
    id: number
    fieldName: string
    eventTitle?: string | null
    fieldType: string
    isActive: boolean
  }
}

interface DateSchedule {
  id: number
  definition: { fieldName: string }
  occurrences: Array<{ id: number; scheduledDate: Date; completedAt: Date | null }>
}

interface PreventivePlan {
  id: number
  name: string
  executions: Array<{ id: number; scheduledDate: Date; completedAt: Date | null; tasks: Array<{ completedAt: Date | null }> }>
}

export interface AssetEventRelations {
  events: RelatedEvent[]
  documents: RelatedDocument[]
  dynamicFieldValues: DateFieldValue[]
  dateSchedules?: DateSchedule[]
  preventivePlans?: PreventivePlan[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function parseRelationDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(trimmed)
  const euMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed)
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : euMatch
      ? { year: Number(euMatch[3]), month: Number(euMatch[2]), day: Number(euMatch[1]) }
      : null

  if (!parts) return null
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const valid = date.getUTCFullYear() === parts.year
    && date.getUTCMonth() === parts.month - 1
    && date.getUTCDate() === parts.day
  return valid ? date : null
}

function urgencyFor(daysUntil: number): DerivedEventUrgency {
  if (daysUntil < 0) return 'red'
  if (daysUntil <= 21) return 'amber'
  return 'slate'
}

function toDerivedEvent(
  id: string,
  title: string,
  date: Date,
  source: DerivedEventSource,
  sourceLabel: string,
  now: Date,
): DerivedAssetEvent {
  const daysUntil = Math.round((utcDay(date) - utcDay(now)) / DAY_MS)
  return {
    id,
    title,
    date: new Date(utcDay(date)).toISOString(),
    daysUntil,
    urgency: urgencyFor(daysUntil),
    source,
    sourceLabel,
  }
}

export function deriveAssetEvents(relations: AssetEventRelations, now = new Date()): DerivedAssetEvent[] {
  const derived: DerivedAssetEvent[] = relations.events.filter((event) => !event.completedAt).map((event) =>
    toDerivedEvent(`event:${event.id}`, event.title, event.date, 'event', event.type, now),
  )

  for (const document of relations.documents) {
    const date = parseRelationDate(document.versions[0]?.expiryDate)
    if (!date) continue
    derived.push(toDerivedEvent(
      `document:${document.id}`,
      document.eventTitle ?? document.name,
      date,
      'document',
      document.type,
      now,
    ))
  }

  for (const schedule of relations.dateSchedules ?? []) {
    const occurrence = schedule.occurrences.find((entry) => !entry.completedAt)
    if (!occurrence) continue
    derived.push(toDerivedEvent(`dynamic-date:${occurrence.id}`, schedule.definition.fieldName, occurrence.scheduledDate, 'dynamic-date', 'Fecha', now))
  }

  // Legacy fallback for databases which have not yet run the migration.
  if ((relations.dateSchedules?.length ?? 0) === 0) for (const value of relations.dynamicFieldValues) {
    const definition = value.definition
    if (!definition.isActive || definition.fieldType !== 'DATE') continue
    const date = parseRelationDate(value.dateValue)
    if (!date) continue
    derived.push(toDerivedEvent(
      `dynamic-field:${value.id}`,
      definition.fieldName,
      date,
      'dynamic-date',
      'Campo dinámico',
      now,
    ))
  }

  for (const plan of relations.preventivePlans ?? []) {
    const execution = plan.executions.find((entry) => !entry.completedAt)
    if (!execution) continue
    const completed = execution.tasks.filter((task) => task.completedAt).length
    derived.push(toDerivedEvent(`preventive:${execution.id}`, plan.name, execution.scheduledDate, 'preventive', `${completed}/${execution.tasks.length} tareas`, now))
  }

  return derived.sort((left, right) => {
    const dateDifference = Date.parse(left.date) - Date.parse(right.date)
    return dateDifference !== 0 ? dateDifference : left.id.localeCompare(right.id)
  })
}
