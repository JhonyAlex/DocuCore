import type { ApiCalendarEventCategory, ApiCalendarEventOccurrence, ApiCalendarEventStatus } from '@/lib/api'

export const calendarCategoryPresentation: Record<ApiCalendarEventCategory, { label: string; chipClass: string; dotClass: string }> = {
  expiry: { label: 'Vencimiento', chipClass: 'bg-red-500', dotClass: 'bg-red-500' },
  calibration: { label: 'Calibración', chipClass: 'bg-amber-500', dotClass: 'bg-amber-500' },
  maintenance: { label: 'Mantenimiento', chipClass: 'bg-brand-500', dotClass: 'bg-brand-500' },
  review: { label: 'Revisión', chipClass: 'bg-emerald-500', dotClass: 'bg-emerald-500' },
}

export const calendarStatusLabel: Record<ApiCalendarEventStatus, string> = {
  overdue: 'Vencido', today: 'Hoy', upcoming: 'Próximo', pending: 'Pendiente', completed: 'Completado',
}

export function calendarChipClass(event: ApiCalendarEventOccurrence): string {
  const base = calendarCategoryPresentation[event.category].chipClass
  return event.status === 'completed' ? `${base} opacity-55 line-through` : event.status === 'overdue' ? `${base} ring-1 ring-red-200 dark:ring-red-400/70` : base
}
