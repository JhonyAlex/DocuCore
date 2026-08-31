import { describe, expect, it } from 'vitest'
import { parseExcelBlob } from '../../src/lib/excelParser'
import { createSampleWorkbookBuffer } from '../helpers/excelFixture'

describe('excelParser', () => {
  it('parses a valid multi-sheet workbook with merges, formats, and empty cells', async () => {
    const buffer = createSampleWorkbookBuffer()
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const parsed = await parseExcelBlob(blob)
    expect(parsed.sheetNames).toEqual(['Inventario', 'Mantenimiento'])

    // Sheet 1
    const s1 = parsed.sheets['Inventario']
    expect(s1).toBeDefined()
    expect(s1.rowCount).toBe(6)
    expect(s1.colCount).toBe(4)
    expect(s1.colHeaders).toEqual(['A', 'B', 'C', 'D'])

    // Merged cell A1:D1
    const cellA1 = s1.rows[0][0]
    expect(cellA1?.formattedText).toBe('Resumen de Equipos y Calibración')
    expect(cellA1?.rowSpan).toBe(1)
    expect(cellA1?.colSpan).toBe(4)

    // Covered cells B1, C1, D1
    expect(s1.rows[0][1]?.isMergeCovered).toBe(true)
    expect(s1.rows[0][2]?.isMergeCovered).toBe(true)
    expect(s1.rows[0][3]?.isMergeCovered).toBe(true)

    // Data rows
    const row2 = s1.rows[2] // MG-203, Manómetro digital, 5, Operativo
    expect(row2[0]?.formattedText).toBe('MG-203')
    expect(row2[1]?.formattedText).toBe('Manómetro digital')
    expect(row2[2]?.formattedText).toBe('5')
    expect(row2[2]?.align).toBe('right')
    expect(row2[3]?.formattedText).toBe('Operativo')

    // Empty cell in row 4: CNC-05, "", 2, En espera
    const row4 = s1.rows[4]
    expect(row4[0]?.formattedText).toBe('CNC-05')
    expect(row4[1]?.formattedText).toBe('')
    expect(row4[2]?.formattedText).toBe('2')

    // Sheet 2
    const s2 = parsed.sheets['Mantenimiento']
    expect(s2).toBeDefined()
    expect(s2.rowCount).toBe(3)
    expect(s2.colCount).toBe(4)
    expect(s2.rows[1][0]?.formattedText).toBe('15/07/2026')
    expect(s2.rows[1][1]?.formattedText).toBe('Calibración anual')
    expect(s2.rows[1][2]?.formattedText).toBe('Juan Pérez')
    expect(s2.rows[1][3]?.formattedText).toBe('150 €')
  })

  it('re-uses cache when parsing the same Blob reference', async () => {
    const buffer = createSampleWorkbookBuffer()
    const blob = new Blob([new Uint8Array(buffer)])

    const p1 = await parseExcelBlob(blob)
    const p2 = await parseExcelBlob(blob)
    expect(p1).toBe(p2) // Same object from WeakMap cache
  })

  it('provides compact slice for embedded preview', async () => {
    const buffer = createSampleWorkbookBuffer()
    const blob = new Blob([new Uint8Array(buffer)])

    const compact = await parseExcelBlob(blob, true)
    expect(compact.sheetNames).toEqual(['Inventario'])
    expect(compact.sheets['Inventario'].rowCount).toBeLessThanOrEqual(15)
  })

  it('fails gracefully on invalid / corrupted buffer', async () => {
    const corruptedBlob = new Blob([new Uint8Array(Buffer.from('PK\x03\x04corrupted-zip-data'))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    await expect(parseExcelBlob(corruptedBlob)).rejects.toThrow()
  })
})
