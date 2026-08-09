import { useEffect, useRef, useState } from 'react'
import StatusChip from '@/components/StatusChip'
import DocumentModal from '@/components/DocumentModal'
import SearchablePicker, { type SearchableOption } from '@/components/SearchablePicker'
import { downloadDocument, fetchDocument, fetchDocuments, updateDocument, type ApiAsset, type ApiStatus } from '@/lib/api'
import { formatApiDate, formatDocumentSize, mapApiAssetEventToDisplay, mapApiAssetToDisplay } from '@/lib/assetMappers'

const tabs = ['Resumen', 'Características', 'Documentos', 'Eventos', 'Historial', 'Plano']

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

function AssetDocuments({ asset, limit }: { asset: ApiAsset; limit?: number }) {
  const allDocuments = asset.documents ?? []
  const documents = limit ? allDocuments.slice(0, limit) : allDocuments
  if (documents.length === 0) return <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">No hay documentos asociados a este activo.</div>
  return <div className="space-y-2">{documents.map((document) => {
    const version = document.currentVersion
    const format = version?.originalName.split('.').pop()?.toUpperCase() ?? 'DOC'
    return <div key={document.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800"><div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 flex items-center justify-center text-xs font-bold">{format}</div><div className="flex-1"><div className="text-sm font-medium">{document.name}{version && ` v${version.version}`}</div><div className="text-xs text-slate-500">{version ? `${formatDocumentSize(version.sizeBytes)} · Subido ${formatApiDate(version.uploadedAt)}` : 'Sin versión'}</div></div>{version && <button type="button" onClick={() => void downloadDocument(document.id)} className="text-xs text-brand-600">Descargar</button>}</div>
  })}</div>
}

interface AssetModalProps {
  asset: ApiAsset | null
  statuses: ApiStatus[]
  onClose: () => void
  onEdit: () => void
  onChangeStatus: (statusId: number) => Promise<void>
  onDelete: (asset: ApiAsset) => void | Promise<void>
  onDocumentsChanged: () => void | Promise<void>
}

export default function AssetModal({ asset, statuses, onClose, onEdit, onChangeStatus, onDelete, onDocumentsChanged }: AssetModalProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [showStatusSelector, setShowStatusSelector] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const linkDialogOpenRef = useRef(linkDialogOpen)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const assetId = asset?.id

  // UX-02: el modal nunca se desmonta (vive en la vista); al cambiar de activo
  // (o al cerrar y reabrir) siempre arranca en la pestaña «Resumen».
  useEffect(() => {
    setActiveTab(0)
    setShowStatusSelector(false)
    setStatusError(null)
    setDeleteError(null)
  }, [assetId])

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
      if (event.key !== 'Escape' || linkDialogOpenRef.current) return
      event.preventDefault()
      onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [assetId])

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

  const changeStatus = async (statusId: number) => {
    setStatusError(null)
    setChangingStatus(true)
    try {
      await onChangeStatus(statusId)
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
    const res = await fetchDocuments({ search: query || undefined, limit: 20 })
    return res.data.map((document) => ({
      value: String(document.id),
      label: document.name,
      hint: `v${document.currentVersion?.version ?? 1} · ${document.assets.length > 0 ? document.assets.map((linked) => `${linked.code} · ${linked.name}`).join(', ') : 'Sin activo'}`,
    }))
  }

  const linkDocument = async (option: SearchableOption | null) => {
    if (!option || linking) return
    setLinkError(null)
    setLinking(true)
    try {
      const document = await fetchDocument(Number(option.value))
      await updateDocument(document.id, { assetIds: [...new Set([...document.assets.map((linked) => linked.id), asset.id])] })
      setLinkDialogOpen(false)
      await onDocumentsChanged()
    } catch {
      setLinkError('No se pudo vincular el documento. Inténtalo de nuevo.')
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`asset-dialog-title-${asset.id}`} tabIndex={-1} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl focus:outline-none">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-slate-500">{displayAsset.code}</div>
            <h3 id={`asset-dialog-title-${asset.id}`} className="font-semibold text-lg">{displayAsset.name}</h3>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 px-5 flex items-center gap-4 text-sm overflow-x-auto">
          {tabs.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)} className={`py-3 border-b-2 ${activeTab === i ? 'border-brand-600 text-brand-600 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'} whitespace-nowrap`}>
              {tab}
              {tab === 'Documentos' && <span className="text-xs text-slate-400 ml-1">{asset.documentCount}</span>}
              {tab === 'Eventos' && <span className="text-xs text-slate-400 ml-1">{asset.eventCount}</span>}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <div className="p-5 overflow-y-auto scrollbar-thin">
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
                                <button type="button" role="option" aria-selected={status.id === asset.statusId} onClick={() => { setShowStatusSelector(false); void changeStatus(status.id) }} disabled={changingStatus} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
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
              <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center aspect-square">
                <svg className="w-20 h-20 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
              </div>
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
                  <button type="button" className="px-3 py-1.5 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    {event.source === 'event' ? 'Completar' : 'Detalles'}
                  </button>
                </div>
              ))}
            </div>

            <h4 className="font-medium mb-3">Documentos recientes</h4>
            <AssetDocuments asset={asset} limit={2} />
          </div>
        )}

        {activeTab === 2 && (
          <div className="p-5 overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Documentos asociados</h4>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setLinkDialogOpen(true)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  Vincular documento
                </button>
                <button type="button" onClick={() => setCreateDialogOpen(true)} className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Nuevo documento
                </button>
              </div>
            </div>
            <AssetDocuments asset={asset} />
          </div>
        )}

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4">
              {isDecommissioned ? (
                <button type="button" onClick={() => activeStatus && void changeStatus(activeStatus.id)} disabled={changingStatus || !activeStatus} className="text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">Reactivar</button>
              ) : (
                <button type="button" onClick={() => decommissionedStatus && void changeStatus(decommissionedStatus.id)} disabled={changingStatus || !decommissionedStatus} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">Dar de baja</button>
              )}
              {/* ITEM-05: eliminar mueve a la papelera (recuperable 30 días). */}
              <button type="button" onClick={() => void handleDelete()} disabled={deleting} className="text-sm text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">Eliminar</button>
            </div>
            {(statusError || deleteError) && <div role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{statusError ?? deleteError}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">Cerrar</button>
            <button type="button" onClick={onEdit} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">Editar</button>
          </div>
        </div>
      </div>
      {linkDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !linking && setLinkDialogOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="link-document-dialog-title" className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 id="link-document-dialog-title" className="font-semibold">Vincular documento</h3>
              <button type="button" aria-label="Cerrar" onClick={() => setLinkDialogOpen(false)} disabled={linking} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">×</button>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Busca el documento y añádelo a los activos asociados de {asset.code}. Un documento puede estar vinculado a varios activos a la vez.</p>
              <SearchablePicker value={null} selectedLabel={null} placeholder="Buscar documento por nombre…" ariaLabel="Buscar documento" allowClear={false} disabled={linking} onSearch={searchDocuments} onSelect={(option) => void linkDocument(option)} emptyText="No hay documentos con ese nombre" />
              {linkError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{linkError}</p>}
            </div>
          </div>
        </div>
      )}
      {createDialogOpen && <DocumentModal document={null} initialAssetIds={[{ id: asset.id, label: `${asset.code} · ${asset.name}` }]} onClose={() => setCreateDialogOpen(false)} onChanged={onDocumentsChanged} />}
    </div>
  )
}
