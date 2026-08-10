import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

type PdfPreviewProps = {
  blob: Blob
  name: string
  compact?: boolean
}

// Vista previa de PDF renderizada con pdf.js en canvas propios, en lugar del
// visor nativo del navegador (cuya barra de herramientas no se puede ocultar y
// que conserva la posición de scroll entre la vista incrustada y el visor).
// Cada montaje renderiza desde la página 1 y el scroll es del contenedor
// propio (que arranca en 0), de modo que la vista previa siempre muestra el
// documento desde arriba. `compact` es el modo incrustado del modal (altura
// fija, recorta mostrando la parte superior y no captura el clic: el wrapper
// `role="button"` del modal abre el visor); el visor usa el modo completo.
export default function PdfPreview({ blob, name, compact = false }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    let pdf: PDFDocumentProxy | null = null
    let renderToken = 0
    let renderedScale = 0
    let timer: number | undefined
    let resizeObserver: ResizeObserver | null = null

    const renderPages = async (scale: number) => {
      if (!pdf || cancelled) return
      const token = ++renderToken
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled || token !== renderToken) return
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale })
          let canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${i}"]`)
          if (!canvas) {
            canvas = document.createElement('canvas')
            canvas.dataset.page = String(i)
            canvas.className = 'block w-full h-auto'
            container.appendChild(canvas)
          }
          canvas.width = Math.max(1, Math.floor(viewport.width))
          canvas.height = Math.max(1, Math.floor(viewport.height))
          await page.render({ canvas, viewport }).promise
          if (i === 1 && !cancelled) setStatus('ready')
        }
      } catch {
        if (!cancelled && token === renderToken) setStatus('error')
      }
    }

    // Escala fit-width × devicePixelRatio para que el canvas sea nítido;
    // re-renderiza solo si la escala calculada cambia de forma apreciable.
    const schedule = async () => {
      if (!pdf || cancelled) return
      const width = container.clientWidth
      if (width === 0) return
      const first = await pdf.getPage(1)
      const base = first.getViewport({ scale: 1 })
      const scale = (width / base.width) * (window.devicePixelRatio || 1)
      if (Math.abs(scale - renderedScale) <= 0.05) return
      renderedScale = scale
      await renderPages(scale)
    }

    const load = async () => {
      try {
        const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        if (cancelled) return
        GlobalWorkerOptions.workerSrc = worker.default
        const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        loadingTask = task
        pdf = await task.promise
        if (cancelled) {
          void task.destroy()
          return
        }
        await schedule()
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    void load()

    resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void schedule(), 100)
    })
    resizeObserver.observe(container)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      renderToken += 1
      resizeObserver?.disconnect()
      if (loadingTask) void loadingTask.destroy()
    }
  }, [blob, name])

  return (
    <div ref={containerRef} className={`pdf-preview ${compact ? 'pointer-events-none max-h-56 overflow-hidden' : 'max-h-[70vh] overflow-y-auto scrollbar-thin rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800'}`}>
      {status === 'loading' && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando vista previa…</p>}
      {status === 'error' && <p role="alert" className="p-4 text-sm text-red-600 dark:text-red-400">No se pudo mostrar la vista previa. Descarga el archivo para visualizarlo.</p>}
    </div>
  )
}
