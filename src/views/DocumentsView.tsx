import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DocumentModal from '@/components/DocumentModal'
import DocumentsTable from '@/components/DocumentsTable'
import DocumentsFilters, { type DocumentFilters } from '@/components/DocumentsFilters'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useSelection } from '@/hooks/useSelection'
import { deleteDocument, downloadDocument, fetchDocument, fetchDocumentKpis, fetchDocuments, type ApiDocument } from '@/lib/api'
import { toUserWriteError } from '@/lib/apiErrors'
import { useSession } from '@/contexts/SessionContext'

const LIMIT = 5

export default function DocumentsView() {
  const [searchParams] = useSearchParams()
  const { session } = useSession()
  const selection = useSelection<number>()
  const [documents, setDocuments] = useState<ApiDocument[]>([])
  const [kpis, setKpis] = useState({ vigente: 0, porVencer: 0, vencido: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ApiDocument | null | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<{ ids: number[]; label: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filters, setFilters] = useState<DocumentFilters>({})
  const [deferredFilters, setDeferredFilters] = useState<DocumentFilters>({})
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const openedDocIdRef = useRef<number | null>(null)
  const deepLinkedDocId = Number(searchParams.get('documentId'))

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredFilters(filters), 250)
    return () => window.clearTimeout(timer)
  }, [filters])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [list, nextKpis] = await Promise.all([fetchDocuments({ ...deferredFilters, page, limit: LIMIT, projectId: session?.project.id }), fetchDocumentKpis(session?.project.id)])
      setDocuments(list.data)
      setTotal(list.total)
      setTotalPages(list.totalPages)
      setKpis(nextKpis)
    } catch {
      setError('No se pudieron cargar los documentos. Inténtalo de nuevo.')
      setDocuments([])
    }
  }, [deferredFilters, page, session?.project.id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const urlSearch = searchParams.get('search')
    if (urlSearch !== null) {
      setFilters((prev) => ({ ...prev, search: urlSearch }))
    }
  }, [searchParams])

  useEffect(() => {
    if (!Number.isInteger(deepLinkedDocId) || deepLinkedDocId <= 0 || openedDocIdRef.current === deepLinkedDocId) return
    openedDocIdRef.current = deepLinkedDocId
    void fetchDocument(deepLinkedDocId).then((doc) => setEditing(doc)).catch(() => { openedDocIdRef.current = null })
  }, [deepLinkedDocId])

  const toUserError = (writeError: unknown) => toUserWriteError(writeError, {
    notFound: 'El documento ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    fallback: 'No se pudo eliminar el documento. Inténtalo de nuevo.',
  })

  const requestBulkDelete = () => {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    setDeleteError(null)
    setDeleteTarget({ ids, label: `${ids.length} ${ids.length === 1 ? 'documento' : 'documentos'}` })
  }

  const confirmBulkDelete = async () => {
    if (!deleteTarget) return
    setDeleteError(null)
    setDeleting(true)
    try {
      await Promise.all(deleteTarget.ids.map((id) => deleteDocument(id)))
      selection.clear()
      setDeleteTarget(null)
      await load()
    } catch (writeError) {
      setDeleteError(toUserError(writeError))
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkDownload = async () => {
    for (const id of selection.selectedIds) {
      await downloadDocument(id)
    }
  }

  const cards = [
    { value: kpis.vigente, label: 'Documentos vigentes', sublabel: 'Sin incidencias', className: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' },
    { value: kpis.porVencer, label: 'Por vencer', sublabel: 'Próximos 30 días', className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600' },
    { value: kpis.vencido, label: 'Vencidos', sublabel: 'Acción requerida', className: 'bg-red-50 dark:bg-red-900/30 text-red-600' },
    { value: kpis.total, label: 'Total', sublabel: 'Documentos almacenados', className: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' },
  ]

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-6"><div><h1 className="text-2xl font-semibold tracking-tight">Documentos</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Fichas técnicas, certificados, manuales y contratos</p></div><div className="flex items-center gap-2"><DocumentsFilters filters={filters} onChange={(next) => { setFilters(next); setPage(1); selection.clear() }} page={page} total={total} totalPages={totalPages} onPageChange={(next) => { setPage(next); selection.clear() }} /><button type="button" onClick={() => { selection.clear(); setEditing(null) }} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center gap-1.5"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>Subir documento</button></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">{cards.map((card) => <div key={card.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3"><div className={`w-10 h-10 rounded-lg ${card.className} flex items-center justify-center text-lg font-semibold`}>{card.value}</div><div><div className="text-sm font-medium">{card.label}</div><div className="text-xs text-slate-500">{card.sublabel}</div></div></div>)}</div>
      <BulkActionBar selectedCount={selection.selectedCount} onClear={selection.clear}>
        <button type="button" onClick={() => void handleBulkDownload()} className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">Descargar</button>
        <button type="button" onClick={requestBulkDelete} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Eliminar</button>
      </BulkActionBar>
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      <DocumentsTable
        documents={documents}
        selection={selection}
        onRowClick={(document) => setEditing(document)}
        onDownload={(document) => void downloadDocument(document.id)}
        onDelete={(document) => { setDeleteError(null); setDeleteTarget({ ids: [document.id], label: document.name }) }}
      />
      {editing !== undefined && <DocumentModal document={editing} onClose={() => setEditing(undefined)} onChanged={load} />}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar documento"
        message={deleteTarget && deleteTarget.ids.length > 1
          ? <>Los <span className="font-medium text-slate-900 dark:text-slate-100">{deleteTarget.label}</span> seleccionados se eliminarán de forma permanente junto con todos sus archivos. ¿Continuar?</>
          : <>El documento <span className="font-medium text-slate-900 dark:text-slate-100">{deleteTarget?.label}</span> se eliminará de forma permanente junto con todos sus archivos. ¿Continuar?</>
        }
        confirmLabel="Eliminar"
        busyLabel="Eliminando…"
        busy={deleting}
        onConfirm={() => void confirmBulkDelete()}
        onCancel={() => setDeleteTarget(null)}
        error={deleteError}
        variant="danger"
      />
    </section>
  )
}
