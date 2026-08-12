import type { ApiAssetType, ApiFloorPlanAsset, ApiStatus } from '@/lib/api'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { floorPlanTypeColor, type FloorPlanAlert } from '@/lib/floorPlanPresentation'

interface FloorPlanAssetPanelProps {
  types: ApiAssetType[]
  assets: ApiFloorPlanAsset[]
  statuses: ApiStatus[]
  visibleTypes: Set<number>
  search: string
  alert: FloorPlanAlert | 'all'
  statusFilterId: number | null
  filteredAssets: ApiFloorPlanAsset[]
  markers: EditableFloorPlanMarker[]
  editMode: boolean
  selectedAssetId: number | null
  movingMarkerId: number | null
  onToggleType: (typeId: number, visible: boolean) => void
  onSearchChange: (value: string) => void
  onAlertChange: (alert: FloorPlanAlert | 'all') => void
  onStatusFilterChange: (statusId: number | null) => void
  onAssetClick: (asset: ApiFloorPlanAsset) => void
  onSelectedAssetChange: (assetId: number | null) => void
  onMoveMarker: (marker: EditableFloorPlanMarker) => void
  onNudgeMarker: (marker: EditableFloorPlanMarker, x: number, y: number) => void
}

function operationalStatusColor(name: string): string {
  if (name === 'Activo') return 'bg-emerald-500'
  if (name === 'En revisión' || name === 'Alerta') return 'bg-amber-500'
  return 'bg-red-500'
}

export default function FloorPlanAssetPanel({
  types,
  assets,
  statuses,
  visibleTypes,
  search,
  alert,
  statusFilterId,
  filteredAssets,
  markers,
  editMode,
  selectedAssetId,
  movingMarkerId,
  onToggleType,
  onSearchChange,
  onAlertChange,
  onStatusFilterChange,
  onAssetClick,
  onSelectedAssetChange,
  onMoveMarker,
  onNudgeMarker,
}: FloorPlanAssetPanelProps) {
  const placed = new Set(markers.map((marker) => marker.assetId))
  const availableToPlace = filteredAssets.filter((asset) => !placed.has(asset.id))

  return <>
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Capas</div>
      {types.map((type) => {
        const count = assets.filter((asset) => asset.type.id === type.id).length
        return <label key={type.id} className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={visibleTypes.has(type.id)} onChange={(event) => onToggleType(type.id, event.target.checked)} className="rounded" />
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: floorPlanTypeColor(type.id) }} />
          {type.name} <span className="text-xs text-slate-400">({count})</span>
        </label>
      })}
    </div>
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Leyenda de estado</div>
      <div className="space-y-1 text-sm">{statuses.map((status) => <div key={status.id} className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${operationalStatusColor(status.name)}`} />{status.name}</div>)}</div>
    </div>
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
      <label className="text-xs text-slate-500 uppercase tracking-wider">Buscar activo</label>
      <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Código o nombre" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
      <select aria-label="Alerta" value={alert} onChange={(event) => onAlertChange(event.target.value as FloorPlanAlert | 'all')} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
        <option value="all">Todas las alertas</option><option value="overdue">Vencidos</option><option value="soon">≤ 21 días</option><option value="normal">Sin urgencia</option>
      </select>
      <select aria-label="Estado de activo" value={statusFilterId ?? ''} onChange={(event) => onStatusFilterChange(event.target.value ? Number(event.target.value) : null)} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
        <option value="">Todos los estados</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
      </select>
      <div className="mt-2 max-h-36 overflow-y-auto scrollbar-thin">
        {filteredAssets.map((asset) => <button key={asset.id} type="button" onClick={() => onAssetClick(asset)} className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800">{asset.code} · {asset.name} {placed.has(asset.id) ? '· Colocado' : '· Sin colocar'}</button>)}
      </div>
    </div>
    {editMode && <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
      <label className="text-xs text-slate-500 uppercase tracking-wider">Activo a colocar</label>
      <select id="floor-plan-asset" value={selectedAssetId ?? ''} onChange={(event) => onSelectedAssetChange(event.target.value ? Number(event.target.value) : null)} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
        <option value="">Selecciona un activo</option>{availableToPlace.map((asset) => <option key={asset.id} value={asset.id}>{asset.code} · {asset.name}</option>)}
      </select>
      <p className="mt-1 text-xs text-slate-500">Selecciona un activo y toca el plano para colocarlo.</p>
      {markers.length > 0 && <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800"><p className="text-xs text-slate-500">Marcadores colocados</p>{markers.map((marker) => <div key={marker.id} className="mt-1"><button type="button" aria-label={`Mover ${marker.asset.code} · ${marker.asset.name}`} onClick={() => onMoveMarker(marker)} className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800">Mover {marker.asset.code}</button>{movingMarkerId === marker.id && <div className="flex gap-1 px-2 pb-1"><button type="button" aria-label="Desplazar a la izquierda" onClick={() => onNudgeMarker(marker, marker.x - 0.05, marker.y)}>←</button><button type="button" aria-label="Desplazar a la derecha" onClick={() => onNudgeMarker(marker, marker.x + 0.05, marker.y)}>→</button><button type="button" aria-label="Desplazar arriba" onClick={() => onNudgeMarker(marker, marker.x, marker.y - 0.05)}>↑</button><button type="button" aria-label="Desplazar abajo" onClick={() => onNudgeMarker(marker, marker.x, marker.y + 0.05)}>↓</button></div>}</div>)}</div>}
    </div>}
  </>
}
