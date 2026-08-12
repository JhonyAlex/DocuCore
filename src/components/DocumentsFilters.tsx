import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { DocumentListParams } from '@/lib/api'

export type DocumentFilters = Pick<DocumentListParams, 'search' | 'type' | 'status'>

const statuses = ['', 'Vigente', 'Por vencer', 'Vencido'] as const

/** Contextual controls preserve the approved idle layout while retaining real,
 * keyboard-accessible server-side filters and page navigation. */
export default function DocumentsFilters({ filters, onChange, page, total, totalPages, onPageChange }: {
  filters: DocumentFilters
  onChange: (next: DocumentFilters) => void
  page: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<DocumentFilters>) => onChange({ ...filters, ...patch })
  useEffect(() => {
    const close = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return <div ref={root} className="relative">
    <button type="button" aria-label="Buscar y filtrar documentos" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800" title="Buscar y filtrar documentos">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16" y2="16" /><path d="M4 4h5" /></svg>
    </button>
    {open && <div className="absolute right-0 z-20 mt-2 w-[22rem] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Buscar documentos
        <input autoFocus aria-label="Buscar documentos" value={filters.search ?? ''} onChange={(event: ChangeEvent<HTMLInputElement>) => set({ search: event.target.value })} placeholder="Documento o activo…" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800" />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input aria-label="Filtrar por tipo" value={filters.type ?? ''} onChange={(event: ChangeEvent<HTMLInputElement>) => set({ type: event.target.value })} placeholder="Tipo" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
        <select aria-label="Filtrar por estado" value={filters.status ?? ''} onChange={(event) => set({ status: event.target.value ? event.target.value as NonNullable<DocumentFilters['status']> : undefined })} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
          {statuses.map((status) => <option key={status} value={status}>{status || 'Todos los estados'}</option>)}
        </select>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
        <button type="button" onClick={() => onChange({})} className="text-slate-600 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:text-white" disabled={!filters.search && !filters.type && !filters.status}>Limpiar</button>
        {totalPages > 1 && <div className="flex items-center gap-1"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">Anterior</button><span className="px-1 text-slate-500">{page}/{totalPages} · {total}</span><button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">Siguiente</button></div>}
      </div>
    </div>}
  </div>
}
