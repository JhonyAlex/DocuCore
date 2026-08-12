import { describe, expect, it } from 'vitest'
import { addCalendarMonths, calendarRange, daysInCalendarMonth, mondayOffset, navigateCalendarDate, parseCalendarDate, weekEnd, weekStart } from '@/lib/calendarDates'
import { calendarCategoryPresentation } from '@/lib/calendarPresentation'
import { calendarEventStatus } from '../../server/lib/calendarDomain'

describe('calendar date helpers', () => {
  it('keeps date-only values in UTC without a timezone shift', () => {
    expect(parseCalendarDate('2026-08-12').toISOString()).toBe('2026-08-12T00:00:00.000Z')
  })

  it('calculates leap February and Monday-first offsets', () => {
    expect(daysInCalendarMonth('2028-02-01')).toBe(29)
    expect(mondayOffset('2026-07-01')).toBe(2)
  })

  it('navigates month boundaries and clamps dates consistently', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(navigateCalendarDate('month', '2026-12-15', 1)).toBe('2027-01-15')
    expect(navigateCalendarDate('week', '2026-07-15', -1)).toBe('2026-07-08')
  })

  it('builds Monday through Sunday ranges', () => {
    expect(weekStart('2026-07-15')).toBe('2026-07-13')
    expect(weekEnd('2026-07-15')).toBe('2026-07-19')
    expect(calendarRange('month', '2026-07-15')).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('classifies temporal state and category presentation independently', () => {
    const today = parseCalendarDate('2026-07-15')
    expect(calendarEventStatus(parseCalendarDate('2026-07-14'), null, today)).toBe('overdue')
    expect(calendarEventStatus(parseCalendarDate('2026-07-15'), null, today)).toBe('today')
    expect(calendarEventStatus(parseCalendarDate('2026-07-20'), null, today)).toBe('upcoming')
    expect(calendarEventStatus(parseCalendarDate('2026-08-20'), null, today)).toBe('pending')
    expect(calendarEventStatus(parseCalendarDate('2026-07-14'), new Date(), today)).toBe('completed')
    expect(calendarCategoryPresentation.maintenance.label).toBe('Mantenimiento')
  })
})
