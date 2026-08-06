import type { Item, Pagination } from '@/types'
import StatusChip from '@/components/StatusChip'

const urgencyClass: Record<string, string> = {
  amber: 'text-amber-600',
  red: 'text-red-600',
  slate: 'text-slate-600',
}

interface ItemsTableProps {
  items: Item[]
  loading: boolean
  error: string | null
  pagination: Pagination
  onRowClick: (item: Item) => void
  onPageChange: (page: number) => void
  onRetry: () => void
}

type PageToken = number | 'ellipsis'

function pageWindow(current: number, total: number): PageToken[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: PageToken[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('ellipsis')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('ellipsis')
  pages.push(total)
  return pages
}

export default function ItemsTable({ items, loading, error, pagination, onRowClick, onPageChange, onRetry }: ItemsTableProps) {
  const { page, totalPages, total, limit } = pagination
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const pages = pageWindow(page, totalPages)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium"><input type="checkbox" className="rounded" /></th>
              <th className="text-left px-4 py-3 font-medium">Código</th>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Ubicación</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Próximo evento</th>
              <th className="text-left px-4 py-3 font-medium">Responsable</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-4 py-3"><div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="space-y-1">
                        <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                        <div className="h-2 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-2 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right"><div className="h-4 w-4 ml-auto rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                </tr>
              ))}
            {!loading && error && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-red-600 dark:text-red-400">
                  <div role="alert">
                    <div>{`Error: ${error}`}</div>
                    <button type="button" onClick={onRetry} className="mt-3 px-3 py-1.5 rounded-md border border-red-200 dark:border-red-900 text-sm hover:bg-red-50 dark:hover:bg-red-900/20">Reintentar</button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !error && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">No se encontraron ítems</td>
              </tr>
            )}
            {!loading &&
              !error &&
              items.map((item) => (
                <tr key={item.id} onClick={() => onRowClick(item)} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer">
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded" /></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${item.initialsBgClass} flex items-center justify-center text-xs font-semibold`}>{item.initials}</div>
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-slate-500">{item.serialLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`chip ${item.typeChipClass}`}>{item.type}</span></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.location}</td>
                  <td className="px-4 py-3"><StatusChip label={item.status} chipClass={item.statusChipClass} pulseDot={item.pulseDot} /></td>
                  <td className="px-4 py-3">
                    <div className="text-xs">{item.nextEvent.label}</div>
                    <div className={`text-xs ${urgencyClass[item.nextEvent.urgency]}`}>{item.nextEvent.date}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${item.responsibleColor} text-white text-xs font-medium flex items-center justify-center`}>{item.responsibleInitials}</div>
                      <span className="text-xs">{item.responsible}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {loading ? 'Cargando…' : total === 0 ? 'Sin resultados' : `Mostrando ${start}-${end} de ${total} resultados`}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="px-3 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">Anterior</button>
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`e-${i}`} className="px-2 text-slate-400">…</span>
            ) : (
              <button key={p} onClick={() => onPageChange(p)} className={`px-3 py-1.5 rounded-md text-sm ${p === page ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{p}</button>
            ),
          )}
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="px-3 py-1.5 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">Siguiente</button>
        </div>
      </div>
    </div>
  )
}
