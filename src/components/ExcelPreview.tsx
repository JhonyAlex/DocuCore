import { useEffect, useState } from 'react'
import { parseExcelBlob, type ParsedWorkbook, type ParsedSheet } from '@/lib/excelParser'

type ExcelPreviewProps = {
  blob: Blob
  name: string
  compact?: boolean
}

export default function ExcelPreview({ blob, compact = false }: ExcelPreviewProps) {
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setWorkbook(null)

    parseExcelBlob(blob, compact)
      .then((parsed) => {
        if (cancelled) return
        if (parsed.sheetNames.length === 0) {
          setStatus('empty')
          return
        }
        setWorkbook(parsed)
        setActiveSheetIndex(0)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [blob, compact])

  if (status === 'loading') {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 ${compact ? 'h-48' : 'h-[60vh]'}`}>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <svg className="w-5 h-5 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>Cargando hoja de cálculo…</span>
        </div>
      </div>
    )
  }

  if (status === 'error' || !workbook) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
        <p className="font-medium">No se pudo generar la vista previa de esta hoja de cálculo.</p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">El archivo puede estar dañado o en un formato no estándar. Descarga el archivo para visualizarlo en tu aplicación de hojas de cálculo.</p>
      </div>
    )
  }

  const activeSheetName = workbook.sheetNames[activeSheetIndex] || workbook.sheetNames[0]
  const currentSheet: ParsedSheet | undefined = workbook.sheets[activeSheetName]

  const renderSheetTabs = () => {
    if (compact || workbook.sheetNames.length <= 1) return null
    return (
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-1 scrollbar-thin">
        {workbook.sheetNames.map((sheetName, index) => {
          const isActive = index === activeSheetIndex
          return (
            <button
              key={sheetName}
              type="button"
              onClick={() => setActiveSheetIndex(index)}
              className={`px-3 py-1.5 text-xs rounded-t font-medium transition whitespace-nowrap ${
                isActive
                  ? 'bg-slate-200/80 dark:bg-slate-800 text-brand-600 dark:text-brand-400 border-b-2 border-brand-500 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {sheetName}
            </button>
          )
        })}
      </div>
    )
  }

  if (!currentSheet || currentSheet.rowCount === 0) {
    return (
      <div className="space-y-2">
        {renderSheetTabs()}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
          Esta hoja está vacía.
        </div>
      </div>
    )
  }

  return (
    <div className={`excel-preview flex flex-col select-text ${compact ? 'max-h-56 pointer-events-none' : 'max-h-[75vh]'}`}>
      {!compact && currentSheet.isOversized && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
          Esta hoja es demasiado grande para mostrarla completamente en el navegador. Se está mostrando una vista limitada (primeras {currentSheet.rowCount} filas y {currentSheet.colCount} columnas). Puedes descargar el archivo original para consultarlo completo.
        </div>
      )}

      {!compact && renderSheetTabs()}

      <div className={`overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 scrollbar-thin ${compact ? 'max-h-48' : 'max-h-[65vh]'}`}>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 select-none">
              <th className="sticky top-0 left-0 z-20 w-10 min-w-[2.5rem] border-b border-r border-slate-200 dark:border-slate-700 bg-slate-200/70 dark:bg-slate-800 px-2 py-1.5 text-center text-[10px] font-semibold">
                #
              </th>
              {currentSheet.colHeaders.map((colHeader) => (
                <th
                  key={colHeader}
                  className="sticky top-0 z-10 min-w-[5rem] border-b border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 px-2 py-1.5 text-center font-semibold"
                >
                  {colHeader}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 px-1.5 py-1 text-center font-mono text-[10px] text-slate-500 dark:text-slate-400 select-none">
                  {rowIndex + 1}
                </td>
                {row.map((cell, colIndex) => {
                  if (cell?.isMergeCovered) return null
                  return (
                    <td
                      key={colIndex}
                      rowSpan={cell?.rowSpan}
                      colSpan={cell?.colSpan}
                      className={`border-b border-r border-slate-200 dark:border-slate-800 px-2 py-1 text-slate-800 dark:text-slate-200 whitespace-nowrap ${
                        cell?.align === 'right' ? 'text-right' : cell?.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {cell ? cell.formattedText : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
