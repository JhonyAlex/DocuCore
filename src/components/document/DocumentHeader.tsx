import DocumentStatusBadge from './DocumentStatusBadge'
import type { DocumentValidityStatus } from '@/lib/documentStatus'

interface DocumentHeaderProps {
  isNew: boolean
  name: string
  type: string
  versionNumber?: number
  validityStatus?: DocumentValidityStatus
  readOnly?: boolean
  saving?: boolean
  onClose: () => void
}

export default function DocumentHeader({
  isNew,
  name,
  type,
  versionNumber,
  validityStatus,
  readOnly,
  saving,
  onClose,
}: DocumentHeaderProps) {
  return (
    <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="document-dialog-title" className="font-semibold text-base md:text-lg truncate max-w-md" title={isNew ? 'Subir documento' : name || 'Gestionar documento'}>
            {isNew ? 'Subir documento' : name || 'Gestionar documento'}
          </h2>
          {!isNew && versionNumber !== undefined && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              v{versionNumber}
            </span>
          )}
          {!isNew && validityStatus && (
            <DocumentStatusBadge status={validityStatus} />
          )}
          {type && (
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              · {type}
            </span>
          )}
        </div>
        {readOnly && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Proyecto archivado: la información se conserva en modo solo lectura.
          </p>
        )}
      </div>

      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        disabled={saving}
        className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-40"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
