import type { ReactNode } from 'react'

interface BulkActionBarProps {
  selectedCount: number
  onClear: () => void
  children: ReactNode
}

/**
 * Barra de acciones masivas compartida.
 * Aparece cuando hay al menos un elemento seleccionado.
 * Los botones de acción los pasa cada vista como children (color-coded):
 * - Eliminar / Eliminar definitivamente → text-red-600
 * - Restaurar → text-emerald-600
 * - Descargar → text-brand-600
 */
export default function BulkActionBar({ selectedCount, onClear, children }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="mb-4 fade-in bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
        {selectedCount} {selectedCount === 1 ? 'seleccionado' : 'seleccionados'}
      </p>
      <div className="flex items-center gap-2">
        {children}
        <button type="button" onClick={onClear} className="px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-800 text-sm text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40">
          Limpiar
        </button>
      </div>
    </div>
  )
}
