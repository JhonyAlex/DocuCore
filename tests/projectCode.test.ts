import { describe, expect, it } from 'vitest'
import { normalizeProjectCode } from '../shared/projectCode'

describe('normalizeProjectCode', () => {
  it('uses lowercase hyphenated codes for natural user input', () => {
    expect(normalizeProjectCode('  Planta  Norte  01 ')).toBe('planta-norte-01')
  })
})
