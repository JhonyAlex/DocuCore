import { useEffect, useState } from 'react'
import type { ApiAsset } from '@/lib/api'
import { AssetImagePlaceholder } from '@/components/AssetImageBox'
import ConfirmDialog from '@/components/ConfirmDialog'

interface AssetImagePickerProps {
  asset: ApiAsset | null
  value: File | null
  onChange: (file: File | null) => void
}

// IMG-01: selector de imagen del formulario de activo. Solo selecciona el
// fichero — la subida ocurre al guardar el formulario. Muestra preview local
// del fichero elegido o, en edición sin fichero nuevo, la imagen actual.
export default function AssetImagePicker({ asset, value, onChange }: AssetImagePickerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [discardRequested, setDiscardRequested] = useState(false)

  useEffect(() => {
    if (!value) {
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(value)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  const currentImageUrl = objectUrl ?? (asset?.imageUrl ?? null)
  const hasPreview = currentImageUrl !== null

  return (
    <div>
      <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Imagen del activo</div>
      <div className="flex items-center gap-4">
        <div className="w-36 shrink-0 aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center">
          {hasPreview ? (
            <img src={currentImageUrl} alt="Vista previa de la imagen del activo" className="h-full w-full object-cover" />
          ) : (
            <AssetImagePlaceholder className="w-10 h-10 text-slate-300" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="asset-image-file" className="inline-flex w-fit cursor-pointer items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            {hasPreview ? 'Cambiar imagen' : 'Elegir imagen'}
            <input id="asset-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
          </label>
          {value && (
            <button type="button" onClick={() => setDiscardRequested(true)} className="w-fit px-3 py-1 rounded-lg text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              Descartar selección
            </button>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, WebP o GIF · máx. 10 MB</p>
        </div>
      </div>
      <ConfirmDialog
        open={discardRequested}
        title="Descartar imagen seleccionada"
        message="La imagen elegida se quitará del formulario y no se subirá al guardar. ¿Continuar?"
        confirmLabel="Descartar selección"
        onConfirm={() => { onChange(null); setDiscardRequested(false) }}
        onCancel={() => setDiscardRequested(false)}
        variant="danger"
      />
    </div>
  )
}
