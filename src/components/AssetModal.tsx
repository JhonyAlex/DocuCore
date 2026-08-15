import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import StatusChip from '@/components/StatusChip'
import DocumentModal from '@/components/DocumentModal'
import AssetImageBox, { AssetImageViewer } from '@/components/AssetImageBox'
import AssetDocuments from '@/components/AssetDocuments'
import AssetActionConfirmDialog, { type AssetConfirmedAction } from '@/components/AssetActionConfirmDialog'
import SearchablePicker, { type SearchableOption } from '@/components/SearchablePicker'
import AssetCharacteristics from '@/components/AssetCharacteristics'
import AssetEventsPanel from '@/components/AssetEventsPanel'
import AssetPreventivesPanel from '@/components/AssetPreventivesPanel'
import AssetHistoryPanel from '@/components/AssetHistoryPanel'
import { fetchDocument, fetchDocuments, updateDocument, type ApiAsset, type ApiStatus } from '@/lib/api'
import { formatApiDate, mapApiAssetEventToDisplay, mapApiAssetToDisplay } from '@/lib/assetMappers'
import useAssetDocumentDialog from '@/hooks/useAssetDocumentDialog'

// El visor de planos incorpora OpenSeadragon; la pestaña solo se monta bajo
// interacción explícita, por lo que se mantiene fuera del bundle inicial.
const AssetFloorPlanPreview = lazy(() => import('@/components/AssetFloorPlanPreview'))

const tabs = ['Resumen', 'Características', 'Documentos', 'Eventos', 'Preventivos', 'Historial', 'Plano']

const eventCardStyles = {
  amber: 'bg-amber-50/70 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/50',
  red: 'bg-red-50/70 dark:bg-red-900/20 border-red-100 dark:border-red-900/50',
  slate: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
}

const eventIconStyles = {
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  red: 'bg-red-100 dark:bg-red-900/40 text-red-600',
  slate: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  brand: 'bg-brand-100 dark:bg-brand-900/40 text-brand-600',
}

const sourceCardStyles = {
  brand: 'bg-brand-50/50 dark:bg-brand-900/20 border-brand-100 dark:border-brand-900/50',
}

interface AssetModalProps {
  asset: ApiAsset | null
  statuses: ApiStatus[]
  onClose: () => void
  onEdit: () => void
  onChangeStatus: (statusId: number) => Promise<void>
  onDelete: (asset: ApiAsset) => void | Promise<void>
  onDocumentsChanged: () => void | Promise<void>
  // IMG-01: la ficha actualiza el activo tras subir/quitar su imagen.
  onImageChanged: (asset: ApiAsset) => void
  initialPreventiveExecutionId?: number | null
}

