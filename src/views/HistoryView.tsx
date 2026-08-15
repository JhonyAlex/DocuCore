import { useCallback, useEffect, useState } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import {
  fetchHistory,
  fetchUsers,
  downloadHistoryCsv,
  type ApiHistoryEntry,
  type ApiUserRef,
} from '@/lib/api'
import { formatApiDateTime, getHistoryActionChipClass, responsibleColorMap } from '@/lib/assetMappers'

const LIMIT = 20

export default function HistoryView() {
  const { projectId } = useProject()
  if (projectId === null) throw new Error('HistoryView requires a project scope')
  const [users, setUsers] = useState<ApiUserRef[]>([])
  const [history, setHistory] = useState<ApiHistoryEntry[]>([])
  const [availableActions, setAvailableActions] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros interactivos
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined)
  const [selectedAction, setSelectedAction] = useState<string>('')

  // Debounce de búsqueda
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // Carga inicial de usuarios para el filtro
  useEffect(() => {
    let active = true
    fetchUsers(projectId)
      .then((data) => {
        if (active) setUsers(data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [projectId])

  // Carga de historial remoto
  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchHistory(projectId, {
        search: debouncedSearch || undefined,
        userId: selectedUserId,
        action: selectedAction || undefined,
        page,
        limit: LIMIT,
      })
      setHistory(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      if (res.availableActions && res.availableActions.length > 0) {
        setAvailableActions(res.availableActions)
      }
    } catch {
      setError('No se pudo cargar el historial. Inténtalo de nuevo.')
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [projectId, debouncedSearch, selectedUserId, selectedAction, page])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadHistoryCsv(projectId, {
        search: debouncedSearch || undefined,
        userId: selectedUserId,
        action: selectedAction || undefined,
      })
    } catch {
      alert('Error al exportar el archivo CSV de historial')
    } finally {
      setExporting(false)
    }
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setDebouncedSearch('')
    setSelectedUserId(undefined)
    setSelectedAction('')
    setPage(1)
  }

  const hasActiveFilters = Boolean(debouncedSearch || selectedUserId || selectedAction)
  const fromRecord = total === 0 ? 0 : (page - 1) * LIMIT + 1
  const toRecord = Math.min(page * LIMIT, total)

  return (
    <section className="fade-in space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Historial y auditoría
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Trazabilidad completa de cambios en activos, documentos, planos, eventos y configuración
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="history-export-btn"
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {exporting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Exportando...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Exportar CSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 relative">
          <svg
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="history-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por texto, entidad o detalle..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold px-1"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filtro de Usuario */}
          <select
            id="history-user-filter"
            value={selectedUserId ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : undefined
              setSelectedUserId(val)
              setPage(1)
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
          >
            <option value="">Todos los usuarios</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          {/* Filtro de Acción */}
          <select
            id="history-action-filter"
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
          >
            <option value="">Todos los tipos de acción</option>
            {availableActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => void loadHistory()}
            className="underline font-medium hover:text-rose-900 dark:hover:text-rose-100 ml-4"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla de Historial */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="text-left px-4 py-3.5 font-medium whitespace-nowrap">Fecha y hora</th>
                <th className="text-left px-4 py-3.5 font-medium">Usuario</th>
                <th className="text-left px-4 py-3.5 font-medium">Acción</th>
                <th className="text-left px-4 py-3.5 font-medium">Entidad</th>
                <th className="text-left px-4 py-3.5 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-32" /></td>
                    <td className="px-4 py-3.5"><div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-full w-20" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48" /></td>
                  </tr>
                ))
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <svg className="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium">No se encontraron movimientos registrados</p>
                      {hasActiveFilters && (
                        <p className="text-xs text-slate-400">
                          Prueba a cambiar o{' '}
                          <button onClick={handleClearFilters} className="text-brand-600 dark:text-brand-400 underline font-medium">
                            limpiar los filtros aplicados
                          </button>
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                history.map((log) => {
                  const userColorClass = responsibleColorMap[log.user.color] || 'bg-brand-500'
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-medium">
                        {formatApiDateTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${userColorClass} text-white text-xs font-semibold flex items-center justify-center shrink-0 shadow-sm`}>
                            {log.user.initials}
                          </div>
                          <span className="font-medium text-slate-900 dark:text-slate-100">{log.user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHistoryActionChipClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60">
                          {log.entityId}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {log.detail}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
            <div>
              Mostrando <span className="font-medium text-slate-700 dark:text-slate-300">{fromRecord}</span> a{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{toRecord}</span> de{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{total}</span> registros
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
