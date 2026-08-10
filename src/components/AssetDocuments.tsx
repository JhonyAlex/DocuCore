import { downloadDocument, type ApiAsset } from '@/lib/api'
import { formatApiDate, formatDocumentSize } from '@/lib/assetMappers'

interface AssetDocumentsProps {
  asset: ApiAsset
  limit?: number
  openingId: number | null
  onOpen: (documentId: number) => void
}

// Lista compartida entre Resumen y Documentos de la ficha. La fila abre la
// gestión sin navegar; Descargar conserva su acción independiente.
export default function AssetDocuments({ asset, limit, openingId, onOpen }: AssetDocumentsProps) {
  const allDocuments = asset.documents ?? []
  const documents = limit ? allDocuments.slice(0, limit) : allDocuments
  if (documents.length === 0) return <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">No hay documentos asociados a este activo.</div>

  return <div className="space-y-2">{documents.map((document) => {
    const version = document.currentVersion
    const format = version?.originalName.split('.').pop()?.toUpperCase() ?? 'DOC'
    return (
      <div key={document.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
        <button type="button" aria-label={`Gestionar ${document.name}`} onClick={() => onOpen(document.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-brand-500">
          <span className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">{format}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" title={document.name}>{document.name}{version && ` v${version.version}`}</span>
            <span className="block truncate text-xs text-slate-500">{openingId === document.id ? 'Abriendo documento…' : version ? `${formatDocumentSize(version.sizeBytes)} · Subido ${formatApiDate(version.uploadedAt)}` : 'Sin versión'}</span>
          </span>
        </button>
        {version && <button type="button" onClick={(event) => { event.stopPropagation(); void downloadDocument(document.id) }} className="shrink-0 text-xs text-brand-600">Descargar</button>}
      </div>
    )
  })}</div>
}
