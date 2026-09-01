import { useEffect as lifecycleEffect, useState } from 'react'
import { completeAssetEvent, fetchAssetEventHistory, type ApiAsset, type ApiAssetEventHistory } from '@/lib/api'
import { formatApiDate } from '@/lib/assetMappers'

function status(row: ApiAssetEventHistory): string {
  if (row.completedAt) return `Completado · ${formatApiDate(row.completedDate ?? row.completedAt)}`
  return ({ overdue: 'Vencido', today: 'Hoy', upcoming: 'Próximo', pending: 'Pendiente', completed: 'Completado' })[row.status]
}

interface AssetEventsPanelProps {
  asset: ApiAsset
  onChanged: (asset: ApiAsset) => void
  onOpenPreventive: (executionId: number) => void
  onOpenDocument?: (documentId: number) => void
}

export default function AssetEventsPanel({
  asset,
  onChanged,
  onOpenPreventive,
  onOpenDocument,
}: AssetEventsPanelProps) {
  const [rows, setRows] = useState<ApiAssetEventHistory[]>([])
  const [performedDate, setPerformedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      setRows(await fetchAssetEventHistory(asset.projectId, asset.id))
    } catch {
      setError('No se pudo cargar el historial de eventos.')
    }
  }

  lifecycleEffect(() => {
    void load()
  }, [asset.id, asset.projectId])

  const complete = async (row: ApiAssetEventHistory) => {
    if (row.source === 'document') return
    setBusy(row.id)
    setError(null)
    try {
      const updatedAsset = await completeAssetEvent(asset.projectId, asset.id, row.source, row.id, performedDate)
      onChanged(updatedAsset)
      await load()
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.includes('409')
          ? 'Completa antes todas las tareas del preventivo.'
          : 'No se pudo completar el evento.',
      )
    } finally {
      setBusy(null)
    }
  }

  const handleAction = (row: ApiAssetEventHistory) => {
    if (row.source === 'preventive') {
      onOpenPreventive(row.id)
    } else if (row.source === 'document') {
      if (onOpenDocument) onOpenDocument(row.id)
    } else {
      void complete(row)
    }
  }

  const hasCompletableEvents = rows.some((r) => !r.completedAt && r.source !== 'document')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="font-medium">Eventos y vencimientos</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hitos operativos, tareas programadas y vencimientos documentales del activo.
          </p>
        </div>
        {hasCompletableEvents && (
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Fecha de realización:
            <input
              type="date"
              value={performedDate}
              onChange={(event) => setPerformedDate(event.target.value)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        )}
      </div>

      {error && <p role="alert" className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 text-center">
          Sin eventos registrados.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isDocument = row.source === 'document'
            const isPreventive = row.source === 'preventive'
            const isOverdue = status(row) === 'Vencido'

            return (
              <div
                key={`${row.source}:${row.id}`}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  row.completedAt
                    ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-800/50'
                    : isOverdue
                      ? 'border-red-100 bg-red-50/70 dark:border-red-900/50 dark:bg-red-900/20'
                      : isDocument
                        ? 'border-brand-100 bg-brand-50/40 dark:border-brand-900/40 dark:bg-brand-900/10'
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{row.title}</span>
                    {isDocument && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                        Documento
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {formatApiDate(row.date)} · {row.sourceLabel}
                    {row.progress ? ` · ${row.progress.completed}/${row.progress.total} tareas` : ''}
                  </div>
                </div>

                <span className="text-xs font-medium text-slate-500 shrink-0">{status(row)}</span>

                {!row.completedAt && (
                  <button
                    type="button"
                    onClick={() => handleAction(row)}
                    disabled={!isPreventive && !isDocument && busy === row.id}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-600 dark:border-slate-700 dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                  >
                    {isPreventive
                      ? 'Ver preventivo'
                      : isDocument
                        ? 'Ver documento'
                        : busy === row.id
                          ? 'Completando…'
                          : 'Completar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
