import { useCallback, useEffect, useRef, useState } from 'react'
import type { Item, ItemFilters, Pagination } from '@/types'
import ItemsFilters from '@/components/ItemsFilters'
import ItemsTable from '@/components/ItemsTable'
import ItemModal from '@/components/ItemModal'
import ItemFormModal from '@/components/ItemFormModal'
import type { ItemFormValues } from '@/components/ItemFormModal'
import { changeItemStatus, createItem, fetchItemTypes, fetchItems, fetchLocations, fetchStatuses, updateItem, type ApiItem, type ApiItemType, type ApiStatus, type ItemListParams } from '@/lib/api'
import { mapApiItemToDisplay } from '@/lib/itemMappers'
import { currentProject, currentUser } from '@/data/mock'
import { useItemCreateRequest } from '@/contexts/ItemCreateContext'

const LIMIT = 6

export default function ItemsView() {
  const { createRequested, clearCreateRequest } = useItemCreateRequest()
  const [selectedItem, setSelectedItem] = useState<ApiItem | null>(null)
  const [items, setItems] = useState<ApiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [types, setTypes] = useState<ApiItemType[]>([])
  const [statuses, setStatuses] = useState<ApiStatus[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [optionsError, setOptionsError] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<ItemFilters>({
    search: '',
    typeId: null,
    statusId: null,
    location: null,
  })
  const latestLoadRequest = useRef(0)

  const loadItems = useCallback(async () => {
    const requestId = latestLoadRequest.current + 1
    latestLoadRequest.current = requestId
    setLoading(true)
    setError(null)
    try {
      const params: ItemListParams = {
        page,
        limit: LIMIT,
        search: filters.search || undefined,
        typeId: filters.typeId ?? undefined,
        statusId: filters.statusId ?? undefined,
        location: filters.location ?? undefined,
      }
      const res = await fetchItems(params)
      if (requestId !== latestLoadRequest.current) return
      setItems(res.data)
      setSelectedItem((current) => current ? res.data.find((item) => item.id === current.id) ?? current : null)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch {
      if (requestId !== latestLoadRequest.current) return
      setError('No se pudieron cargar los ítems. Inténtalo de nuevo.')
      setItems([])
    } finally {
      if (requestId === latestLoadRequest.current) setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    let active = true
    Promise.all([fetchItemTypes(), fetchStatuses(), fetchLocations()])
      .then(([nextTypes, nextStatuses, nextLocations]) => {
        if (!active) return
        setTypes(nextTypes)
        setStatuses(nextStatuses)
        setLocations(nextLocations)
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
    setSelectedItem(null)
    setFormMode('create')
    clearCreateRequest()
  }, [clearCreateRequest, createRequested])

  const handleFilterChange = (next: ItemFilters) => {
    setFilters(next)
    setPage(1)
  }

  const toUserError = (writeError: unknown) => {
    const message = writeError instanceof Error ? writeError.message : ''
    if (message.includes('409')) return 'Ya existe un ítem con ese código.'
    if (message.includes('404')) return 'El ítem ya no está disponible. Actualiza la lista e inténtalo de nuevo.'
    if (message.includes('400') || message.includes('422')) return 'Revisa los campos obligatorios e inténtalo de nuevo.'
    return 'No se pudo guardar el ítem. Inténtalo de nuevo.'
  }

  const saveItem = async (values: ItemFormValues) => {
    try {
      if (formMode === 'edit') {
        if (!selectedItem) throw new Error('El ítem ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
        const updated = await updateItem(selectedItem.id, values)
        setSelectedItem(updated)
      } else {
        await createItem(values)
      }
      await loadItems()
      setFormMode(null)
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  const handleStatusChange = async (statusId: number) => {
    if (!selectedItem) throw new Error('El ítem ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
    try {
      const updated = await changeItemStatus(selectedItem.id, statusId)
      setSelectedItem(updated)
      await loadItems()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }

  const pagination: Pagination = { page, totalPages, total, limit: LIMIT }
  const displayedItems: Item[] = items.map(mapApiItemToDisplay)
  const projectId = Number(currentProject.id)
  const formItem = formMode === 'edit' ? selectedItem : null
  const responsibleId = formItem?.responsibleId ?? currentUser.id
  const responsibleName = formItem?.responsible?.name ?? currentUser.name

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activos e ítems</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Inventario completo del proyecto activo</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Exportar CSV
          </button>
          <button type="button" onClick={() => setFormMode('create')} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" /></svg>
            Nuevo ítem
          </button>
        </div>
      </div>

      <ItemsFilters filters={filters} types={types} statuses={statuses} locations={locations} onFilterChange={handleFilterChange} />
      <ItemsTable
        items={displayedItems}
        loading={loading}
        error={error}
        pagination={pagination}
        onRowClick={(item) => setSelectedItem(items.find((apiItem) => apiItem.id === item.id) ?? null)}
        onPageChange={setPage}
        onRetry={() => void loadItems()}
      />
      <ItemModal item={selectedItem} statuses={statuses} onClose={() => setSelectedItem(null)} onEdit={() => setFormMode('edit')} onChangeStatus={handleStatusChange} onDocumentsChanged={loadItems} />
      {formMode && <ItemFormModal mode={formMode} item={formItem} types={types} statuses={statuses} locations={locations} projectName={currentProject.name} responsibleName={responsibleName} projectId={formItem?.projectId ?? projectId} responsibleId={responsibleId} optionsError={optionsError} onClose={() => setFormMode(null)} onSubmit={saveItem} />}
    </section>
  )
}
