import { useRef, useState } from 'react'
import { deleteAssetImage, uploadAssetImage, type ApiAsset } from '@/lib/api'

// IMG-01: placeholder del HTML de referencia (mismo SVG de la ficha del activo).
export function AssetImagePlaceholder({ className = 'w-20 h-20 text-slate-300' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  )
}

interface AssetImageBoxProps {
  asset: ApiAsset
  onChanged: (asset: ApiAsset) => void
}

// IMG-01: cuadro de imagen de la ficha del activo. Muestra la foto (o el
// placeholder, idéntico al HTML de referencia en reposo) y permite subirla,
// cambiarla o quitarla desde el hover. La subida es inmediata al elegir el fichero.
export default function AssetImageBox({ asset, onChanged }: AssetImageBoxProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      await deleteAssetImage(asset.id)
      onChanged({ ...asset, imageUrl: null, imageMimeType: null, imageSizeBytes: null })
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo quitar la imagen.')
    } finally {
      setBusy(false)
    }
  }

  const hasImage = asset.imageUrl !== null

  return (
    <div>
      <div className="group relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center aspect-square">
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
            <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              {hasImage ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {hasImage && (
              <button type="button" onClick={() => void remove()} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs">
                Quitar
              </button>
            )}
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Subir imagen del activo" className="sr-only" onChange={(event) => { pick(event.target.files?.[0] ?? null); event.target.value = '' }} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
