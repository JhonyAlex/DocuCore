import { useCallback, useEffect, useRef, useState } from 'react'
import { calendarRange, type CalendarViewMode } from '@/lib/calendarDates'
import { fetchCalendar, type ApiCalendarResponse } from '@/lib/api'

export function useCalendar(projectId: number, view: CalendarViewMode, date: string | null) {
  const [data, setData] = useState<ApiCalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)

  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    setError(null)
    try {
      const range = date ? calendarRange(view, date) : undefined
      const next = await fetchCalendar(projectId, range ?? {})
      if (request === sequence.current) setData(next)
    } catch (reason) {
      if (request === sequence.current) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el calendario.')
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [date, projectId, view])

  useEffect(() => { void load() }, [load])
  return { data, loading, error, reload: load }
}
