import type { ApiFloorPlanAsset } from '@/lib/api'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'

interface FloorPlanAssetSearchProps {
  search: string
  assets: ApiFloorPlanAsset[]
  markers: EditableFloorPlanMarker[]
  onSearchChange: (value: string) => void
  onFocusMarker: (marker: EditableFloorPlanMarker) => void
  onStartPlacement: (asset: ApiFloorPlanAsset) => void
}

export default function FloorPlanAssetSearch({ search, assets, markers, onSearchChange, onFocusMarker, onStartPlacement }: FloorPlanAssetSearchProps) {
  const markerByAssetId = new Map(markers.map((marker) => [marker.assetId, marker]))
  return (
    <div className="absolute left-3 top-3 z-20 w-[min(22rem,calc(100%-1.5rem))]">
      <label className="sr-only" htmlFor="floor-plan-search">Buscar activo</label>
      <input id="floor-plan-search" aria-label="Buscar activo" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar activo por nombre o código" className="w-full rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" />
      {search.trim() && <div role="listbox" aria-label="Resultados de activos" className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {assets.map((asset) => {
          const marker = markerByAssetId.get(asset.id)
          return <div key={asset.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <button type="button" onClick={() => marker ? onFocusMarker(marker) : onStartPlacement(asset)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{asset.name}</span>
              <span className="block truncate text-xs text-slate-500">{asset.code} · {asset.type.name}</span>
            </button>
            {marker ? <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">Colocado</span> : <button type="button" onClick={() => onStartPlacement(asset)} className="shrink-0 rounded bg-brand-600 px-2 py-1 text-xs text-white">Colocar</button>}
          </div>
        })}
        {assets.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No hay activos que coincidan con los filtros actuales.</p>}
      </div>}
    </div>
  )
}
