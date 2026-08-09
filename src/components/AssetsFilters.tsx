import { useState, type ChangeEvent } from 'react'
import type { AssetFilters } from '@/types'
import type { ApiAssetType, ApiLocation, ApiStatus } from '@/lib/api'

interface AssetsFiltersProps {
  filters: AssetFilters
  types: ApiAssetType[]
  statuses: ApiStatus[]
  locations: ApiLocation[]
  onFilterChange: (next: AssetFilters) => void
}

export default function AssetsFilters({ filters, types, statuses, locations, onFilterChange }: AssetsFiltersProps) {
  const [showReferenceChips, setShowReferenceChips] = useState(true)

  const applyFilters = (next: AssetFilters) => {
    setShowReferenceChips(false)
    onFilterChange(next)
  }

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    applyFilters({ ...filters, search: e.target.value })
  }
  const handleType = (e: ChangeEvent<HTMLSelectElement>) => {
    applyFilters({ ...filters, typeId: e.target.value ? Number(e.target.value) : null })
  }
  const handleStatus = (e: ChangeEvent<HTMLSelectElement>) => {
    applyFilters({ ...filters, statusId: e.target.value ? Number(e.target.value) : null })
  }
  const handleLocation = (e: ChangeEvent<HTMLSelectElement>) => {
    applyFilters({ ...filters, locationId: e.target.value ? Number(e.target.value) : null })
  }
  const clearAll = () => {
    applyFilters({ search: '', typeId: null, statusId: null, locationId: null })
  }

  const activeType = types.find((t) => t.id === filters.typeId)
  const activeStatus = statuses.find((s) => s.id === filters.statusId)
  const activeLocation = locations.find((l) => l.id === filters.locationId)
  const hasActive = Boolean(filters.search || filters.typeId || filters.statusId || filters.locationId)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={filters.search} onChange={handleSearch} placeholder="Buscar por nombre, código, serie…" className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-brand-500" />
        </div>
        <select value={filters.typeId ?? ''} onChange={handleType} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={filters.statusId ?? ''} onChange={handleStatus} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
          <option value="">Todos los estados</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={filters.locationId ?? ''} onChange={handleLocation} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
          <option value="">Todas las ubicaciones</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <button onClick={clearAll} className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Limpiar</button>
      </div>
      {(hasActive || showReferenceChips) && (
        <div className="flex items-center gap-2 mt-3 text-xs text-slate-500 dark:text-slate-400">
          {filters.search && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{`Búsqueda: ${filters.search} ×`}</span>}
          {(activeType || showReferenceChips) && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{`Tipo: ${activeType?.name ?? 'Máquina'} ×`}</span>}
          {(activeStatus || showReferenceChips) && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{`Estado: ${activeStatus?.name ?? 'Activo'} ×`}</span>}
          {activeLocation && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{`Ubicación: ${activeLocation.label} ×`}</span>}
          <button onClick={clearAll} className="text-brand-600 hover:text-brand-700 ml-2">Limpiar todos</button>
        </div>
      )}
    </div>
  )
}
