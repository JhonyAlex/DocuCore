import type { Asset, Pagination } from '@/types'
import StatusChip from '@/components/StatusChip'
import RowActionsMenu, { type RowActionsMenuItem } from '@/components/RowActionsMenu'
import TableSortHeader from '@/components/TableSortHeader'
import { useTableDragScroll } from '@/hooks/useTableDragScroll'

const urgencyClass: Record<string, string> = {
  amber: 'text-amber-600',
  red: 'text-red-600',
  slate: 'text-slate-600',
}

interface AssetsTableProps {
  assets: Asset[]
  loading: boolean
  error: string | null
  pagination: Pagination
  trashMode?: boolean
  selectedIds: Set<number>
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (field: string) => void
  onToggleSelect: (id: number) => void
  onToggleSelectPage: (ids: number[]) => void
  onRowClick: (asset: Asset) => void
  onDuplicate: (asset: Asset) => void
  onDelete: (asset: Asset) => void
  onRestore: (asset: Asset) => void
  onPurge: (asset: Asset) => void
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

function menuItemsFor(asset: Asset, trashMode: boolean, handlers: Pick<AssetsTableProps, 'onDuplicate' | 'onDelete' | 'onRestore' | 'onPurge'>): RowActionsMenuItem[] {
  if (trashMode) {
    return [
      { label: 'Restaurar', onSelect: () => handlers.onRestore(asset), variant: 'success' },
      { label: 'Eliminar definitivamente', onSelect: () => handlers.onPurge(asset), variant: 'danger' },
    ]
  }
  return [
    { label: 'Duplicar', onSelect: () => handlers.onDuplicate(asset) },
    { label: 'Eliminar', onSelect: () => handlers.onDelete(asset), variant: 'danger' },
  ]
}

export default function AssetsTable({ assets, loading, error, pagination, trashMode = false, selectedIds, sortBy, sortOrder, onSort, onToggleSelect, onToggleSelectPage, onRowClick, onDuplicate, onDelete, onRestore, onPurge, onPageChange, onRetry }: AssetsTableProps) {
  const tableContainerRef = useTableDragScroll<HTMLDivElement>()
  const { page, totalPages, total, limit } = pagination
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const pages = pageWindow(page, totalPages)
  const assetIds = assets.map((a) => a.id)
  const allSelected = assetIds.length > 0 && assetIds.every((id) => selectedIds.has(id))
  const someSelected = assetIds.some((id) => selectedIds.has(id)) && !allSelected

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div ref={tableContainerRef} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <input type="checkbox" className="rounded" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected }} onChange={() => onToggleSelectPage(assetIds)} aria-label="Seleccionar todos los activos de la página" />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <TableSortHeader label="Código" field="code" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={onSort} />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <TableSortHeader label="Nombre" field="name" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={onSort} />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <TableSortHeader label="Tipo" field="type" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={onSort} />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <TableSortHeader label="Ubicación" field="location" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={onSort} />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <TableSortHeader label="Estado" field="status" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={onSort} />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <TableSortHeader label={trashMode ? 'Eliminación' : 'Próximo evento'} field={trashMode ? 'deletedAt' : 'nextEvent'} currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={onSort} />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                <TableSortHeader label="Responsable" field="responsible" currentSortBy={sortBy} currentSortOrder={sortOrder} onSort={onSort} />
              </th>
              <th className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800 text-right px-4 py-3 font-medium whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="h-3 w-12 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="space-y-1">
                        <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                        <div className="h-2 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-2 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                  </td>
                  <td className="sticky right-0 bg-white dark:bg-slate-900 px-4 py-3 text-right whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]"><div className="h-4 w-4 ml-auto rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /></td>
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
            {!loading && !error && assets.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">{trashMode ? 'La papelera está vacía' : 'No se encontraron activos'}</td>
              </tr>
            )}
            {!loading &&
              !error &&
              assets.map((asset) => (
                <tr key={asset.id} onClick={() => !trashMode && onRowClick(asset)} className={`group ${trashMode ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer'}`}>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="rounded" checked={selectedIds.has(asset.id)} onChange={() => onToggleSelect(asset.id)} aria-label={`Seleccionar ${asset.code}`} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{asset.code}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3 min-w-0 max-w-xs">
                      <div data-asset-type-color={asset.typeColorKey} className={`w-8 h-8 shrink-0 rounded-lg ${asset.initialsBgClass} flex items-center justify-center text-xs font-semibold`}>{asset.initials}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate" title={asset.name}>{asset.name}</div>
                        <div className="text-xs text-slate-500 truncate" title={asset.serialLabel}>{asset.serialLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={`chip ${asset.typeChipClass}`}>{asset.type}</span></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-44 truncate" title={asset.location}>{asset.location}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusChip label={asset.status} chipClass={asset.statusChipClass} pulseDot={asset.pulseDot} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {trashMode ? (
                      asset.deletedLabel ? (
                        <div className="text-xs text-red-600 dark:text-red-400 max-w-36 truncate" title={asset.deletedLabel}>{asset.deletedLabel}</div>
                      ) : (
                        <div className="text-xs text-slate-400">—</div>
                      )
                    ) : (
                      asset.nextEvent ? (
                        <div className="min-w-0 max-w-40">
                          <div className="text-xs truncate" title={asset.nextEvent.label}>{asset.nextEvent.label}</div>
                          <div className={`text-xs truncate ${urgencyClass[asset.nextEvent.urgency]}`}>{asset.nextEvent.date}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">Sin eventos programados</div>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2 min-w-0 max-w-36">
                      <div className={`w-6 h-6 shrink-0 rounded-full ${asset.responsibleColor} text-white text-xs font-medium flex items-center justify-center`}>{asset.responsibleInitials}</div>
                      <span className="text-xs truncate" title={asset.responsible}>{asset.responsible}</span>
                    </div>
                  </td>
                  <td className="sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/70 px-4 py-3 text-right whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu items={menuItemsFor(asset, trashMode, { onDuplicate, onDelete, onRestore, onPurge })} ariaLabel={`Acciones de ${asset.code}`} />
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
