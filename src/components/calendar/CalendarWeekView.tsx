import { calendarLongDate, calendarWeekDates } from '@/lib/calendarDates'
import { calendarChipClass, calendarStatusLabel } from '@/lib/calendarPresentation'
import type { ApiCalendarEventOccurrence } from '@/lib/api'

export default function CalendarWeekView({ date, events, onOpenEvent, onOpenDay }: { date: string; events: ApiCalendarEventOccurrence[]; onOpenEvent: (event: ApiCalendarEventOccurrence) => void; onOpenDay: (date: string) => void }) {
  const byDate = new Map<string, ApiCalendarEventOccurrence[]>()
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event])
  return <div className="grid grid-cols-1 divide-y divide-slate-200 dark:divide-slate-800 md:grid-cols-7 md:divide-x md:divide-y-0">
    {calendarWeekDates(date).map((day) => <section key={day} className="min-h-56 p-3"><button type="button" onClick={() => onOpenDay(day)} className="mb-3 text-left text-xs font-semibold capitalize hover:text-brand-600">{calendarLongDate(day)}</button><div className="space-y-2">{(byDate.get(day) ?? []).map((event) => <button key={event.id} type="button" onClick={() => onOpenEvent(event)} className={`${calendarChipClass(event)} w-full rounded px-2 py-1 text-left text-xs text-white`}><span className="block truncate">{event.title}</span><span className="block text-[10px] opacity-85">{calendarStatusLabel[event.status]}</span></button>)}</div></section>)}
  </div>
}
