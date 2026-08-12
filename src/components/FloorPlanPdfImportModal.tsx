import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

type Rect = { x: number; y: number; width: number; height: number }
type Props = { open: boolean; onClose: () => void; onImport: (file: File) => Promise<void> }

function normalized(start: { x: number; y: number }, end: { x: number; y: number }): Rect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

export default function FloorPlanPdfImportModal({ open, onClose, onImport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const loadingRef = useRef<PDFDocumentLoadingTask | null>(null)
  const previewScaleRef = useRef(1)
  const [pages, setPages] = useState(0); const [pageNumber, setPageNumber] = useState(1)
  const [rect, setRect] = useState<Rect | null>(null); const drag = useRef<{ x: number; y: number } | null>(null)
  const [quality, setQuality] = useState(2); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const clear = () => { setPages(0); setPageNumber(1); setRect(null); setError(null); pdfRef.current = null; void loadingRef.current?.destroy(); loadingRef.current = null }
  useEffect(() => () => clear(), [])
  useEffect(() => { if (!open) clear() }, [open])
  useEffect(() => {
    const render = async () => {
      const pdf = pdfRef.current; const canvas = canvasRef.current
      if (!pdf || !canvas) return
      const page = await pdf.getPage(pageNumber); const base = page.getViewport({ scale: 1 }); const scale = Math.min(1.5, 1800 / base.width)
      const viewport = page.getViewport({ scale }); previewScaleRef.current = scale
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport }).promise; setRect(null)
    }
    void render().catch(() => setError('No se pudo renderizar la página seleccionada.'))
  }, [pageNumber, pages])
  const load = async (file: File | null) => {
    if (!file) return; clear(); setBusy(true)
    try {
      const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      GlobalWorkerOptions.workerSrc = worker.default
      const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) }); loadingRef.current = task
      pdfRef.current = await task.promise; setPages(pdfRef.current.numPages)
    } catch { setError('El PDF no se pudo abrir. Prueba con otro archivo.') } finally { setBusy(false) }
  }
  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => { const box = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - box.left) * (event.currentTarget.width / box.width), y: (event.clientY - box.top) * (event.currentTarget.height / box.height) } }
  const exportRegion = async () => {
    const pdf = pdfRef.current; const canvas = canvasRef.current; if (!pdf || !canvas || !rect || rect.width < 8 || rect.height < 8) return setError('Delimita una zona del plano antes de importar.')
    setBusy(true); setError(null)
    try {
      const page = await pdf.getPage(pageNumber)
      const crop = { x: rect.x / previewScaleRef.current, y: rect.y / previewScaleRef.current, width: rect.width / previewScaleRef.current, height: rect.height / previewScaleRef.current }
      const output = document.createElement('canvas'); output.width = Math.ceil(crop.width * quality); output.height = Math.ceil(crop.height * quality)
      const viewport = page.getViewport({ scale: quality })
      await page.render({ canvas: output, viewport, transform: [1, 0, 0, 1, -crop.x * quality, -crop.y * quality] }).promise
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob((result) => result ? resolve(result) : reject(new Error('PNG export failed')), 'image/png'))
      output.width = 1; output.height = 1
      await onImport(new File([blob], `plano-pdf-p${pageNumber}.png`, { type: 'image/png' }))
      clear(); onClose()
    } catch { setError('No se pudo convertir la región. Puedes ajustar la zona e intentarlo de nuevo.') } finally { setBusy(false) }
  }
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Importar desde PDF" className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Importar desde PDF</h2><button type="button" aria-label="Cerrar" onClick={onClose}>×</button></div>
        <p className="mt-1 text-sm text-slate-500">El PDF se procesa solo en este navegador; se subirá únicamente la región convertida.</p>
        <label className="mt-4 inline-block rounded bg-brand-600 px-3 py-2 text-sm text-white">Elegir PDF<input aria-label="Elegir PDF" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void load(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} /></label>
        {pages > 0 && <>
          <div className="mt-3 flex items-center gap-3"><label className="text-sm">Página <select aria-label="Página PDF" value={pageNumber} onChange={(event) => setPageNumber(Number(event.target.value))}>{Array.from({ length: pages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><label className="text-sm">Calidad <select aria-label="Calidad de importación" value={quality} onChange={(event) => setQuality(Number(event.target.value))}><option value={1.5}>Estándar</option><option value={2}>Alta</option><option value={3}>Muy alta</option></select></label></div>
          <div className="relative mt-3 inline-block max-w-full overflow-auto border"><canvas ref={canvasRef} className="block max-h-[55vh] max-w-full touch-none" onPointerDown={(event) => { drag.current = pointer(event); event.currentTarget.setPointerCapture(event.pointerId); setRect({ ...drag.current, width: 0, height: 0 }) }} onPointerMove={(event) => { if (drag.current) setRect(normalized(drag.current, pointer(event))) }} onPointerUp={() => { drag.current = null }} />{rect && <div className="pointer-events-none absolute border-2 border-brand-500 bg-brand-500/10" style={{ left: `${(rect.x / (canvasRef.current?.width || 1)) * 100}%`, top: `${(rect.y / (canvasRef.current?.height || 1)) * 100}%`, width: `${(rect.width / (canvasRef.current?.width || 1)) * 100}%`, height: `${(rect.height / (canvasRef.current?.height || 1)) * 100}%` }} />}</div>
        </>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">Cancelar</button><button type="button" disabled={busy || !rect} onClick={() => void exportRegion()} className="rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-40">{busy ? 'Convirtiendo…' : 'Convertir e importar'}</button></div>
      </div>
    </div>
  )
}
