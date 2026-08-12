import { useEffect, useRef } from 'react'
import AssetIcon from '@/components/AssetIcon'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { floorPlanAlert, floorPlanTypeColor } from '@/lib/floorPlanPresentation'

interface FloorPlanMarkerPopoverProps {
  marker: EditableFloorPlanMarker
  anchor: { x: number; y: number }
  onClose: () => void
  onView: () => void
  onRemove: () => void
}

export default function FloorPlanMarkerPopover({ marker, anchor, onClose, onView, onRemove }: FloorPlanMarkerPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const nextEvent = marker.asset.nextEvents?.[0]
  const alert = floorPlanAlert(marker.asset)

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`Activo ${marker.asset.name}`}
      data-testid="floor-plan-marker-popover"
      className="absolute z-30 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      style={{ left: `clamp(12px, ${anchor.x}px, calc(100% - 300px))`, top: `clamp(12px, ${anchor.y}px, calc(100% - 264px))` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex gap-2.5">
        <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white shadow" style={{ backgroundColor: floorPlanTypeColor(marker.asset.type.id) }}><AssetIcon iconKey={marker.asset.type.iconKey} size={15} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{marker.asset.name}</p>
          <p className="truncate text-xs text-slate-500">{marker.asset.code}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{marker.asset.type.name} · {marker.asset.status.name}</p>
        </div>
        <button type="button" aria-label="Cerrar activo del plano" onClick={onClose} className="h-6 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
      </div>
      {nextEvent && <p className={`mt-3 rounded-md px-2 py-1.5 text-xs ${alert === 'overdue' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : alert === 'soon' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>Próximo evento: {nextEvent.title} · {new Date(nextEvent.date).toLocaleDateString('es-ES')}</p>}
      {!nextEvent && <p className="mt-3 text-xs text-slate-500">Sin eventos programados.</p>}
      <p className="mt-3 text-xs text-slate-500">Arrastra el marcador directamente para moverlo.</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button type="button" onClick={onView} className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white">Ver activo</button>
        <button type="button" onClick={onRemove} className="rounded-md px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Quitar del plano</button>
      </div>
    </div>
  )
}
