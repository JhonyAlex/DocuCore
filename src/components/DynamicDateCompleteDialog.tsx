import { useEffect, useState } from 'react'

interface DynamicDateCompleteDialogProps {
  open: boolean
  fieldName: string
  busy: boolean
  error: string | null
  onConfirm: (performedDate: string) => void
  onCancel: () => void
}

function today(): string {
  const date = new Date()
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10)
}

export default function DynamicDateCompleteDialog({ open, fieldName, busy, error, onConfirm, onCancel }: DynamicDateCompleteDialogProps) {
  const [performedDate, setPerformedDate] = useState(today)

  useEffect(() => {
    if (open) setPerformedDate(today())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [busy, onCancel, open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="complete-dynamic-date-title" className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800"><h3 id="complete-dynamic-date-title" className="font-semibold">Completar {fieldName}</h3></div>
        <div className="p-4">
          <label className="block text-sm">Fecha de realización<input type="date" value={performedDate} onChange={(event) => setPerformedDate(event.target.value)} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></label>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">La siguiente fecha se calculará automáticamente según la periodicidad configurada.</p>
          {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">Cancelar</button>
          <button type="button" onClick={() => onConfirm(performedDate)} disabled={busy || !performedDate} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Programando…' : 'Completar y programar'}</button>
        </div>
      </div>
    </div>
  )
}
