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
import { createFloorPlan, createFloorPlanVersion, createLocation, deleteFloorPlan, fetchAssetTypes, fetchFloorPlan, fetchFloorPlanAssets, fetchFloorPlanFacets, fetchFloorPlanMarkers, fetchFloorPlanPreference, fetchFloorPlans, fetchLocations, fetchStatuses, fetchUsers, floorPlanDziUrl, updateFloorPlanPreference, type ApiAssetType, type ApiFloorPlan, type ApiFloorPlanAsset, type ApiFloorPlanFacet, type ApiLocation, type ApiLocationsResponse, type ApiStatus, type ApiUserRef, type FloorPlanWriteInput } from '@/lib/api'
import { type NormalizedPoint } from '@/lib/floorPlanCoordinates'
import { filterFloorPlanAssets } from '@/lib/floorPlanPresentation'
import { useProject } from '@/contexts/ProjectContext'
import SectionActions from '@/components/SectionActions'

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
  const { projectId } = useProject()
  if (projectId === null) throw new Error('PlansView requires a project scope')
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
  const [backgroundDimmed, setBackgroundDimmed] = useState(true)
  const [backgroundPreferenceSaving, setBackgroundPreferenceSaving] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [viewerActionState, setViewerActionState] = useState<FloorPlanViewerActions | null>(null)
  const viewerActions = useRef<FloorPlanViewerActions | null>(null)
  const preferredPlanIdRef = useRef<number | null>(requestedPlanId)
  const [focusedAssetId, setFocusedAssetId] = useState<number | null>(requestedAssetId)
  const focusedMarkerRef = useRef<string | null>(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const locations = await fetchLocations(projectId)
      const [nextTypes, nextStatuses, nextUsers] = await Promise.all([fetchAssetTypes(projectId), fetchStatuses(projectId), fetchUsers(projectId)])
      let requestedPlan: ApiFloorPlan | null = null
      if (requestedPlanId) {
        try {
          const candidate = await fetchFloorPlan(projectId, requestedPlanId)
          if (candidate.projectId === projectId) requestedPlan = candidate
        } catch {
          setError('No se encontró el plano solicitado en el enlace.')
        }
      }
      setCatalog(locations); setTypes(nextTypes); setStatuses(nextStatuses); setUsers(nextUsers)
      setVisibleTypes(new Set(nextTypes.map((type) => type.id)))
      if (requestedPlan) preferredPlanIdRef.current = requestedPlan.id
      setSelectedLocationId((current) => requestedPlan?.locationId ?? (current && locations.locations.some((location) => location.id === current) ? current : locations.locations.find((location) => location.hasFloorPlan)?.id ?? locations.locations[0]?.id ?? null))
    } catch { setError('No se pudieron cargar las ubicaciones y los planos.') } finally { setLoading(false) }
  }, [projectId, requestedPlanId])

  const loadPlans = useCallback(async (locationId: number, projectId: number, preferredPlanId?: number | null) => {
    try {
      const result = await fetchFloorPlans(projectId, locationId)
      setPlans(result.data)
      const selected = result.data.find((candidate) => candidate.id === (preferredPlanId ?? preferredPlanIdRef.current)) ?? result.data[0] ?? null
      preferredPlanIdRef.current = selected?.id ?? null
      setPlan(selected ? await fetchFloorPlan(projectId, selected.id) : null)
      setPlacementPopover(null); setPlacementTarget(null); setMarkerPopover(null)
    } catch { setError('No se pudo cargar el plano seleccionado.') }
  }, [])

  const refreshPlan = useCallback(async () => {
    if (!catalog || !selectedLocationId) return
    await loadPlans(selectedLocationId, projectId, plan?.id)
  }, [catalog, loadPlans, plan?.id, projectId, selectedLocationId])
  const activePlanId = plan?.id

  useEffect(() => { void loadCatalog() }, [loadCatalog])
  useEffect(() => { if (catalog && selectedLocationId) void loadPlans(selectedLocationId, projectId, preferredPlanIdRef.current) }, [catalog, loadPlans, projectId, selectedLocationId])

  useEffect(() => {
    if (!activePlanId) { setFacets([]); return }
    let current = true
    void fetchFloorPlanFacets(projectId, activePlanId).then((result) => { if (current) setFacets(result.types) }).catch(() => { if (current) setFacets([]) })
    return () => { current = false }
  }, [activePlanId, projectId])

  useEffect(() => {
    if (!activePlanId) {
      setBackgroundDimmed(true)
      return
    }
    let current = true
    setBackgroundDimmed(true)
    void fetchFloorPlanPreference(projectId, activePlanId)
      .then((preference) => { if (current) setBackgroundDimmed(preference.backgroundDimmed) })
      .catch(() => { if (current) setError('No se pudo cargar la preferencia de contraste del plano.') })
    return () => { current = false }
  }, [activePlanId, projectId])

  // Asset discovery is remote and debounced: a plan never downloads the
  // complete subtree simply to make the placement/search UI usable.
  useEffect(() => {
    if (!plan || !assetSearch.trim()) { setSearchedAssets([]); return }
    let current = true
    const timer = window.setTimeout(() => {
      void fetchFloorPlanAssets(projectId, plan.id, assetSearch).then((result) => { if (current) setSearchedAssets(result.data) }).catch(() => { if (current) setSearchedAssets([]) })
    }, 250)
    return () => { current = false; window.clearTimeout(timer) }
  }, [assetSearch, plan, projectId])

  const ficha = useAssetFicha({ projectId, onAssetChanged: () => { void refreshPlan() } })
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
    const next = await fetchFloorPlanMarkers(projectId, plan.id, page)
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
    try { const created = await createFloorPlan(projectId, input, file); preferredPlanIdRef.current = created.id; setSelectedLocationId(input.locationId); await loadPlans(input.locationId, projectId, created.id); setCreateOpen(false) }
    catch { setCreateError('No se pudo crear el plano. Revisa el nombre, la ubicación y la imagen.') }
    finally { setCreateBusy(false) }
  }
  const uploadVersion = async (file: File | null) => {
    if (!plan || !file) return
    setUploading(true); setError(null)
    try { await createFloorPlanVersion(projectId, plan.id, file); await refreshPlan() }
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
    try { await deleteFloorPlan(projectId, plan.id); setConfirmPlanDelete(false); await loadPlans(plan.locationId, projectId) }
    catch { setError('No se pudo eliminar el plano.') } finally { setSaving(false) }
  }
  const createLocationFromAssetForm = async (values: LocationFormValues) => {
    if (!catalog) throw new Error('No hay proyecto seleccionado.')
    const created = await createLocation(projectId, values)
    await loadCatalog()
    return created
  }
  const placeAsset = (asset: ApiFloorPlanAsset, point: NormalizedPoint) => {
    editor.place(asset, point)
    setPlacementPopover(null); setPlacementTarget(null); setAssetSearch('')
  }
  const markViewerReady = useCallback((actions: FloorPlanViewerActions) => setViewerActionState(actions), [])
  const toggleBackgroundLayer = async () => {
    if (!plan || backgroundPreferenceSaving) return
    const next = !backgroundDimmed
    setBackgroundDimmed(next)
    setBackgroundPreferenceSaving(true)
    try {
      await updateFloorPlanPreference(projectId, plan.id, next)
    } catch {
      setBackgroundDimmed(!next)
      setError('No se pudo guardar la preferencia de contraste del plano.')
    } finally {
      setBackgroundPreferenceSaving(false)
    }
  }

  return <section className="fade-in">
    <SectionActions><div className="flex items-center gap-2">
        <button type="button" disabled={!plan} onClick={() => setPdfImportOpen(true)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-40">Importar desde PDF</button>
        <label className={`px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm ${!plan || uploading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>{uploading ? 'Subiendo…' : 'Subir nueva versión'}<input aria-label="Subir nueva versión" disabled={!plan || uploading} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void uploadVersion(event.target.files?.[0] ?? null).catch(() => undefined); event.currentTarget.value = '' }} /></label>
      </div></SectionActions>
    {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
    <div className={`grid grid-cols-1 gap-5 ${sidebarCollapsed ? 'xl:grid-cols-[2.5rem_minmax(0,1fr)]' : 'xl:grid-cols-4'}`}>
      <aside className={`overflow-hidden rounded-xl border border-slate-200 bg-white transition-[width,padding] duration-200 dark:border-slate-800 dark:bg-slate-900 ${sidebarCollapsed ? 'p-4 xl:p-2' : 'p-4'}`}>
        <div className={`mb-2 hidden xl:flex ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button type="button" aria-label={sidebarCollapsed ? 'Desplegar panel de planos' : 'Plegar panel de planos'} title={sidebarCollapsed ? 'Desplegar panel' : 'Plegar panel'} aria-pressed={sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)} className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-xs text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"><svg className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></button>
        </div>
        <div className={sidebarCollapsed ? 'xl:hidden' : ''}>
        <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Edificio</label><select value={buildingId ?? ''} onChange={(event) => { const next = Number(event.target.value); const first = catalog?.locations.find((item) => rootLocationId(item.id, catalog.locations) === next); preferredPlanIdRef.current = null; setFocusedAssetId(null); setSelectedLocationId(first?.id ?? null) }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">{buildings.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
        <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Planta</label><select value={selectedLocationId ?? ''} onChange={(event) => { preferredPlanIdRef.current = null; setFocusedAssetId(null); setSelectedLocationId(Number(event.target.value)) }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">{floors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
        <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Plano</label><select value={plan?.id ?? ''} onChange={(event) => { const value = event.target.value; if (value === '__new__') { setCreateError(null); setCreateOpen(true); return } const selected = plans.find((item) => item.id === Number(value)); if (selected) { preferredPlanIdRef.current = selected.id; setFocusedAssetId(null); void fetchFloorPlan(projectId, selected.id).then(setPlan) } }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"><option value="">Sin plano</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new__">＋ Crear nuevo plano…</option></select>{currentVersion && <div className="text-xs text-slate-500 mt-1">v{currentVersion.version} · Subido: {new Date(currentVersion.uploadedAt).toLocaleDateString('es-ES')} · {sizeLabel(currentVersion.sizeBytes)}</div>}</div>
        {plan && <FloorPlanAssetPanel types={planTypes} statuses={statuses} visibleTypes={visibleTypes} alert={alertFilter} statusFilterId={statusFilterId} onToggleType={(typeId, visible) => setVisibleTypes((current) => { const next = new Set(current); if (visible) next.add(typeId); else next.delete(typeId); return next })} onAlertChange={setAlertFilter} onStatusFilterChange={setStatusFilterId} />}
        {plan?.markersTruncated && <button type="button" disabled={editor.dirty} onClick={() => void loadMoreMarkers()} className="mt-4 text-xs text-brand-600 hover:underline disabled:opacity-40">Cargar más marcadores</button>}
        {plan && <button type="button" onClick={() => setConfirmPlanDelete(true)} className="mt-4 text-xs text-red-600 dark:text-red-400 hover:underline">Eliminar plano</button>}
        </div>
      </aside>
      <div className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${sidebarCollapsed ? '' : 'xl:col-span-3'}`}>
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm"><div className="flex items-center gap-3"><PlanEditorControls dirty={editor.dirty} canUndo={editor.canUndo} canRedo={editor.canRedo} saving={saving} actions={viewerActionState} onUndo={editor.undo} onRedo={editor.redo} onSave={() => void savePositions()} /><span className="text-xs text-slate-500">Pan y zoom siempre disponibles · Coordenadas normalizadas (0–1)</span></div>{plan && <button type="button" aria-pressed={backgroundDimmed} disabled={backgroundPreferenceSaving} onClick={() => void toggleBackgroundLayer()} className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-500 transition hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200">{backgroundDimmed ? 'Sin capa' : 'Capa fondo'}</button>}</div>
        {loading ? <div className="h-[600px] flex items-center justify-center text-sm text-slate-500">Cargando planos…</div> : plan && currentVersion ? <div className="relative">
          <FloorPlanViewer dziUrl={floorPlanDziUrl(projectId, plan.id, currentVersion.version)} width={currentVersion.width} height={currentVersion.height} markers={shownMarkers} highlightedAssetId={focusedAssetId} backgroundDimmed={backgroundDimmed} actionsRef={viewerActions} onReady={markViewerReady} onEmptyQuickClick={(point, anchor) => { setMarkerPopover(null); if (placementTarget && !editor.markers.some((marker) => marker.assetId === placementTarget.id)) { placeAsset(placementTarget, point); return } setPlacementPopover({ point, anchor }) }} onSelectMarker={(marker, anchor) => { setPlacementTarget(null); setPlacementPopover(null); setFocusedAssetId(marker.assetId); setMarkerPopover({ markerId: marker.id, anchor }) }} onMarkerDragStart={(markerId) => { setMarkerPopover(null); editor.beginMove(markerId) }} onMarkerDrag={(markerId, point) => editor.previewMove(markerId, point)} onMarkerDragEnd={() => editor.endMove()} />
          <FloorPlanAssetSearch search={assetSearch} assets={searchedAssets} markers={editor.markers} onSearchChange={setAssetSearch} onFocusMarker={(marker) => { setMarkerPopover(null); viewerActions.current?.focus(marker) }} onStartPlacement={(asset) => { setAssetSearch(''); setPlacementPopover(null); setMarkerPopover(null); setPlacementTarget(asset) }} />
          {placementTarget && <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-brand-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-brand-800 dark:bg-slate-900/95"><span>Elige una zona para <strong>{placementTarget.name}</strong></span><button type="button" onClick={() => setPlacementTarget(null)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">Cancelar</button></div>}
          {placementPopover && <FloorPlanPlacementPopover anchor={placementPopover.anchor} searchAssets={async (query) => (await fetchFloorPlanAssets(projectId, plan.id, query)).data.filter((asset) => !editor.markers.some((marker) => marker.assetId === asset.id))} onChoose={(asset) => placeAsset(asset, placementPopover.point)} onClose={() => setPlacementPopover(null)} />}
          {activeMarker && markerPopover && <FloorPlanMarkerPopover marker={activeMarker} anchor={markerPopover.anchor} onClose={() => setMarkerPopover(null)} onView={() => { ficha.open(activeMarker.assetId); setMarkerPopover(null) }} onRemove={() => { setMarkerRemovalId(activeMarker.id); setMarkerPopover(null) }} />}
        </div> : <div className="h-[600px] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-center"><p className="text-sm font-medium">No hay un plano para esta ubicación.</p><p className="mt-1 text-sm text-slate-500">Crea el primer plano con una imagen PNG, JPEG o WebP.</p><button type="button" onClick={() => { setCreateError(null); setCreateOpen(true) }} className="mt-4 flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Crear plano</button></div>}
      </div>
    </div>
    <FloorPlanCreateModal open={createOpen} locations={catalog?.locations ?? []} projectId={projectId} initialLocationId={selectedLocationId} busy={createBusy} error={createError} onClose={() => setCreateOpen(false)} onSubmit={createPlan} />
    <FloorPlanPdfImportModal open={pdfImportOpen} onClose={() => setPdfImportOpen(false)} onImport={uploadVersion} />
    <AssetModal asset={ficha.asset} statuses={statuses} onClose={ficha.close} onEdit={ficha.onEdit} onChangeStatus={ficha.changeStatus} onDelete={ficha.remove} onDocumentsChanged={ficha.documentsChanged} onImageChanged={ficha.replaceAsset} />
    {ficha.formMode && ficha.asset && catalog && <AssetFormModal mode="edit" asset={ficha.asset} types={types} statuses={statuses} locations={catalog.locations} projectName={catalog.project.name} responsibleName={ficha.asset.responsible?.name ?? ''} projectId={catalog.project.id} responsibleId={ficha.asset.responsibleId} users={users} onCreateLocation={createLocationFromAssetForm} optionsError={false} onClose={ficha.closeForm} onSubmit={ficha.save} />}
    <ConfirmDialog open={markerRemovalId !== null} title="Quitar activo del plano" message={<>El activo <span className="font-medium">{markerForRemoval?.asset.code} · {markerForRemoval?.asset.name}</span> dejará de estar colocado en este plano al guardar las posiciones. ¿Continuar?</>} confirmLabel="Quitar del plano" busy={false} onConfirm={removeAssociation} onCancel={() => setMarkerRemovalId(null)} />
    <ConfirmDialog open={confirmPlanDelete} title="Eliminar plano" message={<>El plano <span className="font-medium">{plan?.name}</span>, sus versiones y sus marcadores se eliminarán de forma permanente. ¿Continuar?</>} confirmLabel="Eliminar plano" busyLabel="Eliminando…" busy={saving} onConfirm={() => void deleteCurrentPlan()} onCancel={() => setConfirmPlanDelete(false)} />
  </section>
}
