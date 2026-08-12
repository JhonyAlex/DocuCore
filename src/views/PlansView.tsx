import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AssetFormModal from '@/components/AssetFormModal'
import AssetModal from '@/components/AssetModal'
import ConfirmDialog from '@/components/ConfirmDialog'
import FloorPlanCreateModal from '@/components/FloorPlanCreateModal'
import FloorPlanViewer, { type FloorPlanViewerActions } from '@/components/FloorPlanViewer'
import FloorPlanPdfImportModal from '@/components/FloorPlanPdfImportModal'
import FloorPlanAssetPanel from '@/components/FloorPlanAssetPanel'
import type { LocationFormValues } from '@/components/LocationFormModal'
import PlanEditorControls, { PlanModeToggle } from '@/components/PlanEditorControls'
import { createFloorPlan, createFloorPlanVersion, createLocation, deleteFloorPlan, fetchAssetTypes, fetchFloorPlan, fetchFloorPlans, fetchLocations, fetchStatuses, fetchUsers, type ApiAssetType, type ApiFloorPlan, type ApiLocation, type ApiLocationsResponse, type ApiStatus, type ApiUserRef, type FloorPlanWriteInput } from '@/lib/api'
import { floorPlanDziUrl } from '@/lib/api'
import { useAssetFicha } from '@/hooks/useAssetFicha'
import { useFloorPlanEditor } from '@/hooks/useFloorPlanEditor'
import { filterFloorPlanAssets, floorPlanAlert, floorPlanEventOrigin } from '@/lib/floorPlanPresentation'

