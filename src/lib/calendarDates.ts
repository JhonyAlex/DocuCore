export type CalendarViewMode = 'month' | 'week' | 'day'

const DAY_MS = 86_400_000

export function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid calendar date: ${value}`)
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`Invalid calendar date: ${value}`)
  return date
}

export function calendarDate(value: Date): string {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())).toISOString().slice(0, 10)
}

export function daysInCalendarMonth(value: string): number {
  const date = parseCalendarDate(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

export function monthStart(value: string): string {
  const date = parseCalendarDate(value)
  return calendarDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
}

export function monthEnd(value: string): string {
  const date = parseCalendarDate(value)
  return calendarDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)))
}

export function mondayOffset(value: string): number {
  const weekday = parseCalendarDate(value).getUTCDay()
  return (weekday + 6) % 7
}

export function weekStart(value: string): string {
  const date = parseCalendarDate(value)
  return calendarDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset(value))))
}

export function weekEnd(value: string): string {
  return addCalendarDays(weekStart(value), 6)
}

export function addCalendarDays(value: string, amount: number): string {
  const date = parseCalendarDate(value)
  return calendarDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount)))
}

export function addCalendarMonths(value: string, amount: number): string {
  const date = parseCalendarDate(value)
  const targetMonth = date.getUTCMonth() + amount
  const first = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return calendarDate(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay))))
}

export function navigateCalendarDate(view: CalendarViewMode, value: string, direction: -1 | 1): string {
  if (view === 'month') return addCalendarMonths(value, direction)
  return addCalendarDays(value, view === 'week' ? direction * 7 : direction)
}

export function calendarRange(view: CalendarViewMode, value: string): { from: string; to: string } {
  if (view === 'month') return { from: monthStart(value), to: monthEnd(value) }
  if (view === 'week') return { from: weekStart(value), to: weekEnd(value) }
  return { from: value, to: value }
}

export function calendarMonthLabel(value: string): string {
  const date = parseCalendarDate(value)
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(date)
  return `${month.replace(/^./, (letter) => letter.toUpperCase())} ${date.getUTCFullYear()}`
}

export function calendarLongDate(value: string): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseCalendarDate(value))
}

export function calendarWeekDates(value: string): string[] {
  const start = weekStart(value)
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index))
}

export function calendarDifferenceInDays(left: string, right: string): number {
  return Math.round((parseCalendarDate(left).getTime() - parseCalendarDate(right).getTime()) / DAY_MS)
}
