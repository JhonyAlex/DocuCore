import { useEffect, useState } from 'react'
import SearchablePicker, { type SearchableOption } from '@/components/SearchablePicker'
import { fetchAssets, type ApiCalendarEventCategory, type CalendarManualEventInput } from '@/lib/api'
import { calendarCategoryPresentation } from '@/lib/calendarPresentation'
import { useProject } from '@/contexts/ProjectContext'

export interface CalendarEventFormValues extends Omit<CalendarManualEventInput, 'projectId'> { assetLabel?: string }

const categories = Object.keys(calendarCategoryPresentation) as ApiCalendarEventCategory[]

export default function CalendarEventFormModal({ open, initialDate, initial, busy, error, onClose, onSubmit }: { open: boolean; initialDate: string; initial?: CalendarEventFormValues | null; busy: boolean; error: string | null; onClose: () => void; onSubmit: (values: CalendarEventFormValues) => void }) {
  const { projectId } = useProject()
  if (projectId === null) throw new Error('CalendarEventFormModal requires a project scope')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate)
  const [category, setCategory] = useState<ApiCalendarEventCategory>('maintenance')
  const [asset, setAsset] = useState<SearchableOption | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? '')
    setDate(initial?.date ?? initialDate)
    setCategory(initial?.category ?? 'maintenance')
    setAsset(initial?.assetId ? { value: String(initial.assetId), label: initial.assetLabel ?? `Activo #${initial.assetId}` } : null)
  }, [initial, initialDate, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [busy, onClose, open])

  if (!open) return null
  const searchAssets = async (query: string): Promise<SearchableOption[]> => {
    const response = await fetchAssets(projectId, { search: query || undefined, limit: 20 })
    return response.data.map((row) => ({ value: String(row.id), label: `${row.code} · ${row.name}`, hint: row.location?.label ?? row.location?.name }))
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !date) return
    onSubmit({ title: title.trim(), date, category, assetId: asset ? Number(asset.value) : null })
  }
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-12" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><form role="dialog" aria-modal="true" aria-labelledby="calendar-event-form-title" onSubmit={submit} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 id="calendar-event-form-title" className="text-lg font-semibold">{initial ? 'Editar evento' : 'Nuevo evento'}</h2><button type="button" aria-label="Cerrar" onClick={onClose} disabled={busy} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">×</button></div><div className="space-y-4 p-5">{error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</p>}<label className="block text-sm font-medium">Título<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label><label className="block text-sm font-medium">Tipo<select value={category} onChange={(event) => setCategory(event.target.value as ApiCalendarEventCategory)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">{categories.map((item) => <option key={item} value={item}>{calendarCategoryPresentation[item].label}</option>)}</select></label></div><label className="block text-sm font-medium">Activo relacionado <span className="font-normal text-slate-500">(opcional)</span><SearchablePicker value={asset?.value ?? null} selectedLabel={asset?.label ?? null} placeholder="Buscar activo…" ariaLabel="Buscar activo relacionado" allowClear onSearch={searchAssets} onSelect={setAsset} /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">Cancelar</button><button type="submit" disabled={busy || !title.trim() || !date} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear evento'}</button></div></form></div>
}
