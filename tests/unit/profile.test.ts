import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120, "El nombre no puede superar 120 caracteres."),
  initials: z.string().trim().min(1, "Las iniciales deben tener al menos 1 carácter.").max(8, "Las iniciales no pueden superar 8 caracteres.").optional(),
}).strict()

function deriveInitials(name: string, customInitials?: string): string {
  if (customInitials && customInitials.trim().length > 0) {
    return customInitials.trim().toUpperCase()
  }
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US"
}

describe('Profile validation & initials generation', () => {
  it('validates a correct name and custom initials', () => {
    const valid = updateProfileSchema.parse({ name: 'Carlos Ruiz', initials: 'CR' })
    expect(valid.name).toBe('Carlos Ruiz')
    expect(valid.initials).toBe('CR')
  })

  it('rejects names with less than 2 characters or whitespace only', () => {
    expect(() => updateProfileSchema.parse({ name: 'A' })).toThrow()
    expect(() => updateProfileSchema.parse({ name: '   ' })).toThrow()
  })

  it('rejects names exceeding 120 characters', () => {
    expect(() => updateProfileSchema.parse({ name: 'A'.repeat(121) })).toThrow()
  })

  it('rejects initials exceeding 8 characters', () => {
    expect(() => updateProfileSchema.parse({ name: 'Nombre Válido', initials: 'ABCDEFGHI' })).toThrow()
  })

  it('derives initials automatically from full name', () => {
    expect(deriveInitials('María Fernández')).toBe('MF')
    expect(deriveInitials('Juan')).toBe('J')
    expect(deriveInitials('Pedro De La Rosa')).toBe('PD')
    expect(deriveInitials('   ana   gómez   ')).toBe('AG')
  })

  it('uses custom initials when supplied', () => {
    expect(deriveInitials('María Fernández', 'MFA')).toBe('MFA')
    expect(deriveInitials('Carlos Ruiz', 'cRz')).toBe('CRZ')
  })
})
