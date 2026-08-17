import { useEffect, useState } from 'react'
import type { ApiAsset } from '@/lib/api'
import ConfirmDialog from '@/components/ConfirmDialog'

interface AssetImagePickerProps {
  asset: ApiAsset | null
  value: File[]
  onChange: (files: File[]) => void
}

interface LocalFilePreview {
  file: File
  url: string
}

// IMG-01: selector de imágenes del formulario de activo. Permite seleccionar
// hasta 5 imágenes con preview local de los ficheros elegidos e indicación
// de las imágenes existentes en modo edición. La subida real ocurre al guardar.
export default function AssetImagePicker({ asset, value, onChange }: AssetImagePickerProps) {
  const [previews, setPreviews] = useState<LocalFilePreview[]>([])
  const [discardIndex, setDiscardIndex] = useState<number | null>(null)

  useEffect(() => {
    const newPreviews = value.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setPreviews(newPreviews)
    return () => {
      for (const p of newPreviews) URL.revokeObjectURL(p.url)
    }
  }, [value])

  const existingImages = asset?.images && asset.images.length > 0
    ? asset.images
    : (asset?.imageUrl ? [{ id: 0, url: asset.imageUrl }] : [])

  const totalCount = existingImages.length + value.length
  const canAddMore = totalCount < 5

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    const availableSlots = 5 - totalCount
    if (availableSlots <= 0) return
    const allowedFiles = fileArray.slice(0, availableSlots)
    onChange([...value, ...allowedFiles])
  }

  const removeFileAt = (index: number) => {
    const updated = value.filter((_, idx) => idx !== index)
    onChange(updated)
    setDiscardIndex(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Imágenes del activo {totalCount > 0 && <span className="font-mono text-slate-400">({totalCount}/5)</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Imágenes existentes del activo (si está en edición) */}
        {existingImages.map((img, idx) => (
          <div
            key={img.id || img.url}
            className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0 group"
          >
            <img src={img.url} alt={`Imagen ${idx + 1}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="text-[10px] text-white font-medium bg-slate-900/80 px-1.5 py-0.5 rounded">Guardada</span>
            </div>
          </div>
        ))}

        {/* Nuevos ficheros seleccionados pendientes de subida */}
        {previews.map((preview, idx) => (
          <div
            key={preview.url}
            className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-brand-400 dark:border-brand-600 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0 group"
          >
            <img src={preview.url} alt={`Nueva ${idx + 1}`} className="w-full h-full object-cover" />
            <div className="absolute top-1 right-1">
              <button
                type="button"
                aria-label={`Descartar imagen ${idx + 1}`}
                onClick={() => setDiscardIndex(idx)}
                className="w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center text-xs shadow-md font-bold"
              >
                ✕
              </button>
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-brand-600/90 text-white text-[9px] font-medium text-center py-0.5 pointer-events-none">
              Nueva
            </div>
          </div>
        ))}

        {/* Botón para añadir más imágenes (si < 5) */}
        {canAddMore && (
          <label
            htmlFor="asset-image-file"
            className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 bg-slate-50 dark:bg-slate-800/30 hover:bg-brand-50/20 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors shrink-0 text-slate-500 dark:text-slate-400 hover:text-brand-600"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-[11px] font-medium text-center leading-tight">
              {totalCount === 0 ? 'Añadir foto' : '＋ Añadir'}
            </span>
            <input
              id="asset-image-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={(event) => {
                handleFilesAdded(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
        )}

        {/* Placeholder si no hay ninguna imagen y no se ha añadido */}
        {totalCount === 0 && (
          <div className="text-xs text-slate-400 dark:text-slate-500">
            Hasta 5 imágenes · PNG, JPG, WebP o GIF · máx. 10 MB por archivo
          </div>
        )}
      </div>

      <ConfirmDialog
        open={discardIndex !== null}
        title="Descartar imagen seleccionada"
        message="La imagen elegida se quitará del formulario y no se subirá al guardar. ¿Continuar?"
        confirmLabel="Descartar selección"
        onConfirm={() => {
          if (discardIndex !== null) removeFileAt(discardIndex)
        }}
        onCancel={() => setDiscardIndex(null)}
        variant="danger"
      />
    </div>
  )
}