export default function AssetModal({ asset, statuses, onClose, onEdit, onChangeStatus, onDelete, onDocumentsChanged, onImageChanged, initialPreventiveExecutionId = null }: AssetModalProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [showStatusSelector, setShowStatusSelector] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmedAction, setConfirmedAction] = useState<AssetConfirmedAction | null>(null)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  // Visor de la foto del activo: abierto desde el cuadro de imagen; guardia
  // para que Escape cierre solo el visor sin cerrar la ficha (patrón DOC-03).
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
  const [focusedPreventiveExecutionId, setFocusedPreventiveExecutionId] = useState<number | null>(null)
  const imagePreviewOpenRef = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const linkDialogOpenRef = useRef(linkDialogOpen)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const assetId = asset?.id
  const documentDialog = useAssetDocumentDialog(asset?.projectId, assetId)
  const documentDialogOpenRef = documentDialog.openRef

  // UX-02: el modal nunca se desmonta (vive en la vista); al cambiar de activo
  // (o al cerrar y reabrir) siempre arranca en la pestaña «Resumen».
  useEffect(() => {
    setActiveTab(initialPreventiveExecutionId ? 4 : 0)
    setShowStatusSelector(false)
    setStatusError(null)
    setDeleteError(null)
    setConfirmedAction(null)
    setImagePreviewOpen(false)
    imagePreviewOpenRef.current = false
    setFocusedPreventiveExecutionId(initialPreventiveExecutionId)
  }, [assetId, initialPreventiveExecutionId])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    linkDialogOpenRef.current = linkDialogOpen
  }, [linkDialogOpen])

  useEffect(() => {
    if (!assetId) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || linkDialogOpenRef.current || imagePreviewOpenRef.current || documentDialogOpenRef.current) return
      event.preventDefault()
      onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [assetId, documentDialogOpenRef])

  useEffect(() => {
    if (!linkDialogOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !linking) {
        event.preventDefault()
        setLinkDialogOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [linkDialogOpen, linking])

  useEffect(() => {
    if (!showStatusSelector) return
    const handlePointerDown = (event: PointerEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) setShowStatusSelector(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showStatusSelector])

  if (!asset) return null
  const displayAsset = mapApiAssetToDisplay(asset)
  const nextEvents = asset.nextEvents.map((event) => ({
    ...mapApiAssetEventToDisplay(event),
    calendarDate: formatApiDate(event.date),
  }))
  const decommissionedStatus = statuses.find((status) => status.name === 'Fuera de servicio')
  const activeStatus = statuses.find((status) => status.name === 'Activo')
  const isDecommissioned = asset.statusId === decommissionedStatus?.id

  const openPreventiveExecution = (executionId: number) => {
    setFocusedPreventiveExecutionId(executionId)
    setActiveTab(4)
  }

  const handleNextEventAction = (event: (typeof nextEvents)[number]) => {
    const relatedId = Number(event.id.split(':')[1])
    if (!Number.isInteger(relatedId) || relatedId <= 0) return
    if (event.source === 'preventive') {
      openPreventiveExecution(relatedId)
    } else if (event.source === 'document') {
      void documentDialog.openAssociated(relatedId)
    } else if (event.source === 'dynamic-date') {
      setActiveTab(1)
    } else {
      setActiveTab(3)
    }
  }

  const changeStatus = async (statusId: number) => {
    setStatusError(null)
    setChangingStatus(true)
    try {
      await onChangeStatus(statusId)
      setConfirmedAction(null)
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'No se pudo actualizar el estado.')
    } finally {
      setChangingStatus(false)
    }
  }

  // ITEM-05: eliminar mueve el activo a la papelera; la vista cierra la ficha.
  const handleDelete = async () => {
    setDeleteError(null)
    setDeleting(true)
    try {
      await onDelete(asset)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar el activo.')
      setDeleting(false)
    }
  }

  const searchDocuments = async (query: string): Promise<SearchableOption[]> => {
    const res = await fetchDocuments(asset.projectId, { search: query || undefined, limit: 20 })
    return res.data.map((document) => ({
      value: String(document.id),
      label: document.name,
      hint: `v${document.currentVersion?.version ?? 1} · ${document.assets && document.assets.length > 0 ? document.assets.map((linked) => `${linked.code} · ${linked.name}`).join(', ') : 'Sin activo'}`,
    }))
  }

  const linkDocument = async (option: SearchableOption | null) => {
    if (!option || linking) return
    setLinkError(null)
    setLinking(true)
    try {
      const document = await fetchDocument(asset.projectId, Number(option.value))
      const currentAssetIds = document.assets ? document.assets.map((linked) => linked.id) : []
      await updateDocument(asset.projectId, document.id, { assetIds: [...new Set([...currentAssetIds, asset.id])] })
      setLinkDialogOpen(false)
      await onDocumentsChanged()
    } catch {
      setLinkError('No se pudo vincular el documento. Inténtalo de nuevo.')
    } finally {
      setLinking(false)
    }
  }

  const requestStatusChange = (status: ApiStatus) => {
    setShowStatusSelector(false)
    if (status.id === asset.statusId) return
    setStatusError(null)
    if (status.name === 'Fuera de servicio') {
      setConfirmedAction({ kind: 'decommission', statusId: status.id })
      return
    }
    void changeStatus(status.id)
  }

  const confirmAction = () => {
    if (confirmedAction?.kind === 'delete') {
      void handleDelete()
    } else if (confirmedAction?.kind === 'decommission') {
      void changeStatus(confirmedAction.statusId)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`asset-dialog-title-${asset.id}`} tabIndex={-1} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl focus:outline-none">
        <div className="shrink-0 p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-mono text-slate-500">{displayAsset.code}</div>
            <h3 id={`asset-dialog-title-${asset.id}`} title={displayAsset.name} className="truncate font-semibold text-lg">{displayAsset.name}</h3>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-5 flex items-center gap-4 text-sm overflow-x-auto scrollbar-thin">
          {tabs.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)} className={`py-3 border-b-2 ${activeTab === i ? 'border-brand-600 text-brand-600 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'} whitespace-nowrap`}>
              {tab}
              {tab === 'Documentos' && <span className="text-xs text-slate-400 ml-1">{asset.documentCount}</span>}
              {tab === 'Eventos' && <span className="text-xs text-slate-400 ml-1">{asset.eventCount}</span>}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <div className="min-h-0 flex-1 p-5 overflow-y-auto scrollbar-thin">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="text-xs text-slate-500">Estado</div>
                      <div ref={statusMenuRef} className="relative mt-1 inline-block">
                        <button type="button" onClick={() => setShowStatusSelector((current) => !current)} aria-label="Cambiar estado" aria-haspopup="listbox" aria-expanded={showStatusSelector} className="flex items-center gap-1.5 cursor-pointer">
                          <StatusChip label={displayAsset.status} chipClass={displayAsset.statusChipClass} pulseDot={displayAsset.pulseDot} />
                          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showStatusSelector ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                        {showStatusSelector && (
                          <ul role="listbox" aria-label="Seleccionar estado" className="absolute left-0 top-full z-10 mt-1 min-w-44 overflow-hidden rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg fade-in">
                            {statuses.map((status) => (
                              <li key={status.id}>
                                <button type="button" role="option" aria-selected={status.id === asset.statusId} onClick={() => requestStatusChange(status)} disabled={changingStatus} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
                                  <span className="flex-1">{status.name}</span>
                                  {status.id === asset.statusId && <span className="text-brand-600" aria-hidden="true">✓</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Tipo</div>
                    <div className="mt-1 text-sm font-medium">{displayAsset.type}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Ubicación</div>
                    <div className="mt-1 text-sm font-medium">{displayAsset.location}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Responsable</div>
                    <div className="mt-1 text-sm font-medium flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded-full ${displayAsset.responsibleColor} text-white text-[10px] font-medium flex items-center justify-center`}>{displayAsset.responsibleInitials}</span>
                      {displayAsset.responsible}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Nº de serie</div>
                    <div className="mt-1 text-sm font-mono">{displayAsset.serialNumber}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500">Instalación</div>
                    <div className="mt-1 text-sm font-medium">{displayAsset.installDate}</div>
                </div>
              </div>
              <AssetImageBox asset={asset} onChanged={onImageChanged} onView={() => { imagePreviewOpenRef.current = true; setImagePreviewOpen(true) }} />
            </div>

            <h4 className="font-medium mb-3">Próximos eventos</h4>
            <div className="space-y-2 mb-5">
              {nextEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
                  Sin eventos programados. Se mostrarán aquí al relacionar una fecha con este activo.
                </div>
              ) : nextEvents.map((event) => (
                <div key={event.id} className={`flex items-center gap-3 p-3 rounded-lg border ${event.source === 'document' && event.urgency !== 'red' ? sourceCardStyles.brand : eventCardStyles[event.urgency]}`}>
                  <div className={`w-10 h-10 rounded-lg ${event.source === 'document' && event.urgency !== 'red' ? eventIconStyles.brand : eventIconStyles[event.urgency]} flex items-center justify-center`}>
                    {event.source === 'document' ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{event.label}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">{event.calendarDate} · {event.sourceLabel}</div>
                  </div>
                  <button type="button" onClick={() => handleNextEventAction(event)} className="px-3 py-1.5 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    {event.source === 'preventive' ? 'Ver preventivo' : event.source === 'document' ? 'Ver documento' : event.source === 'dynamic-date' ? 'Ver característica' : 'Ver eventos'}
                  </button>
                </div>
              ))}
            </div>

            <h4 className="font-medium mb-3">Documentos recientes</h4>
            <AssetDocuments asset={asset} limit={2} openingId={documentDialog.openingId} onOpen={(documentId) => void documentDialog.openAssociated(documentId)} />
            {documentDialog.error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{documentDialog.error}</p>}
          </div>
        )}

        {activeTab === 1 && (
          <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
            <AssetCharacteristics asset={asset} onChanged={onImageChanged} />
          </div>
        )}

        {activeTab === 2 && (
          <div className="min-h-0 flex-1 p-5 overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Documentos asociados</h4>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setLinkDialogOpen(true)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  Vincular documento
                </button>
                <button type="button" onClick={documentDialog.openCreate} className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Nuevo documento
                </button>
              </div>
            </div>
            <AssetDocuments asset={asset} openingId={documentDialog.openingId} onOpen={(documentId) => void documentDialog.openAssociated(documentId)} />
            {documentDialog.error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{documentDialog.error}</p>}
          </div>
        )}

        {activeTab === 3 && <AssetEventsPanel asset={asset} onChanged={onImageChanged} onOpenPreventive={openPreventiveExecution} />}

        {activeTab === 4 && (
          <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
            <AssetPreventivesPanel asset={asset} onChanged={onImageChanged} focusExecutionId={focusedPreventiveExecutionId} onFocusHandled={() => setFocusedPreventiveExecutionId(null)} />
          </div>
        )}

        {activeTab === 5 && <AssetHistoryPanel asset={asset} />}

        {activeTab === 6 && (
          <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
            <Suspense fallback={<p className="text-sm text-slate-500 dark:text-slate-400">Cargando plano…</p>}>
              <AssetFloorPlanPreview asset={asset} />
            </Suspense>
          </div>
        )}

        <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4">
              {isDecommissioned ? (
                <button type="button" onClick={() => activeStatus && void changeStatus(activeStatus.id)} disabled={changingStatus || !activeStatus} className="text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">Reactivar</button>
              ) : (
                <button type="button" onClick={() => decommissionedStatus && requestStatusChange(decommissionedStatus)} disabled={changingStatus || !decommissionedStatus} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">Dar de baja</button>
              )}
              {/* ITEM-05: eliminar mueve a la papelera (recuperable 30 días). */}
              <button type="button" onClick={() => { setDeleteError(null); setConfirmedAction({ kind: 'delete' }) }} disabled={deleting} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">Eliminar</button>
            </div>
            {(statusError || deleteError) && <div role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{statusError ?? deleteError}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">Cerrar</button>
            <button type="button" onClick={onEdit} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">Editar</button>
          </div>
        </div>
      </div>
      <AssetActionConfirmDialog
        asset={asset}
        action={confirmedAction}
        busy={confirmedAction?.kind === 'delete' ? deleting : changingStatus}
        error={confirmedAction?.kind === 'delete' ? deleteError : statusError}
        onConfirm={confirmAction}
        onCancel={() => { setConfirmedAction(null); setDeleteError(null); setStatusError(null) }}
      />
      {linkDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !linking && setLinkDialogOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="link-document-dialog-title" className="flex min-h-0 max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 id="link-document-dialog-title" className="font-semibold">Vincular documento</h3>
              <button type="button" aria-label="Cerrar" onClick={() => setLinkDialogOpen(false)} disabled={linking} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Busca el documento y añádelo a los activos asociados de {asset.code}. Un documento puede estar vinculado a varios activos a la vez.</p>
              <SearchablePicker value={null} selectedLabel={null} placeholder="Buscar documento por nombre…" ariaLabel="Buscar documento" allowClear={false} disabled={linking} onSearch={searchDocuments} onSelect={(option) => void linkDocument(option)} emptyText="No hay documentos con ese nombre" />
              {linkError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{linkError}</p>}
            </div>
          </div>
        </div>
      )}
      {documentDialog.createOpen && <DocumentModal document={null} initialAssetIds={[{ id: asset.id, label: `${asset.code} · ${asset.name}` }]} onClose={documentDialog.close} onChanged={onDocumentsChanged} />}
      {documentDialog.document && <DocumentModal document={documentDialog.document} onClose={documentDialog.close} onChanged={onDocumentsChanged} />}
      {imagePreviewOpen && asset.imageUrl && <AssetImageViewer src={asset.imageUrl} name={asset.name} onClose={() => { imagePreviewOpenRef.current = false; setImagePreviewOpen(false) }} />}
    </div>
  )
}
