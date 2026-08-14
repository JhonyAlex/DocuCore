import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createLocation,
  deleteLocation,
  fetchAssetTypes,
  fetchLocation,
  fetchLocationAssets,
  fetchLocationBootstrap,
  fetchLocations,
  fetchStatuses,
  fetchUsers,
  updateLocation,
  type ApiAssetType,
  type ApiLocation,
  type ApiLocationAsset,
  type ApiLocationDetail,
  type ApiLocationsResponse,
  type ApiStatus,
  type ApiUserRef,
} from '@/lib/api'
import { toUserWriteError } from '@/lib/apiErrors'
import { mapApiLocationAssetToDisplay } from '@/lib/assetMappers'
import LocationFormModal, { type LocationFormValues } from '@/components/LocationFormModal'
import AssetModal from '@/components/AssetModal'
import AssetFormModal from '@/components/AssetFormModal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useAssetFicha } from '@/hooks/useAssetFicha'
import { useSession } from '@/contexts/SessionContext'

interface TreeNode {
  location: ApiLocation
  children: TreeNode[]
  subtreeCount: number
}

// Construye únicamente las ramas ya pedidas al servidor. Nunca fuerza la
// descarga del árbol completo para que el usuario abra una ubicación.
function buildTree(locations: ApiLocation[]): TreeNode[] {
  const byParent = new Map<number | null, ApiLocation[]>()
  for (const location of locations) {
    const siblings = byParent.get(location.parentId) ?? []
    siblings.push(location)
    byParent.set(location.parentId, siblings)
  }

  const countAll = (location: ApiLocation): number =>
    location.assetCount + (byParent.get(location.id) ?? []).reduce((sum, child) => sum + countAll(child), 0)

  const toNode = (location: ApiLocation): TreeNode => ({
    location,
    children: (byParent.get(location.id) ?? []).map(toNode),
    subtreeCount: countAll(location),
  })

  return (byParent.get(null) ?? []).map(toNode)
}

// Una ubicación con hijos se renderiza como rama <details>; el resto son hojas.
function isBranch(node: TreeNode): boolean {
  return node.location.childCount > 0
}

const chevronDown = <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
const chevronRight = <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
const houseIcon = <svg className="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
const buildingIcon = <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
const pinIcon = (className: string) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>

