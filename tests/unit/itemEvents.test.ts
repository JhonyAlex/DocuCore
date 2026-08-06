import { describe, expect, it } from 'vitest'
import { deriveItemEvents, type ItemEventRelations } from '../../server/lib/itemEvents'

function relations(overrides: Partial<ItemEventRelations> = {}): ItemEventRelations {
  return {
    events: [],
    documents: [],
    dynamicFields: null,
    type: { fieldDefinitions: [] },
    ...overrides,
  }
}

const now = new Date('2026-08-06T18:00:00.000Z')

describe('deriveItemEvents', () => {
  it('derives, sorts and classifies events from explicit relations', () => {
    const result = deriveItemEvents(relations({
      events: [
        { id: 2, title: 'Revisión futura', date: new Date('2026-09-15T10:00:00.000Z'), type: 'Mantenimiento' },
        { id: 1, title: 'Revisión vencida', date: new Date('2026-08-03T10:00:00.000Z'), type: 'Inspección' },
      ],
    }), now)

    expect(result).toEqual([
      expect.objectContaining({ id: 'event:1', daysUntil: -3, urgency: 'red', source: 'event' }),
      expect.objectContaining({ id: 'event:2', daysUntil: 40, urgency: 'slate', source: 'event' }),
    ])
  })

  it('uses a related document expiry as an item event', () => {
    const result = deriveItemEvents(relations({
      documents: [{ id: 4, name: 'Certificado de calibración', expiryDate: '10/08/2026', type: 'Calibración' }],
    }), now)

    expect(result).toEqual([
      expect.objectContaining({
        id: 'document:4',
        title: 'Certificado de calibración',
        date: '2026-08-10T00:00:00.000Z',
        daysUntil: 4,
        urgency: 'amber',
        source: 'document',
        sourceLabel: 'Calibración',
      }),
    ])
  })

  it('derives dates from dynamic DATE definitions and ignores unrelated or invalid values', () => {
    const result = deriveItemEvents(relations({
      dynamicFields: {
        'Próxima calibración': '2026-08-06',
        Observaciones: 'Sin fecha',
        'Fecha inválida': '2026-02-30',
      },
      type: {
        fieldDefinitions: [
          { id: 7, fieldName: 'Próxima calibración' },
          { id: 8, fieldName: 'Fecha inválida' },
        ],
      },
    }), now)

    expect(result).toEqual([
      expect.objectContaining({
        id: 'dynamic-field:7',
        title: 'Próxima calibración',
        daysUntil: 0,
        urgency: 'amber',
        source: 'dynamic-field',
      }),
    ])
  })

  it('returns no invented event when the item has no valid dated relation', () => {
    expect(deriveItemEvents(relations({
      documents: [{ id: 1, name: 'Manual', expiryDate: '—', type: 'Manual' }],
    }), now)).toEqual([])
  })
})
