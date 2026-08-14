import { useEffect, useRef, useState } from 'react'
import StatusColorPicker from '@/components/StatusColorPicker'
import StatusChip from '@/components/StatusChip'
import type { ApiStatus, StatusInput } from '@/lib/api'
import { DEFAULT_STATUS_COLOR_KEY, statusColorMap, type StatusColorKey } from '../../shared/statusCatalog'
import type { PulseColor } from '@/types'

interface StatusFormModalProps {
  status: ApiStatus | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: StatusInput) => void
}

export default function StatusFormModal({ status, busy, error, onClose, onSubmit }: StatusFormModalProps) {
  const [name, setName] = useState(status?.name ?? '')
  const [color, setColor] = useState<StatusColorKey>((status?.color as StatusColorKey) ?? DEFAULT_STATUS_COLOR_KEY)
  const [hasPulseDot, setHasPulseDot] = useState<boolean>(Boolean(status?.pulseDot))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(status?.name ?? '')
    setColor((status?.color as StatusColorKey) ?? DEFAULT_STATUS_COLOR_KEY)
    setHasPulseDot(Boolean(status?.pulseDot))
  }, [status])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    inputRef.current?.focus()
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  const previewName = name.trim() || 'Nombre del estado'
  const previewChipClass = statusColorMap[color] ?? statusColorMap[DEFAULT_STATUS_COLOR_KEY]
  const pulseDotValue = hasPulseDot ? ('red' as PulseColor) : undefined

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-form-title"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <div className="text-xs font-mono text-slate-500">{status ? `ESTADO ${status.id}` : 'NUEVO ESTADO'}</div>
            <h3 id="status-form-title" className="text-lg font-semibold">
              {status ? 'Editar estado' : 'Nuevo estado'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit({
              name,
              color,
              pulseDot: hasPulseDot ? 'red' : null,
            })
          }}
        >
          <div className="space-y-4 p-5">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
              >
                {error}
              </p>
            )}

            <label className="block text-xs font-medium">
              Nombre del estado
              <input
                ref={inputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                placeholder="Ej. En calibración, En reparación…"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <StatusColorPicker value={color} disabled={busy} onChange={setColor} />

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="checkbox"
                  checked={hasPulseDot}
                  disabled={busy}
                  onChange={(event) => setHasPulseDot(event.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                Punto pulsante de alerta
              </label>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 pl-5">
                Muestra un indicador parpadeante para estados críticos o que requieren atención inmediata.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Vista previa del chip:</span>
              <div className="mt-2 flex items-center gap-2">
                <StatusChip label={previewName} chipClass={previewChipClass} pulseDot={pulseDotValue} />
              </div>
            </div>

            {status && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <p>{status.assetCount ?? 0} activos asociados actualmente</p>
                <p className="mt-1">El color y el nuevo nombre se reflejarán automáticamente en activos, filtros y planos.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || name.trim() === ''}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-brand-700"
            >
              {busy ? 'Guardando…' : status ? 'Guardar cambios' : 'Crear estado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
