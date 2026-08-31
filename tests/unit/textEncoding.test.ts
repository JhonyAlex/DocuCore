import { describe, expect, it } from 'vitest'
import { normalizeFileName, normalizeTextPayload, repairTextEncoding } from '../../server/lib/textEncoding'

describe('text encoding repair', () => {
  it('repairs UTF-8 filenames that were decoded as Latin-1 and legacy space entities', () => {
    const malformed = 'v1\u00a0·\u00a016â\u0080\u0091Registro control de vidrios, plásticos rígidos y cerámicos â\u0080\u0093 21â\u0080\u009108â\u0080\u00912026.xlsx&#x20;&#x20;'

    expect(repairTextEncoding(malformed)).toBe('v1\u00a0·\u00a016‑Registro control de vidrios, plásticos rígidos y cerámicos – 21‑08‑2026.xlsx  ')
    expect(normalizeFileName(malformed)).toBe('v1\u00a0·\u00a016‑Registro control de vidrios, plásticos rígidos y cerámicos – 21‑08‑2026.xlsx')
  })

  it('also repairs Windows-1252 representations and nested API payloads', () => {
    const payload = { currentVersion: { originalName: 'RevisiÃ³n â€‘ final.pdf' }, labels: ['SeÃ±al'] }

    expect(normalizeTextPayload(payload)).toEqual({ currentVersion: { originalName: 'Revisión ‑ final.pdf' }, labels: ['Señal'] })
  })

  it('leaves already valid Unicode untouched', () => {
    expect(repairTextEncoding('Calibración · áéíóú ñ €')).toBe('Calibración · áéíóú ñ €')
  })
})
