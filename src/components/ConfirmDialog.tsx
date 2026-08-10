import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  error?: string | null
  variant?: 'danger'
}

/**
 * Diálogo de confirmación compartido para acciones irreversibles.
 * Extraído del diálogo inline de purge de AssetsView. Lo usan:
 * purge individual, bulk purge (activos) y bulk delete (documentos).
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel, error = null, variant = 'danger' }: ConfirmDialogProps) {
  if (!open) return null

  const confirmClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-brand-600 hover:bg-brand-700 text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="flex min-h-0 max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 id="confirm-dialog-title" className="font-semibold">{title}</h3>
          <button type="button" aria-label="Cerrar" onClick={onCancel} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
          {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancelar</button>
          <button type="button" onClick={onConfirm} className={`px-3 py-2 rounded-lg text-sm font-medium ${confirmClass}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
