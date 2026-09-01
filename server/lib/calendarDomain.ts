import { UPCOMING_THRESHOLD_DAYS } from '../../shared/documentStatus'

export const CALENDAR_EVENT_SOURCES = ['event', 'document', 'dynamic-date', 'preventive'] as const
export type CalendarEventSource = (typeof CALENDAR_EVENT_SOURCES)[number]

export const CALENDAR_EVENT_CATEGORIES = ['expiry', 'calibration', 'maintenance', 'review'] as const
export type CalendarEventCategory = (typeof CALENDAR_EVENT_CATEGORIES)[number]

export type CalendarEventStatus = 'overdue' | 'today' | 'upcoming' | 'pending' | 'completed'
export type CalendarEventAction = 'view_document' | 'open_preventive' | 'complete' | 'view_dynamic_date' | 'view_event'

export interface CalendarEventOccurrence {
  id: string
  source: CalendarEventSource
  sourceId: number
  projectId: number
  assetId: number | null
  title: string
  sourceLabel: string
  category: CalendarEventCategory
  date: string
  status: CalendarEventStatus
  completedAt: string | null
  completedDate: string | null
  periodicity: string | null
  periodicityMode: string | null
  location?: string | null
  asset: { id: number; code: string; name: string; location?: string } | null
  progress: { completed: number; total: number } | null
  canComplete: boolean
  canEdit: boolean
  canDelete: boolean
  primaryAction: CalendarEventAction
}

const DAY_MS = 86_400_000

export function asCalendarDate(value: Date): string {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())).toISOString().slice(0, 10)
}

export function utcCalendarDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

export function calendarEventStatus(date: Date, completedAt: Date | null, today: Date): CalendarEventStatus {
  if (completedAt) return 'completed'
  const difference = Math.round((utcCalendarDay(date) - utcCalendarDay(today)) / DAY_MS)
  if (difference < 0) return 'overdue'
  if (difference === 0) return 'today'
  return difference <= UPCOMING_THRESHOLD_DAYS ? 'upcoming' : 'pending'
}

export function calendarCategoryFromText(value: string | null | undefined, fallback: CalendarEventCategory = 'expiry'): CalendarEventCategory {
  const normalized = (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')
  if (normalized === 'expiry' || normalized === 'calibration' || normalized === 'maintenance' || normalized === 'review') return normalized
  if (normalized.includes('calibr')) return 'calibration'
  if (normalized.includes('manten')) return 'maintenance'
  if (normalized.includes('revision') || normalized.includes('inspecc') || normalized.includes('auditor')) return 'review'
  return fallback
}

export function calendarCategoryLabel(category: CalendarEventCategory): string {
  return ({ expiry: 'Vencimiento', calibration: 'Calibración', maintenance: 'Mantenimiento', review: 'Revisión' })[category]
}

export function calendarOccurrenceId(source: CalendarEventSource, sourceId: number, assetId: number | null): string {
  return source === 'document' && assetId !== null ? `document:${sourceId}:asset:${assetId}` : `${source}:${sourceId}`
}

export function createCalendarOccurrence(input: Omit<CalendarEventOccurrence, 'id' | 'date' | 'status' | 'completedAt' | 'completedDate' | 'periodicity' | 'periodicityMode' | 'canComplete' | 'canEdit' | 'canDelete' | 'primaryAction'> & {
  date: Date
  completedAt?: Date | null
  completedDate?: Date | null
  periodicity?: string | null
  periodicityMode?: string | null
  today: Date
}): CalendarEventOccurrence {
  const completedAt = input.completedAt ?? null
  const status = calendarEventStatus(input.date, completedAt, input.today)
  const hasCompletedPreventiveTasks = input.source !== 'preventive'
    || !input.progress
    || input.progress.completed === input.progress.total
  // Los vencimientos documentales no son completables manualmente.
  const canComplete = status !== 'completed'
    && input.source !== 'document'
    && hasCompletedPreventiveTasks

  const primaryAction: CalendarEventAction = input.source === 'document'
    ? 'view_document'
    : input.source === 'preventive'
      ? 'open_preventive'
      : input.source === 'dynamic-date'
        ? 'view_dynamic_date'
        : 'complete'

  return {
    id: calendarOccurrenceId(input.source, input.sourceId, input.assetId),
    source: input.source,
    sourceId: input.sourceId,
    projectId: input.projectId,
    assetId: input.assetId,
    title: input.title,
    sourceLabel: input.sourceLabel,
    category: input.category,
    date: asCalendarDate(input.date),
    status,
    completedAt: completedAt?.toISOString() ?? null,
    completedDate: input.completedDate ? asCalendarDate(input.completedDate) : null,
    periodicity: input.periodicity ?? null,
    periodicityMode: input.periodicityMode ?? null,
    location: input.location ?? input.asset?.location ?? null,
    asset: input.asset,
    progress: input.progress,
    canComplete,
    canEdit: input.source === 'event',
    canDelete: input.source === 'event',
    primaryAction,
  }
}
