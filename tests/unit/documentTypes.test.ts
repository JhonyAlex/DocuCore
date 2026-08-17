import { describe, expect, it } from 'vitest'
import { documentTypeCreateSchema, documentTypeUpdateSchema, projectIdOf } from '../../server/lib/documentTypes'

describe('document type configuration validation', () => {
  it('trims and validates a new document type name and icon', () => {
    expect(documentTypeCreateSchema.parse({ name: '  Certificado QA  ', iconKey: 'badge-check' })).toEqual({ name: 'Certificado QA', iconKey: 'badge-check' })
  })

  it('rejects empty updates, invalid icon keys and invalid project ids', () => {
    expect(() => documentTypeUpdateSchema.parse({})).toThrow()
    expect(() => documentTypeCreateSchema.parse({ name: 'Test', iconKey: 'invalid-nonexistent-icon' })).toThrow()
    expect(() => projectIdOf('0')).toThrow()
    expect(projectIdOf('3')).toBe(3)
  })

  it('accepts rename, icon change, order and reactivation updates', () => {
    expect(documentTypeUpdateSchema.parse({ name: 'Contrato Marco', iconKey: 'file-signature', sortOrder: 5, isActive: true })).toEqual({ name: 'Contrato Marco', iconKey: 'file-signature', sortOrder: 5, isActive: true })
  })
})