function sizeLabel(bytes: number): string { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB` }
function rootLocationId(locationId: number, locations: ApiLocation[]): number {
  const byId = new Map(locations.map((location) => [location.id, location]))
  let current = byId.get(locationId)
  const visited = new Set<number>()
  while (current && current.parentId !== null && !visited.has(current.id)) { visited.add(current.id); current = byId.get(current.parentId) }
  return current?.id ?? locationId
}

export default function PlansView() {
  const [searchParams] = useSearchParams()
  const requestedLocationId = Number(searchParams.get('locationId')) || null
  const [catalog, setCatalog] = useState<ApiLocationsResponse | null>(null)
  const [types, setTypes] = useState<ApiAssetType[]>([])
  const [statuses, setStatuses] = useState<ApiStatus[]>([])
  const [users, setUsers] = useState<ApiUserRef[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(requestedLocationId)
  const [plans, setPlans] = useState<ApiFloorPlan[]>([])
  const [plan, setPlan] = useState<ApiFloorPlan | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [visibleTypes, setVisibleTypes] = useState<Set<number>>(new Set())
  const [assetSearch, setAssetSearch] = useState('')
  const [alertFilter, setAlertFilter] = useState<'all' | 'overdue' | 'soon' | 'normal'>('all')
  const [statusFilterId, setStatusFilterId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [pdfImportOpen, setPdfImportOpen] = useState(false)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [movingMarkerId, setMovingMarkerId] = useState<number | null>(null)
  const [markerRemovalId, setMarkerRemovalId] = useState<number | null>(null)
  const [confirmPlanDelete, setConfirmPlanDelete] = useState(false)
  const [viewerActionState, setViewerActionState] = useState<FloorPlanViewerActions | null>(null)
  const viewerActions = useRef<FloorPlanViewerActions | null>(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const locations = await fetchLocations()
      const [nextTypes, nextStatuses, nextUsers] = await Promise.all([fetchAssetTypes(locations.project.id), fetchStatuses(), fetchUsers()])
      setCatalog(locations); setTypes(nextTypes); setStatuses(nextStatuses); setUsers(nextUsers)
      setVisibleTypes(new Set(nextTypes.map((type) => type.id)))
      setSelectedLocationId((current) => current && locations.locations.some((location) => location.id === current) ? current : locations.locations.find((location) => location.hasFloorPlan)?.id ?? locations.locations[0]?.id ?? null)
    } catch { setError('No se pudieron cargar las ubicaciones y los planos.') } finally { setLoading(false) }
  }, [])

  const loadPlans = useCallback(async (locationId: number, projectId: number, preferredPlanId?: number | null) => {
    try {
      const result = await fetchFloorPlans(projectId, locationId)
      setPlans(result.data)
      const selected = result.data.find((candidate) => candidate.id === preferredPlanId) ?? result.data[0] ?? null
      setPlan(selected ? await fetchFloorPlan(selected.id) : null)
      setSelectedAssetId(null)
    } catch { setError('No se pudo cargar el plano seleccionado.') }
  }, [])

  const refreshPlan = useCallback(async () => {
    if (!catalog || !selectedLocationId) return
    await loadPlans(selectedLocationId, catalog.project.id, plan?.id)
  }, [catalog, loadPlans, plan?.id, selectedLocationId])

  useEffect(() => { void loadCatalog() }, [loadCatalog])
  useEffect(() => { if (catalog && selectedLocationId) void loadPlans(selectedLocationId, catalog.project.id) }, [catalog, loadPlans, selectedLocationId]) // La selección de ubicación es la fuente de los planos.

  const ficha = useAssetFicha({ onAssetChanged: () => { void refreshPlan() } })

  const editor = useFloorPlanEditor(plan)
  const location = catalog?.locations.find((item) => item.id === selectedLocationId) ?? null
  const buildingId = location && catalog ? rootLocationId(location.id, catalog.locations) : null
  const buildings = catalog?.locations.filter((item) => item.parentId === null) ?? []
  const floors = catalog && buildingId ? catalog.locations.filter((item) => rootLocationId(item.id, catalog.locations) === buildingId) : []
  const planAssets = plan?.availableAssets ?? []
  const planTypes = types.filter((type) => planAssets.some((asset) => asset.type.id === type.id))
  const filteredAssets = filterFloorPlanAssets(planAssets, { search: assetSearch, typeIds: visibleTypes, statusIds: statusFilterId ? new Set([statusFilterId]) : new Set(), alert: alertFilter })
  const shownMarkers = editor.markers.filter((marker) => visibleTypes.has(marker.asset.type.id) && filteredAssets.some((asset) => asset.id === marker.assetId))
  const selectedMarker = editor.markers.find((marker) => marker.id === selectedMarkerId) ?? null
  const markerForRemoval = editor.markers.find((marker) => marker.id === markerRemovalId) ?? null
  const currentVersion = plan?.currentVersion ?? null

  const createPlan = async (input: FloorPlanWriteInput, file: File) => {
    setCreateBusy(true); setCreateError(null)
    try { const created = await createFloorPlan(input, file); setSelectedLocationId(input.locationId); await loadPlans(input.locationId, input.projectId, created.id); setCreateOpen(false) }
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

  const removeAssociation = () => { if (markerRemovalId !== null) editor.remove(markerRemovalId); setMarkerRemovalId(null); setSelectedMarkerId(null) }
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

  const markViewerReady = useCallback((actions: FloorPlanViewerActions) => setViewerActionState(actions), [])

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div><h1 className="text-2xl font-semibold tracking-tight">Planos interactivos</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Visualiza y gestiona la ubicación de los activos sobre los planos</p></div>
        <div className="flex items-center gap-2">
          <PlanModeToggle editMode={editMode} onModeChange={setEditMode} />
          <button type="button" disabled={!plan} onClick={() => setPdfImportOpen(true)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-40">Importar desde PDF</button>
          <label className={`px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm ${!plan || uploading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}> {uploading ? 'Subiendo…' : 'Subir nueva versión'}<input aria-label="Subir nueva versión" disabled={!plan || uploading} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void uploadVersion(event.target.files?.[0] ?? null).catch(() => undefined); event.currentTarget.value = '' }} /></label>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <aside className="xl:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Edificio</label><select value={buildingId ?? ''} onChange={(event) => { const next = Number(event.target.value); const first = catalog?.locations.find((item) => rootLocationId(item.id, catalog.locations) === next); setSelectedLocationId(first?.id ?? null) }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">{buildings.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Planta</label><select value={selectedLocationId ?? ''} onChange={(event) => setSelectedLocationId(Number(event.target.value))} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">{floors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div className="mb-4"><label className="text-xs text-slate-500 uppercase tracking-wider">Plano</label><select value={plan?.id ?? ''} onChange={(event) => { const value = event.target.value; if (value === '__new__') { setCreateError(null); setCreateOpen(true); return } const selected = plans.find((item) => item.id === Number(value)); if (selected) void fetchFloorPlan(selected.id).then(setPlan) }} className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"><option value="">Sin plano</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new__">＋ Crear nuevo plano…</option></select>{currentVersion && <div className="text-xs text-slate-500 mt-1">v{currentVersion.version} · Subido: {new Date(currentVersion.uploadedAt).toLocaleDateString('es-ES')} · {sizeLabel(currentVersion.sizeBytes)}</div>}</div>
           {plan && <FloorPlanAssetPanel
             types={planTypes}
             assets={planAssets}
             statuses={statuses}
             visibleTypes={visibleTypes}
             search={assetSearch}
             alert={alertFilter}
             statusFilterId={statusFilterId}
             filteredAssets={filteredAssets}
             markers={editor.markers}
             editMode={editMode}
             selectedAssetId={selectedAssetId}
             movingMarkerId={movingMarkerId}
             onToggleType={(typeId, visible) => setVisibleTypes((current) => { const next = new Set(current); if (visible) next.add(typeId); else next.delete(typeId); return next })}
             onSearchChange={setAssetSearch}
             onAlertChange={setAlertFilter}
             onStatusFilterChange={setStatusFilterId}
             onAssetClick={(asset) => { const marker = editor.markers.find((entry) => entry.assetId === asset.id); if (marker) { setSelectedMarkerId(marker.id); viewerActions.current?.focus(marker) } else if (editMode) setSelectedAssetId(asset.id) }}
             onSelectedAssetChange={(assetId) => { setSelectedAssetId(assetId); setSelectedMarkerId(null) }}
             onMoveMarker={(marker) => { setMovingMarkerId(marker.id); setSelectedMarkerId(marker.id); viewerActions.current?.focus(marker) }}
             onNudgeMarker={(marker, x, y) => editor.move(marker.id, { x, y })}
           />}
          {plan && <button type="button" onClick={() => setConfirmPlanDelete(true)} className="mt-4 text-xs text-red-600 dark:text-red-400 hover:underline">Eliminar plano</button>}
        </aside>
        <div className="xl:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm"><div className="flex items-center gap-3"><PlanEditorControls dirty={editor.dirty} canUndo={editor.canUndo} canRedo={editor.canRedo} saving={saving} actions={viewerActionState} onUndo={editor.undo} onRedo={editor.redo} onSave={() => void savePositions()} /><span className="text-xs text-slate-500">Zoom fluido · Coordenadas normalizadas (0–1)</span></div></div>
          {loading ? <div className="h-[600px] flex items-center justify-center text-sm text-slate-500">Cargando planos…</div> : plan && currentVersion ? <FloorPlanViewer dziUrl={floorPlanDziUrl(plan.id, currentVersion.version)} width={currentVersion.width} height={currentVersion.height} markers={shownMarkers} editMode={editMode} placementAssetId={selectedAssetId} actionsRef={viewerActions} onReady={markViewerReady} onPlace={(point) => { const asset = filteredAssets.find((item) => item.id === selectedAssetId && !editor.markers.some((marker) => marker.assetId === item.id)); if (asset) { editor.place(asset, point); setSelectedAssetId(null) } }} onSelectMarker={(marker) => { setSelectedMarkerId(marker.id); if (!editMode) ficha.open(marker.assetId) }} /> : <div className="h-[600px] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-center"><p className="text-sm font-medium">No hay un plano para esta ubicación.</p><p className="mt-1 text-sm text-slate-500">Crea el primer plano con una imagen PNG, JPEG o WebP.</p><button type="button" onClick={() => { setCreateError(null); setCreateOpen(true) }} className="mt-4 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm">Crear plano</button></div>}
        </div>
      </div>
      {selectedMarkerId !== null && <div className="fixed bottom-5 right-5 z-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-lg"><p className="text-sm font-medium">{selectedMarker?.asset.code} · {selectedMarker?.asset.name}</p><p className="text-xs text-slate-500">{selectedMarker?.asset.type.name} · {selectedMarker?.asset.status.name}</p>{selectedMarker?.asset.nextEvents[0] && <p className={`mt-1 text-xs ${floorPlanAlert(selectedMarker.asset) === 'overdue' ? 'text-red-600' : floorPlanAlert(selectedMarker.asset) === 'soon' ? 'text-amber-600' : 'text-slate-500'}`}>{selectedMarker.asset.nextEvents[0].title} · {new Date(selectedMarker.asset.nextEvents[0].date).toLocaleDateString('es-ES')} · {selectedMarker.asset.nextEvents[0].daysUntil} días · {floorPlanEventOrigin(selectedMarker.asset.nextEvents[0].source)} · {selectedMarker.asset.nextEvents[0].sourceLabel}</p>}{editMode && <button type="button" onClick={() => setMarkerRemovalId(selectedMarkerId)} className="mt-1 text-xs text-red-600 hover:underline">Quitar asociación</button>}</div>}
      <FloorPlanCreateModal open={createOpen} locations={catalog?.locations ?? []} projectId={catalog?.project.id ?? 0} initialLocationId={selectedLocationId} busy={createBusy} error={createError} onClose={() => setCreateOpen(false)} onSubmit={createPlan} />
      <FloorPlanPdfImportModal open={pdfImportOpen} onClose={() => setPdfImportOpen(false)} onImport={uploadVersion} />
      <AssetModal asset={ficha.asset} statuses={statuses} onClose={ficha.close} onEdit={ficha.onEdit} onChangeStatus={ficha.changeStatus} onDelete={ficha.remove} onDocumentsChanged={ficha.documentsChanged} onImageChanged={ficha.replaceAsset} />
      {ficha.formMode && ficha.asset && catalog && <AssetFormModal mode="edit" asset={ficha.asset} types={types} statuses={statuses} locations={catalog.locations} projectName={catalog.project.name} responsibleName={ficha.asset.responsible?.name ?? ''} projectId={catalog.project.id} responsibleId={ficha.asset.responsibleId} users={users} onCreateLocation={createLocationFromAssetForm} optionsError={false} onClose={ficha.closeForm} onSubmit={ficha.save} />}
      <ConfirmDialog open={markerRemovalId !== null} title="Quitar asociación del plano" message={<>El activo <span className="font-medium">{markerForRemoval?.asset.code} · {markerForRemoval?.asset.name}</span> dejará de estar colocado en este plano al guardar las posiciones. ¿Continuar?</>} confirmLabel="Quitar asociación" busy={false} onConfirm={removeAssociation} onCancel={() => setMarkerRemovalId(null)} />
      <ConfirmDialog open={confirmPlanDelete} title="Eliminar plano" message={<>El plano <span className="font-medium">{plan?.name}</span>, sus versiones y sus marcadores se eliminarán de forma permanente. ¿Continuar?</>} confirmLabel="Eliminar plano" busyLabel="Eliminando…" busy={saving} onConfirm={() => void deleteCurrentPlan()} onCancel={() => setConfirmPlanDelete(false)} />
    </section>
  )
}
