import { describe, expect, it } from 'vitest'
import { statusCreateSchema, statusUpdateSchema, projectIdOf } from '../../server/lib/statuses'
import { isStatusColorKey, statusColorMap } from '../../shared/statusCatalog'
import { getStatusChipClass } from '../../src/lib/assetMappers'

describe('status configuration validation & helpers', () => {
  it('trims and validates a new status name with color and pulseDot', () => {
    expect(
      statusCreateSchema.parse({
        name: '  En calibración  ',
        color: 'indigo',
        pulseDot: 'red',
      }),
    ).toEqual({
      name: 'En calibración',
      color: 'indigo',
      pulseDot: 'red',
    })
  })

  it('rejects empty updates and invalid project ids', () => {
    expect(() => statusUpdateSchema.parse({})).toThrow()
    expect(() => projectIdOf('0')).toThrow()
    expect(() => projectIdOf('invalid')).toThrow()
    expect(projectIdOf('2')).toBe(2)
  })

  it('accepts rename, color, order and reactivation updates', () => {
    expect(
      statusUpdateSchema.parse({
        name: 'Parada planificada',
        color: 'amber',
        pulseDot: null,
        sortOrder: 5,
        isActive: true,
      }),
    ).toEqual({
      name: 'Parada planificada',
      color: 'amber',
      pulseDot: null,
      sortOrder: 5,
      isActive: true,
    })
  })

  it('rejects an unknown color key in schema validation', () => {
    expect(() =>
      statusCreateSchema.parse({
        name: 'Test',
        color: 'neon-pink',
      }),
    ).toThrow()
  })

  it('correctly maps status chip class dynamically and with fallback', () => {
    expect(isStatusColorKey('emerald')).toBe(true)
    expect(isStatusColorKey('unknown')).toBe(false)
    expect(getStatusChipClass({ name: 'Personalizado', color: 'indigo' })).toBe(statusColorMap.indigo)
    expect(getStatusChipClass({ name: 'Activo' })).toBe(
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    )
  })
})
