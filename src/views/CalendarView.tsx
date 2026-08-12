import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ConfirmDialog from '@/components/ConfirmDialog'
import CalendarDayView from '@/components/calendar/CalendarDayView'
import CalendarEventDetails from '@/components/calendar/CalendarEventDetails'
import CalendarEventFormModal, { type CalendarEventFormValues } from '@/components/calendar/CalendarEventFormModal'
import CalendarMonthView from '@/components/calendar/CalendarMonthView'
import CalendarToolbar from '@/components/calendar/CalendarToolbar'
import CalendarWeekView from '@/components/calendar/CalendarWeekView'
import { useSession } from '@/contexts/SessionContext'
import { useCalendar } from '@/hooks/useCalendar'
import { calendarLongDate, calendarMonthLabel, navigateCalendarDate, type CalendarViewMode } from '@/lib/calendarDates'
import { completeCalendarEvent, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, type ApiCalendarEventCategory, type ApiCalendarEventOccurrence } from '@/lib/api'

const allCategories = new Set<ApiCalendarEventCategory>(['expiry', 'calibration', 'maintenance', 'review'])
const views: CalendarViewMode[] = ['month', 'week', 'day']

function isCalendarView(value: string | null): value is CalendarViewMode { return value !== null && views.includes(value as CalendarViewMode) }

