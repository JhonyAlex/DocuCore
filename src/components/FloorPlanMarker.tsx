import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { floorPlanAlert, floorPlanTypeColor, type FloorPlanLod } from '@/lib/floorPlanPresentation'

interface FloorPlanMarkerProps {
  marker: EditableFloorPlanMarker
  editMode: boolean
  lod: FloorPlanLod
  onSelect: () => void
}

export default function FloorPlanMarker({ marker, editMode, lod, onSelect }: FloorPlanMarkerProps) {
  const alert = floorPlanAlert(marker.asset)
  const typeColor = floorPlanTypeColor(marker.asset.type.id)
  const urgency = alert === 'overdue' ? 'ring-2 ring-red-500 animate-pulse' : alert === 'soon' ? 'ring-2 ring-amber-400' : ''
  return (
    <button
      type="button"
      aria-label={`Abrir ficha de ${marker.asset.code}`}
      data-lod={lod}
      data-alert={alert}
      className="pin flex flex-col items-center cursor-pointer"
      onClick={(event) => { if (editMode) { event.stopPropagation(); onSelect() } }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }}
    >
      <span title={`${marker.asset.code} · ${marker.asset.name} · ${marker.asset.status.name}`} style={{ backgroundColor: typeColor }} className={`${urgency} text-white px-2 py-1 rounded-md shadow-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5`}>
        <span className="w-2 h-2 rounded-full bg-white" />{lod === 'dot' ? '' : lod === 'code' ? marker.asset.code : `${marker.asset.code} · ${marker.asset.name}`}
      </span>
      {lod !== 'dot' && <span className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent" style={{ borderTopColor: typeColor }} />}
    </button>
  )
}
