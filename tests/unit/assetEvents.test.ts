import { describe, expect, it } from 'vitest'
import { deriveAssetEvents, deriveAssetEventsExcludingAcknowledged, type AssetEventRelations } from '../../server/lib/assetEvents'

function relations(overrides: Partial<AssetEventRelations> = {}): AssetEventRelations {
  return {
    events: [],
    documents: [],
    dynamicFieldValues: [],
    ...overrides,
  }
}

const now = new Date('2026-08-06T18:00:00.000Z')

describe('deriveAssetEvents', () => {
  it('derives, sorts and classifies events from explicit relations with semantic actions', () => {
    const result = deriveAssetEvents(relations({
      events: [
        { id: 2, title: 'Revisión futura', date: new Date('2026-09-15T10:00:00.000Z'), type: 'Mantenimiento' },
        { id: 1, title: 'Revisión vencida', date: new Date('2026-08-03T10:00:00.000Z'), type: 'Inspección' },
      ],
    }), now)

    expect(result).toEqual([
      expect.objectContaining({
        id: 'event:1',
        daysUntil: -3,
        urgency: 'red',
        source: 'event',
        isCompletable: true,
        primaryAction: 'complete',
      }),
      expect.objectContaining({
        id: 'event:2',
        daysUntil: 40,
        urgency: 'slate',
        source: 'event',
        isCompletable: true,
        primaryAction: 'complete',
      }),
    ])
  })

  it('uses a related document expiry as an asset event and marks it not manually completable', () => {
    const result = deriveAssetEvents(relations({
      documents: [{ id: 4, name: 'Certificado de calibración', eventTitle: null, versions: [{ expiryDate: new Date('2026-08-10T00:00:00.000Z') }], type: 'Calibración' }],
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
        isCompletable: false,
        primaryAction: 'view_document',
      }),
    ])
  })

  it('does not filter out document events even when legacy acknowledgements are present', () => {
    const rels = relations({
      documents: [{ id: 4, name: 'Certificado de calibración', eventTitle: null, versions: [{ expiryDate: new Date('2026-08-10T00:00:00.000Z') }], type: 'Calibración' }],
    })
    const legacyAcknowledgements = ['document:4']
    const result = deriveAssetEventsExcludingAcknowledged(rels, legacyAcknowledgements, now)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'document:4',
      source: 'document',
      isCompletable: false,
      primaryAction: 'view_document',
    }))
  })

  it('derives dates from dynamic DATE definitions and ignores unrelated or invalid values', () => {
    const result = deriveAssetEvents(relations({
      dynamicFieldValues: [
        { id: 17, dateValue: new Date('2026-08-06T00:00:00.000Z'), definition: { id: 7, fieldName: 'Próxima calibración', eventTitle: null, fieldType: 'DATE', isActive: true } },
        { id: 18, dateValue: null, definition: { id: 8, fieldName: 'Fecha inválida', eventTitle: null, fieldType: 'DATE', isActive: true } },
      ],
    }), now)

    expect(result).toEqual([
      expect.objectContaining({
        id: 'dynamic-field:17',
        title: 'Próxima calibración',
        daysUntil: 0,
        urgency: 'amber',
        source: 'dynamic-date',
        isCompletable: true,
        primaryAction: 'view_dynamic_date',
      }),
    ])
  })

  it('derives pending executions from preventive plans and sorts them against other sources', () => {
    const result = deriveAssetEvents(relations({
      events: [{ id: 1, title: 'Revisión futura', date: new Date('2026-09-01T00:00:00.000Z'), type: 'Inspección' }],
      preventivePlans: [{
        id: 10,
        name: 'Mantenimiento Semestral',
        executions: [
          { id: 101, scheduledDate: new Date('2026-08-15T00:00:00.000Z'), completedAt: null, tasks: [{ completedAt: null }, { completedAt: new Date() }] },
          { id: 100, scheduledDate: new Date('2026-02-15T00:00:00.000Z'), completedAt: new Date(), tasks: [] },
        ],
      }],
    }), now)

    expect(result).toEqual([
      expect.objectContaining({
        id: 'preventive:101',
        title: 'Mantenimiento Semestral',
        date: '2026-08-15T00:00:00.000Z',
        daysUntil: 9,
        urgency: 'amber',
        source: 'preventive',
        sourceLabel: '1/2 tareas',
        isCompletable: true,
        primaryAction: 'open_preventive',
      }),
      expect.objectContaining({
        id: 'event:1',
        title: 'Revisión futura',
        source: 'event',
      }),
    ])
  })

  it('returns no invented event when the asset has no valid dated relation', () => {
    expect(deriveAssetEvents(relations({
      documents: [{ id: 1, name: 'Manual', eventTitle: null, versions: [{ expiryDate: null }], type: 'Manual' }],
    }), now)).toEqual([])
  })
})
