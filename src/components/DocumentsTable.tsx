import RowActionsMenu, { type RowActionsMenuItem } from '@/components/RowActionsMenu'
import { formatApiDate, formatDocumentSize } from '@/lib/assetMappers'
import type { ApiDocument } from '@/lib/api'

const statusClasses: Record<ApiDocument['status'], string> = {
  Vigente: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Por vencer': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Vencido: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const typeClasses: Record<string, string> = {
  Certificado: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Calibración: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  Manual: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  Acta: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Contrato: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
}

const documentIconClasses: Record<string, string> = {
  Certificado: 'bg-red-100 dark:bg-red-900/40 text-red-600',
  Calibración: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  Manual: 'bg-slate-200 dark:bg-slate-700 text-slate-600',
  Acta: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
  Contrato: 'bg-slate-200 dark:bg-slate-700 text-slate-600',
}

interface DocumentsTableProps {
  documents: ApiDocument[]
  loading: boolean
  error: string | null
  selectedIds: Set<number>
  onToggleSelect: (id: number) => void
  onToggleSelectPage: (ids: number[]) => void
  onRowClick: (document: ApiDocument) => void
  onDownload: (document: ApiDocument) => void
  onDelete: (document: ApiDocument) => void
  onRetry: () => void
}

export default function DocumentsTable({ documents, loading, error, selectedIds, onToggleSelect, onToggleSelectPage, onRowClick, onDownload, onDelete, onRetry }: DocumentsTableProps) {
  const docIds = documents.map((d) => d.id)
  const allSelected = docIds.length > 0 && docIds.every((id) => selectedIds.has(id))
  const someSelected = docIds.some((id) => selectedIds.has(id)) && !allSelected

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">
                <input type="checkbox" className="rounded" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected }} onChange={() => onToggleSelectPage(docIds)} aria-label="Seleccionar todos los documentos de la página" />
              </th>
              <th className="text-left px-4 py-3">Documento</th>
              <th className="text-left px-4 py-3">Activos asociados</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Versión</th>
              <th className="text-left px-4 py-3">Emisión</th>
              <th className="text-left px-4 py-3">Vencimiento</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Cargando documentos…</td></tr>}
            {!loading && error && <tr><td colSpan={9} className="px-4 py-8 text-center"><p role="alert" className="text-red-600">{error}</p><button type="button" onClick={onRetry} className="mt-2 text-sm text-brand-600">Reintentar</button></td></tr>}
            {!loading && !error && documents.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No hay documentos todavía.</td></tr>}
            {!loading && !error && documents.map((document) => {
              const version = document.currentVersion
              const format = version?.originalName.split('.').pop()?.toUpperCase() ?? 'DOC'
              const items: RowActionsMenuItem[] = [
                { label: 'Descargar', onSelect: () => onDownload(document) },
                { label: 'Eliminar', onSelect: () => onDelete(document), variant: 'danger' },
              ]
              return (
                <tr key={document.id} onClick={() => onRowClick(document)} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer">
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="rounded" checked={selectedIds.has(document.id)} onChange={() => onToggleSelect(document.id)} aria-label={`Seleccionar ${document.name}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg ${documentIconClasses[document.type] ?? documentIconClasses.Manual} flex items-center justify-center text-xs font-bold`}>{format}</div>
                      <div>
                        <button type="button" onClick={(event) => { event.stopPropagation(); onRowClick(document) }} className="font-medium text-left hover:text-brand-600">{document.name}</button>
                        <div className="text-xs text-slate-500">{version ? `${formatDocumentSize(version.sizeBytes)} · Subido ${formatApiDate(version.uploadedAt)}` : 'Sin versiones'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{document.assets.length > 0 ? document.assets.map((asset) => `${asset.code} · ${asset.name}`).join(', ') : '—'}</td>
                  <td className="px-4 py-3"><span className={`chip ${typeClasses[document.type] ?? typeClasses.Manual}`}>{document.type}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{version ? `v${version.version}` : '—'}</td>
                  <td className="px-4 py-3 text-xs">{version ? formatApiDate(version.issueDate) : '—'}</td>
                  <td className="px-4 py-3 text-xs">{version?.expiryDate ? formatApiDate(version.expiryDate) : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3"><span className={`chip ${statusClasses[document.status]}`}>{document.status}</span></td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu items={items} ariaLabel={`Acciones de ${document.name}`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
