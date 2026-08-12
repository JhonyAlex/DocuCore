import { describe, expect, it } from 'vitest'
import { createSeedPdfBuffer } from '../../server/lib/seedPdf'

describe('canonical seed PDF', () => {
  it('creates a valid PDF structure and preserves an optional display size', () => {
    const pdf = createSeedPdfBuffer('Documento (QA)', 4096)
    const source = pdf.toString('utf8')
    const startXref = Number(source.match(/startxref\n(\d+)/)?.[1])

    expect(pdf.length).toBe(4096)
    expect(source.startsWith('%PDF-1.4')).toBe(true)
    expect(source).toContain('(Documento \\(QA\\)) Tj')
    expect(source.slice(startXref)).toMatch(/^xref\n0 6\n/)
    expect(source).toContain('%%EOF')
  })
})
