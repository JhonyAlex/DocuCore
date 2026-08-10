import { useEffect, useRef } from 'react'
import PdfPreview from '@/components/PdfPreview'

// Cuerpo de la vista previa: PDF renderizado con pdf.js en canvas propios
// (PdfPreview: sin la barra del visor nativo y siempre desde arriba), imágenes
// en <img> y texto plano en <pre>. El iframe queda solo como respaldo si el
// PDF llegara sin blob (no ocurre en el flujo normal). Los formatos sin vista
// previa del navegador (xlsx/xls) se resuelven antes de llegar aquí (el área
// de vista previa queda deshabilitada en el modal); el mensaje se mantiene
// como respaldo por si llega otro MIME. `compact` es el modo incrustado del
// modal (alturas pequeñas, sin interacción interna: el clic abre el visor);
// el visor usa el modo completo.
export function DocumentPreviewBody({ name, mimeType, objectUrl, text, blob, compact = false }: {
  name: string
  mimeType: string
  objectUrl: string | null
  text: string | null
  blob: Blob | null
  compact?: boolean
}) {
  const isPdf = mimeType === 'application/pdf'
  const isImage = mimeType.startsWith('image/')
  const isText = mimeType.startsWith('text/')

  if (isPdf && blob) {
    return <PdfPreview blob={blob} name={name} compact={compact} />
  }
  if (isPdf && objectUrl) {
    return <iframe title={`Vista previa de ${name}`} src={objectUrl} className={compact ? 'pointer-events-none h-56 w-full' : 'h-[70vh] w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800'} />
  }
  if (isImage && objectUrl) {
    return <img src={objectUrl} alt={name} className={compact ? 'pointer-events-none max-h-56 w-full object-contain' : 'max-h-[70vh] mx-auto rounded-lg border border-slate-200 dark:border-slate-800'} />
  }
  if (isText) {
    return <pre className={compact ? 'pointer-events-none whitespace-pre-wrap text-xs overflow-hidden max-h-40 p-3' : 'whitespace-pre-wrap text-sm overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3'}>{text ?? ''}</pre>
  }
  return <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400"><p>Este formato no tiene vista previa en el navegador.</p><p className="mt-1">Descarga esta versión para visualizarla.</p></div>
}

type DocumentPreviewModalProps = {
  name: string
  version: number
  mimeType: string
  objectUrl: string | null
  text: string | null
  blob: Blob | null
  onClose: () => void
}

// Visor de la versión actual: modal anidado (z-[60]) que muestra a tamaño
// completo el contenido ya cargado por el modal padre (no vuelve a pedir el
// fichero). Escape/backdrop/✕ cierran solo el visor; el modal padre guarda
// su propio Escape mientras está abierto.
export default function DocumentPreviewModal({ name, version, mimeType, objectUrl, text, blob, onClose }: DocumentPreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.document.addEventListener('keydown', closeOnEscape)
    dialogRef.current?.focus()
    return () => {
      window.document.removeEventListener('keydown', closeOnEscape)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Vista previa de ${name}`} tabIndex={-1} className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none flex flex-col">
        <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate font-semibold text-lg">Vista previa · {name} · v{version}</h2>
          <button type="button" aria-label="Cerrar vista previa" onClick={onClose} className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
          <DocumentPreviewBody name={name} mimeType={mimeType} objectUrl={objectUrl} text={text} blob={blob} />
        </div>
      </div>
    </div>
  )
}
