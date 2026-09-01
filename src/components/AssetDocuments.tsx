import { downloadDocument, type ApiAsset } from '@/lib/api'
import { formatApiDate, formatDocumentSize } from '@/lib/assetMappers'
import { computeAssetDocumentsSummary, computeDocumentStatus, type DocumentValidityStatus } from '@/lib/documentStatus'
import DocumentStatusBadge from '@/components/document/DocumentStatusBadge'

interface AssetDocumentsProps {
  asset: ApiAsset
  limit?: number
  openingId: number | null
  onOpen: (documentId: number) => void
  showSummary?: boolean
}

export default function AssetDocuments({ asset, limit, openingId, onOpen, showSummary = false }: AssetDocumentsProps) {
  const allDocuments = asset.documents ?? []
  const documents = limit ? allDocuments.slice(0, limit) : allDocuments
  const summary = computeAssetDocumentsSummary(allDocuments)

  if (allDocuments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-5 text-center text-sm text-slate-500 dark:text-slate-400">
        No hay documentos asociados a este activo.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {showSummary && allDocuments.length > 0 && (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            Estado de documentación:
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {summary.summaryText}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {documents.map((document) => {
          const version = document.currentVersion
          const format = version?.originalName.split('.').pop()?.toUpperCase() ?? 'DOC'
          const validityStatus: DocumentValidityStatus = document.status ?? computeDocumentStatus(version?.expiryDate)

          return (
            <div
              key={document.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 bg-white dark:bg-slate-900 shadow-sm"
            >
              <button
                type="button"
                aria-label={`Gestionar ${document.name}`}
                onClick={() => onOpen(document.id)}
                className="flex min-w-0 flex-1 items-start sm:items-center gap-3 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <span className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-xs font-bold shrink-0 border border-slate-200 dark:border-slate-700">
                  {format}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100" title={document.name}>
                      {document.name}
                    </span>
                    {version && (
                      <span className="px-1.5 py-0.2 rounded text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        v{version.version}
                      </span>
                    )}
                    <DocumentStatusBadge status={validityStatus} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{document.type}</span>
                    {version?.expiryDate ? (
                      <span>· Vence {formatApiDate(version.expiryDate)}</span>
                    ) : (
                      <span>· Sin vencimiento</span>
                    )}
                    {version?.sizeBytes ? (
                      <span>· {formatDocumentSize(version.sizeBytes)}</span>
                    ) : null}
                  </div>
                </div>
              </button>

              <div className="flex shrink-0 items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  aria-label={`Gestionar o renovar ${document.name}`}
                  onClick={() => onOpen(document.id)}
                  disabled={openingId === document.id}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/50 transition-colors disabled:opacity-40"
                >
                  {openingId === document.id ? 'Abriendo…' : 'Gestionar / renovar'}
                </button>
                {version && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void downloadDocument(asset.projectId, document.id)
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title="Descargar archivo vigente"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
