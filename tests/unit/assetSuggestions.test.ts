import { describe, expect, it } from 'vitest'
import { mapAssetSuggestion } from '@/lib/assetSuggestions'

// UX-04: el mapeo de sugerencias convierte la fila de la API en { value, hint }
// para cada campo, mostrando el valor de los otros dos campos como contexto.

describe('mapAssetSuggestion', () => {
  const row = { code: 'CNC-05', name: 'Torno CNC Haas ST-20', initials: 'CN' }

  it('suggests code with name and initials as context', () => {
    expect(mapAssetSuggestion('code', row)).toEqual({ value: 'CNC-05', hint: 'Torno CNC Haas ST-20 · CN' })
  })

  it('suggests name with code and initials as context', () => {
    expect(mapAssetSuggestion('name', row)).toEqual({ value: 'Torno CNC Haas ST-20', hint: 'CNC-05 · CN' })
  })

  it('suggests initials with code and name as context', () => {
    expect(mapAssetSuggestion('initials', row)).toEqual({ value: 'CN', hint: 'CNC-05 · Torno CNC Haas ST-20' })
  })

  it('drops null fields from the hint', () => {
    expect(mapAssetSuggestion('code', { code: 'X-1', name: null, initials: 'XY' })).toEqual({ value: 'X-1', hint: 'XY' })
    expect(mapAssetSuggestion('name', { code: null, name: 'Solo nombre', initials: null })).toEqual({ value: 'Solo nombre', hint: '' })
  })
})
