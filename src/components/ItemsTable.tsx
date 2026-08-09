import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
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
  onDuplicate: (item: Item) => void
  onPageChange: (page: number) => void
  onRetry: () => void
}

type PageToken = number | 'ellipsis'

interface ActionsMenuState {
  item: Item
  top: number
  left: number
}

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

export default function ItemsTable({ items, loading, error, pagination, onRowClick, onDuplicate, onPageChange, onRetry }: ItemsTableProps) {
  const [actionsMenu, setActionsMenu] = useState<ActionsMenuState | null>(null)
  const { page, totalPages, total, limit } = pagination
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const pages = pageWindow(page, totalPages)

  useEffect(() => {
    if (!actionsMenu) return

    const closeMenu = () => setActionsMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }

    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)

    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [actionsMenu])

  const toggleActionsMenu = (event: MouseEvent<HTMLButtonElement>, item: Item) => {
    if (actionsMenu?.item.id === item.id) {
      setActionsMenu(null)
      return
    }

    const buttonRect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 144
    const viewportPadding = 8
    setActionsMenu({
      item,
      top: buttonRect.bottom + 4,
      left: Math.min(
        window.innerWidth - menuWidth - viewportPadding,
        Math.max(viewportPadding, buttonRect.right - menuWidth),
      ),
    })
  }

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
                    {item.nextEvent ? (
                      <>
                        <div className="text-xs">{item.nextEvent.label}</div>
                        <div className={`text-xs ${urgencyClass[item.nextEvent.urgency]}`}>{item.nextEvent.date}</div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-400">Sin eventos programados</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${item.responsibleColor} text-white text-xs font-medium flex items-center justify-center`}>{item.responsibleInitials}</div>
                      <span className="text-xs">{item.responsible}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button type="button" aria-label={`Acciones de ${item.code}`} aria-controls="item-actions-menu" aria-expanded={actionsMenu?.item.id === item.id} onClick={(event) => toggleActionsMenu(event, item)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
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
      {actionsMenu && createPortal(
        <>
          <button type="button" tabIndex={-1} aria-label="Cerrar menú de acciones" onClick={() => setActionsMenu(null)} className="fixed inset-0 z-[60] cursor-default" />
          <div id="item-actions-menu" role="menu" className="fixed z-[70] w-36 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900" style={{ top: actionsMenu.top, left: actionsMenu.left }}>
            <button type="button" role="menuitem" onClick={() => { const item = actionsMenu.item; setActionsMenu(null); onDuplicate(item) }} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Duplicar</button>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
