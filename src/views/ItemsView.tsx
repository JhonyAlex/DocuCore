import { useCallback, useEffect, useState } from 'react'
import type { Item, ItemFilters, Pagination } from '@/types'
import ItemsFilters from '@/components/ItemsFilters'
import ItemsTable from '@/components/ItemsTable'
import ItemModal from '@/components/ItemModal'
import { fetchItems, type ItemListParams } from '@/lib/api'
import { mapApiItemToDisplay } from '@/lib/itemMappers'

const LIMIT = 10

export default function ItemsView() {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<ItemFilters>({
    search: '',
    typeId: null,
    statusId: null,
    location: null,
  })

  const loadItems = useCallback(async () => {
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
      setItems(res.data.map(mapApiItemToDisplay))
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar ítems')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const handleFilterChange = (next: ItemFilters) => {
    setFilters(next)
    setPage(1)
  }

  const pagination: Pagination = { page, totalPages, total, limit: LIMIT }

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
          <button className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo ítem
          </button>
        </div>
      </div>

      <ItemsFilters filters={filters} onFilterChange={handleFilterChange} />
      <ItemsTable
        items={items}
        loading={loading}
        error={error}
        pagination={pagination}
        onRowClick={setSelectedItem}
        onPageChange={setPage}
      />
      <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </section>
  )
}
