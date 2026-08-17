import { useEffect, useRef, useState } from 'react'
import DocumentIconPicker from '@/components/DocumentIconPicker'
import type { ApiDocumentType, DocumentTypeInput } from '@/lib/api'
import { DEFAULT_DOCUMENT_ICON_KEY, type DocumentIconKey } from '../../shared/documentIconCatalog'

interface DocumentTypeFormModalProps {
  type: ApiDocumentType | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: DocumentTypeInput) => void
}

export default function DocumentTypeFormModal({ type, busy, error, onClose, onSubmit }: DocumentTypeFormModalProps) {
  const [name, setName] = useState(type?.name ?? '')
  const [iconKey, setIconKey] = useState<DocumentIconKey>(type?.iconKey ?? DEFAULT_DOCUMENT_ICON_KEY)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(type?.name ?? '')
    setIconKey(type?.iconKey ?? DEFAULT_DOCUMENT_ICON_KEY)
  }, [type])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    inputRef.current?.focus()
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="doc-type-form-title" className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div><div className="text-xs font-mono text-slate-500">{type ? `TIPO ${type.id}` : 'NUEVO TIPO'}</div><h3 id="doc-type-form-title" className="text-lg font-semibold">{type ? 'Editar tipo de documento' : 'Nuevo tipo de documento'}</h3></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">×</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit({ name, iconKey }) }}>
          <div className="space-y-4 p-5">
            {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
            <label className="block text-xs font-medium">Nombre del tipo<input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="Ej. Certificado de calibración" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950" /></label>
            <DocumentIconPicker value={iconKey} disabled={busy} onChange={setIconKey} />
            {type && <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"><p>{type.documentCount ?? 0} documentos asociados</p><p className="mt-1">El icono y el nuevo nombre se reflejarán automáticamente en documentos y filtros.</p></div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700">Cancelar</button><button type="submit" disabled={busy || name.trim() === ''} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Guardando…' : type ? 'Guardar cambios' : 'Crear tipo'}</button></div>
        </form>
      </div>
    </div>
  )
}
