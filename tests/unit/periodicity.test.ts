import { describe, expect, it } from 'vitest'
import { addMonthsClamped, calculateNextExpiry } from '../../server/lib/periodicity'
import { addMonthsClamped as clientAddMonthsClamped, calculateNextExpiry as clientCalculateNextExpiry } from '@/lib/periodicity'

// DOC-03: el cálculo del próximo vencimiento vive duplicado en server y src con
// la misma semántica (el servidor es la fuente autoritativa; el frontend
// precalcula el campo editable). Ambos deben comportarse idéntico.

const iso = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

describe('addMonthsClamped', () => {
  it('keeps the day of month when it exists in the target month', () => {
    expect(addMonthsClamped(iso('2026-01-15'), 3).toISOString().slice(0, 10)).toBe('2026-04-15')
  })

  it('clamps to the last day of the target month when the day does not exist', () => {
    expect(addMonthsClamped(iso('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(addMonthsClamped(iso('2026-03-31'), 1).toISOString().slice(0, 10)).toBe('2026-04-30')
    expect(addMonthsClamped(iso('2026-05-31'), 1).toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  it('handles leap years', () => {
    expect(addMonthsClamped(iso('2024-02-29'), 12).toISOString().slice(0, 10)).toBe('2025-02-28')
    expect(addMonthsClamped(iso('2024-01-31'), 1).toISOString().slice(0, 10)).toBe('2024-02-29')
  })

  it('rolls over the year boundary', () => {
    expect(addMonthsClamped(iso('2026-11-30'), 3).toISOString().slice(0, 10)).toBe('2027-02-28')
  })

  it('does not drift after a clamp (base keeps its own day)', () => {
    expect(addMonthsClamped(iso('2026-02-28'), 1).toISOString().slice(0, 10)).toBe('2026-03-28')
  })
})

describe('calculateNextExpiry (server)', () => {
  it('Calendario mode jumps from the previous expiry', () => {
    const next = calculateNextExpiry(iso('2026-03-15'), iso('2026-04-20'), 'Calendario', 'Trimestral')
    expect(next.toISOString().slice(0, 10)).toBe('2026-06-15')
  })

  it('Calendario mode falls back to the issue date without a previous expiry', () => {
    const next = calculateNextExpiry(null, iso('2026-04-20'), 'Calendario', 'Trimestral')
    expect(next.toISOString().slice(0, 10)).toBe('2026-07-20')
  })

  it('Subida mode jumps from the issue date regardless of the previous expiry', () => {
    const next = calculateNextExpiry(iso('2026-03-15'), iso('2026-04-20'), 'Subida', 'Trimestral')
    expect(next.toISOString().slice(0, 10)).toBe('2026-07-20')
  })

  it('maps every periodicity to the right number of months', () => {
    expect(calculateNextExpiry(null, iso('2026-01-01'), 'Subida', 'Mensual').toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(calculateNextExpiry(null, iso('2026-01-01'), 'Subida', 'Bimestral').toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(calculateNextExpiry(null, iso('2026-01-01'), 'Subida', 'Cuatrimestral').toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(calculateNextExpiry(null, iso('2026-01-01'), 'Subida', 'Semestral').toISOString().slice(0, 10)).toBe('2026-07-01')
    expect(calculateNextExpiry(null, iso('2026-01-01'), 'Subida', 'Anual').toISOString().slice(0, 10)).toBe('2027-01-01')
  })
})

describe('frontend mirrors the server calculation', () => {
  it('clamps month ends identically', () => {
    expect(clientAddMonthsClamped(iso('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28')
  })

  it('calculates both modes identically', () => {
    const cases: Array<Parameters<typeof calculateNextExpiry>> = [
      [iso('2026-03-15'), iso('2026-04-20'), 'Calendario', 'Trimestral'],
      [null, iso('2026-04-20'), 'Calendario', 'Trimestral'],
      [iso('2026-03-15'), iso('2026-04-20'), 'Subida', 'Trimestral'],
      [iso('2026-01-31'), iso('2026-02-10'), 'Calendario', 'Mensual'],
    ]
    for (const args of cases) {
      expect(clientCalculateNextExpiry(args[0], args[1], args[2], args[3]).toISOString().slice(0, 10))
        .toBe(calculateNextExpiry(args[0], args[1], args[2], args[3]).toISOString().slice(0, 10))
    }
  })
})
