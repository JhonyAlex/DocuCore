import { useEffect, useRef, useState } from 'react'

export interface AssetImageViewerImage {
  id: number
  url: string
}

export interface AssetImageViewerProps {
  images: AssetImageViewerImage[]
  initialIndex?: number
  name: string
  onClose: () => void
}

// Visor ampliado de fotos del activo: modal anidado (z-[60]) que permite
// visualizar a gran tamaño las imágenes del activo, desplazarse con botones
// o flechas del teclado (← / →), y seleccionar directamente desde la barra
// inferior de miniaturas. Escape/backdrop/✕ cierran solo el visor.
export default function AssetImageViewer({ images, initialIndex = 0, name, onClose }: AssetImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (images.length === 0) return 0
    return Math.max(0, Math.min(initialIndex, images.length - 1))
  })
  const dialogRef = useRef<HTMLDivElement>(null)

  const total = images.length
  const currentImage = images[currentIndex]

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0))
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose, total])

  if (!currentImage) return null

  const prev = () => setCurrentIndex((idx) => (idx > 0 ? idx - 1 : total - 1))
  const next = () => setCurrentIndex((idx) => (idx < total - 1 ? idx + 1 : 0))

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Foto de ${name}`}
        tabIndex={-1}
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl focus:outline-none flex flex-col"
      >
        {/* Cabecera */}
        <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="min-w-0 truncate font-semibold text-lg">
              {total > 1 ? `Foto ${currentIndex + 1} de ${total} · ${name}` : `Foto · ${name}`}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar foto"
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        {/* Escenario principal de la imagen */}
        <div className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4 flex flex-col items-center justify-center bg-slate-950/5 dark:bg-slate-950/40">
          <div className="relative flex items-center justify-center w-full max-w-3xl">
            <img
              key={currentImage.url}
              src={currentImage.url}
              alt={`Foto ${currentIndex + 1} de ${total} de ${name}`}
              className="max-h-[60vh] max-w-full object-contain rounded-lg border border-slate-200 dark:border-slate-800 shadow-md select-none"
            />

            {/* Flechas de navegación sobre el escenario (si hay más de 1 imagen) */}
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Foto anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Foto siguiente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tira inferior de miniaturas (si hay más de 1 imagen) */}
        {total > 1 && (
          <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80 flex items-center justify-center gap-2 overflow-x-auto scrollbar-thin">
            {images.map((image, index) => {
              const isActive = index === currentIndex
              return (
                <button
                  key={image.id || image.url}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`Ver foto ${index + 1} de ${total}`}
                  className={`relative w-14 h-14 rounded-lg overflow-hidden border transition-all shrink-0 ${
                    isActive
                      ? 'border-brand-600 ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-slate-900 scale-105 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img
                    src={image.url}
                    alt={`Miniatura ${index + 1}`}
                    className="w-full h-full object-cover select-none"
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
