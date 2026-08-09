import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset, AssetFilters, Pagination } from '@/types'
import AssetsFilters from '@/components/AssetsFilters'
import AssetsTable from '@/components/AssetsTable'
import AssetModal from '@/components/AssetModal'
import AssetFormModal from '@/components/AssetFormModal'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useSelection } from '@/hooks/useSelection'
import type { AssetFormValues } from '@/components/AssetFormModal'
import { changeAssetStatus, createAsset, deleteAsset, fetchAssetTypes, fetchAssets, fetchLocations, fetchStatuses, purgeAsset, restoreAsset, updateAsset, type ApiAsset, type ApiAssetType, type ApiLocation, type ApiStatus, type AssetListParams } from '@/lib/api'
import { toUserWriteError } from '@/lib/apiErrors'
import { mapApiAssetToDisplay } from '@/lib/assetMappers'
import { useSession } from '@/contexts/SessionContext'
import { useAssetCreateRequest } from '@/contexts/AssetCreateContext'

const LIMIT = 6

interface PurgeTarget {
  ids: number[]
  label: string
}

export default function AssetsView() {
  const { createRequested, clearCreateRequest } = useAssetCreateRequest()
  const { session, reload: reloadSession } = useSession()
  const selection = useSelection<number>()
  const [selectedAsset, setSelectedAsset] = useState<ApiAsset | null>(null)
  const [assets, setAssets] = useState<ApiAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [types, setTypes] = useState<ApiAssetType[]>([])
  const [statuses, setStatuses] = useState<ApiStatus[]>([])
  const [locations, setLocations] = useState<ApiLocation[]>([])
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
  // ITEM-05: modo papelera — lista los activos eliminados (recuperables 30 días)
  // con acciones Restaurar y Eliminar definitivamente.
  const [trashMode, setTrashMode] = useState(false)
  const [trashCount, setTrashCount] = useState(0)
  const [trashSearch, setTrashSearch] = useState('')
  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null)
  const [purgeError, setPurgeError] = useState<string | null>(null)
  const latestLoadRequest = useRef(0)

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
      }
      const res = await fetchAssets(params)
      if (requestId !== latestLoadRequest.current) return
      setAssets(res.data)
      setSelectedAsset((current) => current && !trashMode ? res.data.find((asset) => asset.id === current.id) ?? current : current)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch {
      if (requestId !== latestLoadRequest.current) return
      setError('No se pudieron cargar los activos. Inténtalo de nuevo.')
      setAssets([])
    } finally {
      if (requestId === latestLoadRequest.current) setLoading(false)
    }
  }, [page, trashMode, trashSearch, filters])

  const refreshTrashCount = useCallback(async () => {
    try {
      const res = await fetchAssets({ limit: 1, trashed: true })
      setTrashCount(res.total)
    } catch {
      setTrashCount(0)
    }
  }, [])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  useEffect(() => {
    void refreshTrashCount()
  }, [refreshTrashCount])

  useEffect(() => {
    let active = true
    Promise.all([fetchAssetTypes(), fetchStatuses(), fetchLocations()])
      .then(([nextTypes, nextStatuses, nextLocations]) => {
        if (!active) return
        setTypes(nextTypes)
        setStatuses(nextStatuses)
        setLocations(nextLocations.locations)
      })
      .catch(() => {
        if (active) setOptionsError(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!createRequested) return
    setSelectedAsset(null)
    setFormMode('create')
    clearCreateRequest()
  }, [clearCreateRequest, createRequested])

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

  const saveAsset = async (values: AssetFormValues) => {
    try {
      if (formMode === 'edit') {
        if (!selectedAsset) throw new Error('El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
        const updated = await updateAsset(selectedAsset.id, values)
        setSelectedAsset(updated)
      } else {
        const created = await createAsset(values)
        if (formMode === 'duplicate') setSelectedAsset(created)
      }
      await loadAssets()
      reloadSession()
      setFormMode(null)
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  const handleStatusChange = async (statusId: number) => {
    if (!selectedAsset) throw new Error('El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
    try {
      const updated = await changeAssetStatus(selectedAsset.id, statusId)
      setSelectedAsset(updated)
      await loadAssets()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  // ITEM-05: eliminar mueve a la papelera; se refresca lista, contador y sesión.
  const handleDelete = async (asset: { id: number }) => {
    try {
      await deleteAsset(asset.id)
      if (selectedAsset?.id === asset.id) setSelectedAsset(null)
      await Promise.all([loadAssets(), refreshTrashCount()])
      reloadSession()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  const handleRestore = async (asset: { id: number }) => {
    try {
      await restoreAsset(asset.id)
      await Promise.all([loadAssets(), refreshTrashCount()])
      reloadSession()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  // Acciones masivas: Promise.all sobre los ids seleccionados.
  // Reusa la auditoría, validaciones y guards 404/409 de los endpoints individuales.
  const handleBulkDelete = async () => {
    try {
      await Promise.all(selection.selectedIds.map((id) => deleteAsset(id)))
      selection.clear()
      await Promise.all([loadAssets(), refreshTrashCount()])
      reloadSession()
    } catch (writeError) {
      setError(toUserError(writeError))
    }
  }

  const handleBulkRestore = async () => {
    try {
      await Promise.all(selection.selectedIds.map((id) => restoreAsset(id)))
      selection.clear()
      await Promise.all([loadAssets(), refreshTrashCount()])
      reloadSession()
    } catch (writeError) {
      setError(toUserError(writeError))
    }
  }

  const requestBulkPurge = () => {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    setPurgeError(null)
    setPurgeTarget({ ids, label: `${ids.length} ${ids.length === 1 ? 'activo' : 'activos'}` })
  }

  const handlePurge = async () => {
    if (!purgeTarget) return
    setPurgeError(null)
    try {
      await Promise.all(purgeTarget.ids.map((id) => purgeAsset(id)))
      selection.clear()
      setPurgeTarget(null)
      await Promise.all([loadAssets(), refreshTrashCount()])
    } catch {
      setPurgeError('No se pudo eliminar definitivamente. Inténtalo de nuevo.')
    }
  }

  const enterTrash = () => {
    setTrashMode(true)
    setPage(1)
    setTrashSearch('')
    selection.clear()
  }

  const leaveTrash = () => {
    setTrashMode(false)
    setPage(1)
    selection.clear()
  }

  const pagination: Pagination = { page, totalPages, total, limit: LIMIT }
  const displayedAssets: Asset[] = assets.map(mapApiAssetToDisplay)
  const projectId = session?.project.id ?? 0
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
            <>
              <button className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Exportar CSV
              </button>
              <button type="button" onClick={() => setFormMode('create')} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" /></svg>
                Nuevo activo
              </button>
            </>
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
          <button type="button" onClick={() => void handleBulkDelete()} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Eliminar</button>
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
        onToggleSelect={selection.toggle}
        onToggleSelectPage={selection.toggleAll}
        onRowClick={(asset) => !trashMode && setSelectedAsset(assets.find((apiAsset) => apiAsset.id === asset.id) ?? null)}
        onDuplicate={(asset) => {
          setSelectedAsset(assets.find((apiAsset) => apiAsset.id === asset.id) ?? null)
          setFormMode('duplicate')
        }}
        onDelete={(asset) => { void handleDelete(asset).catch((writeError: unknown) => setError(writeError instanceof Error ? writeError.message : 'No se pudo eliminar el activo.')) }}
        onRestore={(asset) => { void handleRestore(asset).catch((writeError: unknown) => setError(writeError instanceof Error ? writeError.message : 'No se pudo restaurar el activo.')) }}
        onPurge={(asset) => { setPurgeError(null); setPurgeTarget({ ids: [asset.id], label: `${asset.code} · ${asset.name}` }) }}
        onPageChange={handlePageChange}
        onRetry={() => void loadAssets()}
      />
      <AssetModal asset={selectedAsset} statuses={statuses} onClose={() => setSelectedAsset(null)} onEdit={() => setFormMode('edit')} onChangeStatus={handleStatusChange} onDelete={(asset) => void handleDelete(asset)} onDocumentsChanged={loadAssets} />
      {formMode && <AssetFormModal mode={formMode} asset={formAsset} types={types} statuses={statuses} locations={locations} projectName={session?.project.name ?? ''} responsibleName={responsibleName} projectId={formAsset?.projectId ?? projectId} responsibleId={responsibleId} optionsError={optionsError} onClose={() => setFormMode(null)} onSubmit={saveAsset} />}
      <ConfirmDialog
        open={purgeTarget !== null}
        title="Eliminar definitivamente"
        message={purgeTarget && purgeTarget.ids.length > 1
          ? <>Los <span className="font-medium text-slate-900 dark:text-slate-100">{purgeTarget.label}</span> seleccionados se borrarán de forma permanente y no podrán recuperarse. ¿Continuar?</>
          : <>El activo <span className="font-medium text-slate-900 dark:text-slate-100">{purgeTarget?.label}</span> se borrará de forma permanente y no podrá recuperarse. ¿Continuar?</>
        }
        confirmLabel="Eliminar definitivamente"
        onConfirm={() => void handlePurge()}
        onCancel={() => setPurgeTarget(null)}
        error={purgeError}
        variant="danger"
      />
    </section>
  )
}
