import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FloorPlanViewer, { type FloorPlanViewerActions } from '@/components/FloorPlanViewer'
import { fetchAssetFloorPlanPlacements, type ApiAsset, type ApiAssetFloorPlanPlacement, type ApiFloorPlanMarker } from '@/lib/api'
import { DEFAULT_ASSET_ICON_KEY } from '../../shared/assetIconCatalog'

interface AssetFloorPlanPreviewProps {
  asset: ApiAsset
}

function previewMarker(asset: ApiAsset, placement: ApiAssetFloorPlanPlacement): ApiFloorPlanMarker {
  return {
    id: placement.markerId,
    floorPlanId: placement.planId,
    assetId: asset.id,
    x: placement.x,
    y: placement.y,
    createdAt: '',
    updatedAt: '',
    asset: {
      id: asset.id,
      code: asset.code,
      name: asset.name,
      locationId: asset.locationId,
      type: asset.type ?? { id: asset.typeId, name: 'Activo', iconKey: DEFAULT_ASSET_ICON_KEY },
      status: asset.status ?? { id: asset.statusId, name: 'Activo', pulseDot: null },
      nextEvents: asset.nextEvents,
    },
  }
}

export default function AssetFloorPlanPreview({ asset }: AssetFloorPlanPreviewProps) {
  const navigate = useNavigate()
  const actionsRef = useRef<FloorPlanViewerActions | null>(null)
  const [placements, setPlacements] = useState<ApiAssetFloorPlanPlacement[]>([])
  const [activePlanId, setActivePlanId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setPlacements([])
    setActivePlanId(null)
    void fetchAssetFloorPlanPlacements(asset.projectId, asset.id)
      .then((response) => {
        if (!active) return
        setPlacements(response.data)
        setActivePlanId(response.data[0]?.planId ?? null)
      })
      .catch(() => { if (active) setError('No se pudieron cargar los planos de este activo.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [asset.id, asset.projectId])

  const activePlacement = placements.find((placement) => placement.planId === activePlanId) ?? placements[0] ?? null
  const openInPlans = (placement: ApiAssetFloorPlanPlacement | null) => {
    const params = new URLSearchParams({ assetId: String(asset.id) })
    if (placement) params.set('planId', String(placement.planId))
    navigate(`/projects/${asset.projectId}/plans?${params.toString()}`)
  }

  if (loading) return <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">Cargando ubicación en planos…</div>
  if (error) return <div role="alert" className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>
  if (!activePlacement) return <div data-testid="asset-floor-plan-empty" className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40"><p className="text-sm font-medium">Este activo aún no está ubicado en ningún plano</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Añádelo desde un plano para verlo centrado aquí.</p><button type="button" onClick={() => openInPlans(null)} className="mt-4 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Ir a Planos</button></div>

  const marker = previewMarker(asset, activePlacement)
  return <div data-testid="asset-floor-plan-preview" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-medium">Ubicación en plano</h4><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{activePlacement.location.label} · {activePlacement.planName} · v{activePlacement.currentVersion.version}</p></div><button type="button" data-testid="asset-open-in-plans" onClick={() => openInPlans(activePlacement)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">Abrir en Planos</button></div>
    {placements.length > 1 && <div role="tablist" aria-label="Planos que contienen este activo" className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">{placements.map((placement) => <button key={placement.planId} type="button" role="tab" aria-selected={placement.planId === activePlacement.planId} onClick={() => setActivePlanId(placement.planId)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs ${placement.planId === activePlacement.planId ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>{placement.planName}</button>)}</div>}
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"><FloorPlanViewer dziUrl={activePlacement.dziUrl} width={activePlacement.currentVersion.width} height={activePlacement.currentVersion.height} markers={[marker]} actionsRef={actionsRef} readOnly initialFocusMarker={marker} highlightedAssetId={asset.id} className="h-[360px]" /></div>
    <p className="text-xs text-slate-500 dark:text-slate-400">El visor está centrado en este activo. Puedes hacer pan y zoom para inspeccionar su entorno.</p>
  </div>
}
