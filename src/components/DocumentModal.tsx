import { useEffect, useRef } from 'react'
import type { SelectedValue } from '@/components/SearchableMultiPicker'
import DocumentHeader from '@/components/document/DocumentHeader'
import DocumentFormFields from '@/components/document/DocumentFormFields'
import DocumentPreviewPane from '@/components/document/DocumentPreviewPane'
import DocumentVersionsList from '@/components/document/DocumentVersionsList'
import DocumentPreviewModal from '@/components/DocumentPreviewModal'
import { useDocumentPreview } from '@/hooks/useDocumentPreview'
import { useDocumentForm } from '@/hooks/useDocumentForm'
import { downloadDocument, downloadDocumentAttachment, type ApiDocument } from '@/lib/api'
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
  const { projectId, readOnly } = useProject()
  if (projectId === null) throw new Error('DocumentModal requires a project scope')

  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLInputElement>(null)

  const form = useDocumentForm({
    projectId,
    document,
    initialAssetIds,
    readOnly,
    onClose,
    onChanged,
  })

  const isNew = !document
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
      if (event.key === 'Escape' && !form.saving && !preview.previewOpenRef.current) onClose()
    }
    window.document.addEventListener('keydown', closeOnEscape)
    initialFocusRef.current?.focus()
    return () => {
      window.document.removeEventListener('keydown', closeOnEscape)
      previouslyFocused?.focus()
    }
  }, [onClose, form.saving, preview.previewOpenRef])

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
        className="flex min-h-0 max-h-[92vh] w-full max-w-5xl 2xl:max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none"
      >
        <DocumentHeader
          isNew={isNew}
          name={currentDoc?.name ?? form.name}
          type={form.type}
          versionNumber={currentVersion?.version}
          validityStatus={validityStatus}
          readOnly={readOnly}
          saving={form.saving}
          onClose={onClose}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0 flex-1 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* Columna Izquierda: Formulario de metadatos (42% en desktop) */}
          <div className="lg:col-span-5 p-5 min-h-0 overflow-y-auto scrollbar-thin">
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
          </div>

          {/* Columna Derecha: Vista previa e Historial de versiones (58% en desktop) */}
          <div className="lg:col-span-7 p-5 min-h-0 overflow-y-auto scrollbar-thin space-y-5 bg-slate-50/30 dark:bg-slate-900/40 flex flex-col">
            <div className="shrink-0">
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

            {!isNew && (
              <div className="flex-1 min-h-0">
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
        </div>

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
