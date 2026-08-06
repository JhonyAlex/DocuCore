import { useCallback, useEffect, useState } from 'react'
import DocumentModal from '@/components/DocumentModal'
import { downloadDocument, fetchDocumentKpis, fetchDocuments, type ApiDocument } from '@/lib/api'
import { formatApiDate } from '@/lib/itemMappers'

const statusClasses = {
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 0 : 1)} MB`
}

export default function DocumentsView() {
  const [documents, setDocuments] = useState<ApiDocument[]>([])
  const [kpis, setKpis] = useState({ vigente: 0, porVencer: 0, vencido: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ApiDocument | null | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, nextKpis] = await Promise.all([fetchDocuments({ limit: 5 }), fetchDocumentKpis()])
      setDocuments(list.data)
      setKpis(nextKpis)
    } catch {
      setError('No se pudieron cargar los documentos. Inténtalo de nuevo.')
      setDocuments([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  const cards = [
    { value: kpis.vigente, label: 'Documentos vigentes', sublabel: 'Sin incidencias', className: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' },
    { value: kpis.porVencer, label: 'Por vencer', sublabel: 'Próximos 30 días', className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600' },
    { value: kpis.vencido, label: 'Vencidos', sublabel: 'Acción requerida', className: 'bg-red-50 dark:bg-red-900/30 text-red-600' },
    { value: kpis.total, label: 'Total', sublabel: 'Documentos almacenados', className: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' },
  ]

  return <section className="fade-in">
    <div className="flex items-end justify-between mb-6"><div><h1 className="text-2xl font-semibold tracking-tight">Documentos</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Fichas técnicas, certificados, manuales y contratos</p></div><button type="button" onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>Subir documento</button></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">{cards.map((card) => <div key={card.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3"><div className={`w-10 h-10 rounded-lg ${card.className} flex items-center justify-center text-lg font-semibold`}>{card.value}</div><div><div className="text-sm font-medium">{card.label}</div><div className="text-xs text-slate-500">{card.sublabel}</div></div></div>)}</div>
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase"><tr><th className="text-left px-4 py-3">Documento</th><th className="text-left px-4 py-3">Ítem asociado</th><th className="text-left px-4 py-3">Tipo</th><th className="text-left px-4 py-3">Versión</th><th className="text-left px-4 py-3">Emisión</th><th className="text-left px-4 py-3">Vencimiento</th><th className="text-left px-4 py-3">Estado</th><th className="text-right px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
      {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Cargando documentos…</td></tr>}
      {!loading && error && <tr><td colSpan={8} className="px-4 py-8 text-center"><p role="alert" className="text-red-600">{error}</p><button type="button" onClick={() => void load()} className="mt-2 text-sm text-brand-600">Reintentar</button></td></tr>}
      {!loading && !error && documents.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No hay documentos todavía.</td></tr>}
      {!loading && !error && documents.map((document) => { const version = document.currentVersion; const format = version?.originalName.split('.').pop()?.toUpperCase() ?? 'DOC'; return <tr key={document.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className={`w-9 h-9 rounded-lg ${documentIconClasses[document.type] ?? documentIconClasses.Manual} flex items-center justify-center text-xs font-bold`}>{format}</div><div><button type="button" onClick={() => setEditing(document)} className="font-medium text-left hover:text-brand-600">{document.name}</button><div className="text-xs text-slate-500">{version ? `${formatSize(version.sizeBytes)} · Subido ${formatApiDate(version.uploadedAt)}` : 'Sin versiones'}</div></div></div></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{document.item ? `${document.item.code} · ${document.item.name}` : '—'}</td><td className="px-4 py-3"><span className={`chip ${typeClasses[document.type] ?? typeClasses.Manual}`}>{document.type}</span></td><td className="px-4 py-3 font-mono text-xs">{version ? `v${version.version}` : '—'}</td><td className="px-4 py-3 text-xs">{version ? formatApiDate(version.issueDate) : '—'}</td><td className="px-4 py-3 text-xs">{version?.expiryDate ? formatApiDate(version.expiryDate) : <span className="text-slate-400">—</span>}</td><td className="px-4 py-3"><span className={`chip ${statusClasses[document.status]}`}>{document.status}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void downloadDocument(document.id)} className="px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-xs">Descargar</button></td></tr> })}
    </tbody></table></div></div>
    {editing !== undefined && <DocumentModal document={editing} onClose={() => setEditing(undefined)} onChanged={load} />}
  </section>
}
