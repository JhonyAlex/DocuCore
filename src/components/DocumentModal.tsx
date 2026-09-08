import { useEffect, useRef, useState } from 'react'
import type { SelectedValue } from '@/components/SearchableMultiPicker'
import DocumentHeader from '@/components/document/DocumentHeader'
import DocumentFormFields from '@/components/document/DocumentFormFields'
import DocumentPreviewPane from '@/components/document/DocumentPreviewPane'
import DocumentVersionsList from '@/components/document/DocumentVersionsList'
import DocumentPreviewModal from '@/components/DocumentPreviewModal'
import EntityCommentsPanel from '@/components/comments/EntityCommentsPanel'
import { useDocumentPreview } from '@/hooks/useDocumentPreview'
import { useDocumentForm } from '@/hooks/useDocumentForm'
import { downloadDocument, downloadDocumentAttachment, fetchCommentCount, type ApiDocument } from '@/lib/api'
import { computeDocumentStatus, type DocumentValidityStatus } from '@/lib/documentStatus'
import { useProject } from '@/contexts/ProjectContext'

type DocumentModalProps = {
  document: ApiDocument | null
  initialAssetIds?: SelectedValue[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}

function resolveDocumentValidityStatus(docStatus: string | undefined, expiryDate: string | null | undefined): DocumentValidityStatus {
  if (docStatus === 'Por vencer' || docStatus === 'Próximo a vencer') return 'Próximo a vencer'
  if (docStatus === 'Vigente') return 'Vigente'
  if (docStatus === 'Vencido') return 'Vencido'
  return computeDocumentStatus(expiryDate)
}

export default function DocumentModal({ document, initialAssetIds = [], onClose, onChanged }: DocumentModalProps) {
  const { projectId, readOnly, project } = useProject()
  if (projectId === null) throw new Error('DocumentModal requires a project scope')
  // COM-01: un VIEWER lee comentarios pero no escribe (el servidor lo exige).
  const canComment = project?.currentRole !== 'VIEWER'

  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLInputElement>(null)

  const isNew = !document
  const documentId = document?.id ?? 0

  // COM-01: el contador del header es una consulta ligera (`/comments/count`);
  // la lista solo se pide al abrir el panel, que se monta bajo demanda.
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsCount, setCommentsCount] = useState<number | null>(null)

  useEffect(() => {
    setCommentsOpen(false)
    if (documentId === 0) {
      setCommentsCount(null)
      return
    }
    let active = true
    setCommentsCount(null)
    fetchCommentCount(projectId, { entityType: 'document', entityId: documentId })
      .then((result) => { if (active) setCommentsCount(result.count) })
      .catch(() => { if (active) setCommentsCount(null) })
    return () => { active = false }
  }, [documentId, projectId])

  const form = useDocumentForm({
    projectId,
    document,
    initialAssetIds,
    readOnly,
    onClose,
    onChanged,
  })

  const currentDoc = form.current ?? document
  const currentVersion = currentDoc?.currentVersion
  const validityStatus = resolveDocumentValidityStatus(currentDoc?.status, currentVersion?.expiryDate)

  const preview = useDocumentPreview({
    projectId,
    document: currentDoc,
    currentVersion,
    onError: form.setError,
  })

  useEffect(() => {
    const previouslyFocused = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || form.saving || preview.previewOpenRef.current) return
      // COM-01: con el panel de comentarios abierto, Escape cierra solo esa
      // capa (igual que el visor ampliado); un segundo Escape cierra el modal.
      if (commentsOpen) {
        setCommentsOpen(false)
        return
      }
      onClose()
    }
    window.document.addEventListener('keydown', closeOnEscape)
    initialFocusRef.current?.focus()
    return () => {
      window.document.removeEventListener('keydown', closeOnEscape)
      previouslyFocused?.focus()
    }
  }, [onClose, form.saving, preview.previewOpenRef, commentsOpen])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-3 sm:p-5"
      onClick={(event) => event.target === event.currentTarget && !form.saving && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-dialog-title"
        tabIndex={-1}
        className={`flex min-h-0 max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none ${
          commentsOpen ? 'max-w-5xl modal-3col:max-w-[1320px] 2xl:max-w-[1440px]' : 'max-w-5xl 2xl:max-w-6xl'
        }`}
      >
        <DocumentHeader
          isNew={isNew}
          name={currentDoc?.name ?? form.name}
          type={form.type}
          versionNumber={currentVersion?.version}
          validityStatus={validityStatus}
          readOnly={readOnly}
          saving={form.saving}
          commentsOpen={commentsOpen}
          commentsCount={commentsCount}
          onToggleComments={() => setCommentsOpen((open) => !open)}
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 min-w-0 flex">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0 flex-1 min-w-0 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* Columna Izquierda: Formulario de metadatos + Historial de versiones (42% en desktop) */}
          <div className="lg:col-span-5 p-5 min-h-0 overflow-y-auto scrollbar-thin space-y-6">
            <DocumentFormFields
              initialFocusRef={initialFocusRef}
              name={form.name}
              setName={form.setName}
              typeId={form.typeId}
              setTypeId={form.setTypeId}
              type={form.type}
              setType={form.setType}
              documentTypes={form.documentTypes}
              assets={form.assets}
              setAssets={form.setAssets}
              onSearchAssets={form.searchAssets}
              locationId={form.locationId}
              locationLabel={form.locationLabel}
              onSelectLocation={(opt) => {
                form.setLocationId(opt ? Number(opt.value) : null)
                form.setLocationLabel(opt?.label ?? null)
              }}
              onSearchLocations={form.searchLocationOptions}
              issueDate={form.issueDate}
              setIssueDate={form.setIssueDate}
              expiryDate={form.expiryDate}
              setExpiryDate={form.setExpiryDate}
              periodicity={form.periodicity}
              setPeriodicity={form.setPeriodicity}
              periodicityMode={form.periodicityMode}
              setPeriodicityMode={form.setPeriodicityMode}
              expiryTouched={form.expiryTouched}
              setExpiryTouched={form.setExpiryTouched}
              isNew={isNew}
              files={form.files}
              setFiles={form.setFiles}
              writeDisabled={form.writeDisabled}
            />

            {!isNew && (
              <div className="pt-2">
                <DocumentVersionsList
                  currentVersion={currentVersion ?? null}
                  detail={form.detail}
                  activeTargetKey="current"
                  previewingTarget={preview.previewingTarget}
                  saving={form.saving}
                  readOnly={readOnly}
                  onSelectCurrent={preview.openPreview}
                  onSelectVersion={preview.openVersionPreview}
                  onSelectAttachment={preview.openAttachmentPreview}
                  onDownloadVersion={(v) => void downloadDocument(projectId, currentDoc!.id, v)}
                  onDownloadAttachment={(v, attId) => void downloadDocumentAttachment(projectId, currentDoc!.id, v, attId)}
                  onUploadNewVersion={form.uploadNewVersion}
                />
              </div>
            )}
          </div>

          {/* Columna Derecha: Vista previa a toda la altura disponible (58% en desktop) */}
          <div className="lg:col-span-7 p-5 min-h-0 overflow-y-auto scrollbar-thin bg-slate-50/30 dark:bg-slate-900/40 flex flex-col">
            <div className="h-full flex-1 flex flex-col">
              <DocumentPreviewPane
                activePreview={preview.activePreviewItem}
                loading={preview.previewLoading}
                error={preview.previewError}
                isNew={isNew}
                hasNewFiles={form.files.length > 0}
                onResetToCurrent={() => preview.closePreview()}
                onExpand={preview.openPreview}
              />
            </div>
          </div>
          </div>

          {/* COM-01: panel de comentarios del documento. Solo se monta (y por
              tanto solo carga la lista) al abrirlo. En escritorio amplio (modal-3col: >= 1440 px)
              es una columna lateral de 360 px que acompaña a la expansión horizontal del modal,
              preservando el 100% del ancho útil del formulario y vista previa sin comprimirlos;
              al cerrarla el modal recupera su tamaño normal. En portátiles (1280x800, 1366x768),
              tablets y móviles se convierte en drawer lateral flotante (z-[60], capa propia)
              sobre el modal, garantizando que el formulario y la vista previa nunca pierdan ancho útil. */}
          {!isNew && commentsOpen && (
            <aside
              aria-label="Comentarios del documento"
              className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[320px] sm:w-[300px] min-h-0 flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-2xl modal-3col:static modal-3col:z-auto modal-3col:w-[280px] modal-3col:shrink-0 modal-3col:shadow-none"
            >
              <EntityCommentsPanel
                key={`document-${documentId}`}
                projectId={projectId}
                entityType="document"
                entityId={documentId}
                readOnly={readOnly}
                canComment={canComment}
                count={commentsCount}
                onClose={() => setCommentsOpen(false)}
                onCountChange={(delta) => setCommentsCount((current) => (current === null ? null : Math.max(0, current + delta)))}
                className="min-h-0 flex-1"
              />
            </aside>
          )}
        </div>

        {/* Backdrop solo móvil/tablet/portátil compacto (< modal-3col): en desktop amplio el panel es una columna más tras la expansión. */}
        {!isNew && commentsOpen && (
          <div aria-hidden="true" onClick={() => setCommentsOpen(false)} className="fixed inset-0 z-[55] bg-slate-900/50 backdrop-blur-sm modal-3col:hidden" />
        )}

        {/* Footer del diálogo */}
        <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="min-w-0 flex-1">
            {form.error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400 truncate">{form.error}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={form.saving}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cerrar
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={() => void form.save()}
                disabled={form.saving}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors shadow-sm disabled:opacity-40"
              >
                {form.saving ? 'Guardando…' : isNew ? 'Subir documento' : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      </div>

      {preview.previewOpen && preview.modalPreview && currentDoc && (
        <DocumentPreviewModal
          name={preview.modalPreview.name ?? currentDoc.name}
          version={preview.modalPreview.version}
          mimeType={preview.modalPreview.mimeType}
          objectUrl={preview.modalPreview.objectUrl}
          text={preview.modalPreview.text}
          blob={preview.modalPreview.blob}
          onClose={preview.closePreview}
        />
      )}
    </div>
  )
}
