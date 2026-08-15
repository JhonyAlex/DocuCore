import { useCallback, useEffect, useState } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { downloadHistoryCsv, fetchHistory, type ApiHistoryEntry } from '@/lib/api'
import { formatApiDateTime, getHistoryActionChipClass, responsibleColorMap } from '@/lib/assetMappers'

const HISTORY_PAGE_SIZE = 20

export default function HistoryView() {
  const { projectId } = useProject()
  if (projectId === null) throw new Error('HistoryView requires a project scope')
  const [history, setHistory] = useState<ApiHistoryEntry[]>([])
  const [availableActions, setAvailableActions] = useState<string[]>([])
  const [selectedAction, setSelectedAction] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchHistory(projectId, { action: selectedAction || undefined, page: 1, limit: HISTORY_PAGE_SIZE })
      setHistory(response.data)
      setAvailableActions(response.availableActions ?? [])
    } catch {
      setHistory([])
      setError('No se pudo cargar el historial. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [projectId, selectedAction])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadHistoryCsv(projectId, { action: selectedAction || undefined })
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Historial y auditoría</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Trazabilidad completa de cambios en activos, documentos y eventos</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            id="history-action-filter"
            value={selectedAction}
            onChange={(event) => setSelectedAction(event.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="">Todos los tipos de acción</option>
            {availableActions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
          <button
            id="history-export-btn"
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || history.length === 0}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? 'Exportando…' : 'Exportar'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={() => void loadHistory()} className="font-medium underline">Reintentar</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Usuario</th>
              <th className="text-left px-4 py-3">Acción</th>
              <th className="text-left px-4 py-3">Entidad</th>
              <th className="text-left px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? Array.from({ length: 5 }, (_, index) => (
              <tr key={index} className="animate-pulse"><td colSpan={5} className="px-4 py-3"><div className="h-4 rounded bg-slate-100 dark:bg-slate-800" /></td></tr>
            )) : history.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatApiDateTime(log.timestamp)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full ${responsibleColorMap[log.user.color] ?? 'bg-brand-500'} text-white text-xs font-medium flex items-center justify-center`}>{log.user.initials}</div>
                    <span>{log.user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><span className={`chip ${getHistoryActionChipClass(log.action)}`}>{log.action}</span></td>
                <td className="px-4 py-3 font-mono text-xs">{log.entityId}</td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{log.detail}</td>
              </tr>
            ))}
            {!loading && history.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No se encontraron movimientos registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
