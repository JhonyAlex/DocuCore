import { useEffect, useMemo, useRef, useState } from 'react'
import type { ApiFloorPlanAsset } from '@/lib/api'

interface FloorPlanPlacementPopoverProps {
  anchor: { x: number; y: number }
  assets: ApiFloorPlanAsset[]
  onChoose: (asset: ApiFloorPlanAsset) => void
  onClose: () => void
}

function matches(asset: ApiFloorPlanAsset, query: string): boolean {
  return `${asset.name} ${asset.code} ${asset.type.name}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))
}

export default function FloorPlanPlacementPopover({ anchor, assets, onChoose, onClose }: FloorPlanPlacementPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const matchingAssets = useMemo(() => assets.filter((asset) => matches(asset, query.trim())).slice(0, 8), [assets, query])

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
      aria-label="Añadir activo aquí"
      data-testid="floor-plan-placement-popover"
      className="absolute z-30 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      style={{ left: `clamp(12px, ${anchor.x}px, calc(100% - 300px))`, top: `clamp(12px, ${anchor.y}px, calc(100% - 260px))` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Añadir activo aquí</p>
        <button type="button" aria-label="Cerrar selector de activo" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
      </div>
      <input autoFocus aria-label="Buscar activo para colocar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o código" className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
      <div className="mt-2 max-h-48 overflow-y-auto scrollbar-thin">
        {matchingAssets.map((asset) => (
          <button key={asset.id} type="button" onClick={() => onChoose(asset)} className="block w-full rounded-md px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
            <span className="block truncate text-sm font-medium">{asset.name}</span>
            <span className="block truncate text-xs text-slate-500">{asset.code} · {asset.type.name}</span>
          </button>
        ))}
        {matchingAssets.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">No hay activos pendientes de colocar que coincidan.</p>}
      </div>
    </div>
  )
}
