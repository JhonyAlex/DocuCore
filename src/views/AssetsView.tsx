import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Asset, AssetFilters, Pagination } from '@/types'
import AssetsFilters from '@/components/AssetsFilters'
import AssetsTable from '@/components/AssetsTable'
import AssetModal from '@/components/AssetModal'
import AssetFormModal from '@/components/AssetFormModal'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useSelection } from '@/hooks/useSelection'
import type { AssetFormValues } from '@/components/AssetFormModal'
import type { LocationFormValues } from '@/components/LocationFormModal'
import { changeAssetStatus, createAsset, createLocation, deleteAsset, fetchAsset, fetchAssetTypes, fetchAssets, fetchLocations, fetchStatuses, fetchUsers, purgeAsset, restoreAsset, updateAsset, uploadAssetImage, type ApiAsset, type ApiAssetType, type ApiLocation, type ApiStatus, type ApiUserRef, type AssetListParams } from '@/lib/api'
import { toUserWriteError } from '@/lib/apiErrors'
import { mapApiAssetToDisplay } from '@/lib/assetMappers'
import { useSession } from '@/contexts/SessionContext'
import { useAssetCreateRequest } from '@/contexts/AssetCreateContext'
import { useProject } from '@/contexts/ProjectContext'

const LIMIT = 6

interface RemovalTarget {
  ids: number[]
  label: string
  kind: 'trash' | 'purge'
}

