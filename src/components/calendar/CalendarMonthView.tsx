import { addCalendarDays, daysInCalendarMonth, mondayOffset, monthStart, parseCalendarDate } from '@/lib/calendarDates'
import { calendarChipClass } from '@/lib/calendarPresentation'
import type { ApiCalendarEventOccurrence } from '@/lib/api'

interface CalendarMonthViewProps {
  date: string
  today: string
  events: ApiCalendarEventOccurrence[]
  onOpenEvent: (event: ApiCalendarEventOccurrence) => void
  onOpenDay: (date: string) => void
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_CHIPS = 2

export default function CalendarMonthView({ date, today, events, onOpenEvent, onOpenDay }: CalendarMonthViewProps) {
  const first = monthStart(date)
  const emptyCells = Array.from({ length: mondayOffset(first) })
  const days = Array.from({ length: daysInCalendarMonth(first) }, (_, index) => addCalendarDays(first, index))
  const byDate = new Map<string, ApiCalendarEventOccurrence[]>()
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event])

  return <>
    <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500">
      {WEEKDAYS.map((label) => <div key={label} className="p-2 text-center font-medium">{label}</div>)}
    </div>
    <div className="grid grid-cols-7 text-sm">
      {emptyCells.map((_, index) => <div key={`empty-${index}`} className="cal-cell border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-2" />)}
      {days.map((day) => {
        const dayEvents = byDate.get(day) ?? []
        const isToday = day === today
        return <div key={day} className="cal-cell border border-slate-100 dark:border-slate-800 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer text-left">
          <span className="flex items-center justify-between mb-1"><span className={isToday ? 'w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-semibold flex items-center justify-center' : 'text-xs font-medium'}>{parseCalendarDate(day).getUTCDate()}</span></span>
          <span className="space-y-1 block">
            {dayEvents.slice(0, MAX_CHIPS).map((event) => <button key={event.id} type="button" onClick={() => onOpenEvent(event)} className={`${calendarChipClass(event)} text-white text-[10px] px-1.5 py-0.5 rounded truncate block w-full text-left`}>{event.title}</button>)}
            {dayEvents.length > MAX_CHIPS && <button type="button" onClick={() => onOpenDay(day)} className="text-[10px] text-brand-600 dark:text-brand-300">+{dayEvents.length - MAX_CHIPS} más</button>}
          </span>
        </div>
      })}
    </div>
  </>
}