export default function LocationsView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const deepLinkedLocationId = Number(searchParams.get('locationId'))
  const { reload: reloadSession } = useSession()
  const [catalog, setCatalog] = useState<ApiLocationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(() => (Number.isInteger(deepLinkedLocationId) && deepLinkedLocationId > 0 ? deepLinkedLocationId : null))
  const [detail, setDetail] = useState<ApiLocationDetail | null>(null)
  const [openBranches, setOpenBranches] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<ApiUserRef[]>([])
  // LOC-02: opciones de la ficha del activo y de su formulario de edición.
  const [types, setTypes] = useState<ApiAssetType[]>([])
  const [statuses, setStatuses] = useState<ApiStatus[]>([])
  const [optionsError, setOptionsError] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detailVersion, setDetailVersion] = useState(0)
  const latestDetailRequest = useRef(0)
  const latestCatalogRequest = useRef(0)
  const selectedIdRef = useRef<number | null>(selectedId)

  useEffect(() => {
    if (Number.isInteger(deepLinkedLocationId) && deepLinkedLocationId > 0) {
      setSelectedId(deepLinkedLocationId)
    }
  }, [deepLinkedLocationId])

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const loadCatalog = useCallback(async () => {
    const requestId = latestCatalogRequest.current + 1
    const retainedSelectedId = selectedIdRef.current
    latestCatalogRequest.current = requestId
    setLoading(true)
    setError(null)
    try {
      const [nextCatalog, nextUsers] = await Promise.all([fetchLocationBootstrap(), fetchUsers()])
      if (requestId !== latestCatalogRequest.current) return
      // A refresh may happen while a nested location is selected (for example
      // after editing an asset in its ficha). Keep only that selected node as
      // an extra DTO; never rebuild its entire ancestor branch.
      const selected = retainedSelectedId && !nextCatalog.locations.some((location) => location.id === retainedSelectedId)
        ? await fetchLocation(retainedSelectedId).catch(() => null)
        : null
      if (requestId !== latestCatalogRequest.current) return
      setCatalog(selected ? { ...nextCatalog, locations: [...nextCatalog.locations, selected] } : nextCatalog)
      setUsers(nextUsers)
      // Bootstrap only chooses the first contextual leaf on initial entry. A
      // refresh after editing must retain the user's selected parent/leaf.
      if (retainedSelectedId === null && nextCatalog.selectedId !== null) setSelectedId(nextCatalog.selectedId)
      setOpenBranches((current) => current.size === 0 ? new Set(nextCatalog.openBranchIds) : current)
    } catch {
      if (requestId !== latestCatalogRequest.current) return
      setError('No se pudieron cargar las ubicaciones. Inténtalo de nuevo.')
      setCatalog(null)
    } finally {
      if (requestId === latestCatalogRequest.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  // LOC-02: tipos y estados para la ficha y el formulario de edición del activo.
  useEffect(() => {
    let active = true
    Promise.all([fetchAssetTypes(), fetchStatuses()])
      .then(([nextTypes, nextStatuses]) => {
        if (!active) return
        setTypes(nextTypes)
        setStatuses(nextStatuses)
      })
      .catch(() => {
        if (active) setOptionsError(true)
      })
    return () => {
      active = false
    }
  }, [])

  const tree = useMemo(() => (catalog ? buildTree(catalog.locations) : []), [catalog])

  // La primera rama se solicita bajo demanda; no hay búsqueda de una hoja
  // recorriendo ubicaciones que el usuario todavía no ha abierto.
  useEffect(() => {
    if (!catalog || selectedId !== null) return
    const first = tree.find((node) => node.location.assetCount > 0) ?? tree[0]
    if (first) setSelectedId(first.location.id)
  }, [catalog, tree, selectedId])

  // Mantener abierta la rama de la ubicación seleccionada.
  useEffect(() => {
    if (!catalog || selectedId === null) return
    setOpenBranches((current) => {
      const next = new Set(current)
      let cursor = catalog.locations.find((location) => location.id === selectedId)
      while (cursor && cursor.parentId !== null) {
        next.add(cursor.parentId)
        cursor = catalog.locations.find((location) => location.id === cursor?.parentId)
      }
      return next
    })
  }, [catalog, selectedId])

  const [assetsPage, setAssetsPage] = useState(1)
  const [locationAssets, setLocationAssets] = useState<ApiLocationAsset[]>([])
  const [locationAssetsTotal, setLocationAssetsTotal] = useState(0)
  const [locationAssetsTotalPages, setLocationAssetsTotalPages] = useState(1)
  const [loadingAssets, setLoadingAssets] = useState(false)

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null)
      return
    }
    const requestId = latestDetailRequest.current + 1
    latestDetailRequest.current = requestId
    fetchLocation(selectedId)
      .then((next) => {
        if (requestId === latestDetailRequest.current) setDetail(next)
      })
      .catch(() => {
        if (requestId === latestDetailRequest.current) setDetail(null)
      })
  }, [selectedId, detailVersion])

  useEffect(() => {
    setConfirmDelete(false)
    setDeleteError(null)
    setAssetsPage(1)
  }, [selectedId])

  useEffect(() => {
    if (selectedId === null) {
      setLocationAssets([])
      setLocationAssetsTotal(0)
      setLocationAssetsTotalPages(1)
      return
    }
    setLoadingAssets(true)
    fetchLocationAssets(selectedId, { page: assetsPage, limit: 10 })
      .then((res) => {
        setLocationAssets(res.data)
        setLocationAssetsTotal(res.total)
        setLocationAssetsTotalPages(res.totalPages)
      })
      .catch(() => {
        setLocationAssets([])
        setLocationAssetsTotal(0)
        setLocationAssetsTotalPages(1)
      })
      .finally(() => {
        setLoadingAssets(false)
      })
  }, [selectedId, assetsPage, detailVersion])

  const matchesSearch = useCallback((node: TreeNode, query: string): boolean => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    if (node.location.name.toLowerCase().includes(normalized)) return true
    return node.children.some((child) => matchesSearch(child, normalized))
  }, [])

  const filteredTree = useMemo(() => {
    const filter = (nodes: TreeNode[]): TreeNode[] => nodes
      .filter((node) => matchesSearch(node, search))
      .map((node) => ({ ...node, children: filter(node.children) }))
    return filter(tree)
  }, [tree, search, matchesSearch])

  const totalAssets = useMemo(() => tree.reduce((sum, node) => sum + node.subtreeCount, 0), [tree])

  const toggleBranch = (id: number) => {
    setOpenBranches((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loadChildren = (parentId: number) => {
    if (!catalog || catalog.locations.some((location) => location.parentId === parentId)) return
    void fetchLocations({ parentId }).then((result) => {
      setCatalog((current) => current ? { ...current, locations: [...current.locations, ...result.locations.filter((next) => !current.locations.some((known) => known.id === next.id))] } : current)
    }).catch(() => setError('No se pudieron cargar las ubicaciones hijas.'))
  }

  const toUserError = (writeError: unknown) => toUserWriteError(writeError, {
    conflict: 'Ya existe una ubicación con ese código.',
    notFound: 'La ubicación ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    validation: 'Revisa los campos obligatorios e inténtalo de nuevo.',
    fallback: 'No se pudo guardar la ubicación. Inténtalo de nuevo.',
  })

  const saveLocation = async (values: LocationFormValues) => {
    if (!catalog) return
    try {
      if (formMode === 'edit') {
        if (!selectedId) throw new Error('La ubicación ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
        await updateLocation(selectedId, values)
      } else {
        await createLocation({ ...values, projectId: catalog.project.id })
      }
      await loadCatalog()
      setDetailVersion((version) => version + 1)
      setFormMode(null)
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  const removeLocation = async () => {
    if (!selectedId) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteLocation(selectedId)
      setSelectedId(null)
      setConfirmDelete(false)
      await loadCatalog()
    } catch (writeError) {
      setDeleteError(toUserWriteError(writeError, {
        conflict: 'No se puede eliminar: la ubicación tiene activos o ubicaciones hijas.',
        notFound: 'La ubicación ya no está disponible.',
        fallback: 'No se pudo eliminar la ubicación. Inténtalo de nuevo.',
      }))
    } finally {
      setDeleting(false)
    }
  }

  // LOC-02: cualquier cambio hecho en la ficha del activo (estado, edición,
  // eliminación, documentos) refresca el detalle, el árbol y el sidebar.
  const handleAssetChanged = useCallback(async () => {
    setDetailVersion((version) => version + 1)
    await loadCatalog()
    reloadSession()
  }, [loadCatalog, reloadSession])

  const ficha = useAssetFicha({ onAssetChanged: handleAssetChanged })

  // LOC-02: alta rápida de ubicación desde el formulario de activo — crea en el
  // proyecto de la vista y refresca el catálogo sin skeleton (la selección del
  // formulario ya apunta a la nueva).
  const createLocationFromAssetForm = async (locationValues: LocationFormValues): Promise<ApiLocation> => {
    try {
      const created = await createLocation({ ...locationValues, projectId: catalog?.project.id ?? 0 })
      setCatalog((current) => current ? { ...current, locations: [...current.locations, created] } : current)
      return created
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  const renderLeaf = (node: TreeNode) => {
    const { location, subtreeCount } = node
    const isSelected = location.id === selectedId
    return (
      <a
        key={location.id}
        href="#"
        onClick={(event) => {
          event.preventDefault()
          setSelectedId(location.id)
        }}
        className={`flex items-center gap-2 p-2 rounded ${isSelected ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
      >
        {pinIcon(isSelected ? 'w-4 h-4' : 'w-4 h-4 text-slate-500')}
        {location.name}
        <span className="ml-auto text-xs">{subtreeCount}</span>
      </a>
    )
  }

  const renderBranch = (node: TreeNode) => {
    const { location, children, subtreeCount } = node
    const isOpen = search.trim() !== '' || openBranches.has(location.id)
    return (
      <details key={location.id} open={isOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            toggleBranch(location.id)
            loadChildren(location.id)
            setSelectedId(location.id)
          }}
          className={`flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800${location.id === selectedId ? ' bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300' : ''}`}
        >
          {isOpen ? chevronDown : chevronRight}
          {buildingIcon}
          {location.name}
          <span className="ml-auto text-xs text-slate-400">{subtreeCount}</span>
        </summary>
        <div className="ml-4 space-y-0.5 mt-1">
          {children.map((child) => (isBranch(child) ? renderBranch(child) : renderLeaf(child)))}
        </div>
      </details>
    )
  }

  const selectedLocation = catalog?.locations.find((location) => location.id === selectedId) ?? null
  const breadcrumb = detail && detail.ancestors.length > 0 && catalog
    ? [catalog.project.name, ...detail.ancestors.map((ancestor) => ancestor.name)].join(' → ')
    : detail && catalog
      ? catalog.project.name
      : ''
  const displayedAssets = locationAssets.map(mapApiLocationAssetToDisplay)
  const hasLocations = (catalog?.locations.length ?? 0) > 0

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ubicaciones</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Estructura jerárquica de centros, edificios, plantas y áreas</p>
        </div>
        <button type="button" onClick={() => setFormMode('create')} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nueva ubicación
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="relative mb-3">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ubicación…" className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
          </div>
          {loading && <div className="space-y-2 animate-pulse">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-8 rounded bg-slate-100 dark:bg-slate-800" />)}</div>}
          {error && (
            <div role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
              <button type="button" onClick={() => void loadCatalog()} className="ml-2 text-brand-600 hover:text-brand-700">Reintentar</button>
            </div>
          )}
          {!loading && !error && catalog && !hasLocations && (
            <div className="text-sm text-slate-500 dark:text-slate-400 p-2">
              No hay ubicaciones todavía. Crea la primera con «Nueva ubicación».
            </div>
          )}
          {!loading && !error && catalog && hasLocations && (
            <div className="space-y-0.5 text-sm">
              <details open>
                <summary className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-medium">
                  {chevronDown}
                  {houseIcon}
                  {catalog.project.name}
                  <span className="ml-auto text-xs text-slate-400">{totalAssets}</span>
                </summary>
                <div className="ml-4 space-y-0.5 mt-1">
                  {filteredTree.map((node) => (isBranch(node) ? renderBranch(node) : renderLeaf(node)))}
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          {!detail && !selectedLocation && (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Selecciona una ubicación del árbol para consultar su detalle, o crea una nueva.
            </div>
          )}
          {!detail && selectedLocation && (
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-48 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
            </div>
          )}
          {detail && selectedLocation && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold">{detail.name}</h2>
                  <div className="text-xs text-slate-500 mt-0.5">{breadcrumb}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setFormMode('edit')} className="px-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800">Editar</button>
                  <button
                    type="button"
                    onClick={() => { if (detail.hasFloorPlan) navigate(`/plans?locationId=${detail.id}`) }}
                    disabled={!detail.hasFloorPlan}
                    title={detail.hasFloorPlan ? 'Abrir plano de la ubicación' : 'Disponible cuando PLAN-01 persista los planos'}
                    className={`px-3 py-1.5 rounded-md text-xs ${detail.hasFloorPlan ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'}`}
                  >Ver plano</button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-xs text-slate-500">Responsable</div>
                  <div className="text-sm font-medium mt-0.5">{detail.responsible.name}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-xs text-slate-500">Activos</div>
                  <div className="text-sm font-medium mt-0.5">{detail.assetCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-xs text-slate-500">Superficie</div>
                  <div className="text-sm font-medium mt-0.5">{detail.surface}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-xs text-slate-500">Código</div>
                  <div className="text-sm font-medium mt-0.5 font-mono">{detail.code}</div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm flex items-center gap-1.5">
                  Activos en esta ubicación
                  {locationAssetsTotal > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">({locationAssetsTotal})</span>
                  )}
                </h3>
                <button type="button" onClick={() => { setConfirmDelete(true); setDeleteError(null) }} className="text-xs text-red-600 hover:text-red-700">Eliminar ubicación</button>
              </div>
              <div className="space-y-2">
                {loadingAssets && (
                  <div className="space-y-2 animate-pulse">
                    {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800" />)}
                  </div>
                )}
                {!loadingAssets && displayedAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => ficha.open(asset.id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${asset.initialsBgClass} flex items-center justify-center text-xs font-semibold`}>{asset.initials}</div>
                      <div>
                        <div className="text-sm font-medium">{asset.code} · {asset.name}</div>
                        <div className="text-xs text-slate-500">Instalado: {asset.installedDate}</div>
                      </div>
                    </div>
                    <span className={`chip ${asset.statusChipClass}`}>{asset.statusLabel}</span>
                  </button>
                ))}
                {!loadingAssets && displayedAssets.length === 0 && (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Sin activos en esta ubicación.</div>
                )}
              </div>
              {locationAssetsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-500">
                  <span>Página {assetsPage} de {locationAssetsTotalPages}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={assetsPage <= 1}
                      onClick={() => setAssetsPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={assetsPage >= locationAssetsTotalPages}
                      onClick={() => setAssetsPage((p) => Math.min(locationAssetsTotalPages, p + 1))}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {formMode && catalog && (
        <LocationFormModal
          mode={formMode}
          location={formMode === 'edit' ? selectedLocation : null}
          locations={catalog.locations}
          users={users}
          projectId={catalog.project.id}
          optionsError={users.length === 0}
          onClose={() => setFormMode(null)}
          onSubmit={saveLocation}
        />
      )}

      {/* LOC-02: ficha del activo desde el detalle de la ubicación, con las
          mismas acciones que en Activos (estado, editar, eliminar, documentos). */}
      <AssetModal
        asset={ficha.asset}
        statuses={statuses}
        onClose={ficha.close}
        onEdit={ficha.onEdit}
        onChangeStatus={ficha.changeStatus}
        onDelete={ficha.remove}
        onDocumentsChanged={ficha.documentsChanged}
        onImageChanged={ficha.replaceAsset}
      />
      {ficha.formMode && ficha.asset && catalog && (
        <AssetFormModal
          mode="edit"
          asset={ficha.asset}
          types={types}
          statuses={statuses}
          locations={catalog.locations}
          projectName={catalog.project.name}
          responsibleName={ficha.asset.responsible?.name ?? ''}
          projectId={catalog.project.id}
          responsibleId={ficha.asset.responsibleId}
          users={users}
          onCreateLocation={createLocationFromAssetForm}
          optionsError={optionsError}
          onClose={ficha.closeForm}
          onSubmit={ficha.save}
        />
      )}
      <ConfirmDialog
        open={confirmDelete && detail !== null}
        title="Eliminar ubicación"
        message={<>La ubicación <span className="font-medium text-slate-900 dark:text-slate-100">{detail?.name}</span> se eliminará de forma permanente. La operación se bloqueará si contiene activos o ubicaciones hijas. ¿Continuar?</>}
        confirmLabel="Eliminar ubicación"
        busyLabel="Eliminando…"
        busy={deleting}
        error={deleteError}
        onConfirm={() => void removeLocation()}
        onCancel={() => { setConfirmDelete(false); setDeleteError(null) }}
        variant="danger"
      />
    </section>
  )
}
