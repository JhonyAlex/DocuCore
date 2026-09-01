import { DocumentPreviewBody } from '@/components/DocumentPreviewModal'
import { isViewableMimeType } from '@/lib/documentPreview'

export interface ActivePreviewItem {
  title: string
  subTitle?: string
  version: number
  mimeType: string
  isHistorical: boolean
  objectUrl: string | null
  text: string | null
  blob: Blob | null
  downloadAction?: () => void
}

interface DocumentPreviewPaneProps {
  activePreview: ActivePreviewItem | null
  loading: boolean
  error: boolean
  isNew: boolean
  hasNewFiles: boolean
  onResetToCurrent: () => void
  onExpand: () => void
}

export default function DocumentPreviewPane({
  activePreview,
  loading,
  error,
  isNew,
  hasNewFiles,
  onResetToCurrent,
  onExpand,
}: DocumentPreviewPaneProps) {
  const isViewable = activePreview ? isViewableMimeType(activePreview.mimeType) : false

  return (
    <div className="flex flex-col h-full min-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 overflow-hidden shadow-inner">
      {/* Barra superior de herramientas del visor */}
      <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
            {activePreview ? activePreview.title : isNew ? 'Vista previa del nuevo documento' : 'Vista previa del documento'}
          </span>
          {activePreview?.isHistorical && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Versión histórica (v{activePreview.version})
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {activePreview?.isHistorical && (
            <button
              type="button"
              onClick={onResetToCurrent}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/50 dark:hover:bg-brand-900/50 transition-colors"
            >
              ← Volver a versión vigente
            </button>
          )}

          {activePreview?.downloadAction && (
            <button
              type="button"
              onClick={activePreview.downloadAction}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Descargar archivo visualizado"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Descargar</span>
            </button>
          )}

          {isViewable && (
            <button
              type="button"
              onClick={onExpand}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium transition-colors shadow-sm"
              title="Ampliar vista previa a pantalla completa"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <span>Ampliar</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de aviso cuando se ve una versión histórica */}
      {activePreview?.isHistorical && (
        <div className="shrink-0 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">⚠️</span>
            <span>Estás consultando una versión histórica anterior. Los datos del formulario corresponden al documento general.</span>
          </div>
          <button
            type="button"
            onClick={onResetToCurrent}
            className="font-medium underline hover:text-amber-900 dark:hover:text-amber-200 shrink-0 ml-2"
          >
            Ver versión actual
          </button>
        </div>
      )}

      {/* Cuerpo del visor con scroll propio */}
      <div className="min-h-0 flex-1 p-4 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400 gap-2">
            <svg className="w-6 h-6 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-xs">Cargando vista previa del documento…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No se pudo cargar la vista previa</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              Descarga el archivo directamente para consultarlo en tu equipo.
            </p>
          </div>
        ) : isNew ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {hasNewFiles ? 'Archivos listos para registrar' : 'Nuevo documento'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              {hasNewFiles
                ? 'Completa los metadatos a la izquierda y pulsa "Subir documento" para guardar.'
                : 'Selecciona los ficheros a la izquierda para completar el registro documental.'}
            </p>
          </div>
        ) : activePreview && isViewable ? (
          <div className="w-full">
            <DocumentPreviewBody
              name={activePreview.title}
              mimeType={activePreview.mimeType}
              objectUrl={activePreview.objectUrl}
              text={activePreview.text}
              blob={activePreview.blob}
              compact={false}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg bg-white/50 dark:bg-slate-900/30">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="9" x2="15" y2="15" />
                <line x1="15" y1="9" x2="9" y2="15" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sin vista previa para este formato
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              Este tipo de archivo no dispone de visor web incrustado. Puedes descargarlo para consultarlo.
            </p>
            {activePreview?.downloadAction && (
              <button
                type="button"
                onClick={activePreview.downloadAction}
                className="mt-4 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shadow-sm"
              >
                Descargar archivo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
