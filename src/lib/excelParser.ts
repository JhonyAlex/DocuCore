import type { Range } from 'xlsx'

export interface ParsedCell {
  formattedText: string
  raw: unknown
  type: string
  align: 'left' | 'right' | 'center'
  rowSpan?: number
  colSpan?: number
  isMergeCovered?: boolean
}

export interface ParsedSheet {
  name: string
  rowCount: number
  colCount: number
  colHeaders: string[]
  rows: (ParsedCell | null)[][]
  isOversized: boolean
  totalRows: number
  totalCols: number
}

export interface ParsedWorkbook {
  sheetNames: string[]
  sheets: Record<string, ParsedSheet>
}

// Global WeakMap cache: Blob -> Promise<ParsedWorkbook>
const workbookCache = new WeakMap<Blob, Promise<ParsedWorkbook>>()

const MAX_DISPLAY_ROWS = 500
const MAX_DISPLAY_COLS = 50
const COMPACT_MAX_ROWS = 15
const COMPACT_MAX_COLS = 10

export async function parseExcelBlob(blob: Blob, compact = false): Promise<ParsedWorkbook> {
  let promise = workbookCache.get(blob)
  if (!promise) {
    promise = doParseExcelBlob(blob)
    workbookCache.set(blob, promise)
  }
  const fullWorkbook = await promise
  if (!compact) return fullWorkbook
  return sliceCompactWorkbook(fullWorkbook)
}

function sliceCompactWorkbook(wb: ParsedWorkbook): ParsedWorkbook {
  const firstSheetName = wb.sheetNames[0]
  if (!firstSheetName || !wb.sheets[firstSheetName]) return wb
  const sheet = wb.sheets[firstSheetName]
  const rows = sheet.rows.slice(0, COMPACT_MAX_ROWS).map((row) => row.slice(0, COMPACT_MAX_COLS))
  return {
    sheetNames: [firstSheetName],
    sheets: {
      [firstSheetName]: {
        ...sheet,
        rowCount: rows.length,
        colCount: Math.min(sheet.colCount, COMPACT_MAX_COLS),
        colHeaders: sheet.colHeaders.slice(0, COMPACT_MAX_COLS),
        rows,
      },
    },
  }
}

async function doParseExcelBlob(blob: Blob): Promise<ParsedWorkbook> {
  const { read, utils } = await import('xlsx')
  const arrayBuffer = await blob.arrayBuffer()
  const workbook = read(new Uint8Array(arrayBuffer), {
    type: 'array',
    cellDates: true,
    cellNF: true,
    cellText: true,
  })

  const sheetNames = workbook.SheetNames || []
  const sheets: Record<string, ParsedSheet> = {}

  for (const name of sheetNames) {
    const ws = workbook.Sheets[name]
    if (!ws || !ws['!ref']) {
      sheets[name] = {
        name,
        rowCount: 0,
        colCount: 0,
        colHeaders: [],
        rows: [],
        isOversized: false,
        totalRows: 0,
        totalCols: 0,
      }
      continue
    }

    const range = utils.decode_range(ws['!ref'])
    const totalRows = Math.max(0, range.e.r - range.s.r + 1)
    const totalCols = Math.max(0, range.e.c - range.s.c + 1)

    if (totalRows === 0 || totalCols === 0) {
      sheets[name] = {
        name,
        rowCount: 0,
        colCount: 0,
        colHeaders: [],
        rows: [],
        isOversized: false,
        totalRows: 0,
        totalCols: 0,
      }
      continue
    }

    const isOversized = totalRows > MAX_DISPLAY_ROWS || totalCols > MAX_DISPLAY_COLS
    const displayRows = Math.min(totalRows, MAX_DISPLAY_ROWS)
    const displayCols = Math.min(totalCols, MAX_DISPLAY_COLS)

    const colHeaders: string[] = []
    for (let c = 0; c < displayCols; c++) {
      colHeaders.push(utils.encode_col(range.s.c + c))
    }

    const merges = (ws['!merges'] || []) as Range[]
    const mergeOriginMap = new Map<string, { rowSpan: number; colSpan: number }>()
    const mergeCoveredSet = new Set<string>()

    for (const m of merges) {
      const startRow = m.s.r - range.s.r
      const startCol = m.s.c - range.s.c
      const endRow = m.e.r - range.s.r
      const endCol = m.e.c - range.s.c

      if (startRow >= displayRows || startCol >= displayCols) continue

      const clampedEndRow = Math.min(endRow, displayRows - 1)
      const clampedEndCol = Math.min(endCol, displayCols - 1)
      const rowSpan = clampedEndRow - startRow + 1
      const colSpan = clampedEndCol - startCol + 1

      if (rowSpan > 1 || colSpan > 1) {
        mergeOriginMap.set(`${startRow}:${startCol}`, { rowSpan, colSpan })

        for (let r = startRow; r <= clampedEndRow; r++) {
          for (let c = startCol; c <= clampedEndCol; c++) {
            if (r !== startRow || c !== startCol) {
              mergeCoveredSet.add(`${r}:${c}`)
            }
          }
        }
      }
    }

    const rows: (ParsedCell | null)[][] = []

    for (let r = 0; r < displayRows; r++) {
      const rowCells: (ParsedCell | null)[] = []
      const actualRow = range.s.r + r

      for (let c = 0; c < displayCols; c++) {
        const actualCol = range.s.c + c
        const key = `${r}:${c}`

        if (mergeCoveredSet.has(key)) {
          rowCells.push({ isMergeCovered: true, formattedText: '', raw: null, type: 'z', align: 'left' })
          continue
        }

        const cellAddress = utils.encode_cell({ r: actualRow, c: actualCol })
        const cell = ws[cellAddress]
        const mergeInfo = mergeOriginMap.get(key)

        if (!cell) {
          rowCells.push(mergeInfo ? {
            formattedText: '',
            raw: null,
            type: 'z',
            align: 'left',
            rowSpan: mergeInfo.rowSpan,
            colSpan: mergeInfo.colSpan,
          } : null)
          continue
        }

        let formattedText = ''
        if (cell.w !== undefined && cell.w !== null) {
          formattedText = String(cell.w)
        } else if (cell.v !== undefined && cell.v !== null) {
          if (cell.t === 'd' && cell.v instanceof Date) {
            formattedText = cell.v.toLocaleDateString('es-ES')
          } else {
            formattedText = String(cell.v)
          }
        }

        let align: 'left' | 'right' | 'center' = 'left'
        if (cell.t === 'n' || cell.t === 'd') align = 'right'
        else if (cell.t === 'b' || cell.t === 'e') align = 'center'

        rowCells.push({
          formattedText,
          raw: cell.v,
          type: cell.t || 's',
          align,
          rowSpan: mergeInfo?.rowSpan,
          colSpan: mergeInfo?.colSpan,
        })
      }
      rows.push(rowCells)
    }

    sheets[name] = {
      name,
      rowCount: displayRows,
      colCount: displayCols,
      colHeaders,
      rows,
      isOversized,
      totalRows,
      totalCols,
    }
  }

  return { sheetNames, sheets }
}
