import RowActionsMenu, { type RowActionsMenuItem } from '@/components/RowActionsMenu'
import { formatApiDate, formatDocumentSize } from '@/lib/assetMappers'
import type { ApiDocument } from '@/lib/api'

const statusClasses: Record<'Vigente' | 'Por vencer' | 'Vencido', string> = {
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
  Manual: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
  Acta: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
  Contrato: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600',
}

interface DocumentsTableProps {
  documents: ApiDocument[]
  selection: {
    selectedIds: number[]
    isSelected: (id: number) => boolean
    toggle: (id: number) => void
    toggleAll: (ids: number[]) => void
    allSelected: (ids: number[]) => boolean
    someSelected: (ids: number[]) => boolean
  }
  onRowClick: (document: ApiDocument) => void
  onDownload: (document: ApiDocument) => void
  onDelete: (document: ApiDocument) => void
}

export default function DocumentsTable({ documents, selection, onRowClick, onDownload, onDelete }: DocumentsTableProps) {
  const ids = documents.map((d) => d.id)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los documentos"
                  checked={selection.allSelected(ids)}
                  ref={(node) => {
                    if (node) node.indeterminate = selection.someSelected(ids)
                  }}
                  onChange={() => selection.toggleAll(ids)}
                />
              </th>
              <th className="px-4 py-3 text-left">Documento</th>
              <th className="px-4 py-3 text-left">Activos asociados</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Versión</th>
              <th className="px-4 py-3 text-left">Emisión</th>
              <th className="px-4 py-3 text-left">Vencimiento</th>
              <th className="px-4 py-3 text-left">Periodicidad</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="w-14 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {documents.map((document) => {
              const version = document.currentVersion
              const format = version?.originalName.split('.').pop()?.toUpperCase() ?? 'PDF'
              const items: RowActionsMenuItem[] = [
                { label: 'Gestionar documento', onSelect: () => onRowClick(document) },
                { label: 'Descargar', onSelect: () => onDownload(document) },
                { label: 'Eliminar', variant: 'danger', onSelect: () => onDelete(document) },
              ]

              const assetList = document.assets && document.assets.length > 0 ? `${document.assets.map((asset) => `${asset.code} · ${asset.name}`).join(', ')}${(document.assetCount ?? document.assets.length) > document.assets.length ? ` +${(document.assetCount ?? 0) - document.assets.length}` : ''}` : '—'

              return (
                <tr key={document.id} onClick={() => onRowClick(document)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${document.name}`}
                      checked={selection.isSelected(document.id)}
                      onChange={() => selection.toggle(document.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg ${documentIconClasses[document.type] ?? documentIconClasses.Manual} flex items-center justify-center text-xs font-bold`}>{format}</div>
                      <div className="min-w-0">
                        <button type="button" onClick={(event) => { event.stopPropagation(); onRowClick(document) }} title={document.name} className="block max-w-72 truncate font-medium text-left hover:text-brand-600">{document.name}</button>
                        <div className="truncate text-xs text-slate-500">{version ? `${formatDocumentSize(version.sizeBytes)} · Subido ${formatApiDate(version.uploadedAt)}` : 'Sin versiones'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-slate-600 dark:text-slate-300" title={assetList !== '—' ? assetList : undefined}>{assetList}</td>
                  <td className="px-4 py-3"><span className={`chip ${typeClasses[document.documentType?.name ?? document.type] ?? typeClasses.Manual}`}>{document.documentType?.name ?? document.type}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{version ? `v${version.version}` : '—'}</td>
                  <td className="px-4 py-3 text-xs">{version ? formatApiDate(version.issueDate) : '—'}</td>
                  <td className="px-4 py-3 text-xs">{version?.expiryDate ? formatApiDate(version.expiryDate) : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-xs">{document.periodicity ? `${document.periodicity} · ${document.periodicityMode}` : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">{document.status ? <span className={`chip ${statusClasses[document.status]}`}>{document.status}</span> : <span className="text-slate-400">—</span>}</td>
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
