import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AssetFormModal from '@/components/AssetFormModal'
import AssetModal from '@/components/AssetModal'
import ConfirmDialog from '@/components/ConfirmDialog'
import FloorPlanAssetPanel from '@/components/FloorPlanAssetPanel'
import FloorPlanAssetSearch from '@/components/FloorPlanAssetSearch'
import FloorPlanCreateModal from '@/components/FloorPlanCreateModal'
import FloorPlanMarkerPopover from '@/components/FloorPlanMarkerPopover'
import FloorPlanPdfImportModal from '@/components/FloorPlanPdfImportModal'
import FloorPlanPlacementPopover from '@/components/FloorPlanPlacementPopover'
import FloorPlanViewer, { type FloorPlanOverlayAnchor, type FloorPlanViewerActions } from '@/components/FloorPlanViewer'
import PlanEditorControls from '@/components/PlanEditorControls'
import type { LocationFormValues } from '@/components/LocationFormModal'
import { useAssetFicha } from '@/hooks/useAssetFicha'
import { useFloorPlanEditor } from '@/hooks/useFloorPlanEditor'
import { createFloorPlan, createFloorPlanVersion, createLocation, deleteFloorPlan, fetchAssetTypes, fetchFloorPlan, fetchFloorPlanAssets, fetchFloorPlanFacets, fetchFloorPlanMarkers, fetchFloorPlans, fetchLocations, fetchStatuses, fetchUsers, floorPlanDziUrl, type ApiAssetType, type ApiFloorPlan, type ApiFloorPlanAsset, type ApiFloorPlanFacet, type ApiLocation, type ApiLocationsResponse, type ApiStatus, type ApiUserRef, type FloorPlanWriteInput } from '@/lib/api'
import { type NormalizedPoint } from '@/lib/floorPlanCoordinates'
import { filterFloorPlanAssets } from '@/lib/floorPlanPresentation'

