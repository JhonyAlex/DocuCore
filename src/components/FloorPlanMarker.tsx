import AssetIcon from '@/components/AssetIcon'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { floorPlanAlert, floorPlanTypeColor, type FloorPlanLod } from '@/lib/floorPlanPresentation'

interface FloorPlanMarkerProps {
  marker: EditableFloorPlanMarker
  lod: FloorPlanLod
  highlighted?: boolean
  onSelect: () => void
}

export default function FloorPlanMarker({ marker, lod, highlighted = false, onSelect }: FloorPlanMarkerProps) {
  const alert = floorPlanAlert(marker.asset)
  const typeColor = floorPlanTypeColor(marker.asset.type.id)
  const urgencyHalo = alert === 'overdue' ? 'border-red-500 animate-pulse' : alert === 'soon' ? 'border-amber-400' : ''
  const compact = lod === 'dot'
  return (
    <button
      type="button"
      aria-label={`Abrir activo ${marker.asset.name}`}
      data-lod={lod}
      data-alert={alert}
      data-focused={highlighted || undefined}
      className="pin flex flex-col items-center cursor-pointer"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }}
    >
      <span className="relative flex">
        {alert !== 'normal' && <span aria-hidden="true" className={`absolute -inset-1 rounded-lg border-2 ${urgencyHalo}`} />}
        <span title={`${marker.asset.code} · ${marker.asset.name} · ${marker.asset.status.name}`} style={{ backgroundColor: typeColor }} className={`floor-plan-marker-content relative border border-white/70 text-white shadow-md text-xs font-medium whitespace-nowrap flex items-center gap-1.5 ${compact ? 'h-7 w-7 justify-center rounded-full p-0' : 'rounded-md px-2 py-1'} ${highlighted ? 'ring-4 ring-white/90 ring-offset-2 ring-offset-slate-900/20' : ''}`}>
          <AssetIcon iconKey={marker.asset.type.iconKey} size={compact ? 15 : 14} strokeWidth={2} />
          {!compact && <span>{marker.asset.name}</span>}
          {lod === 'detail' && <span className="border-l border-white/35 pl-1.5 text-[10px] text-white/90">{marker.asset.code}</span>}
        </span>
      </span>
      {!compact && <span className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent" style={{ borderTopColor: typeColor }} />}
    </button>
  )
}