export default function AssetsView() {
  const [searchParams] = useSearchParams()
  const { createRequested, clearCreateRequest } = useAssetCreateRequest()
  const { session, reload: reloadSession } = useSession()
  const { project, projectId, refresh: refreshProject } = useProject()
  if (projectId === null) throw new Error('AssetsView requires a project scope')
  const selection = useSelection<number>()
  const [selectedAsset, setSelectedAsset] = useState<ApiAsset | null>(null)
  const assetDetailRequestRef = useRef(0)
  const [assets, setAssets] = useState<ApiAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [types, setTypes] = useState<ApiAssetType[]>([])
  const [statuses, setStatuses] = useState<ApiStatus[]>([])
  const [locations, setLocations] = useState<ApiLocation[]>([])
  const [users, setUsers] = useState<ApiUserRef[]>([])
  const [optionsError, setOptionsError] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'duplicate' | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<AssetFilters>({
    search: '',
    typeId: null,
    statusId: null,
    locationId: null,
  })
  const [sortBy, setSortBy] = useState<string | undefined>(undefined)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  // ITEM-05: modo papelera — lista los activos eliminados (recuperables 30 días)
  // con acciones Restaurar y Eliminar definitivamente.
  const [trashMode, setTrashMode] = useState(false)
  const [trashCount, setTrashCount] = useState(0)
  const [trashSearch, setTrashSearch] = useState('')
  const [removalTarget, setRemovalTarget] = useState<RemovalTarget | null>(null)
  const [removalError, setRemovalError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const latestLoadRequest = useRef(0)
  const openedDeepLinkRef = useRef<number | null>(null)
  const deepLinkedAssetId = Number(searchParams.get('assetId'))
  const deepLinkedPreventiveExecutionId = Number(searchParams.get('preventiveExecutionId'))

  const loadAssets = useCallback(async () => {
    const requestId = latestLoadRequest.current + 1
    latestLoadRequest.current = requestId
    setLoading(true)
    setError(null)
    try {
      const params: AssetListParams = {
        page,
        limit: LIMIT,
        trashed: trashMode,
        search: trashMode ? (trashSearch || undefined) : (filters.search || undefined),
        typeId: trashMode ? undefined : (filters.typeId ?? undefined),
        statusId: trashMode ? undefined : (filters.statusId ?? undefined),
        locationId: trashMode ? undefined : (filters.locationId ?? undefined),
        sortBy,
        sortOrder,
      }
      const res = await fetchAssets(projectId, params)
      if (requestId !== latestLoadRequest.current) return
      setAssets(res.data)
      // List rows are deliberately light DTOs. Keep an already loaded detail
      // DTO intact instead of replacing it with a list row after a refresh.
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch {
      if (requestId !== latestLoadRequest.current) return
      setError('No se pudieron cargar los activos. Inténtalo de nuevo.')
      setAssets([])
    } finally {
      if (requestId === latestLoadRequest.current) setLoading(false)
    }
  }, [page, projectId, trashMode, trashSearch, filters, sortBy, sortOrder])

  const refreshTrashCount = useCallback(async () => {
    try {
      const res = await fetchAssets(projectId, { limit: 1, trashed: true })
      setTrashCount(res.total)
    } catch {
      setTrashCount(0)
    }
  }, [projectId])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  useEffect(() => {
    void refreshTrashCount()
  }, [refreshTrashCount])

  useEffect(() => {
    let active = true
    Promise.all([fetchAssetTypes(projectId), fetchStatuses(projectId), fetchLocations(projectId), fetchUsers(projectId)])
      .then(([nextTypes, nextStatuses, nextLocations, nextUsers]) => {
        if (!active) return
        setTypes(nextTypes)
        setStatuses(nextStatuses)
        setLocations(nextLocations.locations)
        setUsers(nextUsers)
      })
      .catch(() => {
        if (active) setOptionsError(true)
      })
    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    if (!createRequested) return
    setSelectedAsset(null)
    setFormMode('create')
    clearCreateRequest()
  }, [clearCreateRequest, createRequested])

  useEffect(() => {
    const urlSearch = searchParams.get('search')
    const urlStatusId = searchParams.get('statusId') ? Number(searchParams.get('statusId')) : null
    const urlTypeId = searchParams.get('typeId') ? Number(searchParams.get('typeId')) : null
    const urlLocationId = searchParams.get('locationId') ? Number(searchParams.get('locationId')) : null

    if (urlSearch !== null || urlStatusId !== null || urlTypeId !== null || urlLocationId !== null) {
      setFilters({
        search: urlSearch ?? '',
        statusId: urlStatusId,
        typeId: urlTypeId,
        locationId: urlLocationId,
      })
    }
  }, [searchParams])

  useEffect(() => {
    if (!Number.isInteger(deepLinkedAssetId) || deepLinkedAssetId <= 0 || openedDeepLinkRef.current === deepLinkedAssetId) return
    openedDeepLinkRef.current = deepLinkedAssetId
    void fetchAsset(projectId, deepLinkedAssetId).then(setSelectedAsset).catch(() => { openedDeepLinkRef.current = null })
  }, [deepLinkedAssetId, projectId])

  // Limpiar selección al cambiar filtros, entrar/salir papelera o cambiar de página.
  const handleFilterChange = (next: AssetFilters) => {
    setFilters(next)
    setPage(1)
    selection.clear()
  }

  const handlePageChange = (next: number) => {
    setPage(next)
    selection.clear()
  }

  const toUserError = (writeError: unknown) => toUserWriteError(writeError, {
    conflict: 'Ya existe un activo con ese código o número de serie.',
    notFound: 'El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    validation: 'Revisa los campos obligatorios e inténtalo de nuevo.',
    fallback: 'No se pudo guardar el activo. Inténtalo de nuevo.',
  })

  const toUserDeleteError = (writeError: unknown) => toUserWriteError(writeError, {
    notFound: 'El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    fallback: 'No se pudo eliminar el activo. Inténtalo de nuevo.',
  })

  // IMG-01: la subida de imagen ocurre tras guardar el activo; si falla, el
  // activo queda creado/actualizado y el error lo dice (recuperable desde la ficha).
  const saveAsset = async (values: AssetFormValues, imageFile: File | null) => {
    let saved: ApiAsset
    try {
      if (formMode === 'edit') {
        if (!selectedAsset) throw new Error('El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
        saved = await updateAsset(projectId, selectedAsset.id, values)
      } else {
        saved = await createAsset(projectId, values)
        if (formMode === 'duplicate') setSelectedAsset(saved)
      }
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
    if (imageFile) {
      try {
        saved = await uploadAssetImage(projectId, saved.id, imageFile)
      } catch {
        throw new Error(formMode === 'edit'
          ? 'El activo se actualizó, pero no se pudo subir la imagen. Puedes subirla desde la ficha del activo.'
          : 'El activo se creó, pero no se pudo subir la imagen. Puedes subirla desde la ficha del activo.')
      }
    }
    // Solo en edición/duplicado se refresca la ficha abierta; al crear el
    // activo la lista se recarga y el formulario se cierra sin abrir ficha.
    if (formMode === 'edit' || formMode === 'duplicate') setSelectedAsset(saved)
    await loadAssets()
    reloadSession()
    refreshProject()
    setFormMode(null)
  }

  const toLocationUserError = (writeError: unknown) => toUserWriteError(writeError, {
    conflict: 'Ya existe una ubicación con ese código.',
    notFound: 'La ubicación ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    validation: 'Revisa los campos obligatorios e inténtalo de nuevo.',
    fallback: 'No se pudo guardar la ubicación. Inténtalo de nuevo.',
  })

  // UX-03: alta rápida de ubicación desde el formulario de activo. Crea la ubicación
  // en el proyecto del formulario y refresca el catálogo para que quede seleccionada.
  const createLocationFromAssetForm = async (locationValues: LocationFormValues): Promise<ApiLocation> => {
    try {
      const created = await createLocation(projectId, locationValues)
      const nextLocations = await fetchLocations(projectId)
      setLocations(nextLocations.locations)
      return created
    } catch (writeError) {
      throw new Error(toLocationUserError(writeError))
    }
  }

  const handleStatusChange = async (statusId: number) => {
    if (!selectedAsset) throw new Error('El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
    try {
      const updated = await changeAssetStatus(projectId, selectedAsset.id, statusId)
      setSelectedAsset(updated)
      await loadAssets()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  // IMG-01: tras subir/quitar la imagen en la ficha, el activo se actualiza en
  // el estado de la ficha y en la lista (para que persista al reabrir).
  const handleImageChanged = (updated: ApiAsset) => {
    setSelectedAsset(updated)
    setAssets((current) => current.map((asset) => asset.id === updated.id ? updated : asset))
  }

  // ITEM-05: eliminar mueve a la papelera; se refresca lista, contador y sesión.
  const handleDelete = async (asset: { id: number }) => {
    try {
      await deleteAsset(projectId, asset.id)
      if (selectedAsset?.id === asset.id) setSelectedAsset(null)
      await Promise.all([loadAssets(), refreshTrashCount()])
      reloadSession()
      refreshProject()
    } catch (writeError) {
      throw new Error(toUserDeleteError(writeError))
    }
  }

  const handleRestore = async (asset: { id: number }) => {
    try {
      await restoreAsset(projectId, asset.id)
      await Promise.all([loadAssets(), refreshTrashCount()])
      reloadSession()
      refreshProject()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  const handleBulkRestore = async () => {
    try {
      await Promise.all(selection.selectedIds.map((id) => restoreAsset(projectId, id)))
      selection.clear()
      await Promise.all([loadAssets(), refreshTrashCount()])
      reloadSession()
      refreshProject()
    } catch (writeError) {
      setError(toUserError(writeError))
    }
  }

  const requestBulkPurge = () => {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    setRemovalError(null)
    setRemovalTarget({ ids, label: `${ids.length} ${ids.length === 1 ? 'activo' : 'activos'}`, kind: 'purge' })
  }

  const refreshSelectedAsset = async () => {
    await loadAssets()
    if (!selectedAsset) return
    const refreshed = await fetchAsset(projectId, selectedAsset.id)
    setSelectedAsset(refreshed)
  }

  const openAssetDetail = (assetId: number, afterLoad?: () => void) => {
    const request = ++assetDetailRequestRef.current
    void fetchAsset(projectId, assetId).then((asset) => {
      if (request !== assetDetailRequestRef.current) return
      setSelectedAsset(asset)
      afterLoad?.()
    }).catch(() => {
      if (request === assetDetailRequestRef.current) setError('No se pudo cargar la ficha completa del activo.')
    })
  }

  const requestBulkDelete = () => {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    setRemovalError(null)
    setRemovalTarget({ ids, label: `${ids.length} ${ids.length === 1 ? 'activo' : 'activos'}`, kind: 'trash' })
  }

  // La confirmación cubre tanto el soft delete como la purga definitiva.
  const handleConfirmedRemoval = async () => {
    if (!removalTarget) return
    const target = removalTarget
    setRemovalError(null)
    setRemoving(true)
    try {
      await Promise.all(target.ids.map((id) => target.kind === 'purge' ? purgeAsset(projectId, id) : deleteAsset(projectId, id)))
      selection.clear()
      setRemovalTarget(null)
      await Promise.all([loadAssets(), refreshTrashCount()])
      if (target.kind === 'trash') {
        reloadSession()
        refreshProject()
      }
    } catch (writeError) {
      setRemovalError(target.kind === 'purge'
        ? 'No se pudo eliminar definitivamente. Inténtalo de nuevo.'
        : toUserDeleteError(writeError))
    } finally {
      setRemoving(false)
    }
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
    setPage(1)
    selection.clear()
  }

  const enterTrash = () => {
    setTrashMode(true)
    setPage(1)
    setTrashSearch('')
    setSortBy(undefined)
    setSortOrder('asc')
    selection.clear()
  }

  const leaveTrash = () => {
    setTrashMode(false)
    setPage(1)
    setSortBy(undefined)
    setSortOrder('asc')
    selection.clear()
  }

  const pagination: Pagination = { page, totalPages, total, limit: LIMIT }
  const displayedAssets: Asset[] = assets.map(mapApiAssetToDisplay)
  const formAsset = formMode === 'edit' || formMode === 'duplicate' ? selectedAsset : null
  const responsibleId = formAsset?.responsibleId ?? session?.user.id ?? 0
  const responsibleName = formAsset?.responsible?.name ?? session?.user.name ?? ''

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{trashMode ? 'Activos eliminados · recuperables hasta 30 días' : 'Inventario completo del proyecto activo'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={trashMode ? leaveTrash : enterTrash} className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 ${trashMode ? 'border-brand-600 text-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-500 dark:text-brand-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            {trashMode ? 'Volver a activos' : 'Papelera'}
            {!trashMode && trashCount > 0 && <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-xs font-medium">{trashCount}</span>}
          </button>
          {!trashMode && (
            <button className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      <BulkActionBar selectedCount={selection.selectedCount} onClear={selection.clear}>
        {trashMode ? (
          <>
            <button type="button" onClick={() => void handleBulkRestore()} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">Restaurar</button>
            <button type="button" onClick={requestBulkPurge} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Eliminar definitivamente</button>
          </>
        ) : (
          <button type="button" onClick={requestBulkDelete} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Eliminar</button>
        )}
      </BulkActionBar>

      {!trashMode && (
        <AssetsFilters filters={filters} types={types} statuses={statuses} locations={locations} onFilterChange={handleFilterChange} />
      )}
      {trashMode && (
        <div className="mb-4">
          <input
            type="text"
            value={trashSearch}
            onChange={(event) => { setTrashSearch(event.target.value); setPage(1); selection.clear() }}
            placeholder="Buscar en la papelera por nombre, código o serie…"
            aria-label="Buscar en la papelera"
            className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      )}
      <AssetsTable
        assets={displayedAssets}
        loading={loading}
        error={error}
        pagination={pagination}
        trashMode={trashMode}
        selectedIds={selection.selected}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onToggleSelect={selection.toggle}
        onToggleSelectPage={selection.toggleAll}
        onRowClick={(asset) => { if (!trashMode) openAssetDetail(asset.id) }}
        onDuplicate={(asset) => {
          openAssetDetail(asset.id, () => setFormMode('duplicate'))
        }}
        onDelete={(asset) => { setRemovalError(null); setRemovalTarget({ ids: [asset.id], label: `${asset.code} · ${asset.name}`, kind: 'trash' }) }}
        onRestore={(asset) => { void handleRestore(asset).catch((writeError: unknown) => setError(writeError instanceof Error ? writeError.message : 'No se pudo restaurar el activo.')) }}
        onPurge={(asset) => { setRemovalError(null); setRemovalTarget({ ids: [asset.id], label: `${asset.code} · ${asset.name}`, kind: 'purge' }) }}
        onPageChange={handlePageChange}
        onRetry={() => void loadAssets()}
      />
      <AssetModal asset={selectedAsset} statuses={statuses} initialPreventiveExecutionId={selectedAsset?.id === deepLinkedAssetId && Number.isInteger(deepLinkedPreventiveExecutionId) && deepLinkedPreventiveExecutionId > 0 ? deepLinkedPreventiveExecutionId : null} onClose={() => setSelectedAsset(null)} onEdit={() => setFormMode('edit')} onChangeStatus={handleStatusChange} onDelete={handleDelete} onDocumentsChanged={refreshSelectedAsset} onImageChanged={handleImageChanged} />
      {formMode && <AssetFormModal mode={formMode} asset={formAsset} types={types} statuses={statuses} locations={locations} projectName={project?.name ?? ''} responsibleName={responsibleName} projectId={formAsset?.projectId ?? projectId} responsibleId={responsibleId} users={users} onCreateLocation={createLocationFromAssetForm} optionsError={optionsError} onClose={() => setFormMode(null)} onSubmit={saveAsset} />}
      <ConfirmDialog
        open={removalTarget !== null}
        title={removalTarget?.kind === 'purge' ? 'Eliminar definitivamente' : 'Eliminar activo'}
        message={removalTarget?.kind === 'purge'
          ? removalTarget.ids.length > 1
            ? <>Los <span className="font-medium text-slate-900 dark:text-slate-100">{removalTarget.label}</span> seleccionados se borrarán de forma permanente y no podrán recuperarse. ¿Continuar?</>
            : <>El activo <span className="font-medium text-slate-900 dark:text-slate-100">{removalTarget.label}</span> se borrará de forma permanente y no podrá recuperarse. ¿Continuar?</>
          : removalTarget && removalTarget.ids.length > 1
            ? <>Los <span className="font-medium text-slate-900 dark:text-slate-100">{removalTarget.label}</span> seleccionados se moverán a la papelera y podrán recuperarse durante 30 días. ¿Continuar?</>
            : <>El activo <span className="font-medium text-slate-900 dark:text-slate-100">{removalTarget?.label}</span> se moverá a la papelera y podrá recuperarse durante 30 días. ¿Continuar?</>
        }
        confirmLabel={removalTarget?.kind === 'purge' ? 'Eliminar definitivamente' : 'Eliminar'}
        busyLabel={removalTarget?.kind === 'purge' ? 'Eliminando…' : 'Moviendo a la papelera…'}
        busy={removing}
        onConfirm={() => void handleConfirmedRemoval()}
        onCancel={() => { setRemovalTarget(null); setRemovalError(null) }}
        error={removalError}
        variant="danger"
      />
    </section>
  )
}