function sizeLabel(bytes: number): string { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB` }
function rootLocationId(locationId: number, locations: ApiLocation[]): number {
  const byId = new Map(locations.map((location) => [location.id, location]))
  let current = byId.get(locationId)
  const visited = new Set<number>()
  while (current && current.parentId !== null && !visited.has(current.id)) { visited.add(current.id); current = byId.get(current.parentId) }
  return current?.id ?? locationId
}

type PlacementPopover = { point: NormalizedPoint; anchor: FloorPlanOverlayAnchor }
type MarkerPopover = { markerId: number; anchor: FloorPlanOverlayAnchor }

export default function PlansView() {
  const [searchParams] = useSearchParams()
  const requestedLocationId = Number(searchParams.get('locationId')) || null
  const requestedPlanId = Number(searchParams.get('planId')) || null
  const requestedAssetId = Number(searchParams.get('assetId')) || null
  const [catalog, setCatalog] = useState<ApiLocationsResponse | null>(null)
  const [types, setTypes] = useState<ApiAssetType[]>([])
  const [statuses, setStatuses] = useState<ApiStatus[]>([])
  const [users, setUsers] = useState<ApiUserRef[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(requestedLocationId)
  const [plans, setPlans] = useState<ApiFloorPlan[]>([])
  const [plan, setPlan] = useState<ApiFloorPlan | null>(null)
  const [visibleTypes, setVisibleTypes] = useState<Set<number>>(new Set())
  const [assetSearch, setAssetSearch] = useState('')
  const [searchedAssets, setSearchedAssets] = useState<ApiFloorPlanAsset[]>([])
  const [facets, setFacets] = useState<ApiFloorPlanFacet[]>([])
  const [alertFilter, setAlertFilter] = useState<'all' | 'overdue' | 'soon' | 'normal'>('all')
  const [statusFilterId, setStatusFilterId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [pdfImportOpen, setPdfImportOpen] = useState(false)
  const [placementPopover, setPlacementPopover] = useState<PlacementPopover | null>(null)
  const [placementTarget, setPlacementTarget] = useState<ApiFloorPlanAsset | null>(null)
  const [markerPopover, setMarkerPopover] = useState<MarkerPopover | null>(null)
  const [markerRemovalId, setMarkerRemovalId] = useState<number | null>(null)
  const [confirmPlanDelete, setConfirmPlanDelete] = useState(false)
  const [viewerActionState, setViewerActionState] = useState<FloorPlanViewerActions | null>(null)
  const viewerActions = useRef<FloorPlanViewerActions | null>(null)
  const preferredPlanIdRef = useRef<number | null>(requestedPlanId)
  const [focusedAssetId, setFocusedAssetId] = useState<number | null>(requestedAssetId)
  const focusedMarkerRef = useRef<string | null>(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const locations = await fetchLocations()
      const [nextTypes, nextStatuses, nextUsers] = await Promise.all([fetchAssetTypes(locations.project.id), fetchStatuses(), fetchUsers()])
      let requestedPlan: ApiFloorPlan | null = null
      if (requestedPlanId) {
        try {
          const candidate = await fetchFloorPlan(requestedPlanId)
          if (candidate.projectId === locations.project.id) requestedPlan = candidate
        } catch {
          setError('No se encontró el plano solicitado en el enlace.')
        }
      }
      setCatalog(locations); setTypes(nextTypes); setStatuses(nextStatuses); setUsers(nextUsers)
      setVisibleTypes(new Set(nextTypes.map((type) => type.id)))
      if (requestedPlan) preferredPlanIdRef.current = requestedPlan.id
      setSelectedLocationId((current) => requestedPlan?.locationId ?? (current && locations.locations.some((location) => location.id === current) ? current : locations.locations.find((location) => location.hasFloorPlan)?.id ?? locations.locations[0]?.id ?? null))
    } catch { setError('No se pudieron cargar las ubicaciones y los planos.') } finally { setLoading(false) }
  }, [requestedPlanId])

  const loadPlans = useCallback(async (locationId: number, projectId: number, preferredPlanId?: number | null) => {
    try {
      const result = await fetchFloorPlans(projectId, locationId)
      setPlans(result.data)
      const selected = result.data.find((candidate) => candidate.id === (preferredPlanId ?? preferredPlanIdRef.current)) ?? result.data[0] ?? null
      preferredPlanIdRef.current = selected?.id ?? null
      setPlan(selected ? await fetchFloorPlan(selected.id) : null)
      setPlacementPopover(null); setPlacementTarget(null); setMarkerPopover(null)
    } catch { setError('No se pudo cargar el plano seleccionado.') }
  }, [])

  const refreshPlan = useCallback(async () => {
    if (!catalog || !selectedLocationId) return
    await loadPlans(selectedLocationId, catalog.project.id, plan?.id)
  }, [catalog, loadPlans, plan?.id, selectedLocationId])
  const activePlanId = plan?.id

  useEffect(() => { void loadCatalog() }, [loadCatalog])
  useEffect(() => { if (catalog && selectedLocationId) void loadPlans(selectedLocationId, catalog.project.id, preferredPlanIdRef.current) }, [catalog, loadPlans, selectedLocationId])

  useEffect(() => {
    if (!activePlanId) { setFacets([]); return }
    let current = true
    void fetchFloorPlanFacets(activePlanId).then((result) => { if (current) setFacets(result.types) }).catch(() => { if (current) setFacets([]) })
    return () => { current = false }
  }, [activePlanId])

  // Asset discovery is remote and debounced: a plan never downloads the
  // complete subtree simply to make the placement/search UI usable.
  useEffect(() => {
    if (!plan || !assetSearch.trim()) { setSearchedAssets([]); return }
    let current = true
    const timer = window.setTimeout(() => {
      void fetchFloorPlanAssets(plan.id, assetSearch).then((result) => { if (current) setSearchedAssets(result.data) }).catch(() => { if (current) setSearchedAssets([]) })
    }, 250)
    return () => { current = false; window.clearTimeout(timer) }
  }, [assetSearch, plan])

  const ficha = useAssetFicha({ onAssetChanged: () => { void refreshPlan() } })
  const editor = useFloorPlanEditor(plan)
  const location = catalog?.locations.find((item) => item.id === selectedLocationId) ?? null
  const buildingId = location && catalog ? rootLocationId(location.id, catalog.locations) : null
  const buildings = catalog?.locations.filter((item) => item.parentId === null) ?? []
  const floors = catalog && buildingId ? catalog.locations.filter((item) => rootLocationId(item.id, catalog.locations) === buildingId) : []
  const planTypes = facets
  const markerFilters = { search: assetSearch, typeIds: visibleTypes, statusIds: statusFilterId ? new Set<number>([statusFilterId]) : new Set<number>(), alert: alertFilter }
  const shownMarkers = editor.markers.filter((marker) => filterFloorPlanAssets([marker.asset], markerFilters).length === 1)
  const markerForRemoval = editor.markers.find((marker) => marker.id === markerRemovalId) ?? null
  const activeMarker = editor.markers.find((marker) => marker.id === markerPopover?.markerId) ?? null
  const currentVersion = plan?.currentVersion ?? null
  const loadMoreMarkers = async () => {
    if (!plan || editor.dirty || !plan.markersTruncated) return
    const page = Math.floor(plan.markers.length / 500) + 1
    const next = await fetchFloorPlanMarkers(plan.id, page)
    setPlan((current) => current && current.id === plan.id ? { ...current, markers: [...current.markers, ...next.data], markersTruncated: current.markers.length + next.data.length < next.total } : current)
  }

  useEffect(() => {
    if (!focusedAssetId || !plan || !viewerActionState) return
    const marker = editor.markers.find((candidate) => candidate.assetId === focusedAssetId)
    if (!marker) return
    const focusKey = `${plan.id}:${marker.id}:${focusedAssetId}`
    if (focusedMarkerRef.current === focusKey) return
    focusedMarkerRef.current = focusKey
    viewerActions.current?.focus(marker)
  }, [editor.markers, focusedAssetId, plan, viewerActionState])

  const createPlan = async (input: FloorPlanWriteInput, file: File) => {
    setCreateBusy(true); setCreateError(null)
    try { const created = await createFloorPlan(input, file); preferredPlanIdRef.current = created.id; setSelectedLocationId(input.locationId); await loadPlans(input.locationId, input.projectId, created.id); setCreateOpen(false) }
    catch { setCreateError('No se pudo crear el plano. Revisa el nombre, la ubicación y la imagen.') }
    finally { setCreateBusy(false) }
  }
  const uploadVersion = async (file: File | null) => {
    if (!plan || !file) return
    setUploading(true); setError(null)
    try { await createFloorPlanVersion(plan.id, file); await refreshPlan() }
    catch (uploadError) { setError('No se pudo subir la nueva versión del plano.'); throw uploadError }
    finally { setUploading(false) }
  }
  const savePositions = async () => {
    setSaving(true); setError(null)
    try { await editor.save(); await refreshPlan() } catch { setError('No se pudieron guardar las posiciones. No se han descartado los cambios locales.') } finally { setSaving(false) }
  }
  const removeAssociation = () => { if (markerRemovalId !== null) editor.remove(markerRemovalId); setMarkerRemovalId(null); setMarkerPopover(null) }
  const deleteCurrentPlan = async () => {
    if (!plan) return
    setSaving(true); setError(null)
    try { await deleteFloorPlan(plan.id); setConfirmPlanDelete(false); await loadPlans(plan.locationId, plan.projectId) }
    catch { setError('No se pudo eliminar el plano.') } finally { setSaving(false) }
  }
  const createLocationFromAssetForm = async (values: LocationFormValues) => {
    if (!catalog) throw new Error('No hay proyecto seleccionado.')
    const created = await createLocation({ ...values, projectId: catalog.project.id })
    await loadCatalog()
    return created
  }
  const placeAsset = (asset: ApiFloorPlanAsset, point: NormalizedPoint) => {
    editor.place(asset, point)
    setPlacementPopover(null); setPlacementTarget(null); setAssetSearch('')
  }
  const markViewerReady = useCallback((actions: FloorPlanViewerActions) => setViewerActionState(actions), [])

  return <section className="fade-in">
    <div className="flex items-end justify-between mb-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Planos interactivos</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Visualiza y gestiona la ubicación de los activos sobre los planos</p></div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!plan} onClick={() => setPdfImportOpen(true)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-40">Importar desde PDF</button>
        <label className={`px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm ${!plan || uploading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>{uploading ? 'Subiendo…' : 'Subir nueva versión'}<input aria-label="Subir nueva versión" disabled={!plan || uploading} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void uploadVersion(event.target.files?.[0] ?? null).catch(() => undefined); event.currentTarget.value = '' }} /></label>
      </div>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
      <aside className="xl:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Edificio</label><select value={buildingId ?? ''} onChange={(event) => { const next = Number(event.target.value); const first = catalog?.locations.find((item) => rootLocationId(item.id, catalog.locations) === next); preferredPlanIdRef.current = null; setFocusedAssetId(null); setSelectedLocationId(first?.id ?? null) }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">{buildings.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
        <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Planta</label><select value={selectedLocationId ?? ''} onChange={(event) => { preferredPlanIdRef.current = null; setFocusedAssetId(null); setSelectedLocationId(Number(event.target.value)) }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">{floors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
        <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Plano</label><select value={plan?.id ?? ''} onChange={(event) => { const value = event.target.value; if (value === '__new__') { setCreateError(null); setCreateOpen(true); return } const selected = plans.find((item) => item.id === Number(value)); if (selected) { preferredPlanIdRef.current = selected.id; setFocusedAssetId(null); void fetchFloorPlan(selected.id).then(setPlan) } }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"><option value="">Sin plano</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new__">＋ Crear nuevo plano…</option></select>{currentVersion && <div className="text-xs text-slate-500 mt-1">v{currentVersion.version} · Subido: {new Date(currentVersion.uploadedAt).toLocaleDateString('es-ES')} · {sizeLabel(currentVersion.sizeBytes)}</div>}</div>
        {plan && <FloorPlanAssetPanel types={planTypes} statuses={statuses} visibleTypes={visibleTypes} alert={alertFilter} statusFilterId={statusFilterId} onToggleType={(typeId, visible) => setVisibleTypes((current) => { const next = new Set(current); if (visible) next.add(typeId); else next.delete(typeId); return next })} onAlertChange={setAlertFilter} onStatusFilterChange={setStatusFilterId} />}
        {plan?.markersTruncated && <button type="button" disabled={editor.dirty} onClick={() => void loadMoreMarkers()} className="mt-4 text-xs text-brand-600 hover:underline disabled:opacity-40">Cargar más marcadores</button>}
        {plan && <button type="button" onClick={() => setConfirmPlanDelete(true)} className="mt-4 text-xs text-red-600 dark:text-red-400 hover:underline">Eliminar plano</button>}
      </aside>
      <div className="xl:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm"><div className="flex items-center gap-3"><PlanEditorControls dirty={editor.dirty} canUndo={editor.canUndo} canRedo={editor.canRedo} saving={saving} actions={viewerActionState} onUndo={editor.undo} onRedo={editor.redo} onSave={() => void savePositions()} /><span className="text-xs text-slate-500">Pan y zoom siempre disponibles · Coordenadas normalizadas (0–1)</span></div></div>
        {loading ? <div className="h-[600px] flex items-center justify-center text-sm text-slate-500">Cargando planos…</div> : plan && currentVersion ? <div className="relative">
          <FloorPlanViewer dziUrl={floorPlanDziUrl(plan.id, currentVersion.version)} width={currentVersion.width} height={currentVersion.height} markers={shownMarkers} highlightedAssetId={focusedAssetId} actionsRef={viewerActions} onReady={markViewerReady} onEmptyQuickClick={(point, anchor) => { setMarkerPopover(null); if (placementTarget && !editor.markers.some((marker) => marker.assetId === placementTarget.id)) { placeAsset(placementTarget, point); return } setPlacementPopover({ point, anchor }) }} onSelectMarker={(marker, anchor) => { setPlacementTarget(null); setPlacementPopover(null); setFocusedAssetId(marker.assetId); setMarkerPopover({ markerId: marker.id, anchor }) }} onMarkerDragStart={(markerId) => { setMarkerPopover(null); editor.beginMove(markerId) }} onMarkerDrag={(markerId, point) => editor.previewMove(markerId, point)} onMarkerDragEnd={() => editor.endMove()} />
          <FloorPlanAssetSearch search={assetSearch} assets={searchedAssets} markers={editor.markers} onSearchChange={setAssetSearch} onFocusMarker={(marker) => { setMarkerPopover(null); viewerActions.current?.focus(marker) }} onStartPlacement={(asset) => { setAssetSearch(''); setPlacementPopover(null); setMarkerPopover(null); setPlacementTarget(asset) }} />
          {placementTarget && <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-brand-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-brand-800 dark:bg-slate-900/95"><span>Elige una zona para <strong>{placementTarget.name}</strong></span><button type="button" onClick={() => setPlacementTarget(null)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">Cancelar</button></div>}
          {placementPopover && <FloorPlanPlacementPopover anchor={placementPopover.anchor} searchAssets={async (query) => (await fetchFloorPlanAssets(plan.id, query)).data.filter((asset) => !editor.markers.some((marker) => marker.assetId === asset.id))} onChoose={(asset) => placeAsset(asset, placementPopover.point)} onClose={() => setPlacementPopover(null)} />}
          {activeMarker && markerPopover && <FloorPlanMarkerPopover marker={activeMarker} anchor={markerPopover.anchor} onClose={() => setMarkerPopover(null)} onView={() => { ficha.open(activeMarker.assetId); setMarkerPopover(null) }} onRemove={() => { setMarkerRemovalId(activeMarker.id); setMarkerPopover(null) }} />}
        </div> : <div className="h-[600px] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-center"><p className="text-sm font-medium">No hay un plano para esta ubicación.</p><p className="mt-1 text-sm text-slate-500">Crea el primer plano con una imagen PNG, JPEG o WebP.</p><button type="button" onClick={() => { setCreateError(null); setCreateOpen(true) }} className="mt-4 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm">Crear plano</button></div>}
      </div>
    </div>
    <FloorPlanCreateModal open={createOpen} locations={catalog?.locations ?? []} projectId={catalog?.project.id ?? 0} initialLocationId={selectedLocationId} busy={createBusy} error={createError} onClose={() => setCreateOpen(false)} onSubmit={createPlan} />
    <FloorPlanPdfImportModal open={pdfImportOpen} onClose={() => setPdfImportOpen(false)} onImport={uploadVersion} />
    <AssetModal asset={ficha.asset} statuses={statuses} onClose={ficha.close} onEdit={ficha.onEdit} onChangeStatus={ficha.changeStatus} onDelete={ficha.remove} onDocumentsChanged={ficha.documentsChanged} onImageChanged={ficha.replaceAsset} />
    {ficha.formMode && ficha.asset && catalog && <AssetFormModal mode="edit" asset={ficha.asset} types={types} statuses={statuses} locations={catalog.locations} projectName={catalog.project.name} responsibleName={ficha.asset.responsible?.name ?? ''} projectId={catalog.project.id} responsibleId={ficha.asset.responsibleId} users={users} onCreateLocation={createLocationFromAssetForm} optionsError={false} onClose={ficha.closeForm} onSubmit={ficha.save} />}
    <ConfirmDialog open={markerRemovalId !== null} title="Quitar activo del plano" message={<>El activo <span className="font-medium">{markerForRemoval?.asset.code} · {markerForRemoval?.asset.name}</span> dejará de estar colocado en este plano al guardar las posiciones. ¿Continuar?</>} confirmLabel="Quitar del plano" busy={false} onConfirm={removeAssociation} onCancel={() => setMarkerRemovalId(null)} />
    <ConfirmDialog open={confirmPlanDelete} title="Eliminar plano" message={<>El plano <span className="font-medium">{plan?.name}</span>, sus versiones y sus marcadores se eliminarán de forma permanente. ¿Continuar?</>} confirmLabel="Eliminar plano" busyLabel="Eliminando…" busy={saving} onConfirm={() => void deleteCurrentPlan()} onCancel={() => setConfirmPlanDelete(false)} />
  </section>
}
