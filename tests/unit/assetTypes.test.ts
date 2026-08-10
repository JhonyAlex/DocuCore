import { describe, expect, it } from 'vitest'
import { assetTypeCreateSchema, assetTypeUpdateSchema, projectIdOf } from '../../server/lib/assetTypes'

describe('asset type configuration validation', () => {
  it('trims and validates a new type name', () => {
    expect(assetTypeCreateSchema.parse({ name: '  Equipo médico  ' })).toEqual({ name: 'Equipo médico' })
  })

  it('rejects empty updates and invalid project ids', () => {
    expect(() => assetTypeUpdateSchema.parse({})).toThrow()
    expect(() => projectIdOf('0')).toThrow()
    expect(projectIdOf('2')).toBe(2)
  })

  it('accepts rename, order and reactivation updates', () => {
    expect(assetTypeUpdateSchema.parse({ name: 'Equipo crítico', sortOrder: 8, isActive: true })).toEqual({ name: 'Equipo crítico', sortOrder: 8, isActive: true })
  })
})
