import { useEffect, useRef, useState } from 'react'
import SearchablePicker, { type SearchableOption } from '@/components/SearchablePicker'
import { createDocument, createDocumentVersion, downloadDocument, fetchDocument, fetchItems, updateDocument, type ApiDocument, type ApiDocumentDetail, type DocumentMetadataInput } from '@/lib/api'

type DocumentModalProps = {
  document: ApiDocument | null
  initialItemId?: number | null
  initialItemLabel?: string | null
  onClose: () => void
  onChanged: () => void | Promise<void>
}

const documentTypes = ['Certificado', 'Calibración', 'Manual', 'Acta', 'Contrato']

function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

export default function DocumentModal({ document, initialItemId, initialItemLabel, onClose, onChanged }: DocumentModalProps) {
  const [detail, setDetail] = useState<ApiDocumentDetail | null>(null)
  const [name, setName] = useState(document?.name ?? '')
  const [type, setType] = useState(document?.type ?? documentTypes[0])
  const [itemId, setItemId] = useState<number | null>(document?.itemId ?? initialItemId ?? null)
  const [itemLabel, setItemLabel] = useState<string | null>(
    document?.item ? `${document.item.code} · ${document.item.name}` : (initialItemId ? initialItemLabel ?? null : null),
  )
  const [issueDate, setIssueDate] = useState(dateInput(document?.currentVersion?.issueDate) || new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState(dateInput(document?.currentVersion?.expiryDate))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLInputElement>(null)
  const isNew = !document

  useEffect(() => {
    const previouslyFocused = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
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

  const metadata = (): DocumentMetadataInput => ({ name, type, projectId: 1, itemId, issueDate, expiryDate: expiryDate || null })

  const searchItems = async (query: string): Promise<SearchableOption[]> => {
    const res = await fetchItems({ search: query || undefined, limit: 20 })
    return res.data.map((item) => ({ value: String(item.id), label: `${item.code} · ${item.name}`, hint: item.location?.name }))
  }

  const handleSelectItem = (option: SearchableOption | null) => {
    setItemId(option ? Number(option.value) : null)
    setItemLabel(option ? option.label : null)
  }
  const save = async () => {
    setError(null)
    if (isNew && !file) return setError('Selecciona un fichero para subir el documento.')
    setSaving(true)
    try {
      if (isNew && file) await createDocument(metadata(), file)
      if (!isNew && document) await updateDocument(document.id, { name, type, itemId: itemId ? Number(itemId) : null })
      await onChanged()
      onClose()
    } catch {
      setError('No se pudo guardar el documento. Revisa los datos e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const addVersion = async () => {
    if (!document || !file) return setError('Selecciona el fichero de la nueva versión.')
    setError(null)
    setSaving(true)
    try {
      await createDocumentVersion(document.id, { issueDate, expiryDate: expiryDate || null }, file)
      const next = await fetchDocument(document.id)
      setDetail(next)
      setFile(null)
      await onChanged()
    } catch {
      setError('No se pudo subir la nueva versión.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="document-dialog-title" tabIndex={-1} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 id="document-dialog-title" className="font-semibold text-lg">{isNew ? 'Subir documento' : 'Gestionar documento'}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">Nombre<input ref={initialFocusRef} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
            <label className="text-sm">Tipo<select value={type} onChange={(event) => setType(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">{documentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm">Activo asociado<SearchablePicker value={itemId !== null ? String(itemId) : null} selectedLabel={itemLabel} placeholder="Buscar activo por nombre o código…" ariaLabel="Activo asociado" allowClear clearLabel="Sin activo" disabled={saving} onSearch={searchItems} onSelect={handleSelectItem} /></label>
            <label className="text-sm">Emisión<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
            <label className="text-sm">Vencimiento (opcional)<input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
            <label className="text-sm">{isNew ? 'Fichero' : 'Nueva versión'}<input type="file" accept=".pdf,.xlsx,.xls,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={saving} className="mt-1 block w-full text-xs" /></label>
          </div>
          {!isNew && document && <div className="flex items-center gap-2"><button type="button" onClick={() => void addVersion()} disabled={saving || !file} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-40">Subir nueva versión</button><button type="button" onClick={() => void downloadDocument(document.id)} disabled={saving} className="px-3 py-2 rounded-lg text-brand-600 text-sm">Descargar versión actual</button></div>}
          {detail && document && <div><h3 className="font-medium text-sm mb-2">Historial de versiones</h3><ul className="space-y-1 text-sm">{detail.versions.map((version) => <li key={version.id} className="flex justify-between rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span>v{version.version} · {version.originalName}</span><button type="button" className="text-brand-600" onClick={() => void downloadDocument(document.id, version.version)}>Descargar</button></li>)}</ul></div>}
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">Cancelar</button><button type="button" onClick={() => void save()} disabled={saving} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-40">{saving ? 'Guardando…' : isNew ? 'Subir documento' : 'Guardar cambios'}</button></div>
      </div>
    </div>
  )
}
