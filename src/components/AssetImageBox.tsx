import { useEffect, useRef, useState } from 'react'
import { removeAssetImage, uploadAssetImage, type ApiAsset } from '@/lib/api'
import ConfirmDialog from '@/components/ConfirmDialog'

// IMG-01: placeholder del HTML de referencia (mismo SVG de la ficha del activo).
export function AssetImagePlaceholder({ className = 'w-20 h-20 text-slate-300' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  )
}

// Visor de la foto del activo: modal anidado (z-[60]) que muestra a tamaño
// completo la imagen ya cargada por la ficha (no vuelve a pedir el fichero).
// Escape/backdrop/✕ cierran solo el visor; la ficha guarda su propio Escape
// mientras está abierto (mismo patrón que DocumentPreviewModal).
export function AssetImageViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Foto de ${name}`} tabIndex={-1} className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none flex flex-col">
        <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate font-semibold text-lg">Foto · {name}</h2>
          <button type="button" aria-label="Cerrar foto" onClick={onClose} className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
          <img src={src} alt={`Foto de ${name}`} className="max-h-[70vh] mx-auto rounded-lg border border-slate-200 dark:border-slate-800" />
        </div>
      </div>
    </div>
  )
}

interface AssetImageBoxProps {
  asset: ApiAsset
  onChanged: (asset: ApiAsset) => void
  // Abre el visor ampliado de la foto (la toca la ficha del activo).
  onView?: () => void
}

// IMG-01: cuadro de imagen de la ficha del activo. Muestra la foto (o el
// placeholder, idéntico al HTML de referencia en reposo) y permite subirla,
// cambiarla o quitarla desde el hover. La subida es inmediata al elegir el fichero.
export default function AssetImageBox({ asset, onChanged, onView }: AssetImageBoxProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeRequested, setRemoveRequested] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = (file: File | null) => {
    if (!file || busy) return
    void (async () => {
      setError(null)
      setBusy(true)
      try {
        const updated = await uploadAssetImage(asset.id, file)
        onChanged(updated)
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir la imagen.')
      } finally {
        setBusy(false)
      }
    })()
  }

  const remove = async () => {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await removeAssetImage(asset.id)
      onChanged({ ...asset, imageUrl: null, imageMimeType: null, imageSizeBytes: null })
      setRemoveRequested(false)
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo quitar la imagen.')
    } finally {
      setBusy(false)
    }
  }

  const hasImage = asset.imageUrl !== null

  return (
    <div>
      <div
        className={`group relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center aspect-square ${hasImage ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500' : ''}`}
        role={hasImage ? 'button' : undefined}
        tabIndex={hasImage ? 0 : undefined}
        aria-label={hasImage ? `Abrir foto de ${asset.name}` : undefined}
        aria-haspopup={hasImage ? 'dialog' : undefined}
        onClick={hasImage && !busy && onView ? () => onView() : undefined}
        onKeyDown={hasImage ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!busy && onView) onView() } } : undefined}
      >
        {hasImage ? (
          <img src={asset.imageUrl ?? undefined} alt={`Foto de ${asset.name}`} className="h-full w-full object-cover" />
        ) : (
          <AssetImagePlaceholder />
        )}
        {busy && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40">
            <div role="status" aria-label="Subiendo imagen" className="w-8 h-8 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          </div>
        )}
        {!busy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-900/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              {hasImage ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {hasImage && (
              <button type="button" onClick={(event) => { event.stopPropagation(); setError(null); setRemoveRequested(true) }} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs">
                Quitar
              </button>
            )}
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Subir imagen del activo" className="sr-only" onChange={(event) => { pick(event.target.files?.[0] ?? null); event.target.value = '' }} />
      </div>
      {error && !removeRequested && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <ConfirmDialog
        open={removeRequested}
        title="Quitar foto"
        message={<>La foto de <span className="font-medium text-slate-900 dark:text-slate-100">{asset.name}</span> se eliminará del activo. ¿Continuar?</>}
        confirmLabel="Quitar foto"
        busyLabel="Quitando…"
        busy={busy}
        error={error}
        onConfirm={() => void remove()}
        onCancel={() => { setRemoveRequested(false); setError(null) }}
        variant="danger"
      />
    </div>
  )
}
