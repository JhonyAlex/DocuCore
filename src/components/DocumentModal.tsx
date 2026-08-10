import { useEffect, useRef, useState } from 'react'
import type { SearchableOption } from '@/components/SearchablePicker'
import SearchableMultiPicker, { type SelectedValue } from '@/components/SearchableMultiPicker'
import DocumentPreviewModal, { DocumentPreviewBody } from '@/components/DocumentPreviewModal'
import { createDocument, createDocumentVersion, downloadDocument, fetchAssets, fetchDocument, fetchDocumentPreview, updateDocument, type ApiDocument, type ApiDocumentDetail, type DocumentMetadataInput } from '@/lib/api'
import { PERIODICITIES, calculateNextExpiry, type DocumentPeriodicity, type DocumentPeriodicityMode } from '@/lib/periodicity'

type DocumentModalProps = {
  document: ApiDocument | null
  initialAssetIds?: SelectedValue[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}

const documentTypes = ['Certificado', 'Calibración', 'Manual', 'Acta', 'Contrato']
const periodicityOptions = [{ value: '', label: 'Sin periodicidad' }, ...PERIODICITIES.map((value) => ({ value, label: value }))]

function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

function toUtcDateInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export default function DocumentModal({ document, initialAssetIds = [], onClose, onChanged }: DocumentModalProps) {
  const [detail, setDetail] = useState<ApiDocumentDetail | null>(null)
  const [name, setName] = useState(document?.name ?? '')
  const [type, setType] = useState(document?.type ?? documentTypes[0])
  const [assets, setAssets] = useState<SelectedValue[]>(() => {
    const seeded = [
      ...(document?.assets ?? []).map((asset) => ({ id: asset.id, label: `${asset.code} · ${asset.name}` })),
      ...initialAssetIds,
    ]
    const seen = new Set<number>()
    return seeded.filter((value) => !seen.has(value.id) && seen.add(value.id))
  })
  const [issueDate, setIssueDate] = useState(dateInput(document?.currentVersion?.issueDate) || new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState(dateInput(document?.currentVersion?.expiryDate))
  // DOC-03: periodicidad y modo de cálculo del documento; expiryTouched marca
  // una edición manual del vencimiento (deja de recalcularse) y mountedRef evita
  // saltar el vencimiento vigente al abrir el modal de gestión.
  const [periodicity, setPeriodicity] = useState<DocumentPeriodicity | null>(document?.periodicity ?? null)
  const [periodicityMode, setPeriodicityMode] = useState<DocumentPeriodicityMode>(document?.periodicityMode ?? 'Calendario')
  const [expiryTouched, setExpiryTouched] = useState(false)
  const mountedRef = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Guardia para el visor de vista previa: mientras está abierto, Escape lo
  // cierra a él (su propio listener) sin cerrar este modal (patrón de AssetModal).
  const previewOpenRef = useRef(false)
  // Contenido de la vista previa incrustada: se carga al abrir el documento y
  // se comparte con el visor (no se vuelve a pedir el fichero al ampliar).
  const [preview, setPreview] = useState<{ objectUrl: string | null; text: string | null } | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const isNew = !document
  const version = document?.currentVersion
  const documentId = document?.id
  const versionNumber = version?.version
  const previewable = Boolean(version && (version.mimeType === 'application/pdf' || version.mimeType.startsWith('image/') || version.mimeType.startsWith('text/')))

  useEffect(() => {
    if (!documentId || !versionNumber) return
    let active = true
    setPreview(null)
    setPreviewError(false)
    fetchDocumentPreview(documentId)
      .then((blob) => {
        if (!active) return
        if (blob.type.startsWith('text/')) {
          void blob.text().then((text) => { if (active) setPreview({ objectUrl: null, text }) })
        } else {
          setPreview({ objectUrl: URL.createObjectURL(blob), text: null })
        }
      })
      .catch(() => { if (active) setPreviewError(true) })
    return () => { active = false }
  }, [documentId, versionNumber])

  // El object URL lo crea el efecto de carga y vive mientras exista `preview`.
  useEffect(() => {
    previewUrlRef.current = preview?.objectUrl ?? null
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [preview])

  const openPreview = () => {
    previewOpenRef.current = true
    setPreviewOpen(true)
  }

  const closePreview = () => {
    previewOpenRef.current = false
    setPreviewOpen(false)
  }

  useEffect(() => {
    const previouslyFocused = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !previewOpenRef.current) onClose()
    }
    window.document.addEventListener('keydown', closeOnEscape)
    initialFocusRef.current?.focus()
    return () => {
      window.document.removeEventListener('keydown', closeOnEscape)
      previouslyFocused?.focus()
    }
  }, [onClose, saving])

  useEffect(() => {
    if (!document) return
    let active = true
    fetchDocument(document.id).then((next) => active && setDetail(next)).catch(() => active && setError('No se pudo cargar el historial de versiones.'))
    return () => { active = false }
  }, [document])

  // DOC-03: precalcula el vencimiento con la periodicidad cuando cambian la
  // regla, el modo o la emisión (salvo edición manual del propio campo).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (!periodicity || expiryTouched) return
    const previous = document?.currentVersion?.expiryDate ? new Date(document.currentVersion.expiryDate) : null
    setExpiryDate(calculateNextExpiry(previous, toUtcDateInput(issueDate), periodicityMode, periodicity).toISOString().slice(0, 10))
  }, [periodicity, periodicityMode, issueDate, expiryTouched, document])

  const metadata = (): DocumentMetadataInput => ({
    name,
    type,
    projectId: 1,
    assetIds: assets.map((asset) => asset.id),
    issueDate,
    expiryDate: expiryDate || null,
    periodicity,
    periodicityMode: periodicity ? periodicityMode : null,
  })

  const searchAssets = async (query: string): Promise<SearchableOption[]> => {
    const res = await fetchAssets({ search: query || undefined, limit: 20 })
    return res.data.map((asset) => ({ value: String(asset.id), label: `${asset.code} · ${asset.name}`, hint: asset.location?.name }))
  }

  const save = async () => {
    setError(null)
    if (isNew && !file) return setError('Selecciona un fichero para subir el documento.')
    setSaving(true)
    try {
      if (isNew && file) await createDocument(metadata(), file)
      if (!isNew && document) await updateDocument(document.id, { name, type, assetIds: assets.map((asset) => asset.id), issueDate, expiryDate: expiryDate || null })
      await onChanged()
      onClose()
    } catch {
      setError('No se pudo guardar el documento. Revisa los datos e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const uploadNewVersion = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]
    if (!document || !nextFile) return
    setError(null)
    setSaving(true)
    try {
      // DOC-03: al subir una versión con periodicidad y sin edición manual del
      // vencimiento, la nueva fecha se calcula según el modo elegido.
      let nextExpiry = expiryDate
      if (periodicity && !expiryTouched) {
        const previous = document.currentVersion?.expiryDate ? new Date(document.currentVersion.expiryDate) : null
        nextExpiry = calculateNextExpiry(previous, toUtcDateInput(issueDate), periodicityMode, periodicity).toISOString().slice(0, 10)
      }
      await createDocumentVersion(document.id, { issueDate, expiryDate: nextExpiry || null }, nextFile)
      const next = await fetchDocument(document.id)
      setDetail(next)
      await onChanged()
    } catch {
      setError('No se pudo subir la nueva versión.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="document-dialog-title" tabIndex={-1} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 id="document-dialog-title" className="font-semibold text-lg">{isNew ? 'Subir documento' : 'Gestionar documento'}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">Nombre<input ref={initialFocusRef} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
            <label className="text-sm">Tipo<select value={type} onChange={(event) => setType(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">{documentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm">Activos asociados<SearchableMultiPicker values={assets} ariaLabel="Activos asociados" placeholder="Buscar activos por nombre o código…" disabled={saving} onSearch={searchAssets} onChange={setAssets} /></label>
            <label className="text-sm">Emisión<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
            <label className="text-sm">Vencimiento (opcional)<input type="date" value={expiryDate} onChange={(event) => { setExpiryDate(event.target.value); setExpiryTouched(true) }} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />{periodicity && !expiryTouched && <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">Automático: {periodicity.toLowerCase()} · {periodicityMode === 'Calendario' ? 'según vencimiento vigente' : 'según fecha de subida'}</span>}</label>
            <label className="text-sm">Periodicidad<select value={periodicity ?? ''} onChange={(event) => { setPeriodicity(event.target.value === '' ? null : event.target.value as DocumentPeriodicity); setExpiryTouched(false) }} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">{periodicityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {periodicity && <label className="text-sm">Modo<select value={periodicityMode} onChange={(event) => { setPeriodicityMode(event.target.value as DocumentPeriodicityMode); setExpiryTouched(false) }} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"><option value="Calendario">Según calendario</option><option value="Subida">Según subida</option></select></label>}
            {isNew && <label className="text-sm">Fichero<input type="file" accept=".pdf,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={saving} className="mt-1 block w-full text-xs" /></label>}
          </div>
          {!isNew && document?.currentVersion && <div>
            <h3 className="font-medium text-sm mb-2">Vista previa</h3>
            {previewable ? (
              preview ? (
                <div role="button" tabIndex={0} aria-label={`Abrir vista previa de ${document.name}`} onClick={openPreview} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPreview() } }} className="cursor-pointer overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <DocumentPreviewBody name={document.name} mimeType={document.currentVersion.mimeType} objectUrl={preview.objectUrl} text={preview.text} compact />
                </div>
              ) : previewError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">No se pudo cargar la vista previa.</p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Cargando vista previa…</p>
              )
            ) : (
              <div className="select-none cursor-not-allowed rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-6 text-center text-sm text-slate-400">Sin vista previa para este formato. Descarga el archivo para visualizarlo.</div>
            )}
          </div>}
          {!isNew && document && <div className="flex items-center gap-2"><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"><span>Subir nueva versión</span><input type="file" aria-label="Nueva versión" accept=".pdf,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadNewVersion(event)} disabled={saving} className="sr-only" /></label><button type="button" onClick={() => void downloadDocument(document.id)} disabled={saving} className="px-3 py-2 rounded-lg text-brand-600 text-sm">Descargar versión actual</button></div>}
          {detail && document && <div><h3 className="font-medium text-sm mb-2">Historial de versiones</h3><ul className="space-y-1 text-sm">{detail.versions.map((version) => <li key={version.id} className="flex justify-between rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span>v{version.version} · {version.originalName}</span><button type="button" className="text-brand-600" onClick={() => void downloadDocument(document.id, version.version)}>Descargar</button></li>)}</ul></div>}
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancelar</button><button type="button" onClick={() => void save()} disabled={saving} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-40">{saving ? 'Guardando…' : isNew ? 'Subir documento' : 'Guardar cambios'}</button></div>
      </div>
      {previewOpen && document?.currentVersion && <DocumentPreviewModal name={document.name} version={document.currentVersion.version} mimeType={document.currentVersion.mimeType} objectUrl={preview?.objectUrl ?? null} text={preview?.text ?? null} onClose={closePreview} />}
    </div>
  )
}