export default function CalendarView() {
  const { session, loading: sessionLoading } = useSession()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const requestedView = params.get('view')
  const view: CalendarViewMode = isCalendarView(requestedView) ? requestedView : 'month'
  const queryDate = params.get('date')
  const { data, loading, error, reload } = useCalendar(session?.project.id, view, queryDate)
  const date = queryDate ?? data?.today ?? null
  const [categories, setCategories] = useState<Set<ApiCalendarEventCategory>>(allCategories)
  const [selected, setSelected] = useState<ApiCalendarEventOccurrence | null>(null)
  const [form, setForm] = useState<CalendarEventFormValues | null | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState<ApiCalendarEventOccurrence | null>(null)
  const [busy, setBusy] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)

  useEffect(() => {
    if (!data || queryDate) return
    setParams({ view, date: data.today }, { replace: true })
  }, [data, queryDate, setParams, view])

  useEffect(() => {
    if (!selected || !data) return
    const current = data.events.find((event) => event.id === selected.id)
    if (!current) setSelected(null)
    else setSelected(current)
  }, [data, selected])

  const setContext = (nextView: CalendarViewMode, nextDate: string) => setParams({ view: nextView, date: nextDate })
  const toggleCategory = (category: ApiCalendarEventCategory) => setCategories((current) => {
    const next = new Set(current)
    if (next.has(category) && next.size > 1) next.delete(category)
    else next.add(category)
    return next
  })
  const closeLayers = () => { if (!busy) { setSelected(null); setForm(undefined); setOperationError(null) } }
  const selectedEvents = data?.events.filter((event) => categories.has(event.category)) ?? []
  const title = !date ? 'Calendario' : view === 'month' ? calendarMonthLabel(date) : view === 'week' ? `Semana del ${calendarLongDate(date)}` : calendarLongDate(date)
  const openNew = () => { setOperationError(null); setSelected(null); setForm(null) }
  const submitForm = async (values: CalendarEventFormValues) => {
    if (!session) return
    setBusy(true); setOperationError(null)
    try {
      if (form && form.title) await updateCalendarEvent(selected?.sourceId ?? 0, values)
      else await createCalendarEvent({ ...values, projectId: session.project.id })
      setForm(undefined); setSelected(null); await reload()
    } catch (reason) { setOperationError(reason instanceof Error ? reason.message : 'No se pudo guardar el evento.') } finally { setBusy(false) }
  }
  const complete = async () => {
    if (!selected) return
    setBusy(true); setOperationError(null)
    try { await completeCalendarEvent({ source: selected.source, sourceId: selected.sourceId, assetId: selected.assetId, projectId: selected.projectId, performedDate: data?.today ?? selected.date }); await reload() } catch (reason) { setOperationError(reason instanceof Error && reason.message.includes('409') ? 'Completa antes todas las tareas del preventivo.' : reason instanceof Error ? reason.message : 'No se pudo completar el evento.') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!confirmDelete) return
    setBusy(true); setOperationError(null)
    try { await deleteCalendarEvent(confirmDelete.sourceId); setConfirmDelete(null); setSelected(null); await reload() } catch (reason) { setOperationError(reason instanceof Error ? reason.message : 'No se pudo eliminar el evento.') } finally { setBusy(false) }
  }

  if (error) return <section className="fade-in"><h1 className="text-2xl font-semibold tracking-tight">Calendario</h1><div role="alert" className="mt-6 rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">No se pudo cargar el calendario. <button type="button" onClick={() => void reload()} className="font-medium underline">Reintentar</button></div></section>
  if (sessionLoading || !session || loading || !date || !data) return <section className="fade-in" aria-busy="true"><div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Cargando calendario…</div></section>

  return <section className="fade-in">
    <div className="flex items-end justify-between mb-6"><div><h1 className="text-2xl font-semibold tracking-tight">Calendario</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Eventos, vencimientos, calibraciones y mantenimientos</p></div><div className="flex items-center gap-2"><div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1">{views.map((option) => <button key={option} type="button" onClick={() => setContext(option, date)} className={`px-3 py-1.5 text-sm rounded-md ${view === option ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{option === 'month' ? 'Mes' : option === 'week' ? 'Semana' : 'Día'}</button>)}</div><button type="button" onClick={() => openNew()} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" /></svg>Nuevo evento</button></div></div>
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"><CalendarToolbar view={view} title={title} activeCategories={categories} onPrevious={() => setContext(view, navigateCalendarDate(view, date, -1))} onNext={() => setContext(view, navigateCalendarDate(view, date, 1))} onToday={() => setContext(view, data.today)} onToggleCategory={toggleCategory} />{view === 'month' ? <CalendarMonthView date={date} today={data.today} events={selectedEvents} onOpenEvent={setSelected} onOpenDay={(day) => setContext('day', day)} /> : view === 'week' ? <CalendarWeekView date={date} events={selectedEvents} onOpenEvent={setSelected} onOpenDay={(day) => setContext('day', day)} /> : <CalendarDayView date={date} events={selectedEvents} onOpenEvent={setSelected} />}</div>
    <CalendarEventDetails event={selected} busy={busy} error={operationError} onClose={closeLayers} onComplete={() => void complete()} onEdit={() => { if (!selected) return; setOperationError(null); setForm({ title: selected.title, date: selected.date, category: selected.category, assetId: selected.assetId, assetLabel: selected.asset ? `${selected.asset.code} · ${selected.asset.name}` : undefined }) }} onDelete={() => setConfirmDelete(selected)} onOpenAsset={() => { if (selected?.assetId) navigate(`/assets?assetId=${selected.assetId}`) }} onOpenDomain={() => navigate(selected?.source === 'document' ? '/docs' : `/assets?assetId=${selected?.assetId ?? ''}${selected?.source === 'preventive' ? `&preventiveExecutionId=${selected.sourceId}` : ''}`)} />
    <CalendarEventFormModal open={form !== undefined} initialDate={date} initial={form ?? null} busy={busy} error={operationError} onClose={closeLayers} onSubmit={(values) => void submitForm(values)} />
    <ConfirmDialog open={confirmDelete !== null} title="Eliminar evento" message={`Eliminarás definitivamente «${confirmDelete?.title ?? ''}». Esta acción no se puede deshacer.`} confirmLabel="Eliminar evento" busy={busy} busyLabel="Eliminando…" error={operationError} onCancel={() => !busy && setConfirmDelete(null)} onConfirm={() => void remove()} />
  </section>
}
