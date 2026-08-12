import AssetIcon from '@/components/AssetIcon'
import type { ApiFloorPlanFacet, ApiStatus } from '@/lib/api'
import { floorPlanTypeColor, type FloorPlanAlert } from '@/lib/floorPlanPresentation'

interface FloorPlanAssetPanelProps {
  types: ApiFloorPlanFacet[]
  statuses: ApiStatus[]
  visibleTypes: Set<number>
  alert: FloorPlanAlert | 'all'
  statusFilterId: number | null
  onToggleType: (typeId: number, visible: boolean) => void
  onAlertChange: (alert: FloorPlanAlert | 'all') => void
  onStatusFilterChange: (statusId: number | null) => void
}

function operationalStatusColor(name: string): string {
  if (name === 'Activo') return 'bg-emerald-500'
  if (name === 'En revisión' || name === 'Alerta') return 'bg-amber-500'
  return 'bg-red-500'
}

export default function FloorPlanAssetPanel({
  types,
  statuses,
  visibleTypes,
  alert,
  statusFilterId,
  onToggleType,
  onAlertChange,
  onStatusFilterChange,
}: FloorPlanAssetPanelProps) {
  return <>
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Capas</div>
      {types.map((type) => {
        const count = type.count
        return <label key={type.typeId} className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={visibleTypes.has(type.typeId)} onChange={(event) => onToggleType(type.typeId, event.target.checked)} className="rounded" />
          <span className="flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ backgroundColor: floorPlanTypeColor(type.typeId) }}><AssetIcon iconKey={type.iconKey} size={12} strokeWidth={2} /></span>
          {type.name} <span className="text-xs text-slate-400">({count})</span>
        </label>
      })}
    </div>
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Leyenda de estado</div>
      <div className="space-y-1 text-sm">{statuses.map((status) => <div key={status.id} className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${operationalStatusColor(status.name)}`} />{status.name}</div>)}</div>
    </div>
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Filtros</div>
      <select aria-label="Alerta" value={alert} onChange={(event) => onAlertChange(event.target.value as FloorPlanAlert | 'all')} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
        <option value="all">Todas las alertas</option><option value="overdue">Vencidos</option><option value="soon">≤ 21 días</option><option value="normal">Sin urgencia</option>
      </select>
      <select aria-label="Estado de activo" value={statusFilterId ?? ''} onChange={(event) => onStatusFilterChange(event.target.value ? Number(event.target.value) : null)} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
        <option value="">Todos los estados</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
      </select>
    </div>
  </>
}
