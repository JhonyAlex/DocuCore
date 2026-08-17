import { useEffect, useRef, useState } from 'react'
import { removeAssetImage, uploadAssetImages, type ApiAsset, type ApiAssetImage } from '@/lib/api'
import ConfirmDialog from '@/components/ConfirmDialog'

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
  onView?: (initialIndex: number) => void
}

export default function AssetImageBox({ asset, onChanged, onView }: AssetImageBoxProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeRequested, setRemoveRequested] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const rawImages: ApiAssetImage[] = asset.images && asset.images.length > 0
    ? asset.images
    : (asset.imageUrl ? [{ id: 0, url: asset.imageUrl, mimeType: asset.imageMimeType ?? 'image/jpeg', sizeBytes: asset.imageSizeBytes ?? 0, sortOrder: 0 }] : [])

  const total = rawImages.length
  const hasImages = total > 0

  useEffect(() => {
    if (activeImageIndex >= total && total > 0) {
      setActiveImageIndex(total - 1)
    }
  }, [activeImageIndex, total])

  const currentImage = hasImages ? rawImages[Math.min(activeImageIndex, total - 1)] : null

  const pick = (files: FileList | null) => {
    if (!files || files.length === 0 || busy) return
    const fileArray = Array.from(files)
    const availableSlots = 5 - total
    if (availableSlots <= 0) {
      setError('El activo ya tiene el máximo de 5 imágenes.')
      return
    }
    const filesToUpload = fileArray.slice(0, availableSlots)
    void (async () => {
      setError(null)
      setBusy(true)
      try {
        const updated = await uploadAssetImages(asset.projectId, asset.id, filesToUpload)
        onChanged(updated)
        if (updated.images && updated.images.length > 0) {
          setActiveImageIndex(updated.images.length - 1)
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'No se pudieron subir las imágenes.')
      } finally {
        setBusy(false)
      }
    })()
  }

  const removeCurrent = async () => {
    if (!currentImage || busy) return
    setError(null)
    setBusy(true)
    try {
      const isSpecific = currentImage.id > 0
      await removeAssetImage(asset.projectId, asset.id, isSpecific ? currentImage.id : undefined)
      const remainingImages = rawImages.filter((img) => img.id !== currentImage.id)
      onChanged({
        ...asset,
        images: remainingImages,
        imageUrl: remainingImages[0]?.url ?? null,
        imageMimeType: remainingImages[0]?.mimeType ?? null,
        imageSizeBytes: remainingImages[0]?.sizeBytes ?? null,
      })
      setRemoveRequested(false)
      if (activeImageIndex > 0) {
        setActiveImageIndex((prev) => prev - 1)
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo quitar la imagen.')
    } finally {
      setBusy(false)
    }
  }

  const prevImage = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : total - 1))
  }

  const nextImage = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActiveImageIndex((prev) => (prev < total - 1 ? prev + 1 : 0))
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`group relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center aspect-square ${hasImages ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500' : ''}`}
        role={hasImages ? 'button' : undefined}
        tabIndex={hasImages ? 0 : undefined}
        aria-label={hasImages ? `Abrir foto de ${asset.name}` : undefined}
        aria-haspopup={hasImages ? 'dialog' : undefined}
        onClick={hasImages && !busy && onView ? () => onView(activeImageIndex) : undefined}
        onKeyDown={hasImages ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!busy && onView) onView(activeImageIndex) } } : undefined}
      >
        {hasImages && currentImage ? (
          <img src={currentImage.url} alt={`Foto de ${asset.name}`} className="h-full w-full object-cover select-none" />
        ) : (
          <AssetImagePlaceholder />
        )}

        {/* Indicador de posición (ej. 1/3) si hay múltiples fotos */}
        {total > 1 && (
          <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-slate-900/70 text-white text-[11px] font-mono tracking-tight pointer-events-none backdrop-blur-sm">
            {activeImageIndex + 1}/{total}
          </div>
        )}

        {/* Flechas de navegación en la miniatura de la ficha */}
        {total > 1 && !busy && (
          <>
            <button
              type="button"
              onClick={prevImage}
              aria-label="Foto anterior en la ficha"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full bg-slate-900/60 hover:bg-slate-900 text-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              type="button"
              onClick={nextImage}
              aria-label="Foto siguiente en la ficha"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full bg-slate-900/60 hover:bg-slate-900 text-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </>
        )}

        {busy && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40">
            <div role="status" aria-label="Procesando imagen" className="w-8 h-8 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          </div>
        )}

        {!busy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-slate-900/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            {total < 5 && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-medium backdrop-blur-sm"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                {hasImages ? 'Añadir foto' : 'Subir foto'}
              </button>
            )}
            {hasImages && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setError(null); setRemoveRequested(true) }}
                className="px-3 py-1 rounded-lg bg-red-600/80 hover:bg-red-600 text-xs font-medium text-white backdrop-blur-sm"
              >
                Quitar foto
              </button>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          aria-label="Subir imagen del activo"
          className="sr-only"
          onChange={(event) => { pick(event.target.files); event.target.value = '' }}
        />
      </div>

      {/* Barra de miniaturas en la ficha de activo */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 overflow-x-auto p-1">
          {rawImages.map((img, idx) => {
            const isActive = idx === activeImageIndex
            return (
              <button
                key={img.id || img.url}
                type="button"
                onClick={() => setActiveImageIndex(idx)}
                aria-label={`Seleccionar foto ${idx + 1}`}
                className={`w-8 h-8 rounded overflow-hidden border transition-all shrink-0 ${
                  isActive ? 'border-brand-600 ring-2 ring-brand-500 scale-105 shadow-sm' : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={img.url} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover select-none" />
              </button>
            )
          })}
        </div>
      )}

      {error && !removeRequested && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <ConfirmDialog
        open={removeRequested}
        title="Quitar foto"
        message={<>La foto seleccionada de <span className="font-medium text-slate-900 dark:text-slate-100">{asset.name}</span> se eliminará del activo. ¿Continuar?</>}
        confirmLabel="Quitar foto"
        busyLabel="Quitando…"
        busy={busy}
        error={error}
        onConfirm={() => void removeCurrent()}
        onCancel={() => { setRemoveRequested(false); setError(null) }}
        variant="danger"
      />
    </div>
  )
}
