import type { ChangeEvent } from 'react'
import type { DocumentListParams } from '@/lib/api'

export type DocumentFilters = Pick<DocumentListParams, 'search' | 'type' | 'status'>

const statuses = ['', 'Vigente', 'Por vencer', 'Vencido'] as const

export default function DocumentsFilters({ filters, onChange }: { filters: DocumentFilters; onChange: (next: DocumentFilters) => void }) {
  const set = (patch: Partial<DocumentFilters>) => onChange({ ...filters, ...patch })
  return <div className="mb-4 flex flex-wrap items-center gap-2">
    <div className="relative min-w-[15rem] flex-1">
      <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input aria-label="Buscar documentos" value={filters.search ?? ''} onChange={(event: ChangeEvent<HTMLInputElement>) => set({ search: event.target.value })} placeholder="Buscar documento o activo…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900" />
    </div>
    <input aria-label="Filtrar por tipo" value={filters.type ?? ''} onChange={(event: ChangeEvent<HTMLInputElement>) => set({ type: event.target.value })} placeholder="Tipo" className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
    <select aria-label="Filtrar por estado" value={filters.status ?? ''} onChange={(event) => set({ status: event.target.value ? event.target.value as NonNullable<DocumentFilters['status']> : undefined })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
      {statuses.map((status) => <option key={status} value={status}>{status || 'Todos los estados'}</option>)}
    </select>
    {(filters.search || filters.type || filters.status) && <button type="button" onClick={() => onChange({})} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Limpiar</button>}
  </div>
}
