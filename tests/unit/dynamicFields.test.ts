import { describe, expect, it } from 'vitest'
import { dynamicFieldDefinitionSchema, parseDynamicValue } from '../../server/lib/dynamicFields'

const options = [{ id: 1, definitionId: 1, key: 'alta', label: 'Alta', sortOrder: 0, isActive: true }]

describe('dynamic field configuration and values', () => {
  it('accepts a periodic date applied to several asset types', () => {
    const result = dynamicFieldDefinitionSchema.parse({ fieldName: 'Próxima revisión', groupName: 'Mantenimiento', fieldType: 'DATE', required: false, periodicity: 'Trimestral', periodicityMode: 'Calendario', assetTypeIds: [1, 2], options: [] })
    expect(result.periodicity).toBe('Trimestral')
    expect(result.assetTypeIds).toEqual([1, 2])
  })

  it('rejects selection fields without options and recurrence on non-date fields', () => {
    expect(() => dynamicFieldDefinitionSchema.parse({ fieldName: 'Criticidad', groupName: 'General', fieldType: 'SELECT', required: false, assetTypeIds: [1], options: [] })).toThrow()
    expect(() => dynamicFieldDefinitionSchema.parse({ fieldName: 'Marca', groupName: 'General', fieldType: 'TEXT', required: false, periodicity: 'Anual', assetTypeIds: [1], options: [] })).toThrow()
  })

  it('validates numbers and stable option keys', () => {
    const numberDefinition = { fieldType: 'NUMBER' as const, required: true, minValue: 0, maxValue: 10, decimalPlaces: 2, options: [] }
    expect(parseDynamicValue(numberDefinition as never, 4.25)).toMatchObject({ numberValue: 4.25 })
    expect(() => parseDynamicValue(numberDefinition as never, 11)).toThrow('maximum')
    const selectDefinition = { fieldType: 'SELECT' as const, required: false, minValue: null, maxValue: null, decimalPlaces: null, options }
    expect(parseDynamicValue(selectDefinition as never, 'alta')).toMatchObject({ textValue: 'alta' })
    expect(() => parseDynamicValue(selectDefinition as never, 'otra')).toThrow('selection')
  })
})
